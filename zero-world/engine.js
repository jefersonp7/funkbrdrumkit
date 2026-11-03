/*
 * ZERO WORLD — World Engine (motor do mundo)
 *
 * Responsável por: estado do mundo, regras econômicas, validação de ações,
 * sorteios (RNG com seed), livro-caixa e auditoria.
 * O cérebro do agente (policy.js) NÃO tem acesso a este estado: ele recebe
 * apenas uma observação congelada, montada por observar().
 *
 * Valores monetários: inteiros em centavos.
 */
(function (g) {
  'use strict';

  const VERSAO_MOTOR = 'zero-world-motor-0.1.0';

  // ---------------------------------------------------------------- utilidades
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  const hashSeed = (s) => parseInt(fnv1a(String(s)), 16) >>> 0;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) deepFreeze(o[k]);
    }
    return o;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function brl(c) {
    const s = (Math.abs(c) / 100).toFixed(2).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (c < 0 ? '-' : '') + 'R$ ' + s[0] + ',' + s[1];
  }
  function dataVirtual(inicioISO, dia) {
    const d = new Date(inicioISO + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dia - 1);
    return d.toISOString().slice(0, 10);
  }

  // ------------------------------------------------- RNG (mulberry32, oculto)
  // O estado do gerador vive em world.oculto e só o motor o usa.
  function rng(w) {
    let a = w.oculto.rngState | 0;
    a = (a + 0x6D2B79F5) | 0;
    w.oculto.rngState = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rInt = (w, lo, hi) => lo + Math.floor(rng(w) * (hi - lo + 1));
  const rChance = (w, p) => rng(w) < p;
  function rNormal(w) {
    const u = Math.max(rng(w), 1e-12), v = rng(w);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ----------------------------------------------------------- parâmetros
  // tag: REAL = fonte pública citada (pesquisa web em 03/11/2026, conferida no
  //             resultado de busca, não na fonte primária)
  //      ESTIMATIVA = valor escolhido a partir de faixa de mercado ou suposição
  //      SINTETICA = regra inventada para o simulador funcionar
  const T = { REAL: 'REAL', EST: 'ESTIMATIVA', SIN: 'SINTETICA' };
  const PARAMETROS = {
    salarioMinimo: { v: 162100, tag: T.REAL, desc: 'Salário mínimo 2026', fonte: 'https://www.serasaexperian.com.br/carreiras/blog-carreiras/salario-minimo-2026/' },
    restPopRefeicao: { v: 300, tag: T.REAL, desc: 'Refeição no Restaurante Popular de BH', fonte: 'https://prefeitura.pbh.gov.br/noticias/restaurante-popular-oferece-refeicoes-saudaveis-e-baixo-custo', nota: 'data da fonte incerta' },
    restPopGratisRua: { v: 1, tag: T.REAL, desc: 'Refeição 100% subsidiada para população de rua', fonte: 'https://prefeitura.pbh.gov.br/noticias/restaurante-popular-oferece-refeicoes-saudaveis-e-baixo-custo' },
    bolsaFamilia: { v: 60000, tag: T.REAL, desc: 'Bolsa Família, valor mínimo por família', fonte: 'https://www.opovo.com.br/trends/governo-decidiu-o-valor-do-bolsa-familia-para-2026/' },
    bolsaFamiliaLimite: { v: 21800, tag: T.REAL, desc: 'Limite de renda por pessoa para o Bolsa Família', fonte: 'https://www.opovo.com.br/trends/governo-decidiu-o-valor-do-bolsa-familia-para-2026/' },
    meioSalarioMinimo: { v: 81050, tag: T.REAL, desc: 'Meio salário mínimo (limite do CadÚnico)', fonte: 'https://www.opovo.com.br/trends/governo-decidiu-o-valor-do-bolsa-familia-para-2026/' },
    dasMei: { v: 8605, tag: T.REAL, desc: 'DAS MEI de serviços 2026', fonte: 'https://www.opovo.com.br/noticias/economia/2026/01/02/contribuicao-mensal-do-mei-sobe-para-rs-8105-em-2026.html' },
    wifiGratis: { v: 1, tag: T.REAL, desc: 'Wi-Fi BH gratuito com CPF', fonte: 'https://prefeitura.pbh.gov.br/noticias/wi-fi-bh-gratuito-segue-em-expansao-pela-cidade-e-alcanca-mais-de-7-milhoes-de-usuarios' },
    telecentros: { v: 1, tag: T.REAL, desc: 'Telecentros com computador gratuito', fonte: 'https://prefeitura.pbh.gov.br/transparencia/duvidas-frequentes/pontos-de-acesso-livre-internet' },
    socialMediaMes: { v: 50000, tag: T.EST, desc: 'Gestão de Instagram, preço inicial por mês', fonte: 'https://www.cronoshare.com.br/quanto-custa/servico-gerenciamento-midia-social', nota: 'faixa R$500–1.000 em blog comercial' },
    clippingPorMil: { v: 500, tag: T.EST, desc: 'Pagamento de clipping por mil views (~US$1)', fonte: 'https://cut.pro/pt-BR/blog/economia-clipping-pago-um-dolar-mil-views-2026' },
    diariaMin: { v: 12000, tag: T.EST, desc: 'Diária braçal, mínimo', fonte: 'https://catracalivre.com.br/noticias/quanto-custa-contratar-pedreiro-por-um-dia/', nota: 'guia nacional R$120–190' },
    diariaMax: { v: 19000, tag: T.EST, desc: 'Diária braçal, máximo', fonte: 'https://catracalivre.com.br/noticias/quanto-custa-contratar-pedreiro-por-um-dia/' },
    refeicaoComum: { v: 1800, tag: T.EST, desc: 'Marmita/PF comum' },
    celularUsado: { v: 30000, tag: T.EST, desc: 'Celular usado com câmera razoável' },
    chip: { v: 1500, tag: T.EST, desc: 'Chip pré-pago' },
    planoCelular: { v: 3000, tag: T.EST, desc: 'Recarga mensal de dados' },
    notebookUsado: { v: 90000, tag: T.EST, desc: 'Notebook usado' },
    quartoMes: { v: 65000, tag: T.EST, desc: 'Quarto alugado por mês' },
    pensaoNoite: { v: 5000, tag: T.EST, desc: 'Pernoite em pensão' },
    perfilGoogle: { v: 18000, tag: T.EST, desc: 'Configurar Perfil da Empresa no Google', nota: 'preço não pesquisado; definido pelo autor' },
    siteSimples: { v: 60000, tag: T.EST, desc: 'Site simples de uma página', nota: 'preço não pesquisado' },
    salarioVagaMin: { v: 162100, tag: T.EST, desc: 'Salário das vagas sintéticas (mínimo)' },
    salarioVagaMax: { v: 200000, tag: T.EST, desc: 'Salário das vagas sintéticas (máximo)' },
    liquidoCLT: { v: 0.88, tag: T.EST, desc: 'Fração líquida do salário (INSS/VT)' },
    probDiaria: { v: 0.5, tag: T.SIN, desc: 'Chance de conseguir diária ao procurar' },
    probVagaAlbergue: { v: 0.85, tag: T.SIN, desc: 'Chance de vaga no albergue na noite' },
    probFurtoRua: { v: 0.03, tag: T.SIN, desc: 'Chance de furto dormindo na rua (perde metade do dinheiro)' },
    probDoenca: { v: 0.008, tag: T.SIN, desc: 'Chance diária de adoecer' },
    prazoRG: { v: 20, tag: T.SIN, desc: 'Dias até o RG ficar pronto (gratuidade assumida)' },
    prazoAnaliseBF: { v: 45, tag: T.SIN, desc: 'Dias até a análise do Bolsa Família' },
    probNovaVaga: { v: 0.3, tag: T.SIN, desc: 'Chance diária de surgir uma vaga sintética' },
    probCalote: { v: 0.06, tag: T.SIN, desc: 'Chance de um cliente não pagar a entrega' },
    churnMensal: { v: 0.07, tag: T.SIN, desc: 'Chance de um cliente mensal cancelar' },
    numNegocios: { v: 80, tag: T.SIN, desc: 'Comércios sintéticos no mapa do agente' },
    passagemOnibus: { v: 625, tag: T.REAL, desc: 'Passagem de ônibus em BH (2026)', fonte: 'https://diariodotransporte.com.br/2025/12/30/tarifas-de-onibus-em-belo-horizonte-aumentam-em-1o-de-janeiro-de-2026-confira-os-valores/' },
    usdBrl: { v: 520, tag: T.REAL, desc: 'Dólar em reais (projeção Focus fim de 2026)', fonte: 'https://www.band.com.br/economia/noticias/dolar-no-fim-de-2026-segue-em-r-520-pela-oitava-semana-seguida-aponta-focus-202608100918', nota: 'em centavos por US$1' },
    clippingUSDporMil: { v: 1.0, tag: T.EST, desc: 'Clipping: US$ por mil views', fonte: 'https://cut.pro/pt-BR/blog/economia-clipping-pago-um-dolar-mil-views-2026', nota: 'faixa relatada US$0,50–25' },
    taxaWorkana: { v: 0.2, tag: T.REAL, desc: 'Taxa da plataforma de freela (Workana, até US$300 por cliente)', fonte: 'https://www.mobills.com.br/blog/ganhar-dinheiro/ganhar-dinheiro-na-workana/', nota: 'fontes divergem (12–20%)' },
    kiwifyPct: { v: 0.0899, tag: T.REAL, desc: 'Taxa percentual da Kiwify por venda', fonte: 'https://viniensina.com.br/?p=4267' },
    kiwifyFixa: { v: 249, tag: T.REAL, desc: 'Taxa fixa da Kiwify por venda', fonte: 'https://viniensina.com.br/?p=4267' },
    kiwifySaque: { v: 367, tag: T.REAL, desc: 'Taxa de saque da Kiwify', fonte: 'https://herospark.com/blog/quanto-a-kiwify-cobra-por-venda/' },
    respostaFrio: { v: 0.15, tag: T.EST, desc: 'Resposta a mensagem fria no WhatsApp/DM', fonte: 'https://www.campograndenews.com.br/artigos/prospeccao-ativa-em-2026-o-que-ainda-funciona-no-brasil', nota: 'dado de fornecedor, ~15–20%' },
    afiliadoConversao: { v: 0.02, tag: T.EST, desc: 'Conversão de cliques de afiliado Shopee', fonte: 'https://www.divulganinja.com.br/blog/quanto-shopee-paga-comissao-afiliados-2026', nota: 'faixa 1,5–4% (blog comercial)' },
    afiliadoComissao: { v: 0.06, tag: T.EST, desc: 'Comissão média de afiliado Shopee', fonte: 'https://www.divulganinja.com.br/blog/quanto-shopee-paga-comissao-afiliados-2026', nota: 'fontes citam 3% a 15%' },
    ticketAfiliado: { v: 6000, tag: T.EST, desc: 'Ticket médio de compra via afiliado', fonte: 'https://www.divulganinja.com.br/blog/como-acompanhar-minhas-comissoes-shopee' },
    ugcMin: { v: 12000, tag: T.EST, desc: 'Vídeo UGC iniciante, mínimo', fonte: 'https://influee.co/br/blog/ugc-price' },
    ugcMax: { v: 21000, tag: T.EST, desc: 'Vídeo UGC iniciante, máximo', fonte: 'https://influee.co/br/blog/ugc-price' },
    trafegoMes: { v: 50000, tag: T.EST, desc: 'Gestão de tráfego pago, iniciante por mês', fonte: 'https://trafius.com.br/blog/preco-de-gestor-de-trafego-em-2026-tabela-por-porte' },
    precoProduto: { v: 4700, tag: T.EST, desc: 'Preço do produto digital (kit de posts)' },
    horasProduto: { v: 15, tag: T.SIN, desc: 'Horas para criar o produto digital' },
    liberacaoPlataforma: { v: 7, tag: T.SIN, desc: 'Dias para a plataforma de freela liberar o pagamento' },
    pagamentoUGC: { v: 15, tag: T.SIN, desc: 'Dias para a marca pagar o UGC' },
    pagamentoKiwify: { v: 7, tag: T.SIN, desc: 'Dias até o saque das vendas do produto' },
    telecentroHoras: { v: 4, tag: T.SIN, desc: 'Horas máximas de computador no telecentro por dia' },
    mensagensPorHora: { v: 15, tag: T.SIN, desc: 'Mensagens de prospecção online por hora' },
    numOnline: { v: 300, tag: T.SIN, desc: 'Negócios da Grande BH alcançáveis por mensagem' },
    fatorAceite: { v: 0.3, tag: T.SIN, desc: 'Calibração do aceite de proposta a frio (aceite médio ~5–10%)', nota: 'calibrado em 03/11/2026: com 1,0 o aceite médio era ~20%, irrealista' },
  };
  const pv = (k) => PARAMETROS[k].v;

  const TIPOS_NEGOCIO = [
    ['barbearia', 30000, 90000], ['padaria', 30000, 80000], ['oficina', 30000, 100000],
    ['restaurante', 50000, 150000], ['salão', 30000, 90000], ['pet shop', 40000, 120000],
    ['academia', 50000, 150000], ['clínica', 80000, 200000], ['loja de roupa', 30000, 100000],
    ['lanchonete', 20000, 70000],
  ];
  const BAIRROS = ['Centro', 'Lagoinha', 'Floresta', 'Santa Tereza', 'Barro Preto', 'Carlos Prates', 'Santa Efigênia', 'Funcionários'];
  const CARGOS = ['ajudante de carga', 'auxiliar de limpeza', 'atendente', 'repositor', 'auxiliar de cozinha', 'porteiro'];
  const SERVICOS = {
    perfil_google: { horas: 5, prazo: 7, mensal: false, requer: ['celular'] },
    social_media: { horas: 12, prazo: 30, mensal: true, requer: ['celular'] },
    site: { horas: 20, prazo: 21, mensal: false, requer: ['notebook'] },
    trafego_pago: { horas: 8, prazo: 30, mensal: true, requer: ['celular'] },
    ugc: { horas: 4, prazo: 5, mensal: false, requer: ['celular'] },
    freela: { horas: 0, prazo: 0, mensal: false, requer: ['celular'] },
  };
  const CATEGORIAS_FREELA = [
    ['social_media', 30000, 80000, 12, 10, 'marketing'], ['edicao_video', 10000, 40000, 5, 5, 'tecnologia'],
    ['site', 50000, 150000, 20, 15, 'programacao'], ['design', 8000, 30000, 3, 4, 'marketing'],
  ];
  const BAIRROS_GRANDE_BH = BAIRROS.concat(['Contagem', 'Betim', 'Nova Lima', 'Venda Nova', 'Pampulha', 'Barreiro', 'Buritis', 'Savassi']);
  const ACOES_SO_CLASSICO = ['DIARIA_BRACAL', 'BUSCAR_VAGAS', 'CANDIDATAR', 'TRABALHAR_EMPREGO'];
  const ENTRADAS = ['CAPITAL_INICIAL', 'RECEITA', 'BENEFICIO', 'EMPRESTIMO'];
  const SAIDAS = ['DESPESA', 'COMPRA_ATIVO', 'DEPOSITO_CAUCAO', 'PERDA', 'IMPOSTO', 'PAGAMENTO_DIVIDA'];

  // ------------------------------------------------------------ criação
  function criarMundo(cfg) {
    const id = cfg.id;
    const capital = cfg.capitalInicial | 0;
    if (capital < 0) throw new Error('capital inicial negativo');
    const w = {
      meta: { id, versaoMotor: VERSAO_MOTOR, seed: cfg.seed >>> 0, capitalInicial: capital, dataInicio: cfg.dataInicio || '2026-11-04', cenario: 'Belo Horizonte, MG — parâmetros de 2026 pesquisados em 03/11/2026' },
      dia: 0,
      seq: 0,
      agente: {
        id, idade: 30, conta: 'CAIXA:' + id, limiteCredito: 0,
        local: 'rua', noite: 'rua', status: 'ativo', internadoAte: 0,
        necessidades: { fome: 40, energia: 60, saude: 90 },
        registros: { centroPop: false, cadunico: false },
        docs: { cpf: true, rg: false, rgPedido: false },
        itens: { celular: false, chip: false, notebook: false },
        skills: { negocios: 4, tecnologia: 4, marketing: 4, programacao: 4 },
        portfolio: 0, mei: false, estrategia: 'INICIO',
        emprego: null, contratos: [], pendencias: [], dividas: [], ativos: [],
        quarto: null, beneficios: { bf: 'nao_solicitado' },
        negocios: [], refeicoesHoje: 0, colapsos: 0, furtos: 0,
        memoria: { fatos: [], leads: {}, vagas: {}, receitas: [], crencas: { diaria: { tentativas: 0, sucessos: 0, soma: 0 }, propostas: { enviadas: 0, aceitas: 0, recusadas: 0 }, rejeicoesSeguidas: 0 }, mudancasEstrategia: [], ultimaBuscaVagas: -99 },
      },
      mundo: { negocios: [], vagas: [] },
      oculto: { rngState: cfg.seed | 0, negocios: {}, vagas: {}, agenda: [] },
      ledger: { tx: [], saldo: 0 },
      logs: { decisoes: [], resultados: [], eventos: [] },
      historico: [],
      contadores: { tx: 0, prop: 0, ctr: 0, vaga: 0, ag: 0 },
      metricas: { ciclos: 0, acoes: 0, ms: 0 },
    };
    for (let i = 1; i <= pv('numNegocios'); i++) {
      const [tipo, lo, hi] = TIPOS_NEGOCIO[rInt(w, 0, TIPOS_NEGOCIO.length - 1)];
      const nid = 'N' + String(i).padStart(3, '0');
      w.mundo.negocios.push({ id: nid, nome: tipo + ' #' + i, tipo, bairro: BAIRROS[rInt(w, 0, BAIRROS.length - 1)], temPerfilGoogle: rChance(w, 0.45), instagramAtivo: rChance(w, 0.4) });
      w.oculto.negocios[nid] = { orcamento: Math.round(rInt(w, lo, hi) / 1000) * 1000, abertura: Math.round(rng(w) * 1000) / 1000 };
    }
    if (cfg.cenario === 'digital') { w.tipoCenario = 'digital'; w.carreira = cfg.carreira || null; iniciarDigital(w); }
    else for (let i = 0; i < 3; i++) novaVaga(w);
    if (capital > 0) lancar(w, { tipo: 'CAPITAL_INICIAL', valor: capital, origem: 'PATRIMONIO_INICIAL', destino: w.agente.conta, justificativa: 'Capital inicial do experimento (não é receita)' });
    return w;
  }

  // ------------------------------------------------------------ livro-caixa
  // Única função que altera o saldo.
  function lancar(w, { tipo, valor, origem, destino, justificativa }) {
    if (!Number.isInteger(valor) || valor <= 0) throw new Error('valor inválido: ' + valor);
    const conta = w.agente.conta;
    const entrada = destino === conta, saida = origem === conta;
    if (entrada === saida) throw new Error('transação precisa ter o caixa do agente em exatamente um lado');
    if (entrada && !ENTRADAS.includes(tipo)) throw new Error('tipo inválido para entrada: ' + tipo);
    if (saida && !SAIDAS.includes(tipo)) throw new Error('tipo inválido para saída: ' + tipo);
    const ant = w.ledger.saldo;
    const pos = entrada ? ant + valor : ant - valor;
    if (pos < -w.agente.limiteCredito) return null; // rejeitada: sem saldo e sem crédito
    const tx = {
      id: w.meta.id + '-T' + String(++w.contadores.tx).padStart(5, '0'), seq: ++w.seq,
      agente: w.meta.id, dia: w.dia, tipo, direcao: entrada ? 'ENTRADA' : 'SAIDA', valor,
      origem, destino, justificativa, saldoAnterior: ant, saldoPosterior: pos,
    };
    w.ledger.tx.push(tx);
    w.ledger.saldo = pos;
    return tx;
  }
  const pagar = (w, tipo, valor, destino, just) => lancar(w, { tipo, valor, origem: w.agente.conta, destino, justificativa: just });
  const receber = (w, tipo, valor, origem, just) => lancar(w, { tipo, valor, origem, destino: w.agente.conta, justificativa: just });

  function registrarReceitaMemoria(w, fonte, valor, frente) {
    const r = { dia: w.dia, fonte, valor };
    if (frente) r.frente = frente;
    w.agente.memoria.receitas.push(r);
  }

  function auditar(w) {
    const erros = [];
    let s = 0, ent = 0, sai = 0, capital = 0, prevSeq = 0;
    const ids = new Set();
    for (const t of w.ledger.tx) {
      if (ids.has(t.id)) erros.push('id duplicado ' + t.id);
      ids.add(t.id);
      if (!Number.isInteger(t.valor) || t.valor <= 0) erros.push('valor inválido em ' + t.id);
      if (t.saldoAnterior !== s) erros.push('saldo anterior não confere em ' + t.id);
      const d = t.direcao === 'ENTRADA' ? t.valor : -t.valor;
      if (t.saldoPosterior !== s + d) erros.push('saldo posterior não confere em ' + t.id);
      s += d;
      if (d > 0) ent += t.valor; else sai += t.valor;
      if (t.tipo === 'CAPITAL_INICIAL') capital += t.valor;
      if (t.seq <= prevSeq) erros.push('ordem de sequência quebrada em ' + t.id);
      prevSeq = t.seq;
      if (s < -w.agente.limiteCredito) erros.push('saldo negativo sem crédito em ' + t.id);
    }
    if (s !== w.ledger.saldo) erros.push('saldo registrado (' + w.ledger.saldo + ') diverge do livro (' + s + ')');
    if (capital !== w.meta.capitalInicial) erros.push('capital inicial no livro (' + capital + ') diverge do declarado (' + w.meta.capitalInicial + ')');
    const formula = w.meta.capitalInicial + (ent - capital) - sai;
    if (formula !== s) erros.push('SALDO_FINAL ≠ SALDO_INICIAL + ENTRADAS − SAÍDAS');
    if (w.historico.length !== w.dia) erros.push('histórico com ' + w.historico.length + ' ciclos para ' + w.dia + ' dias');
    w.historico.forEach((h, i) => { if (h.dia !== i + 1) erros.push('ciclo fora de ordem no índice ' + i); });
    const porId = new Map(w.ledger.tx.map((t) => [t.id, t]));
    let antes = w.meta.capitalInicial;
    for (const h of w.historico) {
      if (h.caixaInicio !== antes) erros.push('caixa de início do dia ' + h.dia + ' não confere');
      const delta = h.txIds.reduce((acc, id) => { const t = porId.get(id); if (!t) { erros.push('transação ' + id + ' ausente'); return acc; } return acc + (t.direcao === 'ENTRADA' ? t.valor : -t.valor); }, 0);
      if (h.caixaInicio + delta !== h.caixaFim) erros.push('caixa do dia ' + h.dia + ' não fecha com as transações');
      antes = h.caixaFim;
    }
    return { ok: erros.length === 0, erros, saldo: s, entradas: ent, saidas: sai, capital, saldoInicial: w.meta.capitalInicial, entradasSemCapital: ent - capital };
  }

  // ------------------------------------------------------------ agenda oculta
  function agendar(w, dia, tipo, dados) {
    w.oculto.agenda.push({ id: 'A' + (++w.contadores.ag), dia, tipo, dados: dados || {} });
  }
  function evento(w, tipo, texto, dados) {
    const e = { seq: ++w.seq, dia: w.dia, tipo, texto, dados: dados || {} };
    w.logs.eventos.push(e);
    return e;
  }
  function lembrar(w, texto) {
    const f = w.agente.memoria.fatos;
    f.push({ dia: w.dia, texto });
    if (f.length > 60) f.splice(0, f.length - 60);
  }

  function novaVaga(w) {
    const id = 'V' + String(++w.contadores.vaga).padStart(3, '0');
    const salario = Math.round(rInt(w, pv('salarioVagaMin'), pv('salarioVagaMax')) / 1000) * 1000;
    w.mundo.vagas.push({ id, cargo: CARGOS[rInt(w, 0, CARGOS.length - 1)], salario, requisitos: ['rg', 'celular', 'endereco'], abertaAte: w.dia + rInt(w, 7, 15), preenchida: false, origem: 'SINTETICA' });
    w.oculto.vagas[id] = { concorrentes: rInt(w, 4, 40) };
  }

  // ------------------------------------------------------------ cenário digital
  const digital = (w) => w.tipoCenario === 'digital';
  function iniciarDigital(w) {
    const a = w.agente;
    a.audiencia = { seguidores: 0, posts: 0 };
    a.plataforma = { avaliacoes: 0, somaNotas: 0 };
    a.produto = null; a.produtoHoras = 0; a.afiliado = false; a.portfolioUGC = 0; a.pendenteAfiliado = 0;
    a.memoria.projetos = {}; a.memoria.campanhas = {}; a.memoria.horasPorFrente = {};
    w.mundo.online = []; w.mundo.projetos = []; w.mundo.campanhas = [];
    w.oculto.projetos = {}; w.oculto.campanhas = {};
    w.contadores.proj = 0; w.contadores.camp = 0;
    for (let i = 1; i <= pv('numOnline'); i++) {
      const [tipo, lo, hi] = TIPOS_NEGOCIO[rInt(w, 0, TIPOS_NEGOCIO.length - 1)];
      const nid = 'O' + String(i).padStart(3, '0');
      w.mundo.online.push({ id: nid, nome: tipo + ' online #' + i, tipo, bairro: BAIRROS_GRANDE_BH[rInt(w, 0, BAIRROS_GRANDE_BH.length - 1)], temPerfilGoogle: rChance(w, 0.5), instagramAtivo: rChance(w, 0.45), canal: 'online' });
      w.oculto.negocios[nid] = { orcamento: Math.round(rInt(w, lo, hi) / 1000) * 1000, abertura: Math.round(rng(w) * 1000) / 1000 };
    }
    for (let i = 0; i < 4; i++) novoProjeto(w);
  }
  function novoProjeto(w) {
    const [cat, lo, hi, horas, prazo] = CATEGORIAS_FREELA[rInt(w, 0, CATEGORIAS_FREELA.length - 1)];
    const id = 'J' + String(++w.contadores.proj).padStart(4, '0');
    w.mundo.projetos.push({ id, categoria: cat, orcamento: Math.round(rInt(w, lo, hi) / 1000) * 1000, horas, prazo, abertoAte: w.dia + rInt(w, 3, 7), propostasAtuais: rInt(w, 0, 10), fechado: false, origem: 'SINTETICA' });
    w.oculto.projetos[id] = { concorrentes: rInt(w, 8, 60) };
  }
  function novaCampanha(w) {
    const id = 'U' + String(++w.contadores.camp).padStart(4, '0');
    w.mundo.campanhas.push({ id, marca: 'marca sintética #' + w.contadores.camp, valor: Math.round(rInt(w, pv('ugcMin'), pv('ugcMax')) / 1000) * 1000, abertaAte: w.dia + rInt(w, 4, 8), fechada: false, origem: 'SINTETICA' });
    w.oculto.campanhas[id] = { inscritos: rInt(w, 10, 80) };
  }
  function diaDigital(w) {
    const n = rInt(w, 2, 5);
    for (let i = 0; i < n; i++) novoProjeto(w);
    if (rChance(w, 0.6)) novaCampanha(w);
    w.mundo.projetos = w.mundo.projetos.filter((p) => p.abertoAte >= w.dia - 10);
    w.mundo.campanhas = w.mundo.campanhas.filter((c) => c.abertaAte >= w.dia - 10);
  }
  function negocioPorId(w, id) {
    return (id[0] === 'O' ? w.mundo.online : w.mundo.negocios).find((n) => n.id === id);
  }
  function binomial(w, n, p) {
    if (n <= 0 || p <= 0) return 0;
    if (n <= 30) { let k = 0; for (let i = 0; i < n; i++) if (rng(w) < p) k++; return k; }
    return Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * rNormal(w)));
  }
  function receberBrutoComTaxa(w, bruto, taxa, origem, destinoTaxa, just, fonte, frente) {
    receber(w, 'RECEITA', bruto, origem, just + ' (bruto)');
    registrarReceitaMemoria(w, fonte, bruto, frente);
    if (taxa > 0) pagar(w, 'DESPESA', Math.min(taxa, w.ledger.saldo), destinoTaxa, 'Taxa da plataforma: ' + just);
  }

  // ------------------------------------------------------------ observação
  const CHAVES_PROIBIDAS = ['oculto', 'agenda', 'rngState', 'abertura', 'concorrentes', 'inscritos'];
  function trabalhaHoje(a, dia) {
    return !!(a.emprego && dia >= a.emprego.inicio && (dia - a.emprego.inicio) % 7 !== 6);
  }
  function observar(w) {
    const a = w.agente;
    const o = {
      dia: w.dia, data: dataVirtual(w.meta.dataInicio, w.dia), horasDisponiveis: 16,
      agente: {
        id: a.id, idade: a.idade, caixa: w.ledger.saldo, local: a.local, necessidades: a.necessidades,
        registros: a.registros, docs: a.docs, itens: a.itens, skills: a.skills, portfolio: a.portfolio,
        mei: a.mei, estrategia: a.estrategia, beneficios: a.beneficios, dividas: a.dividas,
        emprego: a.emprego ? { cargo: a.emprego.cargo, salario: a.emprego.salario, inicio: a.emprego.inicio, faltas: a.emprego.faltas, trabalhaHoje: trabalhaHoje(a, w.dia) } : null,
        contratos: a.contratos.filter((c) => c.status === 'ativo').map((c) => ({ id: c.id, clienteId: c.clienteId, servico: c.servico, valor: c.valor, horasFeitas: c.horasFeitas, horasNecessarias: c.horasNecessarias, prazoDia: c.prazoDia, mensal: c.mensal })),
        pendencias: a.pendencias,
        quarto: a.quarto ? { proximoVencimento: a.quarto.proximoVencimento } : null,
        negocios: a.negocios,
      },
      memoria: a.memoria,
      precos: {
        restPopRefeicao: pv('restPopRefeicao'), refeicaoComum: pv('refeicaoComum'), celularUsado: pv('celularUsado'),
        chip: pv('chip'), notebookUsado: pv('notebookUsado'), quartoMes: pv('quartoMes'), pensaoNoite: pv('pensaoNoite'),
        perfilGoogle: pv('perfilGoogle'), socialMediaMes: pv('socialMediaMes'), siteSimples: pv('siteSimples'),
        salarioMinimo: pv('salarioMinimo'), dasMei: pv('dasMei'), bolsaFamilia: pv('bolsaFamilia'),
      },
    };
    if (digital(w)) {
      o.cenario = 'digital'; o.carreira = w.carreira;
      o.agente.audiencia = a.audiencia; o.agente.plataforma = a.plataforma; o.agente.produto = a.produto;
      o.agente.produtoHoras = a.produtoHoras; o.agente.afiliado = a.afiliado; o.agente.portfolioUGC = a.portfolioUGC;
      o.precos.passagemOnibus = pv('passagemOnibus'); o.precos.trafegoMes = pv('trafegoMes'); o.precos.precoProduto = pv('precoProduto');
      o.precos.horasProduto = pv('horasProduto');
    }
    return deepFreeze(clone(o));
  }
  function resumoObs(o) {
    const a = o.agente;
    return {
      caixa: a.caixa, local: a.local, necessidades: a.necessidades, docs: a.docs, itens: a.itens, estrategia: a.estrategia,
      emprego: a.emprego ? a.emprego.cargo : null, contratosAtivos: a.contratos.length, pendencias: a.pendencias.length,
      leadsConhecidos: Object.keys(o.memoria.leads).length, vagasConhecidas: Object.keys(o.memoria.vagas).length,
      ultimosFatos: o.memoria.fatos.slice(-5),
    };
  }

  // ------------------------------------------------------------ ações
  function falha(motivo) { return { ok: false, horas: 0, resultado: motivo }; }
  function gastarEnergia(a, e) { a.necessidades.energia = clamp(a.necessidades.energia - e, 0, 100); }
  function temEndereco(a) { return a.registros.centroPop || !!a.quarto; }
  function negocioDoServico(w, servico) {
    let n = w.agente.negocios.find((x) => x.servico === servico);
    if (!n) { n = { servico, lancadoDia: w.dia, contratos: 0, receita: 0, status: 'ativo' }; w.agente.negocios.push(n); evento(w, 'NEGOCIO_CRIADO', 'Lançou o serviço ' + servico); }
    return n;
  }

  const ACOES = {
    REGISTRAR_CENTRO_POP(w, a) {
      if (a.registros.centroPop) return falha('já registrado');
      a.registros.centroPop = true; gastarEnergia(a, 6);
      lembrar(w, 'Registrado no Centro POP: endereço de referência, albergue e Restaurante Popular gratuito.');
      return { ok: true, horas: 3, resultado: 'registrado' };
    },
    PEDIR_RG(w, a) {
      if (a.docs.rg || a.docs.rgPedido) return falha('RG já pedido');
      if (!a.registros.centroPop) return falha('precisa da declaração do Centro POP para gratuidade');
      a.docs.rgPedido = true; agendar(w, w.dia + pv('prazoRG'), 'rg_pronto'); gastarEnergia(a, 6);
      a.pendencias.push({ tipo: 'rg', desde: w.dia });
      return { ok: true, horas: 3, resultado: 'pedido feito' };
    },
    CADUNICO(w, a) {
      if (a.registros.cadunico) return falha('já cadastrado');
      if (!temEndereco(a)) return falha('sem endereço de referência');
      a.registros.cadunico = true; a.beneficios.bf = 'em_analise';
      agendar(w, w.dia + pv('prazoAnaliseBF'), 'analise_bf'); gastarEnergia(a, 6);
      a.pendencias.push({ tipo: 'bolsa_familia', desde: w.dia });
      return { ok: true, horas: 3, resultado: 'cadastrado' };
    },
    COMER(w, a, p) {
      if (a.refeicoesHoje >= 3) return falha('limite de refeições');
      if (p.opcao === 'popular') {
        if (a.refeicoesHoje >= 2) return falha('Restaurante Popular: no máximo 2 refeições/dia');
        const gratis = a.registros.centroPop && (a.local === 'rua' || a.local === 'albergue');
        if (!gratis && !pagar(w, 'DESPESA', pv('restPopRefeicao'), 'MERCADO:restaurante_popular', 'Refeição no Restaurante Popular')) return falha('sem dinheiro');
        a.necessidades.fome = clamp(a.necessidades.fome - 45, 0, 100); a.refeicoesHoje++;
        return { ok: true, horas: 2, resultado: gratis ? 'refeição gratuita' : 'refeição R$3' };
      }
      if (!pagar(w, 'DESPESA', pv('refeicaoComum'), 'MERCADO:alimentacao', 'Marmita')) return falha('sem dinheiro');
      a.necessidades.fome = clamp(a.necessidades.fome - 45, 0, 100); a.refeicoesHoje++;
      return { ok: true, horas: 0.5, resultado: 'marmita' };
    },
    COMPRAR(w, a, p) {
      const tabela = { celular: ['celularUsado', true], chip: ['chip', false], notebook: ['notebookUsado', true] };
      const t = tabela[p.item];
      if (!t) return falha('item desconhecido');
      if (a.itens[p.item]) return falha('já possui');
      if (p.item === 'chip' && !a.itens.celular) return falha('sem celular');
      const preco = pv(t[0]);
      if (!pagar(w, t[1] ? 'COMPRA_ATIVO' : 'DESPESA', preco, 'MERCADO:' + p.item, 'Compra de ' + p.item)) return falha('sem dinheiro');
      a.itens[p.item] = true;
      if (t[1]) a.ativos.push({ item: p.item, custo: preco, valorContabil: Math.round(preco * 0.6), compradoDia: w.dia, nota: 'valor de revenda estimado em 60%' });
      if (p.item === 'chip') agendar(w, w.dia + 30, 'plano_celular');
      return { ok: true, horas: p.item === 'chip' ? 0 : 2, resultado: 'comprou ' + p.item };
    },
    ALUGAR_QUARTO(w, a) {
      if (a.quarto) return falha('já tem quarto');
      if (!a.docs.rg) return falha('proprietário exige documento com foto');
      const q = pv('quartoMes');
      if (w.ledger.saldo < 2 * q) return falha('precisa de caução + 1º mês');
      pagar(w, 'DEPOSITO_CAUCAO', q, 'LOCADOR:quarto', 'Caução do quarto (devolvível)');
      pagar(w, 'DESPESA', q, 'LOCADOR:quarto', 'Aluguel do 1º mês');
      a.ativos.push({ item: 'caucao', custo: q, valorContabil: q, compradoDia: w.dia, nota: 'depósito devolvível' });
      a.quarto = { desde: w.dia, proximoVencimento: w.dia + 30 };
      a.local = 'quarto'; agendar(w, w.dia + 30, 'aluguel');
      lembrar(w, 'Alugou um quarto por ' + brl(q) + '/mês.');
      return { ok: true, horas: 3, resultado: 'quarto alugado' };
    },
    DIARIA_BRACAL(w, a) {
      if (a.necessidades.energia < 40) return falha('sem energia para trabalho braçal');
      const c = a.memoria.crencas.diaria;
      c.tentativas++; gastarEnergia(a, 45);
      if (!rChance(w, pv('probDiaria'))) { lembrar(w, 'Procurou diária e não conseguiu.'); return { ok: true, horas: 5, resultado: 'não conseguiu diária' }; }
      const valor = Math.round(rInt(w, pv('diariaMin'), pv('diariaMax')) / 500) * 500;
      receber(w, 'RECEITA', valor, 'CONTRATANTE:diaria', 'Diária braçal');
      registrarReceitaMemoria(w, 'diaria', valor);
      c.sucessos++; c.soma += valor;
      lembrar(w, 'Conseguiu diária: ' + brl(valor) + '.');
      return { ok: true, horas: 10, resultado: 'diária ' + brl(valor) };
    },
    BUSCAR_VAGAS(w, a) {
      const horas = a.itens.celular ? 1 : 2;
      a.memoria.ultimaBuscaVagas = w.dia;
      let n = 0;
      for (const v of w.mundo.vagas) {
        if (!v.preenchida && v.abertaAte >= w.dia && !a.memoria.vagas[v.id]) { a.memoria.vagas[v.id] = { id: v.id, cargo: v.cargo, salario: v.salario, requisitos: v.requisitos, abertaAte: v.abertaAte, vistaDia: w.dia, candidatado: false }; n++; }
      }
      return { ok: true, horas, resultado: n + ' vaga(s) nova(s) vista(s)' };
    },
    CANDIDATAR(w, a, p) {
      const m = a.memoria.vagas[p.vagaId];
      if (!m) return falha('vaga desconhecida');
      const v = w.mundo.vagas.find((x) => x.id === p.vagaId);
      if (!v || v.preenchida || v.abertaAte < w.dia) return falha('vaga encerrada');
      if (m.candidatado) return falha('já candidatado');
      if (a.emprego) return falha('já empregado');
      const faltam = [];
      if (!a.docs.rg) faltam.push('rg');
      if (!a.itens.celular) faltam.push('celular');
      if (!temEndereco(a)) faltam.push('endereco');
      if (faltam.length) return falha('requisitos faltando: ' + faltam.join(', '));
      m.candidatado = true;
      a.pendencias.push({ tipo: 'candidatura', vagaId: v.id, desde: w.dia });
      agendar(w, w.dia + rInt(w, 3, 8), 'resultado_candidatura', { vagaId: v.id });
      return { ok: true, horas: 1, resultado: 'candidatura enviada' };
    },
    TRABALHAR_EMPREGO(w, a) {
      if (!trabalhaHoje(a, w.dia)) return falha('não é dia de trabalho');
      if (a.emprego.trabalhouDia === w.dia) return falha('já trabalhou hoje');
      a.emprego.trabalhouDia = w.dia; a.emprego.diasCiclo++; gastarEnergia(a, 40);
      return { ok: true, horas: 9, resultado: 'trabalhou' };
    },
    ESTUDAR(w, a, p) {
      const area = p.area;
      if (!(area in a.skills)) return falha('área inválida');
      const viaTelecentro = !a.itens.celular;
      const ganho = 0.15;
      a.skills[area] = Math.round(clamp(a.skills[area] + ganho, 0, 10) * 100) / 100; gastarEnergia(a, 8);
      return { ok: true, horas: viaTelecentro ? 4 : 3, resultado: area + ' → ' + a.skills[area] + (viaTelecentro ? ' (telecentro)' : ' (Wi-Fi BH)') };
    },
    PROSPECTAR(w, a, p) {
      const horas = clamp(p.horas | 0, 1, 6);
      if (a.necessidades.energia < 5 * horas) return falha('sem energia');
      const desconhecidos = w.mundo.negocios.filter((n) => !a.memoria.leads[n.id]);
      let n = 0, porHora = 3, aPe = false;
      if (digital(w)) {
        const ida = pv('passagemOnibus') * 2;
        if (w.ledger.saldo >= ida) pagar(w, 'DESPESA', ida, 'TRANSPORTE:onibus_bh', 'Ônibus ida e volta para prospectar');
        else { porHora = 2; aPe = true; }
      }
      for (let i = 0; i < horas * porHora && desconhecidos.length; i++) {
        const idx = rInt(w, 0, desconhecidos.length - 1);
        const neg = desconhecidos.splice(idx, 1)[0];
        a.memoria.leads[neg.id] = { id: neg.id, nome: neg.nome, tipo: neg.tipo, bairro: neg.bairro, temPerfilGoogle: neg.temPerfilGoogle, instagramAtivo: neg.instagramAtivo, visitadoDia: w.dia, propostas: [] };
        n++;
      }
      gastarEnergia(a, (aPe ? 7 : 5) * horas);
      return { ok: true, horas, resultado: n + ' comércio(s) visitado(s)' + (aPe ? ' a pé (sem dinheiro para ônibus)' : '') };
    },
    PROPOR(w, a, p) {
      const lead = a.memoria.leads[p.leadId];
      if (!lead) return falha('comércio não conhecido');
      const s = SERVICOS[p.servico];
      if (!s || p.servico === 'freela' || p.servico === 'ugc') return falha('serviço inválido');
      if ((p.servico === 'trafego_pago') && !digital(w)) return falha('serviço inválido');
      if (p.servico === 'trafego_pago') {
        if (a.skills.marketing < 6) return falha('tráfego pago exige marketing ≥ 6');
        if (!a.contratos.some((c) => c.status === 'ativo' && c.clienteId === lead.id && c.servico === 'social_media')) return falha('tráfego só para cliente de social media');
      }
      for (const r of s.requer) if (!a.itens[r] && !(digital(w) && r === 'notebook')) return falha('precisa de ' + r);
      if (!Number.isInteger(p.preco) || p.preco <= 0) return falha('preço inválido');
      if (lead.propostas.some((x) => x.resultado === 'pendente')) return falha('já existe proposta pendente');
      if (a.contratos.some((c) => c.status === 'ativo' && c.clienteId === lead.id && c.servico === p.servico)) return falha('já é cliente desse serviço');
      negocioDoServico(w, p.servico);
      const pid = 'P' + (++w.contadores.prop);
      const prop = { id: pid, dia: w.dia, servico: p.servico, preco: p.preco, resultado: 'pendente' };
      if (p.frente) prop.frente = p.frente;
      lead.propostas.push(prop);
      a.memoria.crencas.propostas.enviadas++;
      a.pendencias.push({ tipo: 'proposta', propostaId: pid, leadId: lead.id, desde: w.dia });
      agendar(w, w.dia + rInt(w, 1, 5), 'resposta_proposta', { propostaId: pid, leadId: lead.id });
      gastarEnergia(a, 3);
      return { ok: true, horas: 1, resultado: 'proposta ' + pid + ' enviada' };
    },
    TRABALHAR_CONTRATOS(w, a, p) {
      let horas = clamp(Number(p.horas) || 0, 0, 10);
      const ativos = a.contratos.filter((c) => c.status === 'ativo' && c.horasFeitas < c.horasNecessarias).sort((x, y) => x.prazoDia - y.prazoDia);
      if (!ativos.length) return falha('nenhum contrato com horas pendentes');
      let usadas = 0, horasPC = 0, viagem = 0;
      for (const c of ativos) {
        if (horas <= 0) break;
        const req = (SERVICOS[c.servico] || SERVICOS.freela).requer;
        const viaTelecentro = digital(w) && req.includes('notebook') && !a.itens.notebook;
        if (req.some((r) => !a.itens[r] && !(viaTelecentro && r === 'notebook'))) continue;
        let h = Math.min(horas, c.horasNecessarias - c.horasFeitas);
        if (viaTelecentro) {
          if (!viagem && horas < 2) continue;
          if (!viagem) { viagem = 1; horas -= 1; }
          h = Math.min(h, horas, pv('telecentroHoras') - horasPC);
          if (h <= 0) continue;
          horasPC += h;
        }
        c.horasFeitas += h; horas -= h; usadas += h;
        if (!c.mensal && c.horasFeitas >= c.horasNecessarias) concluirAvulso(w, c);
      }
      gastarEnergia(a, 3 * usadas);
      return { ok: usadas > 0, horas: usadas + (usadas > 0 ? viagem : 0), resultado: usadas + 'h entregues' + (viagem ? ' (computador do telecentro)' : '') };
    },
    CLIPPING(w, a, p) {
      if (!a.itens.celular) return falha('precisa de celular');
      const posts = clamp(p.posts | 0, 1, 4);
      agendar(w, w.dia + 21, 'pagamento_clipping', { posts, diaPost: w.dia });
      a.pendencias.push({ tipo: 'clipping', desde: w.dia, posts });
      gastarEnergia(a, 3 * posts);
      return { ok: true, horas: posts, resultado: posts + ' corte(s) postado(s); pagamento só depois da apuração' };
    },
    ABRIR_MEI(w, a) {
      if (a.mei) return falha('já é MEI');
      if (!a.itens.celular) return falha('precisa de celular para o portal');
      a.mei = true; agendar(w, w.dia + 30, 'das');
      lembrar(w, 'Abriu MEI. DAS mensal ' + brl(pv('dasMei')) + '.');
      return { ok: true, horas: 1, resultado: 'MEI aberto' };
    },
    PAGAR_DIVIDA(w, a, p) {
      const d = a.dividas.find((x) => x.id === p.dividaId && x.saldo > 0);
      if (!d) return falha('dívida não encontrada');
      if (!pagar(w, 'PAGAMENTO_DIVIDA', d.saldo, d.credor, 'Quitação: ' + d.descricao)) return falha('sem dinheiro');
      d.saldo = 0;
      return { ok: true, horas: 0.5, resultado: 'dívida quitada' };
    },
    PROSPECTAR_ONLINE(w, a, p) {
      if (!digital(w)) return falha('ação do cenário digital');
      if (!a.itens.celular) return falha('precisa de celular');
      const msgs = clamp(p.mensagens | 0, 1, 45);
      const pool = w.mundo.online.filter((n) => !a.memoria.leads[n.id] && !(a.memoria.contatadosOnline || {})[n.id]);
      a.memoria.contatadosOnline = a.memoria.contatadosOnline || {};
      let enviadas = 0, respostas = 0;
      for (let i = 0; i < msgs && pool.length; i++) {
        const neg = pool.splice(rInt(w, 0, pool.length - 1), 1)[0];
        a.memoria.contatadosOnline[neg.id] = w.dia; enviadas++;
        if (rChance(w, pv('respostaFrio'))) {
          respostas++;
          a.memoria.leads[neg.id] = { id: neg.id, nome: neg.nome, tipo: neg.tipo, bairro: neg.bairro, temPerfilGoogle: neg.temPerfilGoogle, instagramAtivo: neg.instagramAtivo, visitadoDia: w.dia, propostas: [], canal: 'online' };
        }
      }
      gastarEnergia(a, 2 * Math.ceil(msgs / pv('mensagensPorHora')));
      return { ok: true, horas: Math.ceil(enviadas / pv('mensagensPorHora')) || 1, resultado: enviadas + ' mensagens, ' + respostas + ' resposta(s)' };
    },
    BUSCAR_FREELAS(w, a) {
      if (!digital(w)) return falha('ação do cenário digital');
      if (!a.itens.celular) return falha('precisa de celular');
      let n = 0;
      for (const pj of w.mundo.projetos) if (!pj.fechado && pj.abertoAte >= w.dia && !a.memoria.projetos[pj.id]) {
        a.memoria.projetos[pj.id] = { id: pj.id, categoria: pj.categoria, orcamento: pj.orcamento, horas: pj.horas, prazo: pj.prazo, abertoAte: pj.abertoAte, propostasQuandoViu: pj.propostasAtuais, vistoDia: w.dia, proposta: null };
        n++;
      }
      return { ok: true, horas: 0.5, resultado: n + ' projeto(s) novo(s) na plataforma' };
    },
    PROPOR_FREELA(w, a, p) {
      if (!digital(w)) return falha('ação do cenário digital');
      const m = a.memoria.projetos[p.projetoId];
      if (!m) return falha('projeto desconhecido');
      const pj = w.mundo.projetos.find((x) => x.id === p.projetoId);
      if (!pj || pj.fechado || pj.abertoAte < w.dia) return falha('projeto encerrado');
      if (m.proposta) return falha('já enviou proposta');
      if (!Number.isInteger(p.preco) || p.preco <= 0) return falha('preço inválido');
      const hoje = Object.values(a.memoria.projetos).filter((x) => x.proposta && x.proposta.dia === w.dia).length;
      if (hoje >= 10) return falha('limite de 10 propostas por dia na plataforma');
      m.proposta = { dia: w.dia, preco: p.preco, resultado: 'pendente', frente: p.frente || 'freela' };
      a.pendencias.push({ tipo: 'proposta_freela', projetoId: pj.id, desde: w.dia });
      agendar(w, w.dia + rInt(w, 2, 6), 'resultado_freela', { projetoId: pj.id });
      negocioDoServico(w, 'freela');
      return { ok: true, horas: 0.5, resultado: 'proposta enviada para ' + pj.id };
    },
    PRODUZIR_PORTFOLIO_UGC(w, a) {
      if (!digital(w)) return falha('ação do cenário digital');
      if (!a.itens.celular) return falha('precisa de celular');
      if (a.portfolioUGC >= 5) return falha('portfólio já completo');
      a.portfolioUGC++; gastarEnergia(a, 8);
      return { ok: true, horas: 3, resultado: 'vídeo de portfólio ' + a.portfolioUGC + '/5' };
    },
    BUSCAR_CAMPANHAS(w, a) {
      if (!digital(w)) return falha('ação do cenário digital');
      if (!a.itens.celular) return falha('precisa de celular');
      let n = 0;
      for (const c of w.mundo.campanhas) if (!c.fechada && c.abertaAte >= w.dia && !a.memoria.campanhas[c.id]) { a.memoria.campanhas[c.id] = { id: c.id, marca: c.marca, valor: c.valor, abertaAte: c.abertaAte, candidatado: false }; n++; }
      return { ok: true, horas: 0.5, resultado: n + ' campanha(s) UGC nova(s)' };
    },
    CANDIDATAR_UGC(w, a, p) {
      if (!digital(w)) return falha('ação do cenário digital');
      const m = a.memoria.campanhas[p.campanhaId];
      if (!m) return falha('campanha desconhecida');
      const c = w.mundo.campanhas.find((x) => x.id === p.campanhaId);
      if (!c || c.fechada || c.abertaAte < w.dia) return falha('campanha encerrada');
      if (m.candidatado) return falha('já candidatado');
      if (a.portfolioUGC < 2) return falha('precisa de ao menos 2 vídeos de portfólio');
      m.candidatado = true;
      a.pendencias.push({ tipo: 'candidatura_ugc', campanhaId: c.id, desde: w.dia });
      agendar(w, w.dia + rInt(w, 2, 6), 'resultado_ugc', { campanhaId: c.id });
      negocioDoServico(w, 'ugc');
      return { ok: true, horas: 0.5, resultado: 'candidatura enviada para ' + c.marca };
    },
    POSTAR_CONTEUDO(w, a, p) {
      if (!digital(w)) return falha('ação do cenário digital');
      if (!a.itens.celular) return falha('precisa de celular');
      const posts = clamp(p.posts | 0, 1, 4);
      let ganho = 0, viral = 0;
      for (let i = 0; i < posts; i++) {
        ganho += Math.round(Math.exp(1.2 + 0.9 * rNormal(w))) + Math.floor(a.audiencia.seguidores * 0.003);
        if (rChance(w, 0.02)) viral += rInt(w, 200, 3000);
      }
      a.audiencia.seguidores += ganho + Math.round(viral * 0.05);
      a.audiencia.posts += posts;
      const alcance = a.audiencia.seguidores * 0.2 * posts + viral;
      let txt = '+' + (ganho + Math.round(viral * 0.05)) + ' seguidores' + (viral ? ' (um post viralizou)' : '');
      if (a.afiliado) {
        const cliques = Math.round(alcance * 0.03);
        const vendas = binomial(w, cliques, pv('afiliadoConversao'));
        const comissao = Math.round(vendas * pv('ticketAfiliado') * pv('afiliadoComissao'));
        a.pendenteAfiliado += comissao;
        txt += '; ' + cliques + ' cliques, ' + vendas + ' venda(s) de afiliado (comissão ' + brl(comissao) + ' a receber)';
      }
      if (a.produto) {
        const visitas = Math.round(alcance * 0.01);
        const vendas = binomial(w, visitas, 0.01);
        if (vendas > 0) { agendar(w, w.dia + pv('pagamentoKiwify'), 'pagamento_produto', { vendas }); a.pendencias.push({ tipo: 'saque_produto', desde: w.dia, vendas }); }
        txt += '; ' + visitas + ' visita(s) na página, ' + vendas + ' venda(s) do produto';
      }
      gastarEnergia(a, 3 * posts);
      return { ok: true, horas: posts, resultado: txt };
    },
    ATIVAR_AFILIADO(w, a) {
      if (!digital(w)) return falha('ação do cenário digital');
      if (!a.itens.celular) return falha('precisa de celular');
      if (a.afiliado) return falha('já é afiliado');
      a.afiliado = true; agendar(w, w.dia + 30, 'pagamento_afiliado'); negocioDoServico(w, 'afiliado');
      lembrar(w, 'Cadastrou-se como afiliado Shopee. Comissão paga por mês.');
      return { ok: true, horas: 1, resultado: 'afiliado ativo' };
    },
    CRIAR_PRODUTO(w, a, p) {
      if (!digital(w)) return falha('ação do cenário digital');
      if (!a.itens.celular) return falha('precisa de celular');
      if (a.produto) return falha('produto já publicado');
      const h = clamp(Number(p.horas) || 3, 1, 6);
      a.produtoHoras += h; gastarEnergia(a, 3 * h);
      if (a.produtoHoras >= pv('horasProduto')) {
        a.produto = { preco: pv('precoProduto'), publicadoDia: w.dia, vendas: 0 };
        negocioDoServico(w, 'produto_digital');
        lembrar(w, 'Publicou o produto digital por ' + brl(pv('precoProduto')) + ' na Kiwify.');
        return { ok: true, horas: h, resultado: 'produto publicado' };
      }
      return { ok: true, horas: h, resultado: 'produto ' + a.produtoHoras + '/' + pv('horasProduto') + 'h' };
    },
    DESCANSAR(w, a, p) {
      const h = clamp(Number(p.horas) || 2, 1, 8);
      a.necessidades.energia = clamp(a.necessidades.energia + 4 * h, 0, 100);
      return { ok: true, horas: h, resultado: 'descansou' };
    },
    DORMIR(w, a, p) {
      const onde = p.onde;
      if (onde === 'quarto') { if (!a.quarto) return falha('sem quarto'); a.noite = 'quarto'; return { ok: true, horas: 0, resultado: 'quarto' }; }
      if (onde === 'albergue') {
        if (!a.registros.centroPop) return falha('albergue exige encaminhamento');
        if (rChance(w, pv('probVagaAlbergue'))) { a.noite = 'albergue'; a.local = 'albergue'; return { ok: true, horas: 0, resultado: 'vaga no albergue' }; }
        a.noite = 'rua'; a.local = 'rua'; return { ok: false, horas: 0, resultado: 'sem vaga no albergue; dormiu na rua' };
      }
      if (onde === 'pensao') {
        if (!pagar(w, 'DESPESA', pv('pensaoNoite'), 'MERCADO:pensao', 'Pernoite em pensão')) { a.noite = 'rua'; return falha('sem dinheiro para pensão; dormiu na rua'); }
        a.noite = 'pensao'; return { ok: true, horas: 0, resultado: 'pensão' };
      }
      a.noite = 'rua'; if (!a.quarto) a.local = 'rua';
      return { ok: true, horas: 0, resultado: 'rua' };
    },
  };

  function concluirAvulso(w, c) {
    const a = w.agente;
    c.status = 'concluido';
    a.portfolio++;
    if (c.plataforma) {
      const nota = rChance(w, 0.85) ? 5 : 4;
      a.plataforma.avaliacoes++; a.plataforma.somaNotas += nota;
      agendar(w, w.dia + pv('liberacaoPlataforma'), 'liberacao_freela', { contratoId: c.id });
      lembrar(w, 'Entregou ' + c.id + ' na plataforma (nota ' + nota + '). Pagamento liberado em ' + pv('liberacaoPlataforma') + ' dias.');
      return;
    }
    if (c.servico === 'ugc') {
      agendar(w, w.dia + pv('pagamentoUGC'), 'pagamento_ugc', { contratoId: c.id });
      lembrar(w, 'Entregou o vídeo UGC ' + c.id + '. A marca paga em ' + pv('pagamentoUGC') + ' dias.');
      return;
    }
    const neg = a.negocios.find((x) => x.servico === c.servico);
    const aPagar = c.valor - c.pago;
    if (aPagar > 0) {
      if (rChance(w, pv('probCalote'))) {
        evento(w, 'CALOTE', 'Cliente ' + c.clienteId + ' não pagou ' + brl(aPagar));
        lembrar(w, 'Calote de ' + brl(aPagar) + ' em ' + c.servico + '.');
      } else {
        receber(w, 'RECEITA', aPagar, 'CLIENTE:' + c.clienteId, 'Entrega de ' + c.servico + ' (' + c.id + ')');
        registrarReceitaMemoria(w, c.servico, aPagar, c.frente); c.pago += aPagar; if (neg) neg.receita += aPagar;
        lembrar(w, 'Entregou ' + c.servico + ' para ' + c.clienteId + ' e recebeu ' + brl(aPagar) + '.');
      }
    }
  }

  // ------------------------------------------------------------ agenda: resolução
  function resolverAgenda(w) {
    const a = w.agente;
    const hoje = w.oculto.agenda.filter((e) => e.dia === w.dia);
    w.oculto.agenda = w.oculto.agenda.filter((e) => e.dia !== w.dia);
    for (const e of hoje) {
      const d = e.dados;
      switch (e.tipo) {
        case 'rg_pronto':
          a.docs.rg = true; a.docs.rgPedido = false; a.pendencias = a.pendencias.filter((p) => p.tipo !== 'rg');
          evento(w, 'RG_PRONTO', 'RG pronto'); lembrar(w, 'RG ficou pronto.'); break;
        case 'analise_bf': {
          a.pendencias = a.pendencias.filter((p) => p.tipo !== 'bolsa_familia');
          const renda = renda30(w);
          if (renda <= pv('bolsaFamiliaLimite')) {
            a.beneficios.bf = 'ativo';
            receber(w, 'BENEFICIO', pv('bolsaFamilia'), 'GOVERNO:bolsa_familia', 'Bolsa Família (renda dos últimos 30 dias: ' + brl(renda) + ')');
            registrarReceitaMemoria(w, 'bolsa_familia', pv('bolsaFamilia'));
            agendar(w, w.dia + 30, 'pagamento_bf'); evento(w, 'BF_APROVADO', 'Bolsa Família aprovado'); lembrar(w, 'Bolsa Família aprovado.');
          } else { a.beneficios.bf = 'negado'; evento(w, 'BF_NEGADO', 'Renda acima do limite'); lembrar(w, 'Bolsa Família negado: renda de ' + brl(renda) + ' em 30 dias.'); }
          break;
        }
        case 'pagamento_bf':
          if (a.beneficios.bf !== 'ativo') break;
          if (renda30(w) > pv('meioSalarioMinimo')) { a.beneficios.bf = 'encerrado'; evento(w, 'BF_ENCERRADO', 'Renda passou de meio salário mínimo'); lembrar(w, 'Bolsa Família encerrado: renda subiu.'); break; }
          receber(w, 'BENEFICIO', pv('bolsaFamilia'), 'GOVERNO:bolsa_familia', 'Bolsa Família'); registrarReceitaMemoria(w, 'bolsa_familia', pv('bolsaFamilia'));
          agendar(w, w.dia + 30, 'pagamento_bf'); break;
        case 'resposta_proposta': resolverProposta(w, d); break;
        case 'resultado_candidatura': resolverCandidatura(w, d); break;
        case 'salario': {
          if (!a.emprego || a.emprego.id !== d.empregoId) break;
          const prop = Math.min(a.emprego.diasCiclo / 26, 1);
          const valor = Math.round(a.emprego.salario * pv('liquidoCLT') * prop);
          if (valor > 0) { receber(w, 'RECEITA', valor, 'EMPREGADOR:' + a.emprego.vagaId, 'Salário líquido (' + a.emprego.diasCiclo + ' dias)'); registrarReceitaMemoria(w, 'salario', valor); lembrar(w, 'Recebeu salário de ' + brl(valor) + '.'); }
          a.emprego.diasCiclo = 0; agendar(w, w.dia + 30, 'salario', d); break;
        }
        case 'pagamento_clipping': {
          a.pendencias = a.pendencias.filter((p) => !(p.tipo === 'clipping' && p.desde === d.diaPost));
          let views = 0;
          const habil = (a.skills.marketing + a.skills.tecnologia) / 20;
          for (let i = 0; i < d.posts; i++) { if (rChance(w, 0.35)) continue; views += Math.round(Math.exp(5.5 + 1.5 * habil + 1.2 * rNormal(w))); }
          const porMil = digital(w) ? Math.round(pv('clippingUSDporMil') * pv('usdBrl')) : pv('clippingPorMil');
          const valor = Math.round(views / 1000 * porMil);
          if (valor > 0) { receber(w, 'RECEITA', valor, 'PLATAFORMA:clipping', 'Clipping: ' + views + ' views em ' + d.posts + ' cortes'); registrarReceitaMemoria(w, 'clipping', valor, digital(w) ? 'clipping' : undefined); const n = negocioDoServico(w, 'clipping'); n.receita += valor; }
          lembrar(w, 'Cortes do dia ' + d.diaPost + ': ' + views + ' views, ' + brl(valor) + '.');
          break;
        }
        case 'ciclo_contrato': resolverCicloContrato(w, d); break;
        case 'aluguel':
          if (!a.quarto) break;
          if (pagar(w, 'DESPESA', pv('quartoMes'), 'LOCADOR:quarto', 'Aluguel mensal')) { a.quarto.proximoVencimento = w.dia + 30; agendar(w, w.dia + 30, 'aluguel'); }
          else { evento(w, 'DESPEJO', 'Sem dinheiro para o aluguel'); lembrar(w, 'Despejado: não tinha o aluguel. Caução retida.'); a.quarto = null; a.local = 'rua'; a.ativos = a.ativos.filter((x) => x.item !== 'caucao'); }
          break;
        case 'plano_celular':
          if (!a.itens.chip) break;
          if (pagar(w, 'DESPESA', pv('planoCelular'), 'OPERADORA', 'Recarga de dados')) agendar(w, w.dia + 30, 'plano_celular');
          else { lembrar(w, 'Sem recarga: só internet no Wi-Fi BH.'); agendar(w, w.dia + 30, 'plano_celular'); }
          break;
        case 'das':
          if (!a.mei) break;
          if (!pagar(w, 'IMPOSTO', pv('dasMei'), 'RECEITA_FEDERAL:DAS', 'DAS MEI')) {
            a.dividas.push({ id: 'D' + w.dia, credor: 'RECEITA_FEDERAL:DAS', descricao: 'DAS MEI em atraso (dia ' + w.dia + ')', saldo: pv('dasMei'), desde: w.dia });
            lembrar(w, 'DAS não pago: virou dívida.');
          }
          agendar(w, w.dia + 30, 'das'); break;
        case 'resultado_freela': resolverFreela(w, d); break;
        case 'resultado_ugc': resolverUGC(w, d); break;
        case 'liberacao_freela': {
          const c = a.contratos.find((x) => x.id === d.contratoId);
          const taxa = Math.round(c.valor * pv('taxaWorkana'));
          receberBrutoComTaxa(w, c.valor, taxa, 'PLATAFORMA:freela', 'PLATAFORMA:taxa_freela', 'Projeto ' + c.projetoId, 'freela', c.frente);
          c.pago = c.valor; const neg = a.negocios.find((x) => x.servico === 'freela'); if (neg) neg.receita += c.valor - taxa;
          lembrar(w, 'Plataforma liberou ' + brl(c.valor - taxa) + ' líquidos do projeto ' + c.projetoId + '.');
          break;
        }
        case 'pagamento_ugc': {
          const c = a.contratos.find((x) => x.id === d.contratoId);
          if (rChance(w, pv('probCalote'))) { evento(w, 'CALOTE', 'Marca não pagou o UGC ' + c.id); lembrar(w, 'A marca não pagou o UGC ' + c.id + '.'); break; }
          receber(w, 'RECEITA', c.valor, 'MARCA:' + c.clienteId, 'Vídeo UGC (' + c.id + ')'); registrarReceitaMemoria(w, 'ugc', c.valor, c.frente);
          c.pago = c.valor; const neg = a.negocios.find((x) => x.servico === 'ugc'); if (neg) neg.receita += c.valor;
          lembrar(w, 'Recebeu ' + brl(c.valor) + ' do UGC ' + c.id + '.');
          break;
        }
        case 'pagamento_afiliado': {
          const v = a.pendenteAfiliado;
          if (v > 0) { receber(w, 'RECEITA', v, 'PLATAFORMA:shopee_afiliados', 'Comissões de afiliado do mês'); registrarReceitaMemoria(w, 'afiliado', v, 'afiliado'); a.pendenteAfiliado = 0; const neg = a.negocios.find((x) => x.servico === 'afiliado'); if (neg) neg.receita += v; }
          lembrar(w, 'Fechamento de afiliado: ' + brl(v) + '.');
          agendar(w, w.dia + 30, 'pagamento_afiliado'); break;
        }
        case 'pagamento_produto': {
          { const desde = w.dia - pv('pagamentoKiwify'); const i = a.pendencias.findIndex((p) => p.tipo === 'saque_produto' && p.desde === desde && p.vendas === d.vendas); if (i >= 0) a.pendencias.splice(i, 1); }
          const bruto = d.vendas * a.produto.preco;
          const taxa = d.vendas * (Math.round(a.produto.preco * pv('kiwifyPct')) + pv('kiwifyFixa')) + pv('kiwifySaque');
          receberBrutoComTaxa(w, bruto, taxa, 'PLATAFORMA:kiwify', 'PLATAFORMA:taxa_kiwify', d.vendas + ' venda(s) do produto digital', 'produto_digital', 'produto');
          a.produto.vendas += d.vendas; const neg = a.negocios.find((x) => x.servico === 'produto_digital'); if (neg) neg.receita += bruto - taxa;
          lembrar(w, 'Saque de ' + d.vendas + ' venda(s) do produto: ' + brl(bruto - taxa) + ' líquidos.');
          break;
        }
        default: throw new Error('evento de agenda desconhecido: ' + e.tipo);
      }
    }
  }

  function renda30(w) {
    return w.ledger.tx.filter((t) => t.tipo === 'RECEITA' && t.dia > w.dia - 30).reduce((s, t) => s + t.valor, 0);
  }

  function resolverProposta(w, d) {
    const a = w.agente;
    a.pendencias = a.pendencias.filter((p) => p.propostaId !== d.propostaId);
    const lead = a.memoria.leads[d.leadId];
    const prop = lead.propostas.find((x) => x.id === d.propostaId);
    const pub = negocioPorId(w, d.leadId);
    const hid = w.oculto.negocios[d.leadId];
    const need = { perfil_google: pub.temPerfilGoogle ? 0.15 : 0.9, social_media: pub.instagramAtivo ? 0.3 : 0.7, site: 0.25, trafego_pago: 0.5 }[prop.servico];
    const orc = { perfil_google: hid.orcamento * 0.5, social_media: hid.orcamento, site: hid.orcamento * 1.2, trafego_pago: hid.orcamento * 0.8 }[prop.servico];
    const fatorPreco = clamp(orc / prop.preco, 0, 1.5);
    const habil = (a.skills.marketing + a.skills.tecnologia + a.skills.negocios) / 30;
    const prova = Math.min(a.portfolio, 6) / 6;
    const p = orc < prop.preco * 0.6 ? 0 : clamp(pv('fatorAceite') * need * hid.abertura * (0.35 + 0.4 * habil + 0.25 * prova) * Math.pow(fatorPreco, 1.5) * (a.mei && prop.servico !== 'perfil_google' ? 1.1 : 1), 0, 0.5);
    const crencas = a.memoria.crencas.propostas;
    if (!rChance(w, p)) {
      prop.resultado = 'recusada'; crencas.recusadas++; a.memoria.crencas.rejeicoesSeguidas++;
      lembrar(w, lead.nome + ' recusou ' + prop.servico + ' a ' + brl(prop.preco) + '.');
      return;
    }
    prop.resultado = 'aceita'; crencas.aceitas++; a.memoria.crencas.rejeicoesSeguidas = 0;
    const s = SERVICOS[prop.servico];
    const c = { id: 'C' + (++w.contadores.ctr), clienteId: lead.id, servico: prop.servico, valor: prop.preco, pago: 0, horasFeitas: 0, horasNecessarias: s.horas, inicioDia: w.dia, prazoDia: w.dia + s.prazo, mensal: s.mensal, status: 'ativo', ciclos: 0 };
    if (prop.frente) c.frente = prop.frente;
    a.contratos.push(c);
    const neg = negocioDoServico(w, prop.servico); neg.contratos++;
    evento(w, 'CONTRATO', lead.nome + ' fechou ' + prop.servico + ' por ' + brl(prop.preco), { contrato: c.id });
    lembrar(w, lead.nome + ' aceitou ' + prop.servico + ' por ' + brl(prop.preco) + '.');
    if (s.mensal) {
      receber(w, 'RECEITA', c.valor, 'CLIENTE:' + lead.id, '1º mês adiantado de ' + prop.servico + ' (' + c.id + ')');
      registrarReceitaMemoria(w, prop.servico, c.valor, c.frente); c.pago += c.valor; neg.receita += c.valor;
      agendar(w, w.dia + 30, 'ciclo_contrato', { contratoId: c.id });
    } else if (prop.servico === 'site') {
      const sinal = Math.round(c.valor / 2);
      receber(w, 'RECEITA', sinal, 'CLIENTE:' + lead.id, 'Sinal de 50% do site (' + c.id + ')');
      registrarReceitaMemoria(w, 'site', sinal, c.frente); c.pago += sinal; neg.receita += sinal;
    }
  }

  function resolverCicloContrato(w, d) {
    const a = w.agente;
    const c = a.contratos.find((x) => x.id === d.contratoId);
    if (!c || c.status !== 'ativo') return;
    const entregou = c.horasFeitas >= c.horasNecessarias * 0.8;
    const churn = pv('churnMensal') + (entregou ? 0 : 0.35);
    c.ciclos++;
    if (rChance(w, churn)) {
      c.status = 'cancelado'; a.reputacaoQuedas = (a.reputacaoQuedas || 0) + (entregou ? 0 : 1);
      evento(w, 'CANCELAMENTO', 'Cliente ' + c.clienteId + ' cancelou ' + c.servico);
      lembrar(w, 'Cliente ' + c.clienteId + ' cancelou ' + c.servico + (entregou ? '.' : ' (entrega abaixo do combinado).'));
      return;
    }
    if (entregou) a.portfolio++;
    c.horasFeitas = 0; c.prazoDia = w.dia + 30;
    if (rChance(w, pv('probCalote'))) { lembrar(w, 'Cliente ' + c.clienteId + ' atrasou a mensalidade e não pagou.'); evento(w, 'CALOTE', 'Mensalidade não paga ' + c.id); }
    else {
      receber(w, 'RECEITA', c.valor, 'CLIENTE:' + c.clienteId, 'Mensalidade de ' + c.servico + ' (' + c.id + ')');
      registrarReceitaMemoria(w, c.servico, c.valor, c.frente); c.pago += c.valor;
      const neg = a.negocios.find((x) => x.servico === c.servico); if (neg) neg.receita += c.valor;
    }
    agendar(w, w.dia + 30, 'ciclo_contrato', d);
  }

  function resolverCandidatura(w, d) {
    const a = w.agente;
    a.pendencias = a.pendencias.filter((p) => !(p.tipo === 'candidatura' && p.vagaId === d.vagaId));
    const v = w.mundo.vagas.find((x) => x.id === d.vagaId);
    const conc = w.oculto.vagas[d.vagaId].concorrentes;
    if (a.emprego || v.preenchida) { lembrar(w, 'Vaga ' + d.vagaId + ': processo encerrado.'); return; }
    const p = clamp((0.9 / (1 + conc / 10)) * (0.7 + 0.075 * a.skills.negocios), 0.03, 0.6);
    if (!rChance(w, p)) { lembrar(w, 'Não foi aprovado na vaga ' + d.vagaId + ' (' + v.cargo + ').'); return; }
    v.preenchida = true;
    a.emprego = { id: 'E' + w.dia, vagaId: v.id, cargo: v.cargo, salario: v.salario, inicio: w.dia + 2, faltas: 0, diasCiclo: 0, trabalhouDia: 0 };
    agendar(w, w.dia + 2 + 30, 'salario', { empregoId: a.emprego.id });
    evento(w, 'CONTRATADO', 'Contratado como ' + v.cargo + ' (' + brl(v.salario) + ')');
    lembrar(w, 'Aprovado como ' + v.cargo + ', salário ' + brl(v.salario) + '. Começa no dia ' + a.emprego.inicio + '.');
  }

  function resolverFreela(w, d) {
    const a = w.agente;
    a.pendencias = a.pendencias.filter((p) => !(p.tipo === 'proposta_freela' && p.projetoId === d.projetoId));
    const m = a.memoria.projetos[d.projetoId];
    const pj = w.mundo.projetos.find((x) => x.id === d.projetoId) || { fechado: true };
    if (pj.fechado) { m.proposta.resultado = 'perdida'; lembrar(w, 'Projeto ' + d.projetoId + ' fechou com outra pessoa.'); return; }
    const cat = CATEGORIAS_FREELA.find((c) => c[0] === pj.categoria);
    const habil = a.skills[cat[5]] / 10;
    const aval = Math.min(a.plataforma.avaliacoes, 10) / 10;
    const conc = w.oculto.projetos[d.projetoId].concorrentes;
    const fatorPreco = clamp(pj.orcamento / m.proposta.preco, 0, 1.3);
    const p = clamp((1 / (1 + conc / 6)) * (0.3 + 0.5 * habil + 0.2 * aval) * Math.pow(fatorPreco, 1.5) * (a.plataforma.avaliacoes === 0 ? 0.6 : 1), 0, 0.5);
    if (!rChance(w, p)) { m.proposta.resultado = 'perdida'; if (rChance(w, 0.5)) pj.fechado = true; lembrar(w, 'Não ganhou o projeto ' + pj.id + ' (' + pj.categoria + ').'); return; }
    pj.fechado = true; m.proposta.resultado = 'ganha';
    const c = { id: 'C' + (++w.contadores.ctr), clienteId: 'PLATAFORMA', projetoId: pj.id, servico: 'freela', categoria: pj.categoria, valor: m.proposta.preco, pago: 0, horasFeitas: 0, horasNecessarias: pj.horas, inicioDia: w.dia, prazoDia: w.dia + pj.prazo, mensal: false, status: 'ativo', ciclos: 0, plataforma: true, frente: m.proposta.frente };
    a.contratos.push(c);
    const neg = negocioDoServico(w, 'freela'); neg.contratos++;
    evento(w, 'CONTRATO', 'Ganhou o projeto ' + pj.id + ' (' + pj.categoria + ') por ' + brl(c.valor), { contrato: c.id });
    lembrar(w, 'Ganhou o projeto ' + pj.id + ' (' + pj.categoria + ') por ' + brl(c.valor) + '.');
  }
  function resolverUGC(w, d) {
    const a = w.agente;
    a.pendencias = a.pendencias.filter((p) => !(p.tipo === 'candidatura_ugc' && p.campanhaId === d.campanhaId));
    const camp = w.mundo.campanhas.find((x) => x.id === d.campanhaId) || { fechada: true };
    if (camp.fechada) { lembrar(w, 'Campanha ' + d.campanhaId + ' encerrada.'); return; }
    const insc = w.oculto.campanhas[d.campanhaId].inscritos;
    const p = clamp((1 / (1 + insc / 8)) * (0.4 + 0.12 * Math.min(a.portfolioUGC, 5)) * (0.5 + a.skills.marketing / 10), 0, 0.5);
    if (!rChance(w, p)) { lembrar(w, 'Não foi escolhido na campanha de ' + camp.marca + '.'); return; }
    camp.fechada = true;
    const s = SERVICOS.ugc;
    const c = { id: 'C' + (++w.contadores.ctr), clienteId: camp.id, servico: 'ugc', valor: camp.valor, pago: 0, horasFeitas: 0, horasNecessarias: s.horas, inicioDia: w.dia, prazoDia: w.dia + s.prazo, mensal: false, status: 'ativo', ciclos: 0, frente: 'ugc' };
    a.contratos.push(c);
    const neg = negocioDoServico(w, 'ugc'); neg.contratos++;
    evento(w, 'CONTRATO', 'Selecionado para UGC de ' + camp.marca + ' por ' + brl(c.valor), { contrato: c.id });
    lembrar(w, 'Selecionado para UGC de ' + camp.marca + ' (' + brl(c.valor) + ').');
  }

  // ------------------------------------------------------------ ciclo diário
  function cicloDia(w, cerebro) {
    w.dia++;
    const a = w.agente, dia = w.dia;
    const reg = { dia, data: dataVirtual(w.meta.dataInicio, dia), caixaInicio: w.ledger.saldo };
    const txIni = w.ledger.tx.length, evIni = w.logs.eventos.length, resIni = w.logs.resultados.length;
    a.refeicoesHoje = 0;
    a.noite = 'rua';
    resolverAgenda(w);
    if (digital(w)) diaDigital(w);
    else if (rChance(w, pv('probNovaVaga'))) novaVaga(w);
    a.necessidades.fome = clamp(a.necessidades.fome + 35, 0, 100);
    if (rChance(w, pv('probDoenca'))) { a.necessidades.saude = clamp(a.necessidades.saude - 30, 0, 100); evento(w, 'DOENCA', 'Adoeceu'); lembrar(w, 'Adoeceu.'); }

    let decisaoSeq = null;
    if (a.internadoAte >= dia) {
      reg.internado = true; a.noite = 'hospital';
    } else {
      const obs = observar(w);
      const d = cerebro.decidir(obs);
      if (!d || !Array.isArray(d.plano)) throw new Error('cérebro devolveu decisão inválida');
      const dec = {
        seq: ++w.seq, dia, agente: w.meta.id, politica: cerebro.id, tipoCerebro: cerebro.tipo,
        observacaoHash: fnv1a(JSON.stringify(obs)), sabia: resumoObs(obs),
        alternativas: clone(d.alternativas || []), plano: clone(d.plano), novaEstrategia: d.novaEstrategia || null,
      };
      w.logs.decisoes.push(dec);
      decisaoSeq = dec.seq;
      if (dec.novaEstrategia && dec.novaEstrategia !== a.estrategia) {
        a.memoria.mudancasEstrategia.push({ dia, de: a.estrategia, para: dec.novaEstrategia });
        a.estrategia = dec.novaEstrategia;
      }
      let horas = 16;
      for (const acao of dec.plano) {
        const fn = ACOES[acao.tipo];
        let r;
        if (!fn) r = falha('ação inexistente');
        else {
          const custoMin = acao.tipo === 'DORMIR' ? 0 : 0.5;
          if (digital(w) && ACOES_SO_CLASSICO.includes(acao.tipo)) r = falha('fora do cenário digital');
          else r = horas < custoMin ? falha('sem horas no dia') : fn(w, a, acao);
          if (r.horas > horas) { r = { ok: false, horas: 0, resultado: 'sem horas no dia' }; }
        }
        horas -= r.horas;
        if (digital(w) && acao.frente && r.horas > 0) a.memoria.horasPorFrente[acao.frente] = (a.memoria.horasPorFrente[acao.frente] || 0) + r.horas;
        w.metricas.acoes++;
        w.logs.resultados.push({ seq: ++w.seq, dia, decisaoSeq, acao: acao.tipo, params: clone(acao), ok: r.ok, resultado: r.resultado, horas: r.horas });
      }
      if (trabalhaHoje(a, dia) && a.emprego.trabalhouDia !== dia) {
        a.emprego.faltas++;
        lembrar(w, 'Faltou ao trabalho (' + a.emprego.faltas + 'ª falta).');
        if (a.emprego.faltas >= 3) { evento(w, 'DEMISSAO', 'Demitido por faltas'); lembrar(w, 'Demitido por faltas.'); a.emprego = null; }
      }
    }
    fimDoDia(w);
    reg.decisaoSeq = decisaoSeq;
    reg.caixaFim = w.ledger.saldo;
    reg.txIds = w.ledger.tx.slice(txIni).map((t) => t.id);
    reg.eventoSeqs = w.logs.eventos.slice(evIni).map((e) => e.seq);
    reg.resultadoSeqs = w.logs.resultados.slice(resIni).map((r) => r.seq);
    reg.necessidades = clone(a.necessidades);
    reg.local = a.local; reg.noite = a.noite;
    reg.estrategia = a.estrategia;
    reg.patrimonio = financeiro(w).patrimonio;
    w.historico.push(reg);
    w.metricas.ciclos++;
    const aud = auditar(w);
    if (!aud.ok) throw new Error('auditoria falhou no dia ' + dia + ': ' + aud.erros.join('; '));
  }

  function fimDoDia(w) {
    const a = w.agente, n = a.necessidades, dia = w.dia;
    // contratos avulsos atrasados
    for (const c of a.contratos) {
      if (c.status === 'ativo' && !c.mensal && dia > c.prazoDia) {
        c.status = 'perdido'; evento(w, 'CONTRATO_PERDIDO', 'Prazo estourado em ' + c.id); lembrar(w, 'Perdeu o contrato ' + c.id + ' por atraso.');
      }
    }
    // negócios sem receita em 45 dias = fracassados
    for (const neg of a.negocios) {
      if (neg.status === 'ativo' && neg.receita === 0 && dia - neg.lancadoDia >= 45) { neg.status = 'fracassado'; evento(w, 'NEGOCIO_FRACASSADO', neg.servico + ' sem receita em 45 dias'); lembrar(w, 'O serviço ' + neg.servico + ' não deu receita em 45 dias.'); }
    }
    // furto na rua
    if (a.noite === 'rua' && w.ledger.saldo >= 200 && rChance(w, pv('probFurtoRua'))) {
      const perda = Math.floor(w.ledger.saldo / 2);
      pagar(w, 'PERDA', perda, 'FURTO', 'Furto enquanto dormia na rua');
      a.furtos++; evento(w, 'FURTO', 'Perdeu ' + brl(perda)); lembrar(w, 'Foi furtado dormindo na rua: perdeu ' + brl(perda) + '.');
    }
    const rec = { quarto: 60, albergue: 50, pensao: 50, hospital: 45, rua: 30 }[a.noite] || 30;
    n.energia = clamp(n.energia + rec, 0, 100);
    if (n.fome >= 100) n.saude -= 20; else if (n.fome >= 85) n.saude -= 8;
    if (n.energia <= 10) n.saude -= 5;
    if (n.fome < 60 && n.energia > 30) n.saude += 3;
    n.saude = clamp(n.saude, 0, 100);
    if (n.saude <= 0 && a.internadoAte < dia) {
      a.colapsos++; a.internadoAte = dia + 3; n.saude = 50; n.fome = 30;
      evento(w, 'INTERNACAO', 'Colapso de saúde: internado no SUS por 3 dias'); lembrar(w, 'Passou mal e ficou internado 3 dias.');
    }
  }

  // ------------------------------------------------------------ API de execução
  function avancarDia(w, cerebro) {
    const snap = JSON.stringify(w);
    const t0 = Date.now();
    try {
      cicloDia(w, cerebro);
    } catch (e) {
      const r = JSON.parse(snap);
      for (const k of Object.keys(w)) delete w[k];
      Object.assign(w, r);
      return { ok: false, erro: String((e && e.message) || e) };
    }
    w.metricas.ms += Date.now() - t0;
    return { ok: true, dia: w.dia };
  }
  function avancar(w, cerebro, n) {
    for (let i = 0; i < n; i++) { const r = avancarDia(w, cerebro); if (!r.ok) return r; }
    return { ok: true, dia: w.dia };
  }
  function hashMundo(w) {
    const c = clone(w); delete c.metricas.ms;
    return fnv1a(JSON.stringify(c));
  }
  const serializar = (w) => JSON.stringify(w);
  const desserializar = (s) => JSON.parse(s);

  // ------------------------------------------------------------ indicadores
  function financeiro(w) {
    const tx = w.ledger.tx, soma = (f) => tx.filter(f).reduce((s, t) => s + t.valor, 0);
    const receita = soma((t) => t.tipo === 'RECEITA');
    const beneficios = soma((t) => t.tipo === 'BENEFICIO');
    const despesas = soma((t) => t.tipo === 'DESPESA' || t.tipo === 'IMPOSTO');
    const perdas = soma((t) => t.tipo === 'PERDA');
    const ativos = w.agente.ativos.reduce((s, x) => s + x.valorContabil, 0);
    const dividas = w.agente.dividas.reduce((s, x) => s + x.saldo, 0);
    const patrimonio = w.ledger.saldo + ativos - dividas;
    const ganho = patrimonio - w.meta.capitalInicial;
    return {
      capitalInicial: w.meta.capitalInicial, saldo: w.ledger.saldo, receita, beneficios, despesas, perdas,
      lucro: receita + beneficios - despesas - perdas, ativos, dividas, patrimonio, ganhoLiquido: ganho,
      roi: w.meta.capitalInicial > 0 ? ganho / w.meta.capitalInicial : 'não aplicável',
    };
  }

  function diaRegistrado(w, dia) {
    if (dia < 1 || dia > w.dia) return { status: 'NÃO SIMULADO', dia };
    const h = w.historico[dia - 1];
    const dec = w.logs.decisoes.find((d) => d.seq === h.decisaoSeq) || null;
    return {
      status: 'SIMULADO', dia, data: h.data, caixaInicio: h.caixaInicio, caixaFim: h.caixaFim, patrimonio: h.patrimonio,
      necessidades: h.necessidades, local: h.local, noite: h.noite, internado: !!h.internado, estrategia: h.estrategia,
      sabia: dec ? dec.sabia : null, alternativas: dec ? dec.alternativas : [], plano: dec ? dec.plano : [],
      resultados: w.logs.resultados.filter((r) => h.resultadoSeqs.includes(r.seq)),
      eventos: w.logs.eventos.filter((e) => h.eventoSeqs.includes(e.seq)),
      transacoes: w.ledger.tx.filter((t) => h.txIds.includes(t.id)),
    };
  }

  const ZW = {
    VERSAO_MOTOR, PARAMETROS, SERVICOS, CHAVES_PROIBIDAS,
    criarMundo, avancarDia, avancar, auditar, financeiro, diaRegistrado, observar,
    hashMundo, serializar, desserializar, hashSeed, fnv1a, brl, lancar, CATEGORIAS_FREELA,
  };
  if (typeof module === 'object' && module.exports) module.exports = ZW; else g.ZW = ZW;
})(typeof globalThis !== 'undefined' ? globalThis : this);
