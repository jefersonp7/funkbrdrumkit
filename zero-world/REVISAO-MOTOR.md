# Revisão do motor ZERO WORLD — 03/11/2026

Tudo aqui foi verificado com código executável:
- `node zero-world/auditoria-motor.js`: 23 checagens; evidências em `runs/AUDITORIA-MOTOR/`.
- `node --test zero-world/test.js`: 15 testes.
- Um teste de navegador (Playwright) para fechar e reabrir a página.

O cérebro dos agentes é uma **POLÍTICA PROGRAMADA (regras fixas, não é IA)**. Todos os números de agentes são **RESULTADO SIMULADO**.

## 1. O que diferencia as dez carreiras

**O motor é o mesmo para as 10.** Só mudam três coisas:
- a semente;
- o campo `carreira`;
- a rotina que a política executa (`policy-digital.js`, objeto `rotina`).

**Regras compartilhadas por todas as carreiras (mesma ordem, mesmo código):**
1. Comer: 2 refeições se fome ≥ 70, 1 se fome ≥ 35. Prefere o Restaurante Popular (grátis para quem está na rua ou no albergue e registrado no Centro POP).
2. Documentos, um por dia: Centro POP → RG → CadÚnico.
3. Celular + chip, se o caixa cobre (R$315).
4. Entregar contratos pendentes antes de qualquer frente nova.
5. Oferecer tráfego pago a cliente de social media, se marketing ≥ 6.
6. Estudar 3h na habilidade da carreira, se sobram horas.
7. MEI com 2+ contratos.
8. Notebook (só sites, freela ou quem tem contrato de site).
9. Quitar dívidas.
10. Alugar quarto quando a receita de 30 dias ≥ 1,3 × aluguel.
11. Dormir (quarto → albergue → rua).
12. **Pivô:** depois de 45 dias sem receita, abre uma segunda frente (online, ou freela se a carreira já for online).

**O que é exclusivo de cada carreira:**

| Carreira | Rotina própria |
|---|---|
| social_local | PROSPECTAR presencial (ônibus R$6,25 × 2) + PROPOR social_media a quem não tem Instagram ativo |
| google_local | PROSPECTAR + PROPOR perfil_google a quem não tem perfil; com portfólio ≥ 3, também social_media |
| sites | PROSPECTAR + PROPOR site; trabalha no telecentro (máx. 4h/dia + 1h de deslocamento) até comprar notebook |
| freela | BUSCAR_FREELAS + até 6 PROPOR_FREELA/dia, preço a 80% do orçamento (95% com 3+ avaliações) |
| clipping | CLIPPING com 4 cortes/dia |
| ugc | 3 vídeos de portfólio, depois BUSCAR_CAMPANHAS + até 4 CANDIDATAR_UGC/dia |
| afiliado | ATIVAR_AFILIADO + POSTAR_CONTEUDO 4/dia |
| produto | CRIAR_PRODUTO (15h) + POSTAR_CONTEUDO |
| online | PROSPECTAR_ONLINE (45 mensagens/dia) + PROPOR a quem respondeu |
| adaptativo | Rodízio de 7 frentes nos dias 1–28; depois as 2 com mais R$/hora medidos por ele mesmo (a cada 10 dias testa a menos explorada) |

**Evidência (`runs/AUDITORIA-MOTOR/evidencias.json`, 30 dias):**
- Ações usadas por **todos**: CADUNICO, COMER, COMPRAR, DORMIR, ESTUDAR, PEDIR_RG, REGISTRAR_CENTRO_POP.
- Ações usadas por **no máximo 2 agentes**: ALUGAR_QUARTO, ATIVAR_AFILIADO, BUSCAR_CAMPANHAS, BUSCAR_FREELAS, CANDIDATAR_UGC, CLIPPING, CRIAR_PRODUTO, PRODUZIR_PORTFOLIO_UGC, PROPOR_FREELA, PROSPECTAR_ONLINE.

## 2. Por que todos fizeram "registrar centro pop" às 11h

