// Revisão do motor (03/11/2026). Rodar: node zero-world/auditoria-motor.js
// Gera evidências em zero-world/runs/AUDITORIA-MOTOR/. Não altera o motor.
'use strict';
const fs = require('fs');
const path = require('path');
const ZW = require('./engine.js');
const PD = require('./policy-digital.js');
const Exp = require('./experiment.js');
const AO = require('./ao-vivo.json');

const OUT = path.join(__dirname, 'runs', 'AUDITORIA-MOTOR');
fs.mkdirSync(OUT, { recursive: true });
const brl = ZW.brl;
const ev = {}; // evidências
const check = (nome, ok, det) => { (ev.checagens = ev.checagens || []).push({ nome, ok: !!ok, det: det || '' }); console.log((ok ? 'OK   ' : 'FALHA') + ' ' + nome + (det ? ' — ' + det : '')); };
const novaRodada = () => Exp.criarRodadaDigital(AO.semente, { dataInicio: AO.dataInicioVirtual });

// ------------------------------------------------------------------ 1. ações por carreira (30 dias)
const mundos = novaRodada();
const capturas = {}; // observações e decisões entregues ao cérebro, por agente e dia
const cerebroGravador = {
  id: PD.id, tipo: PD.tipo,
  decidir(o) { const d = PD.decidir(o); (capturas[o.agente.id] = capturas[o.agente.id] || []).push({ dia: o.dia, obs: o, dec: d }); return d; },
};
for (let dia = 1; dia <= 30; dia++) for (const w of mundos) { const r = ZW.avancarDia(w, cerebroGravador); if (!r.ok) throw new Error(r.erro); }

const acoesPorAgente = {};
for (const w of mundos) {
  const c = {};
  for (const r of w.logs.resultados) if (r.ok) c[r.acao] = (c[r.acao] || 0) + 1;
  acoesPorAgente[w.meta.id + ' ' + w.carreira] = c;
}
const todas = [...new Set(Object.values(acoesPorAgente).flatMap((c) => Object.keys(c)))].sort();
const compartilhadas = todas.filter((a) => Object.values(acoesPorAgente).every((c) => c[a]));
const exclusivas = todas.filter((a) => Object.values(acoesPorAgente).filter((c) => c[a]).length <= 2);
ev.acoes = { acoesPorAgente, compartilhadasPorTodos: compartilhadas, usadasPorAte2Agentes: exclusivas };

// ------------------------------------------------------------------ 2. dia 1: por que "registrar centro pop" às 11h
ev.dia1 = mundos.map((w) => {
  const cap = capturas[w.meta.id][0];
  const a = cap.obs.agente;
  return {
    id: w.meta.id, carreira: w.carreira,
    observacao: { caixa: a.caixa, fome: a.necessidades.fome, energia: a.necessidades.energia, centroPop: a.registros.centroPop, rg: a.docs.rg, celular: a.itens.celular, local: a.local },
    plano: cap.dec.plano.map((p) => p.tipo + (p.opcao ? ':' + p.opcao : '') + (p.item ? ':' + p.item : '')),
    resultados: w.logs.resultados.filter((r) => r.dia === 1).map((r) => r.acao + ' ' + r.horas + 'h ' + r.resultado),
  };
});
const planosDia1 = new Set(ev.dia1.map((d) => d.plano.slice(0, 3).join('>')));
check('Dia 1: os 10 agentes recebem a mesma observação inicial', new Set(ev.dia1.map((d) => JSON.stringify(d.observacao))).size === 1, JSON.stringify(ev.dia1[0].observacao));
check('Dia 1: as 3 primeiras ações são iguais para todos (comer, comer, registrar)', planosDia1.size === 1, [...planosDia1][0]);
const pagouRefeicao = mundos.every((w) => w.ledger.tx.filter((t) => t.dia === 1 && t.justificativa.includes('Restaurante Popular')).length === 2);
check('Dia 1: todos pagaram 2 refeições de R$3 antes de se registrar (ineficiência da política)', pagouRefeicao);

