// Testes obrigatórios do ZERO WORLD (Fase 12). Rodar: node --test zero-world/test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ZW = require('./engine.js');
const Politica = require('./policy.js');
const Exp = require('./experiment.js');

const novo = (cap, seed, id) => ZW.criarMundo({ id: id || 'TESTE', capitalInicial: cap, seed });

test('1. o saldo nunca muda sem transação', () => {
  const w = novo(50000, 11);
  for (let d = 0; d < 60; d++) {
    const antes = w.ledger.tx.length, saldoAntes = w.ledger.saldo;
    assert.equal(ZW.avancarDia(w, Politica).ok, true);
    const novas = w.ledger.tx.slice(antes);
    const delta = novas.reduce((s, t) => s + (t.direcao === 'ENTRADA' ? t.valor : -t.valor), 0);
    assert.equal(w.ledger.saldo, saldoAntes + delta, 'dia ' + w.dia);
    assert.equal(ZW.auditar(w).ok, true);
  }
  // adulteração é detectada
  const adulterado = ZW.desserializar(ZW.serializar(w));
  adulterado.ledger.saldo += 1;
  assert.equal(ZW.auditar(adulterado).ok, false);
  // saída sem saldo é rejeitada (sem crédito não existe saldo negativo)
  const vazio = novo(0, 1);
  assert.equal(ZW.lancar(vazio, { tipo: 'DESPESA', valor: 100, origem: vazio.agente.conta, destino: 'X', justificativa: 't' }), null);
  assert.equal(vazio.ledger.tx.length, 0);
  assert.throws(() => ZW.lancar(vazio, { tipo: 'RECEITA', valor: 0, origem: 'X', destino: vazio.agente.conta, justificativa: 't' }));
});

test('2. avançar 30 dias processa 30 ciclos', () => {
  const w = novo(0, 22);
  assert.equal(ZW.avancar(w, Politica, 30).ok, true);
  assert.equal(w.dia, 30);
  assert.equal(w.metricas.ciclos, 30);
  assert.equal(w.historico.length, 30);
  assert.deepEqual(w.historico.map((h) => h.dia), Array.from({ length: 30 }, (_, i) => i + 1));
  const internados = w.historico.filter((h) => h.internado).length;
  assert.equal(w.logs.decisoes.length, 30 - internados);
});

test('3. Turbo e Vida produzem o mesmo resultado (mesma seed, política determinística)', () => {
  const turbo = novo(50000, 33);
  ZW.avancar(turbo, Politica, 90);
  let vida = novo(50000, 33);
  for (let d = 0; d < 90; d++) {
    vida = ZW.desserializar(ZW.serializar(vida)); // como se a página fosse recarregada a cada dia
    assert.equal(ZW.avancarDia(vida, Politica).ok, true);
  }
  assert.equal(ZW.hashMundo(vida), ZW.hashMundo(turbo));
});

test('4. um agente não acessa a memória de outro', () => {
  const sozinho = Exp.criarRodada(777).find((w) => w.meta.id === 'ZERO-05');
  ZW.avancar(sozinho, Politica, 60);
  const rodada = Exp.criarRodada(777);
  for (let d = 0; d < 60; d++) for (const w of rodada) ZW.avancarDia(w, Politica); // intercalado
  const doGrupo = rodada.find((w) => w.meta.id === 'ZERO-05');
  assert.equal(ZW.hashMundo(doGrupo), ZW.hashMundo(sozinho));
  for (const w of rodada) {
    const mem = JSON.stringify(w.agente.memoria);
    for (const [outro] of Exp.AGENTES) if (outro !== w.meta.id) assert.equal(mem.includes(outro), false);
  }
  const seeds = new Set(rodada.map((w) => w.meta.seed));
  assert.equal(seeds.size, 10);
});

