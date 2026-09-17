# Provider de IA

## Configurar

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-…
ANTHROPIC_MODEL=claude-sonnet-4-5
```

ou

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-…
OPENAI_MODEL=gpt-4o
```

Sem provider (`AI_PROVIDER=none`, o padrao), as tarefas de geracao **falham com
uma mensagem clara** em vez de produzirem texto inventado. Uma publicacao
generica no feed de um cliente e pior do que nenhuma publicacao.

---

## O contexto que o modelo recebe

Cada geracao leva:

**Do cliente** — nome, empresa, setor, descricao, publico-alvo, produtos,
servicos, localizacao, website.

**Da marca** — tom de voz, posicionamento, audiencia, estilo visual, chamadas
para acao preferidas, palavras a privilegiar e **palavras proibidas**.

**Do canal** — regras da plataforma (comprimento, numero de hashtags, tom) e do
formato (post, carrossel, Reel, Story, flyer).

**Do historico** — as 8 publicacoes mais recentes, para nao repetir angulo nem
abertura.

**Do desempenho** — resumo dos ultimos 30 dias.

Com isto, "conteudo generico" deixa de ser um resultado aceitavel — e um bug.

---

## O que gera

| Funcao | O que devolve |
|---|---|
| `generatePosts` | Texto, titulo, hashtags, CTA, briefing visual e — para video — guiao por cenas |
| `generateAdCopy` | Variacoes de texto principal, titulo, descricao e botao |
| `generateIdeas` | Ideias especificas para o cliente |
| `analyzePerformance` | Conclusoes e recomendacoes com impacto estimado |

Tudo em JSON estruturado. Uma resposta que nao seja JSON valido produz um erro
com codigo `AI_INVALID_JSON`, marcado como repetivel.

---

## Registo

Cada geracao fica em `ai_generations`: provider, modelo, prompts, tokens de
entrada e saida, latencia e estado. Visivel em Logs, canal AI.

---

## Limites

A IA pode sugerir, gerar, analisar, otimizar e preparar campanhas. Nao pode:

- gastar dinheiro sem autorizacao;
- aumentar orcamentos alem do limite do cliente (0% por omissao);
- efetuar pagamentos;
- eliminar campanhas;
- alterar configuracoes financeiras.

Ver [billing.md](billing.md).

---

## Acrescentar outro provider

1. Estender `BaseAIProvider` em `src/server/providers/ai/index.ts`.
2. Implementar `complete()`, `isConfigured()`, `missingConfiguration()` e `model()`.
3. Registar no `switch` de `aiProvider()`.

A construcao de prompts e a validacao de JSON sao partilhadas.
