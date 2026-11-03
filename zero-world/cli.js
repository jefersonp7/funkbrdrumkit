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
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ZW = require('./engine.js');
const Politica = require('./policy.js');
const Exp = require('./experiment.js');

const args = process.argv.slice(2);
const cmd = args[0];
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
} else {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 12).join('\n'));
}
