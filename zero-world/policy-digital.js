/*
 * ZERO WORLD — Agent Brain do cenário digital
 *
 * POLÍTICA PROGRAMADA v2-digital. NÃO é um modelo de IA: são regras fixas,
 * determinísticas. Cada agente tem uma carreira digital de foco. Se a carreira
 * não gerar receita até o dia 45, a política abre uma segunda frente.
 * A carreira "adaptativo" testa frentes e escolhe pelas próprias medições
 * (receita por hora investida, só com o que o agente viveu).
 * A política só PROPÕE ações; o World Engine valida e decide os resultados.
 */
(function (g) {
  'use strict';

  const ID = 'politica-programada-v2-digital';
  const RESERVA = 5000;
  const CARREIRAS = {
    social_local: 'Social media para comércio local (visitas presenciais)',
    google_local: 'Perfil da Empresa no Google para comércio local',
    sites: 'Sites para comércios e profissionais',
    freela: 'Freelancer em plataforma (estilo Workana/99Freelas)',
    clipping: 'Editor de cortes (clipping)',
    ugc: 'Criador de vídeos UGC para marcas',
    afiliado: 'Afiliado Shopee com conteúdo próprio',
    produto: 'Produto digital (kit de posts) + audiência',
    online: 'Prospecção online (WhatsApp/DM) de serviços digitais',
    adaptativo: 'Generalista adaptativo (testa frentes e fica com as melhores)',
  };
  const SKILL_DA_FRENTE = { social_local: 'marketing', google_local: 'marketing', sites: 'programacao', freela: 'tecnologia', clipping: 'tecnologia', ugc: 'marketing', afiliado: 'marketing', produto: 'marketing', online: 'negocios' };
  const FRENTES_ADAPTATIVO = ['google_local', 'online', 'social_local', 'freela', 'clipping', 'ugc', 'afiliado'];

  const soma = (arr, f) => arr.filter(f).reduce((s, r) => s + r.valor, 0);

  function decidir(o) {
    const a = o.agente, m = o.memoria, P = o.precos, dia = o.dia;
    const plano = [], alternativas = [];
    let horas = o.horasDisponiveis, caixa = a.caixa;
    const usar = (acao, h, motivo, custo) => {
      if (h > horas) { alternativas.push({ acao: acao.tipo, escolhida: false, motivo: 'sem horas: ' + motivo }); return false; }
      if ((custo || 0) > caixa) { alternativas.push({ acao: acao.tipo, escolhida: false, motivo: 'sem dinheiro: ' + motivo }); return false; }
      plano.push(Object.assign({}, acao, { motivo })); horas -= h; caixa -= custo || 0; return true;
    };

    // ---- necessidades básicas (iguais para todas as carreiras)
    const rpGratis = a.registros.centroPop && (a.local === 'rua' || a.local === 'albergue');
    const refeicoes = a.necessidades.fome >= 70 ? 2 : a.necessidades.fome >= 35 ? 1 : 0;
    for (let i = 0; i < refeicoes; i++) {
      if (rpGratis) usar({ tipo: 'COMER', opcao: 'popular' }, 2, 'Restaurante Popular gratuito para quem está na rua');
      else if (caixa >= P.restPopRefeicao) usar({ tipo: 'COMER', opcao: 'popular' }, 2, 'Restaurante Popular, R$3', P.restPopRefeicao);
      else alternativas.push({ acao: 'COMER', escolhida: false, motivo: 'sem dinheiro e sem gratuidade' });
    }
    if (!a.registros.centroPop) usar({ tipo: 'REGISTRAR_CENTRO_POP' }, 3, 'endereço de referência, albergue e comida gratuita');
    else if (!a.docs.rg && !a.docs.rgPedido) usar({ tipo: 'PEDIR_RG' }, 3, 'documento para alugar e formalizar');
    else if (!a.registros.cadunico) usar({ tipo: 'CADUNICO' }, 3, 'renda baixa no começo');
    if (!a.itens.celular) {
      if (caixa >= P.celularUsado + P.chip) { usar({ tipo: 'COMPRAR', item: 'celular' }, 2, 'ferramenta de trabalho de toda carreira digital', P.celularUsado); usar({ tipo: 'COMPRAR', item: 'chip' }, 0, 'contato com clientes', P.chip); }
      else alternativas.push({ acao: 'COMPRAR celular', escolhida: false, motivo: 'sem dinheiro: cenário digital fica limitado ao telecentro' });
    }

    // ---- entregas primeiro
    const pend = a.contratos.reduce((s, c) => s + Math.max(0, c.horasNecessarias - c.horasFeitas), 0);
    const viagemTelecentro = !a.itens.notebook && a.contratos.some((c) => c.servico === 'site' && c.horasFeitas < c.horasNecessarias) ? 1 : 0;
    if (pend > 0) { const h = Math.min(pend + viagemTelecentro, 7, horas); usar({ tipo: 'TRABALHAR_CONTRATOS', horas: h, frente: 'entregas' }, h, viagemTelecentro ? 'entregar no prazo (inclui ida ao telecentro)' : 'entregar no prazo'); }

    // ---- escolha das frentes
    const receitaFrente = (f, desde) => soma(m.receitas, (r) => r.frente === f && r.dia > desde);
    let frentes, estrategia;
    if (o.carreira === 'adaptativo') {
      const n = FRENTES_ADAPTATIVO.length;
      if (dia <= 28) { frentes = [FRENTES_ADAPTATIVO[(dia - 1) % n]]; estrategia = 'EXPLORANDO (rodízio de frentes)'; alternativas.push({ acao: 'FRENTE ' + frentes[0], escolhida: true, motivo: 'fase de teste: uma frente por dia' }); }
      else {
        const hp = m.horasPorFrente || {};
        const nota = FRENTES_ADAPTATIVO.map((f) => ({ f, rh: (hp[f] || 0) > 0 ? receitaFrente(f, 0) / hp[f] : 0, h: hp[f] || 0 }));
        nota.forEach((x) => alternativas.push({ acao: 'FRENTE ' + x.f, valorEsperadoPorHora: Math.round(x.rh), escolhida: false, motivo: 'medido em ' + x.h + 'h investidas' }));
        nota.sort((x, y) => y.rh - x.rh || x.h - y.h);
        frentes = dia % 10 === 0 ? [nota[0].f, nota.slice().sort((x, y) => x.h - y.h)[0].f] : [nota[0].f, nota[1].f];
        frentes.forEach((f) => { const alt = alternativas.find((x) => x.acao === 'FRENTE ' + f); if (alt) alt.escolhida = true; });
        estrategia = 'FOCO: ' + frentes.join(' + ');
      }
    } else {
      frentes = [o.carreira];
      estrategia = 'CARREIRA: ' + o.carreira;
      const digitalTotal45 = soma(m.receitas, (r) => r.dia > dia - 45 && r.frente);
      const jaPivotou = m.mudancasEstrategia.some((x) => x.para.includes('PIVÔ'));
      if (jaPivotou || (dia >= 45 && receitaFrente(o.carreira, dia - 45) === 0 && digitalTotal45 === 0)) {
        const segunda = o.carreira === 'online' ? 'freela' : 'online';
        frentes.push(segunda); estrategia = 'CARREIRA: ' + o.carreira + ' + PIVÔ ' + segunda;
        if (!jaPivotou) alternativas.push({ acao: 'PIVÔ para ' + segunda, escolhida: true, motivo: '45 dias sem receita na carreira' });
      }
    }

    // ---- preços aprendidos com recusas
    const cp = m.crencas.propostas;
    const fator = Math.max(0.6, Math.pow(0.85, Math.floor(m.crencas.rejeicoesSeguidas / 6))) * (a.portfolio >= 5 ? 1.3 : 1);
    const preco = (v) => Math.round((v * fator) / 1000) * 1000;

    // ---- rotinas de cada frente
    const candidatos = (filtro) => Object.values(m.leads).filter((l) => !l.propostas.some((p) => p.resultado === 'pendente') && !a.contratos.some((c) => c.clienteId === l.id) && filtro(l));
    const propor = (frente, lista, escolher, max) => {
      let n = 0;
      for (const l of lista) {
        if (n >= max || horas < 1) break;
        const sv = escolher(l); if (!sv) continue;
        if (usar({ tipo: 'PROPOR', leadId: l.id, servico: sv[0], preco: sv[1], frente }, 1, sv[0] + ' para ' + l.nome)) n++;
      }
      return n;
    };
    const ja = (l, s) => l.propostas.some((p) => p.servico === s);
    const rotina = {
      social_local(f) {
        const lista = candidatos((l) => l.canal !== 'online' && !ja(l, 'social_media') && !l.instagramAtivo);
        const n = propor(f, lista, () => ['social_media', preco(P.socialMediaMes)], 3);
        if (lista.length - n < 3 && horas >= 3) usar({ tipo: 'PROSPECTAR', horas: 3, frente: f }, 3, 'visitar comércios sem Instagram ativo', 0);
      },
      google_local(f) {
        const lista = candidatos((l) => l.canal !== 'online' && ((!l.temPerfilGoogle && !ja(l, 'perfil_google')) || (a.portfolio >= 3 && !l.instagramAtivo && !ja(l, 'social_media'))));
        const n = propor(f, lista, (l) => (!l.temPerfilGoogle && !ja(l, 'perfil_google')) ? ['perfil_google', preco(P.perfilGoogle)] : ['social_media', preco(P.socialMediaMes)], 3);
        if (lista.length - n < 3 && horas >= 3) usar({ tipo: 'PROSPECTAR', horas: 3, frente: f }, 3, 'visitar comércios sem Perfil no Google', 0);
      },
      sites(f) {
        const lista = candidatos((l) => !ja(l, 'site'));
        const n = propor(f, lista, () => ['site', preco(P.siteSimples)], 3);
        if (lista.length - n < 3 && horas >= 3) usar({ tipo: 'PROSPECTAR', horas: 3, frente: f }, 3, 'achar comércios para oferecer site', 0);
      },
      online(f) {
        const lista = candidatos((l) => l.canal === 'online' && ((!l.temPerfilGoogle && !ja(l, 'perfil_google')) || (!l.instagramAtivo && !ja(l, 'social_media'))));
        propor(f, lista, (l) => (!l.temPerfilGoogle && !ja(l, 'perfil_google')) ? ['perfil_google', preco(P.perfilGoogle)] : ['social_media', preco(P.socialMediaMes)], 4);
        if (horas >= 3) usar({ tipo: 'PROSPECTAR_ONLINE', mensagens: 45, frente: f }, 3, 'mensagens para negócios da Grande BH');
      },
      freela(f) {
        usar({ tipo: 'BUSCAR_FREELAS', frente: f }, 0.5, 'ver projetos novos');
        const aval = a.plataforma ? a.plataforma.avaliacoes : 0;
        const abertos = Object.values(m.projetos || {}).filter((p) => !p.proposta && p.abertoAte >= dia && (p.categoria !== 'site' || a.skills.programacao >= 5)).sort((x, y) => x.propostasQuandoViu - y.propostasQuandoViu || (x.id < y.id ? -1 : 1));
        let n = 0;
        for (const pj of abertos) { if (n >= 6 || horas < 0.5) break; if (usar({ tipo: 'PROPOR_FREELA', projetoId: pj.id, preco: Math.round((pj.orcamento * (aval >= 3 ? 0.95 : 0.8)) / 1000) * 1000, frente: f }, 0.5, pj.categoria + ' com ' + pj.propostasQuandoViu + ' propostas quando viu')) n++; }
      },
      clipping(f) { if (a.itens.celular) usar({ tipo: 'CLIPPING', posts: 4, frente: f }, 4, 'cortes pagos por mil views'); },
      ugc(f) {
        if (!a.itens.celular) return;
        if (a.portfolioUGC < 3) usar({ tipo: 'PRODUZIR_PORTFOLIO_UGC', frente: f }, 3, 'marcas pedem portfólio');
        usar({ tipo: 'BUSCAR_CAMPANHAS', frente: f }, 0.5, 'ver campanhas abertas');
        if (a.portfolioUGC >= 2) {
          const camps = Object.values(m.campanhas || {}).filter((c) => !c.candidatado && c.abertaAte >= dia).sort((x, y) => y.valor - x.valor);
          for (const c of camps.slice(0, 4)) usar({ tipo: 'CANDIDATAR_UGC', campanhaId: c.id, frente: f }, 0.5, c.marca + ' ' + c.valor);
        }
      },
      afiliado(f) {
        if (!a.itens.celular) return;
        if (!a.afiliado) usar({ tipo: 'ATIVAR_AFILIADO', frente: f }, 1, 'cadastro no programa de afiliados');
        usar({ tipo: 'POSTAR_CONTEUDO', posts: 4, frente: f }, 4, 'audiência gera cliques de afiliado');
      },
      produto(f) {
        if (!a.itens.celular) return;
        if (!a.produto) usar({ tipo: 'CRIAR_PRODUTO', horas: 4, frente: f }, 4, 'kit de posts editáveis');
        usar({ tipo: 'POSTAR_CONTEUDO', posts: a.produto ? 4 : 2, frente: f }, a.produto ? 4 : 2, 'audiência compra o produto');
      },
    };
    for (const f of frentes) if (rotina[f]) rotina[f](f);

    // ---- tráfego pago como serviço extra para cliente de social media
    if (a.skills.marketing >= 6) {
      const clientes = a.contratos.filter((c) => c.servico === 'social_media').map((c) => c.clienteId);
      for (const id of clientes) {
        const l = m.leads[id];
        if (l && !ja(l, 'trafego_pago') && !a.contratos.some((c) => c.clienteId === id && c.servico === 'trafego_pago') && !l.propostas.some((p) => p.resultado === 'pendente')) {
          usar({ tipo: 'PROPOR', leadId: id, servico: 'trafego_pago', preco: P.trafegoMes, frente: 'trafego' }, 1, 'oferecer tráfego para cliente atual'); break;
        }
      }
    }

    // ---- estudo com o que sobra
    const sk = SKILL_DA_FRENTE[frentes[0]] || 'marketing';
    if (horas >= 3 && a.necessidades.energia >= 15 && a.skills[sk] < 9) usar({ tipo: 'ESTUDAR', area: sk }, a.itens.celular ? 3 : 4, 'curso gratuito ligado à carreira');

    // ---- formalização, equipamento, moradia
    const receita30 = soma(m.receitas, (r) => r.dia > dia - 30 && r.fonte !== 'bolsa_familia');
    if (!a.mei && a.contratos.length >= 2 && a.itens.celular) usar({ tipo: 'ABRIR_MEI' }, 1, '2+ clientes: formalizar (enquadramento depende da ocupação)');
    const precisaPC = frentes.includes('sites') || frentes.includes('freela') || a.contratos.some((c) => c.servico === 'site');
    if (!a.itens.notebook && precisaPC && caixa >= P.notebookUsado + 2 * P.quartoMes + RESERVA) usar({ tipo: 'COMPRAR', item: 'notebook' }, 2, 'parar de depender do telecentro', P.notebookUsado);
    for (const d of a.dividas.filter((x) => x.saldo > 0)) if (caixa >= d.saldo + RESERVA) usar({ tipo: 'PAGAR_DIVIDA', dividaId: d.id }, 0.5, 'quitar ' + d.descricao, d.saldo);
    if (!a.quarto && a.docs.rg && caixa >= 2 * P.quartoMes + 20000 && receita30 >= 1.3 * P.quartoMes) usar({ tipo: 'ALUGAR_QUARTO' }, 3, 'renda dos últimos 30 dias cobre o aluguel', 2 * P.quartoMes);
    if (a.necessidades.energia < 25 && horas >= 2) usar({ tipo: 'DESCANSAR', horas: Math.min(4, horas) }, Math.min(4, horas), 'energia baixa');

    const temQuarto = !!a.quarto || plano.some((p) => p.tipo === 'ALUGAR_QUARTO');
    if (temQuarto) usar({ tipo: 'DORMIR', onde: 'quarto' }, 0, 'quarto alugado');
    else if (a.registros.centroPop || plano.some((p) => p.tipo === 'REGISTRAR_CENTRO_POP')) usar({ tipo: 'DORMIR', onde: 'albergue' }, 0, 'albergue gratuito');
    else usar({ tipo: 'DORMIR', onde: 'rua' }, 0, 'sem alternativa gratuita');

    return { plano, alternativas, novaEstrategia: estrategia };
  }

  const Politica = { id: ID, tipo: 'POLÍTICA PROGRAMADA v2-digital (regras fixas, não é IA)', decidir, CARREIRAS };
  if (typeof module === 'object' && module.exports) module.exports = Politica; else g.ZWPoliticaDigital = Politica;
})(typeof globalThis !== 'undefined' ? globalThis : this);