No dia 1, os 10 agentes recebem **a mesma observação**: caixa R$500, fome 75, energia 60, sem Centro POP, sem RG, sem celular, na rua. Isso foi checado. Como a política é determinística, a mesma entrada gera o mesmo começo:
- **fome 40 inicial + 35 do dia = 75 ≥ 70**, então 2 refeições;
- cada refeição no Restaurante Popular leva 2h a partir das 07:00 (07:00 e 09:00);
- o registro vem em seguida, às 11:00.

**Por que o motor torna o registro necessário** (`engine.js`):
- **Albergue:** `DORMIR` em albergue exige encaminhamento (linha ~725).
- **RG gratuito:** `PEDIR_RG` exige a declaração do Centro POP (linha ~399).
- **Refeição de graça:** só para quem está registrado e na rua ou no albergue (linha ~416).
- **Endereço:** `CADUNICO` e o aluguel dependem de endereço (Centro POP ou quarto, linha ~383).

**Defeito encontrado:** a política come **antes** de se registrar. Por isso as 10 vidas pagaram R$6 em refeições que seriam gratuitas se o registro viesse primeiro.

## 3. As decisões usam só a informação do momento?

**Sim, dentro do que o motor modela.**

**Evidências:**
- **Observação congelada:** o cérebro recebe uma observação congelada (`deepFreeze`), sem `oculto`, `agenda`, `rngState`, `abertura`, `concorrentes` nem `inscritos`. Isso foi checado nas 300 decisões dos 30 dias.
- **Decisão pura:** recalcular a decisão com a mesma observação dá sempre o mesmo resultado (300/300).
- **Estado oculto não vaza:** no dia 15, alterei todo o estado oculto (gerador, orçamentos, abertura, concorrência, inscritos, datas da agenda futura). A observação e a decisão ficaram **idênticas** nos 10 agentes.
- **Ordem:** toda decisão tem número de sequência menor que os resultados do mesmo dia.
- **Pagamentos da madrugada:** os pagamentos agendados para o dia caem às 00:00, **antes** da decisão. O agente sabe deles porque já aconteceram.
- **Prazos e vencimentos:** o agente vê o próprio contrato (prazo, vencimento do aluguel) e vagas e projetos públicos (orçamento declarado, data de fechamento). São informações que uma pessoa real também teria.

## 4. Simulação de 30 dias (rodada ao vivo, semente 20261103)

Arquivos `runs/AUDITORIA-MOTOR/DIGI-XX-<carreira>-30dias.md`, com, para cada dia:
- caixa no início e no fim;
- entradas e saídas;
- o plano decidido;
- os clientes ativos;
- todas as transações, os contratos e a memória do agente no dia 30.

Resumo (`RESUMO-30-DIAS.md`):

| Agente | Carreira | Caixa D30 | Patrimônio | Receita | Despesas | Contratos | Propostas | 1ª receita |
|---|---|---|---|---|---|---|---|---|
| DIGI-01 | social_local | R$ 879,00 | R$ 1.059,00 | R$ 1.000,00 | R$ 321,00 | 2 | 47 | D8 |
| DIGI-02 | google_local | R$ 179,00 | R$ 359,00 | R$ 300,00 | R$ 321,00 | 2 | 46 | D13 |
| DIGI-03 | sites | R$ 1.276,50 | R$ 1.456,50 | R$ 1.260,00 | R$ 183,50 | 3 | 80 | D4 |
| DIGI-04 | freela | R$ 571,00 | R$ 1.401,00 | R$ 2.130,00 | R$ 1.109,00 | 12 | 83 | D11 |
| DIGI-05 | clipping | R$ 374,59 | R$ 554,59 | R$ 195,59 | R$ 21,00 | 0 | 0 | D23 |
| DIGI-06 | ugc | R$ 359,00 | R$ 539,00 | R$ 180,00 | R$ 21,00 | 3 | 21 | D29 |
| DIGI-07 | afiliado | R$ 89,50 | R$ 269,50 | R$ 0,00 | R$ 21,00 | 0 | 0 | — |
| DIGI-08 | produto | R$ 255,89 | R$ 435,89 | R$ 94,00 | R$ 38,11 | 0 | 0 | D18 |
| DIGI-09 | online | R$ 969,00 | R$ 1.149,00 | R$ 790,00 | R$ 21,00 | 4 | 53 | D6 |
| DIGI-10 | adaptativo | R$ 894,55 | R$ 1.074,55 | R$ 836,30 | R$ 58,50 | 4 | 46 | D11 |

