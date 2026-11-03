# ZERO WORLD — motor de simulação econômica verificável

O sucessor do experimento do Rafael. O Rafael foi preservado como **EXPERIMENTO-001** (narrativo); a auditoria está em [`../agente-sobrevivencia/AUDITORIA.md`](../agente-sobrevivencia/AUDITORIA.md).

## O que existe e funciona

| Parte | Arquivo | O que faz |
|---|---|---|
| World Engine | `engine.js` | Estado do mundo e regras. Valida cada ação, sorteia resultados com semente (gerador mulberry32 escondido do agente), mantém o livro-caixa e faz a auditoria diária. |
| Agent Brain | `policy.js` | **Política programada v1: regras fixas, não é IA.** Recebe só uma observação congelada e devolve um plano de ações mais as alternativas que considerou. |
| Experimento | `experiment.js` | 10 vidas em mundos independentes, várias rodadas, métricas e relatório coletivo (bloqueado até a rodada terminar). |
| Linha de comando | `cli.js` | Modos vida, turbo e 24x, replay de dia, rodada completa e checkpoints gravados de forma atômica. |
| Testes | `test.js` | Os 10 testes obrigatórios (`node --test zero-world/test.js`). |
| Painel | `dashboard.html` | O mesmo código do motor rodando no navegador, com visão geral, replay, comparação, auditoria e parâmetros. Gerado por `build-dashboard.js`. |

## Como o dia funciona (um ciclo)

1. O dia avança e o motor resolve a **agenda oculta**: respostas de propostas, resultado de candidaturas, salário, RG, Bolsa Família, aluguel, DAS, pagamento de cortes.
2. Vêm os sorteios do mundo: vaga nova, doença. A fome sobe.
3. O motor monta a **observação**: só o que o agente sabe hoje, sem agenda, sem gerador e sem dados ocultos dos comércios e vagas. A observação é congelada.
4. O cérebro decide. A decisão é **gravada antes** de qualquer resultado.
5. O motor executa cada ação: confere requisitos, horas, energia e dinheiro, e calcula o resultado.
6. Fim do dia: furto (se dormiu na rua), energia, saúde, internação, prazos, negócios sem receita há 45 dias.
7. Auditoria: SALDO_FINAL = SALDO_INICIAL + ENTRADAS − SAÍDAS, recalculado transação por transação. **Se falhar, o dia inteiro é desfeito.**

O modo Turbo é só esse ciclo repetido N vezes. Não existe atalho, e por isso Turbo e Vida dão o mesmo hash (teste 3).

## Livro-caixa

Cada transação registra: id, agente, dia, tipo, direção, valor (em centavos), origem, destino, justificativa, saldo anterior e saldo posterior.

- `lancar()` é a única função que muda o saldo.
- Saída sem saldo é recusada, porque o limite de crédito é zero.
- O capital inicial é um lançamento `CAPITAL_INICIAL` e não conta como receita.
- **Ativos** (celular, notebook, caução) entram no patrimônio pelo valor contábil estimado.
- **Dívidas** só surgem de forma explícita (DAS não pago).
- **Patrimônio** = caixa + ativos − dívidas.
- **Ganho líquido** = patrimônio − capital inicial.
- **ROI** com capital zero aparece como "não aplicável".

## Rótulos dos dados

| Rótulo | O que significa |
|---|---|
| `REAL` | Fonte pública citada, pesquisada em 03/11/2026. Foi conferida no resultado de busca, **não na fonte primária**. |
| `ESTIMATIVA` | Valor escolhido a partir de uma faixa de mercado ou de uma suposição. |
| `SINTETICA` | Regra inventada para o simulador funcionar: comércios, vagas, chances de aceite, de diária e de furto, prazos. **Comércios e vagas não existem de verdade.** |
| `RESULTADO SIMULADO` | Tudo que o motor produz. |

O cenário começa em 04/11/2026, com dados de 2026. Nenhum dado posterior à data virtual foi usado.

## Testes (executados em 03/11/2026)