// ------------------------------------------------------------------ 3. decisões só com informação do momento
let puro = true, chavesOk = true, congeladoOk = true;
for (const id of Object.keys(capturas)) for (const c of capturas[id]) {
  if (JSON.stringify(PD.decidir(c.obs)) !== JSON.stringify(c.dec)) puro = false;
  const j = JSON.stringify(c.obs);
  if (ZW.CHAVES_PROIBIDAS.some((k) => j.includes('"' + k + '"'))) chavesOk = false;
  if (!Object.isFrozen(c.obs) || !Object.isFrozen(c.obs.agente) || !Object.isFrozen(c.obs.memoria)) congeladoOk = false;
}
check('A decisão é função só da observação (recalculada 300 vezes, sempre igual)', puro, '10 agentes × 30 dias');
check('Nenhuma observação contém agenda, gerador ou dados ocultos', chavesOk, 'chaves proibidas: ' + ZW.CHAVES_PROIBIDAS.join(', '));
check('Todas as observações estavam congeladas', congeladoOk);
// alterar tudo que é oculto (agenda futura, orçamentos, abertura, concorrência, inscritos, gerador) não muda o que o agente vê hoje
{
  const base = novaRodada();
  for (let d = 0; d < 15; d++) for (const w of base) ZW.avancarDia(w, PD);
  let iguais = 0;
  for (const w of base) {
    const alt = ZW.desserializar(ZW.serializar(w));
    alt.oculto.rngState ^= 0x5bd1e995;
    for (const k of Object.keys(alt.oculto.negocios)) alt.oculto.negocios[k] = { orcamento: 1, abertura: 0 };
    for (const k of Object.keys(alt.oculto.projetos || {})) alt.oculto.projetos[k].concorrentes = 999;
    for (const k of Object.keys(alt.oculto.campanhas || {})) alt.oculto.campanhas[k].inscritos = 999;
    alt.oculto.agenda.forEach((e) => { e.dia += 3; });
    const o1 = ZW.observar(w), o2 = ZW.observar(alt);
    if (JSON.stringify(o1) === JSON.stringify(o2) && JSON.stringify(PD.decidir(o1)) === JSON.stringify(PD.decidir(o2))) iguais++;
  }
  check('Mudar todo o estado oculto (futuro, orçamentos, concorrência, gerador) não muda observação nem decisão', iguais === 10, iguais + '/10 agentes no dia 15');
}
// ordem: decisão gravada antes de qualquer resultado e de qualquer transação gerada pelas ações do dia
{
  let ok = true;
  for (const w of mundos) for (const h of w.historico) {
    const dec = w.logs.decisoes.find((d) => d.seq === h.decisaoSeq);
    if (!dec) continue;
    const res = w.logs.resultados.filter((r) => h.resultadoSeqs.includes(r.seq));
    if (res.some((r) => r.seq < dec.seq)) ok = false;
  }
  check('Toda decisão tem número de sequência menor que os resultados do dia', ok);
}