Notas sobre a tabela:
- A **despesa do freela** inclui a taxa de 20% da plataforma e o 1º aluguel. A **caução** entra como ativo, não como despesa.
- O **afiliado** tem comissão acumulada que só é paga no dia 31 (fechamento mensal).

## 5. Integridade, isolamento e recuperação

| Teste | Resultado | Evidência |
|---|---|---|
| Livro-caixa dos 10 mundos fecha (fórmula + encadeamento dia a dia) | ✅ | 167 transações |
| Adulterações: mudar valor, apagar, trocar ordem, duplicar, mudar saldo, transformar capital em receita, mudar caixa de um dia | ✅ 7/7 detectadas | mensagem de erro de cada uma em `evidencias.json` |
| Saída maior que o saldo | ✅ recusada | |
| Cada mundo sozinho = o mesmo mundo dentro da rodada | ✅ 10/10 hashes | |
| Nenhum objeto compartilhado entre mundos | ✅ | varredura de referências |
| Memória de um agente não cita outro | ✅ | |
| Reabrir = reconstruir pela semente | ✅ 10/10 hashes | |
| Fechar no dia 12 e retomar do checkpoint até o 30 | ✅ 10/10 hashes, sem transação duplicada | |
| **Navegador (Playwright):** abrir no dia 31 virtual, fechar, reabrir no mesmo dia, reabrir no dia seguinte | ✅ hashes idênticos ao Node (D30 e D31), auditoria OK, 0 erros | relógio simulado com `page.clock` |
| `node --test zero-world/test.js` | ✅ 15/15 | |
| `digital-24x` em duas etapas = de uma vez | ✅ diário byte a byte igual, hashes iguais | |

## O que ainda não funciona (ou não é realista)

1. **Ordem do dia 1:** come antes de se registrar e paga R$6 que seriam grátis. *(política)*
2. **Sem horário de funcionamento:** o motor só controla o total de horas do dia. Restaurante Popular (almoço 11h–13h), albergue, telecentro e comércios não têm horário. Por isso as duas refeições saem às 07:00 e 09:00. *(motor)*
3. **Dorme na rua com dinheiro no bolso:** quando o albergue lota (regra sintética de 15%), a política não tenta pensão. Em 30 dias, as 10 vidas passaram de 2 a 9 noites na rua, sempre com ≥ R$50, e 2 foram furtadas. *(política)*
4. **Habilidade sobe rápido demais:** 3h de curso por dia levam de 4 para 8,5 em 30 dias. Como a chance de aceite depende da habilidade, isso infla os resultados a partir do 2º mês. *(regra sintética sem calibração)*
5. **Granularidade diária:** o dia inteiro é resolvido no início. O agente não reage a nada que aconteça durante o dia; respostas chegam só na madrugada seguinte. A aba "Agora" só **revela** o dia por hora, não o simula por hora.
6. **Começo idêntico:** todos recebem a mesma observação, então fazem o mesmo nas primeiras horas. Social_local e google_local quase não se diferenciam nas primeiras semanas (mesma rotina de visita; muda só o serviço oferecido).
7. **Calibração:** comércios, projetos, campanhas, seguidores e chances de aceite são regras sintéticas não validadas com dados reais.
8. **Enquadramento no MEI:** não é modelado (social media "depende" da ocupação).
9. **Custo de reabrir a página:** cresce com os dias (cada dia é recalculado a partir da semente). No dia 365 serão ~40 s.
10. **Não há IA no cérebro.** As decisões são regras fixas, rotuladas assim em todo lugar.