`node --test zero-world/test.js` → **10 de 10 passaram**:
1. o saldo nunca muda sem transação;
2. 30 dias = 30 ciclos;
3. Turbo = Vida;
4. isolamento entre agentes;
5. sem acesso ao futuro;
6. capital inicial;
7. reprodutível;
8. pausar/retomar sem duplicar;
9. falha não corrompe;
10. relatório não inventa.

**Verificação dos próprios testes (mutações propositais, desfeitas depois):**
- Vazar `oculto` para o agente → o teste 5 falhou.
- Somar 1 centavo ao saldo em cada receita → o teste 1 falhou.
- Usar `Math.random` fora da semente → os testes 3 e 7 falharam.

**No navegador (Playwright):** as 10 vidas da semente 20261104 em 240 dias deram **o mesmo hash** da execução em Node.

## Rodada de referência: semente 20261104, 240 dias

Arquivos em `runs/R20261104/`: `resumo.json`, e para cada vida `livro-caixa.csv`, `decisoes.jsonl`, `resultados.jsonl` e `eventos.jsonl`.

**O que os números mostram sobre as regras atuais. Não é previsão do mundo real.**
- Nas 5 rodadas (sementes 20261104 a 20261108), a mediana do ganho líquido em 240 dias foi:
  - R$14.688 com capital R$0;
  - R$15.715 com R$500;
  - R$16.455 com R$1.000.

  Nessa calibração, o efeito do capital inicial é pequeno perto da variação entre sementes.
- Todas as vidas atingiram a "estabilidade" no primeiro dia possível (D30). Isso indica que **a economia sintética está generosa**: comida e albergue gratuitos sem fila, e aceite de propostas de 4–13%. A calibração precisa ser revista com dados reais antes de qualquer conclusão.
- Aceite simulado: Perfil no Google 12,6%, gestão de Instagram 10%, site 4,1%.

## Limitações (o que não foi implementado, e por quê)

- **Sem IA no cérebro.** A política v1 são regras fixas. O lugar de um modelo de linguagem é a interface `cerebro.decidir(observacao)`, que já existe e já é isolada. Não foi ligada a um modelo nesta etapa.
- **Execução contínua.** O modo 24x só roda com um processo aberto: `node cli.js 24x` num computador ligado, ou a página aberta. O ambiente de Artifact não executa nada em segundo plano.
- **Persistência no painel.** O navegador guarda só a semente e o dia, e reproduz o resto. Os checkpoints completos ficam na linha de comando.
- **Aprendizado entre gerações.** `aprendizados()` gera o resumo depois da rodada, e as sementes de avaliação usam um namespace separado (`AVALIACAO:`). Nenhuma política nova foi treinada ainda.
- **Calibração.** As regras sintéticas não foram ajustadas a dados reais.

## Como usar

```bash
node --test zero-world/test.js
node zero-world/cli.js rodada --semente 20261104 --dias 240 --rodadas 5
node zero-world/cli.js criar --checkpoint /tmp/z.json --id ZERO-05 --capital 500 --semente 123
node zero-world/cli.js vida  --checkpoint /tmp/z.json           # 1 dia, com detalhe
node zero-world/cli.js turbo --checkpoint /tmp/z.json --dias 30
node zero-world/cli.js dia   --checkpoint /tmp/z.json --dia 12  # replay
node zero-world/cli.js 24x   --checkpoint /tmp/z.json           # 1 dia por hora real
node zero-world/build-dashboard.js                              # regenera o painel
```

## Etapas

| Etapa | Status |
|---|---|
| 1. Auditoria do Rafael | ✅ feita |
| 2. Motor econômico e financeiro | ✅ feito |
| 3. 1 agente, 30 dias verificáveis | ✅ feito |
| 4. Vida × Turbo | ✅ feito (hash idêntico) |
| 5. 10 mundos independentes | ✅ feito |
| 6. Painel, replay e comparação | ✅ feito |
| 7. Inteligência autônoma de verdade e aprendizado entre gerações | ⏳ não iniciada: só a interface e o resumo de aprendizados existem |
