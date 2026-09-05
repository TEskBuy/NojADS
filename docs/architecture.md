# Arquitetura

## Visao geral

```
                    ┌──────────────────────────────────────┐
   Browser  ───────▶│  Next.js (Vercel)                    │
                    │  paginas · server actions · rotas API│
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  Supabase                            │
                    │  PostgreSQL · Auth · Storage · RLS   │
                    │  jobs · scheduled_jobs               │
                    └───────────────▲──────────────────────┘
                                    │  claim_jobs (SKIP LOCKED)
                    ┌───────────────┴──────────────────────┐
                    │  Worker + Scheduler                  │
                    │  processos de vida longa             │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  Providers                           │
                    │  Social · Ads · AI · Video · Payment │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │  APIs oficiais                       │
                    │  Meta · (TikTok, YouTube, …)         │
                    └──────────────────────────────────────┘
```

---

## Camadas

| Camada | Onde | Responsabilidade |
|---|---|---|
| Paginas | `src/app/(app)/**` | Ler dados e renderizar. Nunca chamam APIs externas. |
| Server actions | `src/server/actions/**` | Validar, autorizar, escrever, enfileirar. |
| Rotas API | `src/app/api/**` | OAuth, webhooks, cron, uploads, health. |
| Servicos | `src/server/services/**` | Regras de negocio: tarefas, campanhas, billing, tokens, storage. |
| Providers | `src/server/providers/**` | A unica camada que fala com o exterior. |
| Repositorios | `src/server/repositories/**` | Leituras compostas. |
| Fila e workers | `src/server/queue`, `src/server/workers` | Execucao assincrona. |
| Registry de capacidades | `src/server/platform/capabilities.ts` | O que cada plataforma permite. |

A regra de dependencia: paginas → servicos → providers. Nunca ao contrario, e
nunca uma pagina a chamar um provider diretamente.

---

## O registry de capacidades

`src/server/platform/capabilities.ts` e a fonte unica de verdade sobre o que
cada plataforma permite. Tem tres estados, e a diferenca entre eles importa:

| Estado | Significado |
|---|---|
| `SUPPORTED` | A API oficial oferece **e** o NojAds implementa |
| `NOT_IMPLEMENTED` | A API oficial oferece, o NojAds **ainda nao** |
| `NOT_SUPPORTED` | A API oficial **nao** oferece |

Consequencias em todo o produto:

- O Ads Manager so lista objetivos e posicionamentos `SUPPORTED`.
- O editor de tarefas recusa formatos que a plataforma nao aceita.
- O ecra de billing mostra, por plataforma, o que se pode e nao se pode fazer.
- Um `NOT_IMPLEMENTED` aparece com a razao a vista, em vez de desaparecer em
  silencio.

Quando uma plataforma muda a API, este ficheiro e o que se atualiza — nao os
ecras.

---

## Providers

Seis interfaces em `src/server/providers/types.ts`:

`SocialProvider`, `AdsProvider`, `AIProvider`, `VideoProvider`,
`PaymentProvider`, `BillingProvider`.

Cada plataforma tem uma implementacao. As que ainda nao foram construidas tem um
*scaffold* cujos metodos lancam `NotImplementedError` — nunca devolvem um
sucesso fabricado. Um stub que devolvesse `{ ok: true }` permitiria a interface
afirmar que uma publicacao saiu quando nada saiu do edificio.

Adicionar uma plataforma nova:
1. Acrescentar a entrada em `capabilities.ts`.
2. Implementar `SocialProvider` e/ou `AdsProvider`.
3. Registar em `providers/social/index.ts` e `providers/ads/index.ts`.

Nada mais muda: nem o Task Engine, nem os workers, nem a interface.

---

## Fluxo de execucao de uma tarefa

```
1. Scheduler encontra tarefas ACTIVE com next_run_at <= agora
2. Verifica a data de fim
3. Reserva a execucao em scheduled_jobs (unique em dedupe_key)
   └─ se ja estava reservada, avanca o relogio e sai
4. Cria um task_run com estado QUEUED
5. Enfileira um job (unique em idempotency_key)
6. Calcula e grava a proxima execucao
7. Worker reclama o job com claim_jobs (FOR UPDATE SKIP LOCKED)
8. Handler executa sob timeout
9. Provider fala com a API oficial
10. Resultado gravado no job e no task_run
11. Contadores da tarefa atualizados
12. Logs e notificacoes escritos
```

O passo 3 e a razao por que o scheduler pode correr duas vezes no mesmo minuto
— de dois sitios diferentes — sem duplicar trabalho.

---

## Fluxo de publicacao de conteudo

