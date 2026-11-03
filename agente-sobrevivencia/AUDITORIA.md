# Auditoria — EXPERIMENTO-001 (Rafael)

**Classificação: experimento NARRATIVO e exploratório.**

Não houve motor de simulação, gerador aleatório, nem separação entre quem decide e quem calcula o resultado. O mesmo autor (o assistente) escreveu as decisões e os resultados, na mesma hora. Por isso nada aqui é prova de autonomia econômica. Fica preservado como referência histórica.

Auditoria feita em 03/11/2026 a partir do histórico do git, dos arquivos do repositório e dos scripts que geraram os números (copiados para `evidencias/`).

## 1. O que foi processado individualmente

| Dia | Como foi feito | Commit |
|---|---|---|
| Exp. 1, D1 (00:00) | Narrado no momento em que o relógio começou. Plano feito antes de existir qualquer resultado. | `30a580c` (05:33 UTC) |
| Exp. 1, D11 (03:54 e 05:11) | Dois retratos do dia, com intenção ("cobrar o Geraldo"). O resultado foi escrito depois, pelo mesmo autor. | `4425c04`, `764d60a` |

Nenhum outro dia foi processado individualmente.

## 2. Períodos acelerados ou resumidos

| Período | Forma | Como foi produzido |
|---|---|---|
| Exp. 1, D2–D10 | 1 linha por dia | Escrito de uma vez, num único turno (`4425c04`, 05:43). O relógio foi adiantado 10 horas na mão (campo `inicio_real` editado). |
| Exp. 1, D11–D120 | Linhas **semanais** | Lista de eventos com entrada e saída digitada à mão em `evidencias/exp1-fase1-sim.py`. O script só soma. |
| Exp. 1, D121–D240 | Linhas **mensais** | Código inline num comando, não salvo. Os valores estão em `experimento-1-bicos/estado.json`. |
| Exp. 2, D1–D120 | Linhas **semanais** | Código inline, não salvo. A saída está em `evidencias/exp2-fase1-out.json`. |
| Exp. 2, D121–D240 | Linhas **mensais** | Código inline, não salvo. Os valores estão em `estado.json`. |

## 3. Transações verificáveis

**Não existe livro-caixa.** Só há somas por semana ou mês, cada uma com uma lista de eventos e valores escolhidos pelo autor.

- **A aritmética fecha.** Exp. 1: 500 + 23.867 − 11.957 = 12.410. Exp. 2: 500 + 36.860 − 16.146 = 21.214.
- **Não há registro por transação:** nenhum ID, nenhum saldo antes e depois.
- **Valores ajustados depois de ver o resultado.** No Exp. 1, a semana 3 deu saldo de −R$306 na primeira versão do script. O autor reescreveu o evento ("negociou o resto do aluguel pro dia do vale") para o saldo não ficar negativo. Isso é construção retrospectiva.
- **Exp. 2:** a renda total (R$13.300) inclui R$1.200 de Bolsa Família, contado como entrada. O rótulo indica isso.

## 4. Decisões tomadas antes de conhecer os resultados

Nenhuma, no sentido estrito. Só os planos do D1 e do D11 foram escritos antes dos resultados, e esses resultados também foram decididos pelo autor depois, sem nenhum gerador independente.

## 5. Acontecimentos construídos depois

Todos os eventos do D2 ao D240, nos dois experimentos. Exemplos:
- contratação no atacadista;
- calote do Geraldo;
- vendas do Carnaval;
- clientes da barbearia, da academia e da pizzaria;
- golpe da tarefa;
- cancelamento da oficina;
- views dos cortes;
- vendas do kit digital.

Os campos `dias_testados`, `evidencia` e `veredito` das oportunidades também foram escritos pelo autor e não medidos. O campo `inicio_real` do Exp. 2 (`2026-11-03T06:20:00`) foi digitado à mão: o relógio nunca rodou nesse experimento.

## 6. Dados reais × estimativas

**Pesquisados na web em 03/11/2026.** São trechos de busca e não foram verificados na fonte primária:
- salário mínimo de 2026 (R$1.621);
- Bolsa Família (R$600 mínimo, limite de R$218 por pessoa);
- DAS MEI de 2026 (~R$81–87) e teto do MEI (R$81 mil);
- Restaurante Popular de BH (R$3, gratuito para população de rua; data da fonte incerta);
- Bolsa Moradia BH (R$800);
- Estamos Juntos (bolsa de R$540, data incerta);
- PMQER e cursos do Senac;
- credenciamento de ambulantes no Carnaval;
- Wi-Fi BH e telecentros;
- faixas de social media, tráfego pago, UGC e clipping (blogs com interesse comercial);
- eletricista e NR-10 (escola privada);
- comissões de afiliado (divergentes).

**Estimados ou inventados pelo autor, sem fonte:**
- diária na Ceasa;
- salário do atacadista (R$1.750);
- pensão e quarto (R$190/semana, R$650/mês);
- regras de horário do albergue;
- gratuidade do RG na UAI;
- preço do celular usado;
- probabilidade e tempo de cada contratação;
- toda a demanda de clientes e as taxas de aceite e de cancelamento;
- views;
- vendas no Carnaval;
- vendas do kit;
- prazo do 1º pagamento do Bolsa Família.

**Não verificado:** se "gestão de redes sociais" é uma atividade permitida para MEI. O texto dizia que o Rafael "conferiu a lista oficial", mas isso não foi feito.

**Fatos citados de memória, sem busca:** Shopping Oiapoque, Feira Hippie, ASMARE, CeasaMinas em Contagem, UAI.

## 7. Histórico diário completo

**Não existe.**

| Dias | Exp. 1 | Exp. 2 |
|---|---|---|
| D1 | registro do momento + linha retroativa | HISTÓRICO NÃO DISPONÍVEL (só o resumo semanal) |
| D2–D10 | 1 linha retroativa por dia | HISTÓRICO NÃO DISPONÍVEL |
| D11 | 2 retratos do dia + linha retroativa | HISTÓRICO NÃO DISPONÍVEL |
| D12–D240 | HISTÓRICO NÃO DISPONÍVEL (só resumos semanais e mensais) | HISTÓRICO NÃO DISPONÍVEL |

## Conclusão

O Rafael é o **EXPERIMENTO-001**: um roteiro plausível montado com alguns dados reais. Serve para gerar hipóteses, por exemplo "o Perfil no Google para comércio local parece um bom primeiro serviço", mas não serve como evidência. Os testes de verdade estão no motor `zero-world/`.
