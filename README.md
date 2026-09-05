# NojAds

Plataforma de gestao, criacao, automacao, publicacao, publicidade, analytics e
pagamentos para redes sociais.

A ideia central: **configurar uma vez e deixar o sistema trabalhar**. O
administrador cria o cliente, define a marca, liga as contas, cria tarefas
recorrentes e ativa. A partir daí o NojAds executa continuamente ate ser pausado,
alterado ou removido.

O outro principio, igualmente central: **o NojAds nunca simula uma operacao
real**. Quando uma plataforma nao permite algo pela API oficial, a interface diz
isso em vez de esconder ou fingir. Quando um conector ainda nao foi construido,
diz isso tambem — e nada e enviado nem cobrado.

---

## O que existe hoje

| Area | Estado |
|---|---|
| Autenticacao, papeis e RLS | Implementado e testado |
| Clientes, marca, limites de gasto | Implementado |
| Task Engine, scheduler, fila e workers | Implementado e testado |
| Meta (Facebook + Instagram): OAuth, publicacao, insights | Implementado |
| Meta Marketing API: campanhas, conjuntos, criativos, anuncios, metricas | Implementado |
| Meta billing (leitura de saldo e estado da conta) | Implementado |
| IA (Anthropic ou OpenAI) para conteudo, copy e analise | Implementado |
| Ads Manager com criacao manual, preview e limites reais | Implementado |
| Billing, transacoes, faturas, idempotencia, limites | Implementado |
| Gateway de pagamento (Stripe) | Implementado, por configurar |
| TikTok, YouTube, LinkedIn, X, Google Ads | Estrutura pronta, conector **nao** implementado |
| Renderizacao de video | Interface pronta, provider **nao** ligado |

O detalhe completo — o que funciona e o que exige configuracao manual sua — esta
em **[docs/STATUS.md](docs/STATUS.md)**. Leia esse ficheiro antes de qualquer
outra coisa.

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** estrito
- **Supabase**: PostgreSQL, Auth, Storage, Row Level Security
- **Fila em Postgres** com `FOR UPDATE SKIP LOCKED` — sem Redis, sem broker externo
- **Worker e scheduler persistentes** em Node (nao em funcoes serverless)
- **Tailwind CSS** + **lucide-react**
- **Vitest** para testes
- **Vercel** para o frontend e as rotas de API

---

## Instalacao local

### 1. Dependencias

```bash
npm install
```

Requer Node.js 20 ou superior.

### 2. Variaveis de ambiente

```bash
cp .env.example .env.local
```

Preencha, no minimo:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TOKEN_ENCRYPTION_KEY=
CRON_SECRET=
```

Gere as duas chaves locais:

```bash
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY (tem de ter exatamente 32 bytes)
openssl rand -hex 32      # CRON_SECRET
```

> A `SUPABASE_SERVICE_ROLE_KEY` ignora o RLS. Nunca lhe ponha o prefixo
> `NEXT_PUBLIC_` e nunca a coloque no frontend.

### 3. Base de dados

Crie um projeto Supabase **exclusivo para o NojAds** e aplique as migrations por
ordem, no SQL Editor do painel ou com o CLI:

```bash
supabase link --project-ref <ref-do-projeto>
supabase db push
```

Os ficheiros estao em `supabase/migrations/`, de `0001` a `0010`. Aplicados por
ordem, criam:

- 36 tabelas com indices, chaves estrangeiras e restricoes;
- politicas RLS em todas elas;
- 5 buckets de Storage com politicas por cliente;
- as funcoes `claim_jobs`, `reap_stalled_jobs` e os helpers de autorizacao.

### 4. Auth

No painel Supabase, em **Authentication > URL Configuration**:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`

Em **Authentication > Providers**, mantenha o Email ativo.

### 5. Storage

Os buckets sao criados pela migration `0009_storage.sql`. Confirme em
**Storage** que existem: `client-logos`, `client-content`, `client-videos`,
`client-ads` e `invoices`.

### 6. OAuth das plataformas

Cada plataforma exige uma aplicacao criada por si no portal de programador
respetivo. O passo a passo completo esta em
**[docs/oauth.md](docs/oauth.md)**. Sem isso, o NojAds funciona mas mostra as
integracoes como *nao configuradas* — nunca como prontas.

### 7. Iniciar

Tres processos, em terminais separados:

```bash
npm run dev         # aplicacao web  → http://localhost:3000
npm run worker      # processa a fila
npm run scheduler   # dispara tarefas agendadas
```

