#!/usr/bin/env node
/*
 * ZERO WORLD — linha de comando (execução persistente em disco)
 *
 *   node zero-world/cli.js criar  --checkpoint arq.json --id ZERO-05 --capital 500 --semente 123
 *   node zero-world/cli.js vida   --checkpoint arq.json            (avança 1 dia e mostra o detalhe)
 *   node zero-world/cli.js turbo  --checkpoint arq.json --dias 30   (N ciclos diários completos)
 *   node zero-world/cli.js 24x    --checkpoint arq.json             (1 dia virtual por hora real, até ser interrompido)
 *   node zero-world/cli.js dia    --checkpoint arq.json --dia 12    (replay de um dia já simulado)
 *   node zero-world/cli.js rodada --semente 20261104 --dias 240 --rodadas 5 --saida zero-world/runs/R20261104
 *   node zero-world/cli.js digital-agora                            (estado atual da rodada digital ao vivo)
 *   node zero-world/cli.js digital-24x [--uma-vez]                  (fica ligado: avança a rodada ao vivo e grava o diário)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ZW = require('./engine.js');
const Politica = require('./policy.js');
const Exp = require('./experiment.js');
const PoliticaDigital = require('./policy-digital.js');
// Rodada AO VIVO do cenário digital: 1 hora real = 1 dia virtual a partir deste instante.
const AO_VIVO = require('./ao-vivo.json');

const args = process.argv.slice(2);
const cmd = args[0];
const agoraMs = () => (process.env.ZW_AGORA ? Date.parse(process.env.ZW_AGORA) : Date.now()); // ZW_AGORA só para testes
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

function carregar(arq) { return ZW.desserializar(fs.readFileSync(arq, 'utf8')); }
function salvar(arq, w) {
  const tmp = arq + '.tmp';
  fs.writeFileSync(tmp, ZW.serializar(w));
  fs.renameSync(tmp, arq); // gravação atômica: um travamento não deixa checkpoint pela metade
}
function imprimirDia(w, dia) {
  const d = ZW.diaRegistrado(w, dia);
  if (d.status !== 'SIMULADO') { console.log('Dia ' + dia + ': ' + d.status); return; }
  console.log(`\n=== ${w.meta.id} · dia ${d.dia} (${d.data}) ===`);
  console.log(`caixa ${ZW.brl(d.caixaInicio)} → ${ZW.brl(d.caixaFim)} · patrimônio ${ZW.brl(d.patrimonio)} · ${d.local} · ${d.estrategia}`);
  console.log('necessidades', JSON.stringify(d.necessidades));
  if (d.internado) console.log('INTERNADO');
  for (const a of d.alternativas) console.log('  considerou:', a.acao, a.escolhida ? '✓' : '✗', a.motivo || '');
  for (const r of d.resultados) console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.acao + ' — ' + r.resultado + (r.params.motivo ? '  [' + r.params.motivo + ']' : ''));
  for (const e of d.eventos) console.log('  evento:', e.tipo, e.texto);
  for (const t of d.transacoes) console.log(`  ${t.id} ${t.tipo} ${t.direcao === 'ENTRADA' ? '+' : '-'}${ZW.brl(t.valor)} ${t.origem}→${t.destino} (${t.justificativa}) saldo ${ZW.brl(t.saldoPosterior)}`);
}

function csvLedger(w) {
  const cols = ['id', 'agente', 'dia', 'tipo', 'direcao', 'valor', 'origem', 'destino', 'justificativa', 'saldoAnterior', 'saldoPosterior'];
  const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  return [cols.join(',')].concat(w.ledger.tx.map((t) => cols.map((c) => esc(t[c])).join(','))).join('\n') + '\n';
}

if (cmd === 'criar') {
  const w = ZW.criarMundo({ id: opt('id', 'ZERO-X'), capitalInicial: Math.round(Number(opt('capital', '0')) * 100), seed: Number(opt('semente', '1')) });
  salvar(opt('checkpoint'), w);
  console.log('criado', w.meta.id, 'semente', w.meta.seed, 'hash', ZW.hashMundo(w));
} else if (cmd === 'vida' || cmd === 'turbo') {
  const arq = opt('checkpoint');
  const w = carregar(arq);
  const n = cmd === 'vida' ? 1 : Number(opt('dias', '30'));
  const r = ZW.avancar(w, Politica, n);
  salvar(arq, w);
  if (cmd === 'vida') imprimirDia(w, w.dia);
  console.log(r.ok ? `ok: dia ${w.dia}` : `ERRO no dia ${w.dia + 1}: ${r.erro} (estado preservado no dia ${w.dia})`, 'hash', ZW.hashMundo(w), 'auditoria', ZW.auditar(w).ok);
} else if (cmd === '24x') {
  const arq = opt('checkpoint');
  const passo = () => {
    const w = carregar(arq);
    const r = ZW.avancarDia(w, Politica);
    salvar(arq, w);
    console.log(new Date().toISOString(), r.ok ? 'dia ' + w.dia : 'ERRO ' + r.erro, ZW.brl(w.ledger.saldo));
  };
  console.log('Modo 24x: 1 dia virtual por hora real. Ctrl+C para parar; o checkpoint fica salvo a cada dia.');
  passo();
  setInterval(passo, 3600 * 1000);
} else if (cmd === 'dia') {
  imprimirDia(carregar(opt('checkpoint')), Number(opt('dia')));
} else if (cmd === 'rodada') {
  const semente = Number(opt('semente', '20261104'));
  const dias = Number(opt('dias', '240'));
  const nRodadas = Number(opt('rodadas', '1'));
  const saida = opt('saida', path.join(__dirname, 'runs', 'R' + semente));
  fs.mkdirSync(saida, { recursive: true });
  const t0 = Date.now();
  const mundos = Exp.criarRodada(semente);
  const erros = Exp.executar(mundos, Politica, dias);
  if (erros.length) { console.error('erros:', erros); process.exit(1); }
  const analise = Exp.analisar(mundos, dias);
  for (const w of mundos) {
    const dir = path.join(saida, w.meta.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'livro-caixa.csv'), csvLedger(w));
    fs.writeFileSync(path.join(dir, 'decisoes.jsonl'), w.logs.decisoes.map((d) => JSON.stringify(d)).join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'resultados.jsonl'), w.logs.resultados.map((d) => JSON.stringify(d)).join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'eventos.jsonl'), w.logs.eventos.map((d) => JSON.stringify(d)).join('\n') + '\n');
  }
  const extras = [];
  for (let i = 1; i < nRodadas; i++) extras.push(semente + i);
  const multi = Exp.rodadas([semente].concat(extras), Politica, dias);
  const resumo = {
    motor: ZW.VERSAO_MOTOR, politica: Politica.id, tipoCerebro: Politica.tipo, semente, dias,
    sementesRodadas: multi.sementes, executadoEm: new Date().toISOString(), msTotal: Date.now() - t0,
    hashes: Object.fromEntries(mundos.map((w) => [w.meta.id, ZW.hashMundo(w)])),
    analise, agregadoMultiRodadas: multi.agregado, aprendizados: Exp.aprendizados(analise),
  };
  fs.writeFileSync(path.join(saida, 'resumo.json'), JSON.stringify(resumo, null, 1));
  console.log('rodada', semente, '·', dias, 'dias ·', mundos.length, 'mundos ·', (Date.now() - t0) + ' ms');
  for (const m of analise.metricas) console.log(m.id, 'capital', ZW.brl(m.capitalInicial), 'patrimônio', ZW.brl(m.patrimonio), 'ganho', ZW.brl(m.ganhoLiquido), '1ª receita D' + m.diaPrimeiraReceita, 'estável D' + m.diaEstabilidade, 'hash', m.hash);
  console.log('agregado', JSON.stringify(multi.agregado));
} else if (cmd === 'digital-rodada') {
  const semente = Number(opt('semente', '20261104'));
  const dias = Number(opt('dias', '240'));
  const saida = opt('saida', path.join(__dirname, 'runs', 'D' + semente));
  fs.mkdirSync(saida, { recursive: true });
  const t0 = Date.now();
  const mundos = Exp.criarRodadaDigital(semente);
  const erros = Exp.executar(mundos, PoliticaDigital, dias);
  if (erros.length) { console.error('erros:', erros); process.exit(1); }
  const analise = Exp.analisar(mundos, dias);
  for (const w of mundos) {
    const dir = path.join(saida, w.meta.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'livro-caixa.csv'), csvLedger(w));
    fs.writeFileSync(path.join(dir, 'decisoes.jsonl'), w.logs.decisoes.map((d) => JSON.stringify(d)).join('\n') + '\n');
    fs.writeFileSync(path.join(dir, 'resultados.jsonl'), w.logs.resultados.map((d) => JSON.stringify(d)).join('\n') + '\n');
  }
  const resumo = { motor: ZW.VERSAO_MOTOR, politica: PoliticaDigital.id, tipoCerebro: PoliticaDigital.tipo, semente, dias, msTotal: Date.now() - t0, hashes: Object.fromEntries(mundos.map((w) => [w.meta.id, ZW.hashMundo(w)])), carreiras: Object.fromEntries(mundos.map((w) => [w.meta.id, w.carreira])), analise };
  fs.writeFileSync(path.join(saida, 'resumo.json'), JSON.stringify(resumo, null, 1));
  for (const m of analise.metricas) console.log(m.id, (m.carreira || '').padEnd(12), 'patrimônio', ZW.brl(m.patrimonio), 'ganho', ZW.brl(m.ganhoLiquido), '1ª receita D' + m.diaPrimeiraReceita, 'hash', m.hash);
  console.log((Date.now() - t0) + ' ms');
} else if (cmd === 'digital-agora') {
  // Calcula o dia virtual pelo relógio real e reproduz a rodada ao vivo até lá (determinístico).
  const agora = agoraMs(), inicio = Date.parse(AO_VIVO.inicioReal);
  if (agora < inicio) { console.log('A rodada ao vivo começa em ' + AO_VIVO.inicioReal + ' (faltam ' + Math.ceil((inicio - agora) / 60000) + ' min).'); process.exit(0); }
  const diaAtual = Math.min(AO_VIVO.horizonte, Math.floor((agora - inicio) / 3600000) + 1);
  const concluidos = Math.max(0, diaAtual - 1);
  const mundos = Exp.criarRodadaDigital(AO_VIVO.semente, { dataInicio: AO_VIVO.dataInicioVirtual });
  Exp.executar(mundos, PoliticaDigital, concluidos);
  const fracao = ((agora - inicio) % 3600000) / 3600000;
  const estado = { geradoEm: new Date(agora).toISOString(), aoVivo: AO_VIVO, diaVirtualEmAndamento: diaAtual, diasConcluidos: concluidos, horaVirtual: Math.floor(fracao * 24) + ':' + String(Math.floor((fracao * 1440) % 60)).padStart(2, '0'), agentes: mundos.map((w) => Object.assign(Exp.metricas(w), { carreira: w.carreira })) };
  const saida = opt('saida', path.join(__dirname, 'runs', 'AO-VIVO'));
  fs.mkdirSync(saida, { recursive: true });
  fs.writeFileSync(path.join(saida, 'estado-agora.json'), JSON.stringify(estado, null, 1));
  console.log('ao vivo · dia virtual', diaAtual, '(' + concluidos + ' concluídos) · hora virtual', estado.horaVirtual);
  for (const m of estado.agentes) console.log(m.id, m.carreira.padEnd(12), ZW.brl(m.patrimonio));
} else if (cmd === 'digital-24x') {
  // Fica ligado na máquina do usuário. A cada minuto confere o relógio; quando um dia virtual
  // termina (1 hora real), simula esse dia nos 10 mundos e grava o diário. Sem tokens, sem IA.
  const pasta = opt('saida', path.join(__dirname, 'runs', 'AO-VIVO'));
  const pastaDiario = path.join(pasta, 'diario');
  const arqCk = path.join(pasta, 'checkpoint.json');
  fs.mkdirSync(pastaDiario, { recursive: true });
  const inicio = Date.parse(AO_VIVO.inicioReal);
  const hh = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
  const sinal = (t) => (t.direcao === 'ENTRADA' ? '+' : '−') + ZW.brl(t.valor);

  let mundos = null;
  if (fs.existsSync(arqCk)) {
    try {
      const ck = JSON.parse(fs.readFileSync(arqCk, 'utf8'));
      if (ck.semente === AO_VIVO.semente && ck.inicioReal === AO_VIVO.inicioReal) {
        mundos = ck.mundos;
        const ok = mundos.every((w) => ZW.auditar(w).ok && w.dia === mundos[0].dia);
        if (!ok) { console.log('checkpoint inválido: recalculando a partir da semente'); mundos = null; }
      }
    } catch (e) { console.log('checkpoint ilegível (' + e.message + '): recalculando a partir da semente'); mundos = null; }
  }
  if (!mundos) mundos = Exp.criarRodadaDigital(AO_VIVO.semente, { dataInicio: AO_VIVO.dataInicioVirtual });

  function salvarCheckpoint() {
    const tmp = arqCk + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ semente: AO_VIVO.semente, inicioReal: AO_VIVO.inicioReal, mundos }));
    fs.renameSync(tmp, arqCk);
  }
  function diarioDoDia(w, dia, atraso) {
    const d = ZW.diaRegistrado(w, dia);
    const dec = w.logs.decisoes.find((x) => x.dia === dia);
    const decSeq = dec ? dec.seq : Infinity;
    const linhas = [];
    linhas.push(`## Dia ${dia} · ${d.data}` + (atraso ? ` · calculado com atraso (máquina estava desligada); resultado idêntico, pois é determinístico` : ''));
    linhas.push(`Caixa ${ZW.brl(d.caixaInicio)} → ${ZW.brl(d.caixaFim)} · patrimônio ${ZW.brl(d.patrimonio)} · dormiu: ${d.noite} · ${d.estrategia}` + (d.internado ? ' · INTERNADO' : ''));
    for (const t of d.transacoes.filter((x) => x.seq < decSeq)) linhas.push(`- 00:00 ${sinal(t)} ${t.justificativa}`);
    for (const e of d.eventos.filter((x) => x.seq < decSeq)) linhas.push(`- 00:00 ${e.texto}`);
    let t = 7, ultimo = decSeq;
    for (const r of d.resultados) {
      const ini = r.acao === 'DORMIR' ? Math.max(t, 22) : t;
      const txs = d.transacoes.filter((x) => x.seq > ultimo && x.seq < r.seq); ultimo = r.seq;
      linhas.push(`- ${hh(ini)} ${r.ok ? '' : '✗ '}${r.acao.replace(/_/g, ' ').toLowerCase()} — ${r.resultado}` + (txs.length ? ' (' + txs.map(sinal).join(', ') + ')' : ''));
      if (r.acao !== 'DORMIR') t += r.horas;
    }
    for (const x of d.transacoes.filter((y) => y.seq > ultimo)) linhas.push(`- fim do dia ${sinal(x)} ${x.justificativa}`);
    for (const e of d.eventos.filter((x) => x.seq > decSeq)) linhas.push(`- evento: ${e.texto}`);
    return linhas.join('\n') + '\n\n';
  }
  function gravarResumo() {
    const ms = mundos.map((w) => Object.assign(Exp.metricas(w), { carreira: w.carreira }));
    const tab = ['| Agente | Carreira | Patrimônio | Ganho líquido | Receita | 1ª receita | Moradia | Estratégia |', '|---|---|---|---|---|---|---|---|']
      .concat(ms.map((m) => `| ${m.id} | ${m.carreira} | ${ZW.brl(m.patrimonio)} | ${ZW.brl(m.ganhoLiquido)} | ${ZW.brl(m.receita)} | ${m.diaPrimeiraReceita ? 'D' + m.diaPrimeiraReceita : '—'} | ${m.moradia} | ${m.estrategiaFinal} |`));
    fs.writeFileSync(path.join(pasta, 'RESUMO.md'), `# Rodada ao vivo · ${mundos[0].dia} dia(s) concluído(s)\n\nAtualizado em ${new Date(agoraMs()).toLocaleString('pt-BR')}. Resultado simulado (política programada, não é IA).\n\n` + tab.join('\n') + '\n');
    fs.writeFileSync(path.join(pasta, 'estado-agora.json'), JSON.stringify({ atualizadoEm: new Date(agoraMs()).toISOString(), diasConcluidos: mundos[0].dia, aoVivo: AO_VIVO, agentes: ms }, null, 1));
  }
  function passo() {
    const agora = agoraMs();
    if (agora < inicio) { console.log('aguardando o início em ' + AO_VIVO.inicioReal); return; }
    const alvo = Math.min(AO_VIVO.horizonte, Math.floor((agora - inicio) / 3600000)); // dias concluídos
    let n = 0;
    while (mundos[0].dia < alvo) {
      const dia = mundos[0].dia + 1;
      const fimReal = inicio + dia * 3600000;
      const atraso = agora - fimReal > 5 * 60000;
      for (const w of mundos) {
        const r = ZW.avancarDia(w, PoliticaDigital);
        if (!r.ok) { console.error(w.meta.id + ' falhou no dia ' + dia + ': ' + r.erro + ' (estado preservado)'); process.exitCode = 1; return; }
        fs.appendFileSync(path.join(pastaDiario, w.meta.id + '-' + w.carreira + '.md'), diarioDoDia(w, dia, atraso));
      }
      n++;
    }
    if (n) {
      salvarCheckpoint(); gravarResumo();
      console.log(new Date(agora).toLocaleString('pt-BR') + ' · ' + n + ' dia(s) processado(s) · ' + mundos[0].dia + ' concluído(s) · ' + mundos.map((w) => w.meta.id.slice(-2) + ' ' + ZW.brl(w.ledger.saldo)).join(' | '));
    }
    if (mundos[0].dia >= AO_VIVO.horizonte) { console.log('Rodada concluída (' + AO_VIVO.horizonte + ' dias).'); process.exit(0); }
  }
  console.log('Zero World digital · 24x · 1 hora real = 1 dia virtual · início ' + AO_VIVO.inicioReal + ' · diário em ' + pastaDiario);
  passo();
  if (!opt('uma-vez', null) && !args.includes('--uma-vez')) {
    setInterval(passo, 60 * 1000);
    process.on('SIGINT', () => { salvarCheckpoint(); console.log('\nparado; checkpoint salvo no dia ' + mundos[0].dia); process.exit(0); });
  }
} else {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 15).join('\n'));
}