// ------------------------------------------------------------------ 4. histórico de 30 dias por agente
const linhasResumo = ['| Agente | Carreira | Caixa D30 | Patrimônio | Receita | Despesas | Clientes fechados | Propostas | 1ª receita |', '|---|---|---|---|---|---|---|---|---|'];
for (const w of mundos) {
  const f = ZW.financeiro(w);
  const contratos = w.agente.contratos;
  const props = Object.values(w.agente.memoria.leads).reduce((s, l) => s + l.propostas.length, 0) + Object.values(w.agente.memoria.projetos || {}).filter((p) => p.proposta).length + Object.values(w.agente.memoria.campanhas || {}).filter((c) => c.candidatado).length;
  const pr = w.ledger.tx.find((t) => t.tipo === 'RECEITA');
  linhasResumo.push(`| ${w.meta.id} | ${w.carreira} | ${brl(w.ledger.saldo)} | ${brl(f.patrimonio)} | ${brl(f.receita)} | ${brl(f.despesas)} | ${contratos.length} | ${props} | ${pr ? 'D' + pr.dia : '—'} |`);
  const L = [`# ${w.meta.id} · ${w.carreira} · 30 dias (RESULTADO SIMULADO · política programada, não é IA)`, '', `Semente ${w.meta.seed} · capital inicial ${brl(w.meta.capitalInicial)}`, '', '| Dia | Caixa início | Caixa fim | Entradas | Saídas | Decisão (plano) | Clientes ativos |', '|---|---|---|---|---|---|---|'];
  for (const h of w.historico) {
    const txs = w.ledger.tx.filter((t) => h.txIds.includes(t.id));
    const ent = txs.filter((t) => t.direcao === 'ENTRADA').reduce((s, t) => s + t.valor, 0);
    const sai = txs.filter((t) => t.direcao === 'SAIDA').reduce((s, t) => s + t.valor, 0);
    const dec = w.logs.decisoes.find((d) => d.seq === h.decisaoSeq);
    const ativos = contratos.filter((c) => c.inicioDia <= h.dia && (c.status === 'ativo' || (c.prazoDia >= h.dia && c.status !== 'perdido'))).length;
    L.push(`| ${h.dia} | ${brl(h.caixaInicio)} | ${brl(h.caixaFim)} | ${ent ? '+' + brl(ent) : ''} | ${sai ? '−' + brl(sai) : ''} | ${dec ? dec.plano.map((p) => p.tipo).join(' → ') : 'internado'} | ${ativos} |`);
  }
  L.push('', '## Transações', '', '| ID | Dia | Tipo | Valor | Origem → destino | Saldo depois | Justificativa |', '|---|---|---|---|---|---|---|');
  for (const t of w.ledger.tx) L.push(`| ${t.id} | ${t.dia} | ${t.tipo} | ${t.direcao === 'ENTRADA' ? '+' : '−'}${brl(t.valor)} | ${t.origem} → ${t.destino} | ${brl(t.saldoPosterior)} | ${t.justificativa} |`);
  L.push('', '## Clientes e contratos', '');
  if (!contratos.length) L.push('Nenhum contrato fechado em 30 dias.');
  for (const c of contratos) L.push(`- ${c.id} · ${c.servico}${c.categoria ? ' (' + c.categoria + ')' : ''} · cliente ${c.clienteId} · ${brl(c.valor)} · fechado no dia ${c.inicioDia} · status ${c.status} · pago ${brl(c.pago)}`);
  L.push('', '## O que o agente lembrava no dia 30', '');
  for (const x of w.agente.memoria.fatos.slice(-15)) L.push(`- D${x.dia}: ${x.texto}`);
  fs.writeFileSync(path.join(OUT, w.meta.id + '-' + w.carreira + '-30dias.md'), L.join('\n') + '\n');
}
fs.writeFileSync(path.join(OUT, 'RESUMO-30-DIAS.md'), '# Rodada ao vivo (semente ' + AO.semente + ') · 30 dias · RESULTADO SIMULADO\n\n' + linhasResumo.join('\n') + '\n');

// ------------------------------------------------------------------ 5. integridade, isolamento, recuperação
for (const w of mundos) if (!ZW.auditar(w).ok) check('Auditoria ' + w.meta.id, false, ZW.auditar(w).erros[0]);
check('Livro-caixa dos 10 mundos fecha nos 30 dias (fórmula e encadeamento)', mundos.every((w) => ZW.auditar(w).ok), mundos.map((w) => w.ledger.tx.length).reduce((a, b) => a + b, 0) + ' transações');
const adulteracoes = {
  'mudar o valor de uma transação': (w) => { w.ledger.tx[3].valor += 100; },
  'apagar uma transação': (w) => { w.ledger.tx.splice(3, 1); },
  'trocar a ordem de duas transações': (w) => { const t = w.ledger.tx; [t[3], t[4]] = [t[4], t[3]]; },
  'duplicar uma transação': (w) => { w.ledger.tx.push(Object.assign({}, w.ledger.tx[3])); },
  'mudar o saldo sem transação': (w) => { w.ledger.saldo += 1; },
  'transformar capital inicial em receita': (w) => { w.ledger.tx[0].tipo = 'RECEITA'; },
  'mudar o caixa final de um dia do histórico': (w) => { w.historico[5].caixaFim += 1; },
};
for (const [nome, f] of Object.entries(adulteracoes)) { const c = ZW.desserializar(ZW.serializar(mundos[3])); f(c); const a = ZW.auditar(c); check('Adulteração detectada: ' + nome, !a.ok, a.erros[0] || 'NÃO DETECTADA'); }
const negativo = ZW.desserializar(ZW.serializar(mundos[0]));
check('Saída maior que o saldo é recusada (sem crédito)', ZW.lancar(negativo, { tipo: 'DESPESA', valor: negativo.ledger.saldo + 1, origem: negativo.agente.conta, destino: 'X', justificativa: 'teste' }) === null);

