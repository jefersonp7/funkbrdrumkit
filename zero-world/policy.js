/*
 * ZERO WORLD — Agent Brain
 *
 * POLÍTICA PROGRAMADA v1. Isto NÃO é um modelo de IA: são regras fixas
 * escritas à mão. É determinística: a mesma observação gera a mesma decisão.
 *
 * Ela recebe só a observação congelada que o motor monta (o que o agente sabe
 * hoje) e devolve um plano de ações + as alternativas que considerou.
 * Não tem acesso ao mundo, à agenda oculta nem ao gerador aleatório.
 * Ela PROPÕE; quem decide o resultado é o World Engine.
 */
(function (g) {
  'use strict';

  const ID = 'politica-programada-v1';
  const RESERVA = 5000; // R$50 que a política tenta não gastar

  function soma30(memoria, dia, filtro) {
    return memoria.receitas.filter((r) => r.dia > dia - 30 && (!filtro || filtro(r))).reduce((s, r) => s + r.valor, 0);
  }

  function decidir(o) {
    const a = o.agente, m = o.memoria, P = o.precos, dia = o.dia;
    const plano = [], alternativas = [];
    let horas = o.horasDisponiveis;
    let caixa = a.caixa; // caixa projetado (a política planeja com o que sabe ter)
    let estrategia = a.estrategia;

    const usar = (acao, h, motivo, custo) => {
      if (h > horas) { alternativas.push({ acao: acao.tipo, escolhida: false, motivo: 'sem horas: ' + motivo }); return false; }
      if ((custo || 0) > caixa) { alternativas.push({ acao: acao.tipo, escolhida: false, motivo: 'sem dinheiro: ' + motivo }); return false; }
      plano.push(Object.assign({}, acao, { motivo }));
      horas -= h; caixa -= custo || 0;
      return true;
    };
    const considerar = (acao, valorHora, escolhida, motivo) => alternativas.push({ acao, valorEsperadoPorHora: Math.round(valorHora), escolhida, motivo });

    const empregado = !!a.emprego;
    const trabalhaHoje = empregado && a.emprego.trabalhaHoje;
    const receitaDigital30 = soma30(m, dia, (r) => ['perfil_google', 'social_media', 'site', 'clipping'].includes(r.fonte));
    const receita30 = soma30(m, dia, (r) => r.fonte !== 'bolsa_familia');
    const rpGratis = a.registros.centroPop && (a.local === 'rua' || a.local === 'albergue');

    // 1. obrigação: dia de escala
    if (trabalhaHoje) usar({ tipo: 'TRABALHAR_EMPREGO' }, 9, 'dia de escala; 3 faltas = demissão');

    // 2. comida
    const refeicoes = a.necessidades.fome >= 70 ? 2 : a.necessidades.fome >= 35 ? 1 : 0;
    for (let i = 0; i < refeicoes; i++) {
      if (rpGratis) usar({ tipo: 'COMER', opcao: 'popular' }, 2, 'Restaurante Popular gratuito para quem está na rua');
      else if (caixa >= P.restPopRefeicao && horas >= 4) usar({ tipo: 'COMER', opcao: 'popular' }, 2, 'Restaurante Popular é a refeição mais barata', P.restPopRefeicao);
      else if (caixa >= P.refeicaoComum) usar({ tipo: 'COMER', opcao: 'marmita' }, 0.5, 'sem tempo para o Restaurante Popular', P.refeicaoComum);
      else alternativas.push({ acao: 'COMER', escolhida: false, motivo: 'sem dinheiro e sem gratuidade' });
    }

    // 3. registros e documentos (um por dia)
    if (!a.registros.centroPop) usar({ tipo: 'REGISTRAR_CENTRO_POP' }, 3, 'endereço de referência, albergue e comida gratuita');
    else if (!a.docs.rg && !a.docs.rgPedido) usar({ tipo: 'PEDIR_RG' }, 3, 'RG é requisito de vaga e de aluguel');
    else if (!a.registros.cadunico) usar({ tipo: 'CADUNICO' }, 3, 'renda baixa: pode dar direito ao Bolsa Família');

    // 4. celular
    const custoCel = P.celularUsado + P.chip;
    if (!a.itens.celular) {
      if (caixa >= custoCel + RESERVA) { usar({ tipo: 'COMPRAR', item: 'celular' }, 2, 'celular habilita vagas, clientes e Pix', P.celularUsado); usar({ tipo: 'COMPRAR', item: 'chip' }, 0, 'chip para contato', P.chip); }
      else considerar('COMPRAR celular', 0, false, 'faltam ' + (custoCel + RESERVA - caixa) + ' centavos');
    }

    // 5. crenças (aprendidas só com a própria experiência)
    const cd = m.crencas.diaria;
    const pDiaria = (1 + cd.sucessos) / (2 + cd.tentativas);
    const valorDiaria = cd.sucessos ? cd.soma / cd.sucessos : 15000;
    const evDiaria = (pDiaria * valorDiaria) / 8;
    const cp = m.crencas.propostas;
    const pAceite = (1 + cp.aceitas) / (5 + cp.enviadas);
    const fatorPreco = Math.max(0.6, Math.pow(0.85, Math.floor(m.crencas.rejeicoesSeguidas / 6))) * (a.portfolio >= 5 ? 1.3 : 1);
    const precoPerfil = Math.round((P.perfilGoogle * fatorPreco) / 1000) * 1000;
    const precoSocial = Math.round((P.socialMediaMes * fatorPreco) / 1000) * 1000;
    const evDigital = a.itens.celular ? (pAceite * precoPerfil) / (1.33 + pAceite * 5) : 0;

    // 6. entregas pendentes primeiro (prazo)
    const pendHoras = a.contratos.reduce((s, c) => s + Math.max(0, c.horasNecessarias - c.horasFeitas), 0);
    if (pendHoras > 0) usar({ tipo: 'TRABALHAR_CONTRATOS', horas: Math.min(pendHoras, 6, horas) }, Math.min(pendHoras, 6, horas), 'entregar no prazo para receber e não perder cliente');

    // 7. sobrevivência sem dinheiro e sem renda pendente
    const esperaReceber = a.pendencias.some((p) => p.tipo === 'proposta' || p.tipo === 'clipping') || a.contratos.length > 0;
    const precisaDinheiro = caixa < 2000 && !esperaReceber;
    const fazerDiaria = !trabalhaHoje && a.necessidades.energia >= 40 && horas >= 10 && (precisaDinheiro || !a.itens.celular || evDiaria > evDigital * 1.5);
    considerar('DIARIA_BRACAL', evDiaria, fazerDiaria, 'chance estimada ' + pDiaria.toFixed(2) + ' com base em ' + cd.tentativas + ' tentativa(s)');
    if (fazerDiaria) { usar({ tipo: 'DIARIA_BRACAL' }, 10, precisaDinheiro ? 'sem dinheiro e sem renda a caminho' : 'maior valor esperado por hora hoje'); }

    // 8. emprego
    if (!empregado && a.docs.rg && a.itens.celular && receita30 < P.salarioMinimo) {
      const candidaturas = a.pendencias.filter((p) => p.tipo === 'candidatura').length;
      if (dia - m.ultimaBuscaVagas >= 5 && candidaturas < 3) usar({ tipo: 'BUSCAR_VAGAS' }, 1, 'renda abaixo do salário mínimo: procurar CLT');
      const abertas = Object.values(m.vagas).filter((v) => !v.candidatado && v.abertaAte >= dia).sort((x, y) => y.salario - x.salario);
      for (const v of abertas.slice(0, Math.max(0, 3 - candidaturas))) usar({ tipo: 'CANDIDATAR', vagaId: v.id }, 1, 'vaga ' + v.cargo + ' a ' + v.salario + ' centavos');
      considerar('EMPREGO_CLT', P.salarioMinimo * 0.88 / 208, true, 'renda estável; requisitos atendidos');
    }

    // 9. serviços digitais
    if (a.itens.celular && horas >= 1) {
      considerar('SERVICOS_DIGITAIS', evDigital, true, 'aceite estimado ' + pAceite.toFixed(2) + ' em ' + cp.enviadas + ' proposta(s); preço perfil ' + precoPerfil);
      const servicoPara = (l) => {
        const jaTentou = l.propostas.map((p) => p.servico);
        if (!l.temPerfilGoogle && !jaTentou.includes('perfil_google')) return ['perfil_google', precoPerfil];
        if (!l.instagramAtivo && !jaTentou.includes('social_media')) return ['social_media', precoSocial];
        if (a.itens.notebook && !jaTentou.includes('site')) return ['site', P.siteSimples];
        return null;
      };
      const ocupado = (l) => l.propostas.some((p) => p.resultado === 'pendente') || a.contratos.some((c) => c.clienteId === l.id);
      const candidatos = Object.values(m.leads).filter((l) => !ocupado(l) && servicoPara(l));
      candidatos.sort((x, y) => (x.temPerfilGoogle - y.temPerfilGoogle) || (x.instagramAtivo - y.instagramAtivo) || (x.id < y.id ? -1 : 1));
      let propostas = 0;
      for (const l of candidatos) {
        if (propostas >= 3 || horas < 1) break;
        const [servico, preco] = servicoPara(l);
        if (usar({ tipo: 'PROPOR', leadId: l.id, servico, preco }, 1, servico + ' para ' + l.nome)) propostas++;
      }
      if (candidatos.length - propostas < 3 && horas >= 3 && a.necessidades.energia >= 20) usar({ tipo: 'PROSPECTAR', horas: 3 }, 3, 'poucos comércios ainda sem proposta');
      if (horas >= 3 && a.necessidades.energia >= 15) usar({ tipo: 'CLIPPING', posts: 3 }, 3, 'renda complementar, paga em ~21 dias');
    }

    // 10. estudo com horas que sobram
    if (horas >= 4 && a.necessidades.energia >= 15) {
      const area = a.skills.marketing <= a.skills.tecnologia ? 'marketing' : 'tecnologia';
      if (a.skills[area] < 8) usar({ tipo: 'ESTUDAR', area }, a.itens.celular ? 3 : 4, 'cursos gratuitos (Wi-Fi BH ou telecentro)');
    }

    // 11. formalização, equipamento e moradia
    const mensais = a.contratos.filter((c) => c.mensal).length;
    if (!a.mei && a.contratos.length >= 2 && a.itens.celular) usar({ tipo: 'ABRIR_MEI' }, 1, '2+ clientes: formalizar');
    if (!a.itens.notebook && mensais >= 2 && caixa >= P.notebookUsado + 2 * P.quartoMes + RESERVA) usar({ tipo: 'COMPRAR', item: 'notebook' }, 2, 'habilita sites', P.notebookUsado);
    for (const d of a.dividas.filter((x) => x.saldo > 0)) if (caixa >= d.saldo + RESERVA) usar({ tipo: 'PAGAR_DIVIDA', dividaId: d.id }, 0.5, 'quitar ' + d.descricao, d.saldo);
    if (!a.quarto && a.docs.rg && caixa >= 2 * P.quartoMes + 20000 && receita30 >= 1.3 * P.quartoMes) usar({ tipo: 'ALUGAR_QUARTO' }, 3, 'renda dos últimos 30 dias cobre o aluguel', 2 * P.quartoMes);
    if (a.necessidades.energia < 25 && horas >= 2) usar({ tipo: 'DESCANSAR', horas: Math.min(4, horas) }, Math.min(4, horas), 'energia baixa');

    // 12. onde dormir
    const temQuarto = !!a.quarto || plano.some((p) => p.tipo === 'ALUGAR_QUARTO');
    if (temQuarto) usar({ tipo: 'DORMIR', onde: 'quarto' }, 0, 'quarto alugado');
    else if (a.registros.centroPop || plano.some((p) => p.tipo === 'REGISTRAR_CENTRO_POP')) usar({ tipo: 'DORMIR', onde: 'albergue' }, 0, 'albergue gratuito');
    else usar({ tipo: 'DORMIR', onde: 'rua' }, 0, 'sem alternativa gratuita');

    // estratégia declarada (rótulo do que a política está priorizando)
    if (empregado && mensais > 0) estrategia = 'EMPREGO+DIGITAL';
    else if (empregado) estrategia = 'EMPREGO';
    else if (a.itens.celular && (receitaDigital30 > 0 || a.contratos.length > 0)) estrategia = 'DIGITAL';
    else if (a.itens.celular) estrategia = 'BUSCA (digital + vagas)';
    else estrategia = 'SOBREVIVENCIA (bicos)';

    return { plano, alternativas, novaEstrategia: estrategia };
  }

  const Politica = { id: ID, tipo: 'POLÍTICA PROGRAMADA (regras fixas, não é IA)', decidir };
  if (typeof module === 'object' && module.exports) module.exports = Politica; else g.ZWPolitica = Politica;
})(typeof globalThis !== 'undefined' ? globalThis : this);
