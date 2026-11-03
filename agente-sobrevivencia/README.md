# Agente "Sobrevivente Brasil" — Rafael, 30 anos, recomeçando em Minas Gerais

Um personagem-agente que perdeu tudo (casa, emprego, celular, rede de apoio) e recomeça em
**Belo Horizonte, MG** com **R$500,00 em dinheiro vivo — e mais nada**. Só caminhos legais.

## O mundo roda sozinho: 1 hora real = 1 dia do Rafael
- O relógio começa quando você manda começar. A cada hora real, passa 1 dia para ele
  (≈ 2,5 min reais = 1 hora dele). Em 1 dia real, ele vive 24 dias.
- **Mundo otimizado:** quando você fica um tempo sem falar com ele, o Rafael não fica
  parado. Ele vive esses dias tomando as melhores decisões realistas sozinho, e ao voltar
  você recebe o resumo dos dias perdidos. Otimizado não quer dizer sortudo: imprevistos
  continuam acontecendo.
- Você não pode "pular" dias: só esperar ou dar ordens.

## Arquivos
- `.claude/agents/sobrevivente-brasil.md` — o agente para o Claude Code.
- `agente-sobrevivencia/prompt-sistema.md` — o mesmo prompt para colar em outros chats.
- `agente-sobrevivencia/relogio.py` — o relógio do mundo (calcula o dia e a hora atuais).
- `agente-sobrevivencia/estado.json` — a memória do Rafael (saldo, itens, documentos, metas, resumos). É a única coisa que o agente lê.
- `agente-sobrevivencia/diario.md` — o diário completo, só para você ler. O agente só acrescenta linhas no fim, sem reler.

## Economia de tokens
- O agente lê só o `estado.json` (1 linha compacta), nunca o diário inteiro.
- A cada 7 dias, a semana vira 1 linha de resumo no histórico.
- As respostas são curtas por padrão (cerca de 12 linhas); o detalhado sai só quando você pede.
- Dias perdidos: até 7 saem em 1 linha cada; acima de 7, sai um resumo único.

## Como usar
**No Claude Code:** `Use o agente sobrevivente-brasil. Começa o dia 1.`
(Para outra cidade de MG: `Estou em Uberlândia, MG. Começa o dia 1.`)

**Em outros chats:** cole `prompt-sistema.md`. Como lá não existe relógio, ele vai pedir a
hora real de início e a hora atual para fazer a conta.

| Você diz | O que acontece |
|---|---|
| `como tá?` / `e aí, Rafael?` | ele confere o relógio, conta os dias que passaram e narra o dia atual |
| `vai pra Ceasa`, `compra um celular usado`… | você dá a ideia, ele decide e reage |
| `modo plano` | plano de 7 / 30 / 90 dias com metas de renda |
| `detalhe` / `conta mais` | resposta completa com tabela de caixa e inventário (o padrão é curto) |
| `relatório` | renda total, média por dia, o que funcionou e próximo passo |

> Se você ou alguém próximo estiver de fato nessa situação: procure o CRAS ou o Centro POP
> da sua cidade. CVV 188 (apoio emocional, 24h, gratuito) · Disque 100 · SAMU 192.
