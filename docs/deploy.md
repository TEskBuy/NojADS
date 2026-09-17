# Deploy

## O que corre onde

| Componente | Onde | Porque |
|---|---|---|
| Interface e rotas API | Vercel | Pedidos curtos |
| Base de dados, Auth, Storage | Supabase | Gerido |
| **Worker** | Railway, Render, Fly, VPS | Processo de vida longa |
| **Scheduler** | Junto ao worker **ou** Vercel Cron | Reserva idempotente permite ambos |

---

## 1. Supabase

1. Criar um projeto **exclusivo para o NojAds**.
2. Aplicar as migrations por ordem:

```bash
supabase link --project-ref <ref>
supabase db push
```

Ou colar `supabase/migrations/0001` a `0010` no SQL Editor, por ordem.

3. **Authentication → URL Configuration**:
   - Site URL: `https://o-seu-dominio.com`
   - Redirect URLs: `https://o-seu-dominio.com/**`
4. **Storage**: confirmar os 5 buckets criados pela migration `0009`.
5. **Settings → API**: copiar as tres chaves.

---

## 2. Vercel

1. Importar o repositorio. O framework e detetado como Next.js.
2. Definir as variaveis de ambiente **separadamente** para Production e Preview:

```
NEXT_PUBLIC_APP_URL=https://o-seu-dominio.com
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TOKEN_ENCRYPTION_KEY=
CRON_SECRET=
WORKER_SHARED_SECRET=
AI_PROVIDER=
ANTHROPIC_API_KEY=
META_APP_ID=
META_APP_SECRET=
META_API_VERSION=v21.0
META_REDIRECT_URI=https://o-seu-dominio.com/api/oauth/meta/callback
META_SCOPES=…
META_WEBHOOK_VERIFY_TOKEN=
PAYMENT_GATEWAY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
BILLING_DEFAULT_CURRENCY=USD
```

> Nunca use as mesmas chaves em Preview e em Production. Um deploy de teste nao
> deve conseguir publicar na conta real de um cliente.

3. Ligar o dominio.
4. Atualizar os Redirect URIs nas plataformas com o dominio final.

O `vercel.json` ja declara os crons:

```json
{
  "crons": [
    { "path": "/api/cron/scheduler",   "schedule": "*/5 * * * *" },
    { "path": "/api/cron/maintenance", "schedule": "0 * * * *" }
  ]
}
```

---

## 3. Worker

### Railway

1. Novo projeto a partir do repositorio.
2. Servico **Worker**: comando `npm run worker`.
3. Servico **Scheduler**: comando `npm run scheduler` (opcional, se usar o
   Vercel Cron).
4. Copiar as variaveis de ambiente. `NEXT_PUBLIC_*` tambem, porque o worker le
   o URL do Supabase.

### Render

Background Worker, build `npm ci && npm run build`, start `npm run worker`.

### Fly.io

```toml
# fly.toml
app = "nojads-worker"

[processes]
  worker = "npm run worker"
  scheduler = "npm run scheduler"
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "worker"]
```

---

## 4. Verificar

```bash
curl https://o-seu-dominio.com/api/health
```

Deve devolver `status: "ok"` e a lista do que esta configurado. Nao revela
nenhum valor de segredo.

Nas Definicoes do NojAds, confirme que cada integracao aparece com o estado
esperado.

---

## Ambientes

Tres, com **projetos Supabase e aplicacoes de plataforma separados**:

| Ambiente | Supabase | Meta | Gateway |
|---|---|---|---|
| Desenvolvimento | projeto dev | app em modo dev | Stripe test |
| Staging | projeto staging | app em modo dev | Stripe test |
| Producao | projeto prod | app aprovada | Stripe live |

Nunca aponte staging para a base de dados de producao. Uma tarefa ativa em
staging publicaria na conta real do cliente.

---

## Depois do primeiro deploy

- [ ] Criar a primeira conta (fica ADMIN)
- [ ] Criar o primeiro cliente
- [ ] Configurar a marca
- [ ] Ligar as redes sociais
- [ ] Sincronizar contas publicitarias
- [ ] Definir limites de gasto
- [ ] Criar uma tarefa e testar com **Executar agora**
- [ ] Confirmar em Logs que o worker a processou
- [ ] Ativar a tarefa
- [ ] `npm run seed:clean` se tiver usado dados DEMO

---

## Migrations futuras

Numere sequencialmente (`0011_…`) e aplique sempre por ordem. Nunca edite uma
migration ja aplicada em producao — crie a seguinte.