test('5. nenhum agente acessa informações futuras', () => {
  const vistos = [];
  const espiao = {
    id: 'espiao', tipo: 'teste',
    decidir(obs) {
      const json = JSON.stringify(obs);
      for (const k of ZW.CHAVES_PROIBIDAS) assert.equal(json.includes('"' + k + '"'), false, 'chave proibida: ' + k);
      assert.equal(Object.isFrozen(obs), true);
      assert.throws(() => { obs.agente.caixa = 1e9; }, TypeError);
      vistos.push(obs.dia);
      return Politica.decidir(obs);
    },
  };
  const w = novo(50000, 55);
  assert.equal(ZW.avancar(w, espiao, 45).ok, true);
  assert.ok(vistos.length > 0);
  // mudar o futuro oculto não muda o que o agente sabe hoje
  const a = novo(50000, 56), b = ZW.desserializar(ZW.serializar(a));
  ZW.avancar(a, Politica, 10); ZW.avancar(b, Politica, 10);
  b.oculto.agenda.forEach((e) => { e.dados = Object.assign({}, e.dados, { alterado: true }); });
  b.oculto.agenda.push({ id: 'FUTURO', dia: 999, tipo: 'rg_pronto', dados: {} });
  assert.deepEqual(ZW.observar(a), ZW.observar(b));
  // toda decisão é registrada antes dos resultados do mesmo dia
  for (const r of w.logs.resultados) {
    const dec = w.logs.decisoes.find((d) => d.seq === r.decisaoSeq);
    assert.ok(dec && dec.seq < r.seq && dec.dia === r.dia);
  }
});

test('6. o capital inicial é registrado corretamente e não é receita', () => {
  const zero = novo(0, 61), quinhentos = novo(50000, 62), mil = novo(100000, 63);
  assert.equal(zero.ledger.tx.length, 0);
  assert.equal(ZW.financeiro(zero).roi, 'não aplicável');
  for (const [w, cap] of [[quinhentos, 50000], [mil, 100000]]) {
    const caps = w.ledger.tx.filter((t) => t.tipo === 'CAPITAL_INICIAL');
    assert.equal(caps.length, 1);
    assert.equal(caps[0].valor, cap);
    assert.equal(ZW.financeiro(w).receita, 0);
    ZW.avancar(w, Politica, 40);
    const f = ZW.financeiro(w);
    const receitaLivro = w.ledger.tx.filter((t) => t.tipo === 'RECEITA').reduce((s, t) => s + t.valor, 0);
    assert.equal(f.receita, receitaLivro);
    assert.equal(f.ganhoLiquido, f.patrimonio - cap);
    assert.equal(typeof f.roi, 'number');
  }
});

test('7. o resultado é reproduzível', () => {
  const a = novo(0, 71), b = novo(0, 71), c = novo(0, 72);
  ZW.avancar(a, Politica, 120); ZW.avancar(b, Politica, 120); ZW.avancar(c, Politica, 120);
  assert.equal(ZW.hashMundo(a), ZW.hashMundo(b));
  assert.notEqual(ZW.hashMundo(a), ZW.hashMundo(c));
});

test('8. pausar e retomar não duplica eventos', () => {
  const direto = novo(50000, 81);
  ZW.avancar(direto, Politica, 30);
  const parte = novo(50000, 81);
  ZW.avancar(parte, Politica, 15);
  const retomado = ZW.desserializar(ZW.serializar(parte));
  ZW.avancar(retomado, Politica, 15);
  assert.equal(ZW.hashMundo(retomado), ZW.hashMundo(direto));
  const ids = retomado.ledger.tx.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const seqs = [...retomado.logs.eventos, ...retomado.logs.decisoes, ...retomado.logs.resultados, ...retomado.ledger.tx].map((x) => x.seq);
  assert.equal(new Set(seqs).size, seqs.length);
});

test('9. uma falha não corrompe o histórico', () => {
  const ref = novo(50000, 91);
  ZW.avancar(ref, Politica, 20);
  const w = novo(50000, 91);
  ZW.avancar(w, Politica, 9);
  const hash9 = ZW.hashMundo(w);
  const quebrado = { id: 'quebrado', tipo: 'teste', decidir() { throw new Error('falha simulada no cérebro'); } };
  const r = ZW.avancarDia(w, quebrado);
  assert.equal(r.ok, false);
  assert.equal(w.dia, 9);
  assert.equal(ZW.hashMundo(w), hash9);
  assert.equal(ZW.auditar(w).ok, true);
  ZW.avancar(w, Politica, 11);
  assert.equal(ZW.hashMundo(w), ZW.hashMundo(ref));
});

test('10. resultados não são inventados para completar relatórios', () => {
  const w = novo(50000, 101);
  ZW.avancar(w, Politica, 30);
  assert.equal(ZW.diaRegistrado(w, 31).status, 'NÃO SIMULADO');
  assert.equal(ZW.diaRegistrado(w, 0).status, 'NÃO SIMULADO');
  const d = ZW.diaRegistrado(w, 12);
  assert.equal(d.status, 'SIMULADO');
  const delta = d.transacoes.reduce((s, t) => s + (t.direcao === 'ENTRADA' ? t.valor : -t.valor), 0);
  assert.equal(d.caixaInicio + delta, d.caixaFim);
  const m = Exp.metricas(w);
  assert.equal(m.receita, w.ledger.tx.filter((t) => t.tipo === 'RECEITA').reduce((s, t) => s + t.valor, 0));
  // a análise coletiva se recusa a rodar com a rodada incompleta
  const rodada = Exp.criarRodada(5);
  ZW.avancar(rodada[0], Politica, 10);
  assert.throws(() => Exp.analisar(rodada, 10), /rodada não concluída/);
});

