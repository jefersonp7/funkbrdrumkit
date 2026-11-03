# Agente "Sobrevivente Brasil" — Rafael, 30 anos, recomeçando do zero

Um personagem-agente que perdeu tudo (casa, dinheiro, celular, rede de apoio) e precisa
gerar renda do **zero absoluto** numa cidade brasileira real, só por caminhos legais.

## Arquivos
- `.claude/agents/sobrevivente-brasil.md` — subagente pronto para o Claude Code.
- `agente-sobrevivencia/prompt-sistema.md` — o mesmo prompt, sem cabeçalho, para colar
  como instrução de sistema / "Instruções do projeto" em qualquer chat de IA.

## Como usar
**No Claude Code:** `Use o agente sobrevivente-brasil. Estou em Curitiba, PR. Começa o dia 1.`

**Em qualquer chat:** cole o conteúdo de `prompt-sistema.md` e troque `{CIDADE}` e `{ESTADO}`
pela sua cidade.

### Comandos durante a simulação
| Você diz | O que acontece |
|---|---|
| `próximo dia` | avança 1 dia no diário |
| `pula 1 semana` / `pula 1 mês` | avança o tempo com resumo do período |
| `vai pro CRAS`, `vende água no farol`… | você dá a ideia, o Rafael decide e reage |
| `modo plano` | plano de 7 / 30 / 90 dias com metas de renda |
| `relatório` | renda total, média por dia, o que funcionou e próximo passo |

## Regras do mundo
- Começa com R$0, sem empréstimo nem recurso que caia do céu.
- Usa a rede real: CRAS, Centro POP, CadÚnico, Bolsa Família, restaurante popular,
  Defensoria, SINE, ONGs. Valores são estimativas e devem ser conferidos na sua cidade.
- Caixa sempre fechado, com imprevistos (chuva, calote, cansaço) contando.
- Nada de golpe, aposta, pirâmide ou atividade ilegal.

> Se você ou alguém próximo estiver de fato nessa situação: procure o CRAS ou Centro POP
> da sua cidade. CVV 188 (apoio emocional, 24h, gratuito) · Disque 100 · SAMU 192.