```
Tarefa → IA → conteudo em base de dados
                    │
       ┌────────────┴────────────┐
   modo AUTOMATICO          modo APROVACAO
       │                         │
   SCHEDULED               PENDING_APPROVAL
       │                         │
       │                    pessoa aprova
       │                         │
       └────────────┬────────────┘
                    ▼
        publishing worker (hora chegou)
                    ▼
        publishing_jobs (chave de idempotencia)
                    ▼
        provider → API oficial
                    ▼
        identificador real devolvido?
           ├─ sim → PUBLISHED + external_id + URL
           └─ nao → FAILED + erro humanizado + notificacao
```

`PUBLISHED` nunca e escrito sem confirmacao da plataforma.

---

## Fluxo de publicidade

```
Ads Manager → Criar anuncio
   ↓ (guardar)
Campanha em rascunho, apenas no NojAds. Nada foi enviado.
   ↓ (aprovar, quando exigido)
   ↓ (publicar)
Validar campos → validar limites de gasto → validar se a conta pode gastar
   ↓
Criar Campaign → gravar id → Ad Set → gravar id → Creative → gravar id → Ad
   ↓
Tudo EM PAUSA. Nada gasta.
   ↓ (ativar — accao humana explicita)
Campanha ativa. A plataforma comeca a cobrar.
```

Gravar cada identificador imediatamente e o que torna a operacao retomavel: se o
passo 3 falhar, os passos 1 e 2 nao sao refeitos e nao ficam objetos orfaos na
plataforma.

---

## Fluxo financeiro

```
Campanha com orcamento
   ↓
Verificar limites do cliente (transacao, campanha, diario, mensal)
   ↓
Calcular desdobramento: gasto publicitario + taxa NojAds + taxa gateway
   ↓
Mostrar tudo separado. Exigir a palavra CONFIRMAR.
   ↓
Criar transacao PENDING com chave de idempotencia deterministica
   ↓
Gateway cobra
   ↓
Webhook confirma → SUCCEEDED → fatura gerada
```

A restricao `total_amount = ad_spend_amount + nojads_fee + gateway_fee` esta na
base de dados. Um erro de calculo falha no insert, nao passa despercebido.

---

## Modelo de dados

36 tabelas. As principais:

**Nucleo** — `profiles`, `clients`, `client_members`, `brand_settings`
**Ligacoes** — `oauth_states`, `social_accounts`, `social_tokens`, `ad_accounts`
**Execucao** — `tasks`, `scheduled_jobs`, `jobs`, `task_runs`
**Conteudo** — `content`, `content_assets`, `content_versions`, `publishing_jobs`, `approvals`
**Publicidade** — `ad_campaigns`, `ad_sets`, `creatives`, `ads`, `audiences`, `analytics`
**Financeiro** — `billing_accounts`, `payment_customers`, `payment_methods`, `payment_transactions`, `invoices`, `refunds`, `billing_events`, `spend_limits`
**Operacao** — `notifications`, `activity_logs`, `ai_generations`, `webhook_events`, `reports`, `integration_settings`, `app_settings`

---

## Row Level Security

Tres niveis:

| Nivel | Leitura | Escrita |
|---|---|---|
| A | acesso ao cliente | escrita no cliente |
| B | acesso ao cliente | apenas service role (escrito por workers) |
| C | staff **e** acesso ao cliente | apenas service role (dinheiro) |

`social_tokens` e `oauth_states` nao tem **nenhuma** politica, e o `EXECUTE` foi
revogado para `anon` e `authenticated`. Nada que segure um JWT de utilizador
chega a um token, em nenhum papel.

`has_client_access()` e `can_write_client()` sao `SECURITY DEFINER` e sao usadas
tanto pelas politicas como pelo codigo de autorizacao. As duas linhas de defesa
sao independentes: um erro na aplicacao nao abre a base de dados.

---

## Decisoes e porque

**Fila em Postgres, nao Redis.** `FOR UPDATE SKIP LOCKED` da reclamacao exata
entre varios workers, sobrevive a reinicios e mantem o sistema numa so
dependencia. Uma agencia com centenas de clientes nao chega perto do limite
disto.

**Workers fora da Vercel.** Funcoes serverless tem limite de tempo por desenho.
Um worker de fila e o contrario disso.

**Fuso horario por tarefa, nao por servidor.** "Todos os dias as 09:00" tem de
significar 09:00 onde o cliente esta, mesmo com o worker noutro continente e
mesmo em mudancas de hora.

**Campanhas nascem em pausa.** Publicar cria a estrutura; ativar gasta dinheiro.
Sao duas decisoes distintas e a interface trata-as como tal.

**Erros com operacao, etapa, motivo, codigo e solucao.** "Erro." nao diz a
ninguem o que fazer a seguir. Ver `src/lib/errors.ts`.

**Modelos de dominio escritos a mao.** Os repositorios sao a unica camada que
converte linhas do Postgres nos tipos do dominio, o que mantem o resto da
aplicacao sem `any`.