O worker e o scheduler sao processos de vida longa. A aplicacao web funciona sem
eles, mas nenhuma tarefa agendada executa.

### 8. Primeira conta

Abra `http://localhost:3000/registar`. **A primeira conta criada nesta
instalacao recebe automaticamente o papel ADMIN.** As seguintes ficam como
CLIENT ate um administrador as alterar.

### 9. Dados DEMO (opcional)

```bash
npm run seed:demo    # cria um cliente ficticio, marcado DEMO em toda a interface
npm run seed:clean   # remove-o por completo
```

Nada criado pelo seed e apresentado como real: as contas nao estao ligadas, a
campanha nao existe em nenhuma plataforma e nenhum pagamento foi feito.

---

## Verificar

```bash
npm run typecheck   # TypeScript estrito, sem erros
npm run test        # 78 testes
npm run build       # build de producao
npm run check       # os tres de seguida
```

---

## Fluxo do administrador

1. Criar cliente
2. Configurar a marca (tom de voz, cores, palavras proibidas, CTAs)
3. Ligar redes sociais (OAuth oficial)
4. Sincronizar contas publicitarias
5. Definir limites de gasto
6. Criar tarefas
7. Definir frequencia e fuso horario
8. Escolher modo automatico ou aprovacao
9. Ativar
10. Acompanhar pelo dashboard

---

## O que corre onde

| Componente | Onde corre | Porque |
|---|---|---|
| Interface e rotas de API | Vercel | Pedidos curtos |
| Base de dados, Auth, Storage | Supabase | Gerido |
| **Worker** | Railway, Render, Fly, VPS | Processo de vida longa; funcoes serverless tem limite de tempo |
| **Scheduler** | O mesmo sitio que o worker, **ou** Vercel Cron | A reserva de execucao e idempotente, os dois podem coexistir |

Detalhes em **[docs/workers.md](docs/workers.md)** e
**[docs/deploy.md](docs/deploy.md)**.

---

## Documentacao

| Ficheiro | Conteudo |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | **O que funciona vs o que exige configuracao manual** |
| [docs/architecture.md](docs/architecture.md) | Arquitetura, fluxos, decisoes |
| [docs/oauth.md](docs/oauth.md) | Configuracao de cada plataforma, passo a passo |
| [docs/ads.md](docs/ads.md) | Ads Manager e limites reais das APIs |
| [docs/billing.md](docs/billing.md) | Billing, pagamentos e seguranca financeira |
| [docs/workers.md](docs/workers.md) | Scheduler, fila, workers, retry, idempotencia |
| [docs/deploy.md](docs/deploy.md) | Producao: Vercel, Supabase, worker |
| [docs/ai.md](docs/ai.md) | Provider de IA e contexto de marca |
| [docs/video.md](docs/video.md) | Video Studio e como ligar um render |
| [docs/security.md](docs/security.md) | RLS, tokens, segredos, webhooks |

---

## Estrutura

```
nojads/
├── supabase/migrations/     10 migrations, aplicaveis por ordem
├── src/
│   ├── app/
│   │   ├── (auth)/          login, registo, recuperacao
│   │   ├── (app)/           dashboard e todos os modulos
│   │   └── api/             oauth, cron, webhooks, uploads, health
│   ├── components/
│   │   ├── ui/              primitivos
│   │   ├── layout/          sidebar, topbar
│   │   ├── forms/           formularios com server actions
│   │   └── charts/          graficos
│   ├── lib/                 env, erros, crypto, logger, supabase
│   ├── server/
│   │   ├── auth/            sessao e autorizacao
│   │   ├── platform/        registry de capacidades das plataformas
│   │   ├── providers/       Social, Ads, AI, Video, Payment, Billing
│   │   ├── services/        tokens, storage, tarefas, campanhas, billing
│   │   ├── tasks/           tipos e calculo de agendamento
│   │   ├── queue/           fila em Postgres
│   │   ├── scheduler/       scheduler + processo autonomo
│   │   ├── workers/         6 workers + runner + processo autonomo
│   │   ├── actions/         server actions
│   │   ├── repositories/    leituras
│   │   ├── oauth/           fluxo OAuth
│   │   └── validators/      esquemas Zod
│   ├── types/               modelos de dominio
│   └── middleware.ts        protecao de rotas
├── scripts/seed-demo.ts
├── tests/
└── docs/
```

---

## Licenca

Projeto privado. Todos os direitos reservados.