// ---------------------------------------------------------------- cenário digital
const PD = require('./policy-digital.js');
const digital = (seed, carreira) => ZW.criarMundo({ id: 'DIG', capitalInicial: 50000, seed, cenario: 'digital', carreira: carreira || 'adaptativo' });

test('D1. no cenário digital, trabalho braçal e CLT são recusados pelo motor', () => {
  const w = digital(201);
  const bracal = { id: 'b', tipo: 'teste', decidir: () => ({ plano: [{ tipo: 'DIARIA_BRACAL' }, { tipo: 'BUSCAR_VAGAS' }, { tipo: 'DORMIR', onde: 'rua' }], alternativas: [] }) };
  ZW.avancar(w, bracal, 3);
  const res = w.logs.resultados.filter((r) => r.acao === 'DIARIA_BRACAL' || r.acao === 'BUSCAR_VAGAS');
  assert.equal(res.length, 6);
  assert.ok(res.every((r) => !r.ok && r.resultado === 'fora do cenário digital'));
  assert.equal(w.ledger.tx.filter((t) => t.tipo === 'RECEITA').length, 0);
});

test('D2. 10 carreiras: Turbo = Vida, auditoria fecha e mundos isolados', () => {
  const rodada = Exp.criarRodadaDigital(7);
  for (const w of rodada) {
    let vida = ZW.desserializar(ZW.serializar(w));
    ZW.avancar(w, PD, 60);
    for (let d = 0; d < 60; d++) { vida = ZW.desserializar(ZW.serializar(vida)); assert.equal(ZW.avancarDia(vida, PD).ok, true); }
    assert.equal(ZW.hashMundo(vida), ZW.hashMundo(w), w.meta.id);
    assert.equal(ZW.auditar(w).ok, true);
  }
  const outro = Exp.criarRodadaDigital(7).find((w) => w.meta.id === 'DIGI-04');
  ZW.avancar(outro, PD, 60);
  assert.equal(ZW.hashMundo(outro), ZW.hashMundo(rodada.find((w) => w.meta.id === 'DIGI-04')));
});

test('D3. taxas reais das plataformas são lançadas no livro', () => {
  let freela = 0, produto = 0;
  for (const seed of [1, 2, 3]) {
    for (const [carreira, ok] of [['freela', 'f'], ['produto', 'p']]) {
      const w = digital(seed, carreira);
      ZW.avancar(w, PD, 200);
      const tx = w.ledger.tx;
      tx.forEach((t, i) => {
        if (t.origem === 'PLATAFORMA:freela') { const taxa = tx[i + 1]; assert.equal(taxa.destino, 'PLATAFORMA:taxa_freela'); assert.equal(taxa.valor, Math.round(t.valor * 0.2)); freela++; }
        if (t.origem === 'PLATAFORMA:kiwify') {
          const taxa = tx[i + 1]; const vendas = t.valor / 4700;
          assert.ok(Number.isInteger(vendas));
          assert.equal(taxa.valor, vendas * (Math.round(4700 * 0.0899) + 249) + 367); produto++;
        }
      });
      void ok;
    }
  }
  assert.ok(freela > 0 && produto > 0, 'esperava pelo menos um pagamento de cada plataforma');
});

test('D4. no digital o agente não vê concorrência, inscritos nem orçamento oculto', () => {
  const espiao = { id: 'e', tipo: 't', decidir(o) { const j = JSON.stringify(o); for (const k of ZW.CHAVES_PROIBIDAS) assert.equal(j.includes('"' + k + '"'), false, k); return PD.decidir(o); } };
  for (const c of ['freela', 'ugc', 'online']) { const w = digital(301, c); assert.equal(ZW.avancar(w, espiao, 60).ok, true); }
});

test('D5. o cenário clássico não mudou: hashes da rodada de referência', () => {
  const ref = require('./runs/R20261104/resumo.json');
  const rodada = Exp.criarRodada(20261104);
  Exp.executar(rodada, Politica, 240);
  for (const w of rodada) assert.equal(ZW.hashMundo(w), ref.hashes[w.meta.id], w.meta.id);
});