// isolamento: cada mundo sozinho = mesmo mundo dentro da rodada; nenhum objeto compartilhado
{
  let iguais = 0;
  for (const w of mundos) {
    const so = novaRodada().find((x) => x.meta.id === w.meta.id);
    for (let d = 0; d < 30; d++) ZW.avancarDia(so, PD);
    if (ZW.hashMundo(so) === ZW.hashMundo(w)) iguais++;
  }
  check('Cada mundo rodado sozinho dá o mesmo hash que dentro da rodada', iguais === 10, iguais + '/10');
  const r = novaRodada();
  const vistos = new Map(); let compartilhado = null;
  const visitar = (o, dono, cam) => { if (!o || typeof o !== 'object') return; if (vistos.has(o) && vistos.get(o) !== dono) { compartilhado = cam; return; } if (vistos.has(o)) return; vistos.set(o, dono); for (const k of Object.keys(o)) visitar(o[k], dono, cam + '.' + k); };
  for (const w of r) visitar(w, w.meta.id, w.meta.id);
  check('Nenhum objeto de memória é compartilhado entre dois mundos', compartilhado === null, compartilhado || 'varredura de referências');
  const mem = mundos.map((w) => JSON.stringify(w.agente.memoria));
  check('A memória de nenhum agente cita outro agente', mundos.every((w, i) => mundos.every((o) => o === w || !mem[i].includes(o.meta.id))));
}

// recuperação: reabrir (reconstruir pela semente) e retomar do checkpoint dão o mesmo estado
{
  const reaberto = novaRodada();
  for (let d = 0; d < 30; d++) for (const w of reaberto) ZW.avancarDia(w, PD);
  check('Reabrir = reconstruir pela semente: mesmos 10 hashes', reaberto.every((w, i) => ZW.hashMundo(w) === ZW.hashMundo(mundos[i])));
  const parte = novaRodada();
  for (let d = 0; d < 12; d++) for (const w of parte) ZW.avancarDia(w, PD);
  const salvo = JSON.stringify(parte);
  const retomado = JSON.parse(salvo);
  for (let d = 0; d < 18; d++) for (const w of retomado) ZW.avancarDia(w, PD);
  check('Fechar no dia 12 e retomar do checkpoint até o dia 30: mesmos 10 hashes', retomado.every((w, i) => ZW.hashMundo(w) === ZW.hashMundo(mundos[i])));
  const ids = retomado.flatMap((w) => w.ledger.tx.map((t) => t.id));
  check('Retomar não duplica transações', new Set(ids).size === ids.length, ids.length + ' ids únicos');
}

ev.hashesD30 = Object.fromEntries(mundos.map((w) => [w.meta.id, ZW.hashMundo(w)]));
fs.writeFileSync(path.join(OUT, 'evidencias.json'), JSON.stringify(ev, null, 1));
const falhas = ev.checagens.filter((c) => !c.ok && !c.nome.startsWith('Dia 1: todos pagaram'));
console.log('\n' + ev.checagens.length + ' checagens · ' + falhas.length + ' falha(s) inesperada(s) · evidências em ' + OUT);
process.exitCode = falhas.length ? 1 : 0;
