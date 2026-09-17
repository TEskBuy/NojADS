# Scheduler, fila e workers

## Porque sao processos separados

Uma tarefa como "criar 3 Reels por dia" precisa de correr sozinha, todos os
dias, sem ninguem no browser. Isso exige um processo vivo.

Funcoes serverless — Vercel incluida — sao limitadas no tempo por desenho. Sao
otimas para responder a um pedido; sao a ferramenta errada para drenar uma fila.
Por isso:

| Componente | Onde | Porque |
|---|---|---|
| Interface e rotas API | Vercel | Pedidos curtos |
| **Worker** | Railway, Render, Fly, VPS | Vida longa |
| **Scheduler** | Junto ao worker **ou** Vercel Cron | Ambos, se quiser |

O scheduler pode correr nos dois sitios ao mesmo tempo: a reserva de execucao e
idempotente.

---

## Fila

Tabela `jobs` no Postgres. Reclamacao com `FOR UPDATE SKIP LOCKED`, na funcao
`claim_jobs`:

```sql
with ready as (
  select j.id from public.jobs j
   where j.status = 'PENDING' and j.run_after <= now()
     and j.queue = any(p_queues)
   order by j.priority asc, j.run_after asc
   limit p_limit
   for update skip locked        -- outro worker salta estas linhas
)
update public.jobs j
   set status = 'RUNNING', locked_by = p_worker, attempts = attempts + 1
  from ready where j.id = ready.id
returning j.*;
```

Dois workers a reclamar ao mesmo tempo recebem conjuntos disjuntos. Nao ha
duplicacao, nao ha bloqueio.

### Filas

`content`, `publishing`, `analytics`, `ads`, `billing`, `notifications`.

Um worker pode servir todas (por omissao) ou apenas algumas:

```bash
WORKER_QUEUES=publishing npm run worker    # so publicacao
WORKER_QUEUES=content,ads npm run worker   # so conteudo e anuncios
```

Util quando a publicacao nao pode esperar atras de uma geracao de IA lenta.

---

## Idempotencia

Tres camadas, cada uma a apanhar o que a anterior deixa passar:

**1. Reserva de execucao.** `scheduled_jobs.dedupe_key` e unico e vale
`sched_<hash(taskId, scheduledFor)>`. O scheduler a correr duas vezes no mesmo
minuto reserva uma vez.

**2. Enfileiramento.** `jobs.idempotency_key` e unico. Um enfileiramento
repetido devolve o job existente e marca `deduplicated: true`.

**3. Efeito externo.** Cada publicacao e cada transacao tem a sua propria chave
deterministica. Uma publicacao que ja chegou a plataforma nunca e repetida: o
worker verifica primeiro se existe uma tentativa `SUCCEEDED` com identificador
externo.

Verificado contra a base de dados real: a segunda insercao com a mesma chave e
recusada com `unique_violation`.

---

## Retry e backoff

Um erro so e repetido quando esta marcado como `retryable`:

- falhas de rede;
- HTTP 5xx;
- limites de pedidos (429, e os codigos que a Meta marca como transitorios);
- timeouts de trabalho.

Nao sao repetidos: erros de validacao, de autorizacao, de configuracao em falta e
`NotSupportedError`. Repetir esses so gastaria tempo.

```
tentativa 1 → falha → nova tentativa em ~30 s
tentativa 2 → falha → ~60 s
tentativa 3 → falha → ~2 min
tentativa 4 → falha → ~4 min
tentativa 5 → falha → DEAD
```

Com jitter, para nao sincronizar retentativas. Maximo de 1 hora.

Um job `DEAD` **fica visivel** em Logs, com o erro completo. Nada desaparece.

---

## Recuperacao de workers mortos

Se um worker morre a meio de um trabalho, a linha fica `RUNNING` com o lock
preso. `reap_stalled_jobs` — chamada em cada ciclo do scheduler e pelo cron de
manutencao — devolve a `PENDING` tudo o que tenha o lock mais antigo que o
timeout do proprio trabalho.

---

## Timeouts

Cada tipo de tarefa declara o seu, em `src/server/tasks/types.ts`:

| Tipo | Timeout |
|---|---|
| Gerar publicacoes | 10 min |
| Gerar Reels | 15 min |
| Publicar agendado | 15 min |
| Sincronizar metricas | 10 min |
| Otimizar campanhas | 15 min |

O runner impoe o limite em memoria; a base de dados guarda-o para a recuperacao.

---

## Correr localmente

```bash
npm run worker      # terminal 2
npm run scheduler   # terminal 3
```

Configuracao:

```
WORKER_ID=worker-local-1
WORKER_QUEUES=content,publishing,analytics,ads,billing,notifications
WORKER_CONCURRENCY=3
WORKER_POLL_INTERVAL_MS=5000
SCHEDULER_INTERVAL_MS=60000
```

`SIGINT` e `SIGTERM` param o ciclo e deixam terminar o que ja comecou.

---

## Producao

### Railway

Dois servicos a partir do mesmo repositorio:

| Servico | Comando |
|---|---|
| Worker | `npm run worker` |
| Scheduler | `npm run scheduler` |

Copie as variaveis de ambiente para ambos. Se so quiser um servico, corra o
worker e deixe o scheduler ao Vercel Cron.

### Render

Background Worker, comando `npm run worker`.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["npm", "run", "worker"]
```

### Vercel Cron

Ja declarado em `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/scheduler",    "schedule": "*/5 * * * *" },
    { "path": "/api/cron/maintenance",  "schedule": "0 * * * *" }
  ]
}
```

Isto **dispara** o scheduler; nao substitui o worker. Sem worker, os trabalhos
acumulam-se na fila sem serem processados.

Chamadas externas exigem o `CRON_SECRET`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/scheduler
```

---

## Escala

- **1 a 50 clientes**: 1 worker, concorrencia 3.
- **50 a 500**: 2 a 3 workers, um dedicado a `publishing`.
- **500+**: um worker por fila, concorrencia 5 a 10, e um indice adicional em
  `analytics` por cliente e data.

`claim_jobs` funciona com qualquer numero de workers em paralelo: cada um so
apanha linhas que mais ninguem apanhou.

---

## Monitorizar

- **Logs** no NojAds: pendentes, em execucao, sem tentativas, por fila.
- `GET /api/health`: estado da base de dados, filas e o que esta configurado.
- Consulta direta:

```sql
select queue, status, count(*) from public.jobs group by 1, 2 order by 1, 2;
select * from public.jobs where status = 'DEAD' order by updated_at desc limit 20;
```
