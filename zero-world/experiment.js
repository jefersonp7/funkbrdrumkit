/*
 * ZERO WORLD — Experimento: 10 vidas independentes, rodadas, métricas e análise.
 * Cada vida é um mundo separado (estado, RNG, NPCs e memória próprios).
 * Nada é compartilhado entre mundos durante a rodada.
 */
(function (g) {
  'use strict';
  const ZW = typeof require === 'function' ? require('./engine.js') : g.ZW;

  const AGENTES = [
    ['ZERO-01', 0], ['ZERO-02', 0], ['ZERO-03', 0], ['ZERO-04', 0],
    ['ZERO-05', 50000], ['ZERO-06', 50000], ['ZERO-07', 50000],
    ['ZERO-08', 100000], ['ZERO-09', 100000], ['ZERO-10', 100000],
  ];

  // semente de cada mundo derivada da semente da rodada (registrada no resultado)
  const sementeMundo = (sementeRodada, id) => ZW.hashSeed('RODADA:' + sementeRodada + ':' + id);
  // namespace separado para cenários de avaliação protegidos (não usados para ajustar políticas)
  const sementeAvaliacao = (base, i) => ZW.hashSeed('AVALIACAO:' + base + ':' + i);

  function criarRodada(sementeRodada, opcoes) {
    const o = opcoes || {};
    return AGENTES.map(([id, capital]) => ZW.criarMundo({ id, capitalInicial: capital, seed: sementeMundo(sementeRodada, id), dataInicio: o.dataInicio }));
  }

  function executar(mundos, cerebro, dias) {
    const erros = [];
    for (const w of mundos) { const r = ZW.avancar(w, cerebro, dias); if (!r.ok) erros.push({ id: w.meta.id, dia: w.dia + 1, erro: r.erro }); }
    return erros;
  }

  function serieDiaria(w) {
    // reconstrói, só a partir do livro e do histórico, renda e despesa móveis de 30 dias
    const recPorDia = new Array(w.dia + 1).fill(0), despPorDia = new Array(w.dia + 1).fill(0);
    for (const t of w.ledger.tx) {
      if (t.dia < 1) continue;
      if (t.tipo === 'RECEITA') recPorDia[t.dia] += t.valor;
      if (t.tipo === 'DESPESA' || t.tipo === 'IMPOSTO') despPorDia[t.dia] += t.valor;
    }
    const out = [];
    let r30 = 0, d30 = 0;
    for (let d = 1; d <= w.dia; d++) {
      r30 += recPorDia[d]; d30 += despPorDia[d];
      if (d > 30) { r30 -= recPorDia[d - 30]; d30 -= despPorDia[d - 30]; }
      const h = w.historico[d - 1];
      out.push({ dia: d, caixa: h.caixaFim, patrimonio: h.patrimonio, renda30: r30, despesa30: d30, internado: !!h.internado });
    }
    return out;
  }

  function metricas(w) {
    const f = ZW.financeiro(w);
    const serie = serieDiaria(w);
    const primeiraReceita = w.ledger.tx.find((t) => t.tipo === 'RECEITA');
    const estavel = serie.find((s) => s.dia >= 30 && s.renda30 >= ZW.PARAMETROS.salarioMinimo.v && s.caixa >= ZW.PARAMETROS.quartoMes.v);
    const a = w.agente;
    const res = w.logs.resultados;
    return {
      id: w.meta.id, seed: w.meta.seed, capitalInicial: f.capitalInicial, diasSimulados: w.dia,
      saldo: f.saldo, patrimonio: f.patrimonio, receita: f.receita, beneficios: f.beneficios, despesas: f.despesas, perdas: f.perdas,
      lucro: f.lucro, dividas: f.dividas, ganhoLiquido: f.ganhoLiquido, roi: f.roi,
      diasSobrevividos: serie.filter((s) => !s.internado).length, colapsos: a.colapsos, furtos: a.furtos,
      diaPrimeiraReceita: primeiraReceita ? primeiraReceita.dia : null,
      diaEstabilidade: estavel ? estavel.dia : null,
      negociosCriados: a.negocios.length, negociosFracassados: a.negocios.filter((n) => n.status === 'fracassado').length,
      mudancasEstrategia: a.memoria.mudancasEstrategia.length, estrategiaFinal: a.estrategia,
      emprego: a.emprego ? a.emprego.cargo : null, moradia: a.quarto ? 'quarto' : a.local,
      risco: { menorCaixa: Math.min(w.meta.capitalInicial, ...serie.map((s) => s.caixa)), diasCaixaAbaixoDe50: serie.filter((s) => s.caixa < 5000).length },
      custo: { ms: w.metricas.ms, ciclos: w.metricas.ciclos, decisoes: w.logs.decisoes.length, acoes: w.metricas.acoes, transacoes: w.ledger.tx.length, bytesEstado: ZW.serializar(w).length },
      hash: ZW.hashMundo(w),
      auditoria: ZW.auditar(w).ok,
    };
  }

  const mediana = (xs) => { const v = xs.filter((x) => x !== null).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };

  // Só pode rodar depois que todos os mundos chegaram ao mesmo dia final.
  function analisar(mundos, diasEsperados) {
    if (!mundos.every((w) => w.dia === diasEsperados)) throw new Error('rodada não concluída: análise coletiva bloqueada');
    const ms = mundos.map(metricas);
    const porCapital = {};
    for (const m of ms) (porCapital[m.capitalInicial] = porCapital[m.capitalInicial] || []).push(m);
    const efeitoCapital = Object.keys(porCapital).map(Number).sort((a, b) => a - b).map((c) => {
      const g2 = porCapital[c];
      return { capitalInicial: c, n: g2.length, medianaGanhoLiquido: mediana(g2.map((x) => x.ganhoLiquido)), medianaPatrimonio: mediana(g2.map((x) => x.patrimonio)), medianaDiaPrimeiraReceita: mediana(g2.map((x) => x.diaPrimeiraReceita)), medianaDiaEstabilidade: mediana(g2.map((x) => x.diaEstabilidade)), semEstabilidade: g2.filter((x) => x.diaEstabilidade === null).length };
    });
    const servicos = {};
    for (const w of mundos) {
      for (const n of w.agente.negocios) { const s = (servicos[n.servico] = servicos[n.servico] || { servico: n.servico, lancados: 0, fracassados: 0, receita: 0, propostas: 0, aceitas: 0 }); s.lancados++; if (n.status === 'fracassado') s.fracassados++; s.receita += n.receita; }
      for (const l of Object.values(w.agente.memoria.leads)) for (const p of l.propostas) { const s = servicos[p.servico]; if (!s) continue; s.propostas++; if (p.resultado === 'aceita') s.aceitas++; }
    }
    const falhas = {};
    for (const w of mundos) for (const r of w.logs.resultados) if (!r.ok) { const k = r.acao + ': ' + r.resultado; falhas[k] = (falhas[k] || 0) + 1; }
    const errosRecorrentes = Object.entries(falhas).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([motivo, vezes]) => ({ motivo, vezes }));
    const tempoEmEstrategia = {};
    for (const w of mundos) for (const h of w.historico) tempoEmEstrategia[h.estrategia] = (tempoEmEstrategia[h.estrategia] || 0) + 1;
    const eventos = {};
    for (const w of mundos) for (const e of w.logs.eventos) eventos[e.tipo] = (eventos[e.tipo] || 0) + 1;
    return {
      dias: diasEsperados, mundos: ms.length, metricas: ms, efeitoCapital,
      negocios: Object.values(servicos).map((s) => Object.assign(s, { taxaAceite: s.propostas ? Math.round((1000 * s.aceitas) / s.propostas) / 10 : null })),
      errosRecorrentes, tempoEmEstrategia, eventos,
      adaptacao: ms.map((m) => ({ id: m.id, mudancasEstrategia: m.mudancasEstrategia, furtos: m.furtos, colapsos: m.colapsos })),
      aviso: 'Resultados de RESULTADO SIMULADO sob regras SINTÉTICAS e uma POLÍTICA PROGRAMADA (não é IA). Não são previsões do mundo real.',
    };
  }

  function rodadas(sementes, cerebro, dias) {
    const porRodada = [];
    for (const s of sementes) {
      const mundos = criarRodada(s);
      const erros = executar(mundos, cerebro, dias);
      porRodada.push({ semente: s, erros, analise: erros.length ? null : analisar(mundos, dias) });
    }
    const agregado = {};
    for (const r of porRodada) if (r.analise) for (const e of r.analise.efeitoCapital) (agregado[e.capitalInicial] = agregado[e.capitalInicial] || []).push(e);
    return {
      sementes, dias, politica: cerebro.id, porRodada,
      agregado: Object.keys(agregado).map(Number).map((c) => ({ capitalInicial: c, rodadas: agregado[c].length, medianaGanhoLiquido: mediana(agregado[c].map((x) => x.medianaGanhoLiquido)), medianaDiaPrimeiraReceita: mediana(agregado[c].map((x) => x.medianaDiaPrimeiraReceita)), medianaDiaEstabilidade: mediana(agregado[c].map((x) => x.medianaDiaEstabilidade)) })),
    };
  }

  // Aprendizados gerais para uma geração futura (não usados pela política v1).
  function aprendizados(analise) {
    const neg = analise.negocios.slice().sort((a, b) => b.receita - a.receita);
    return {
      geradoApos: 'rodada concluída de ' + analise.dias + ' dias',
      servicosPorReceita: neg.map((n) => ({ servico: n.servico, receita: n.receita, taxaAceite: n.taxaAceite })),
      errosMaisComuns: analise.errosRecorrentes.slice(0, 5),
      regraDeUso: 'Pode orientar a política da próxima geração; avaliar sempre em sementes do namespace AVALIACAO, nunca nas sementes usadas aqui.',
    };
  }

  const ZWExp = { AGENTES, sementeMundo, sementeAvaliacao, criarRodada, executar, metricas, serieDiaria, analisar, rodadas, aprendizados };
  if (typeof module === 'object' && module.exports) module.exports = ZWExp; else g.ZWExp = ZWExp;
})(typeof globalThis !== 'undefined' ? globalThis : this);
