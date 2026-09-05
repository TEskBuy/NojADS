# Seguranca

## Duas linhas de defesa independentes

**Na aplicacao.** Toda a server action e toda a rota de API chamam
`requireSession`, `requireRole` ou `requireClientAccess` antes de tocar em
dados. A interface nunca decide sozinha o que um utilizador pode fazer.

**Na base de dados.** Row Level Security em todas as tabelas. Se a aplicacao
tiver um erro, o Postgres continua a recusar.

As duas sao independentes. Nao ha um unico ponto de falha.

---

## Papeis

| Papel | Alcance |
|---|---|
| `ADMIN` | Tudo. Gere clientes, utilizadores e definicoes. |
| `MANAGER` | Apenas os clientes onde e membro. Escrita se `can_write`. |
| `CLIENT` | Leitura dos seus proprios dados. |

A primeira conta criada numa instalacao torna-se ADMIN. As seguintes ficam
CLIENT.

Um utilizador **nao pode alterar o proprio papel**: um trigger na base de dados
recusa, mesmo que a aplicacao deixasse passar.

---

## Row Level Security

Tres niveis:

| Nivel | Tabelas | Leitura | Escrita |
|---|---|---|---|
| A | clientes, marca, contas, tarefas, conteudo, criativos, campanhas, aprovacoes | acesso ao cliente | escrita no cliente |
| B | execucoes, publicacoes, analytics, logs, relatorios, notificacoes | acesso ao cliente | so service role |
| C | contas de faturacao, metodos, transacoes, faturas, reembolsos, limites | staff **e** acesso ao cliente | so service role |

### Sem qualquer politica

`social_tokens` e `oauth_states` tem RLS ativo e **nenhuma politica**, alem de
terem o acesso revogado para `anon` e `authenticated`. Nada que segure um JWT de
utilizador chega a um token, em nenhum papel. Apenas a service key, usada no
servidor e nos workers.

---

## Tokens de redes sociais

- **Nunca** e pedida a palavra-passe de uma rede social.
- Os tokens sao cifrados com **AES-256-GCM** antes de tocarem numa linha.
- Formato: `v{versao}.{iv}.{tag}.{criptograma}`, tudo em base64url.
- IV aleatorio por operacao: o mesmo token nunca produz o mesmo criptograma.
- A tag de autenticacao deteta adulteracao — um criptograma alterado falha em
  vez de devolver lixo.
- O token do Page (Meta), que e o que publica, e cifrado a parte.
- Nenhum token e escrito em log; quando e preciso identifica-lo, usa-se uma
  impressao digital SHA-256 de 12 caracteres.

Gerar a chave:

```bash
openssl rand -base64 32
```

**Se a `TOKEN_ENCRYPTION_KEY` mudar, todos os tokens guardados ficam ilegiveis e
as contas tem de ser reconectadas.** Guarde-a com o cuidado de um segredo de
producao.

---

## Segredos

| Segredo | Onde | Nunca |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | servidor e workers | no frontend, nem com prefixo `NEXT_PUBLIC_` |
| `TOKEN_ENCRYPTION_KEY` | servidor e workers | em commits |
| `META_APP_SECRET` | servidor | no browser |
| `STRIPE_SECRET_KEY` | servidor | no browser |
| `CRON_SECRET` | servidor | em URLs |

`serverEnv()` lanca se for chamado no browser. `src/lib/supabase/admin.ts` tem
`import 'server-only'`, o que faz o build falhar se alguem o importar de um
componente cliente.

O logger redige recursivamente qualquer chave cujo nome contenha `token`,
`secret`, `password`, `api_key`, `authorization` ou `signature`.

---

## Webhooks

| Origem | Verificacao |
|---|---|
| Meta | HMAC SHA-256 do corpo com o App Secret, em `X-Hub-Signature-256` |
| Stripe | HMAC SHA-256 de `timestamp.corpo`, com rejeicao acima de 5 minutos |

Ambos comparam em tempo constante (`timingSafeEqual`).

Um webhook com assinatura invalida e **guardado como invalido e nao
processado** — fica o registo de auditoria sem o efeito.

A duplicacao e impossivel por construcao: unique em `(origem, id do evento)`,
mais a verificacao de estado terminal no worker de billing.

---

## Rotas

O middleware protege tudo exceto `/login`, `/registar`, `/recuperar-senha`,
`/nova-senha` e as rotas publicas de API (`/api/oauth/*`, `/api/webhooks/*`,
`/api/cron/*`, `/api/health`).

`/api/cron/*` exige o cabecalho do Vercel Cron ou
`Authorization: Bearer <CRON_SECRET>`.

---

## Cabecalhos

Aplicados a todas as respostas em `next.config.mjs`:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## Validacao

Todas as entradas passam por esquemas Zod em
`src/server/validators/schemas.ts`, **no servidor**. A interface tambem valida,
para dar melhor experiencia, mas nao e ela que decide.

---

## Storage

Os objetos vivem sempre em `clients/{clientId}/{area}/{ficheiro}`. As politicas
de `storage.objects` extraem o id do cliente do segundo segmento e aplicam as
mesmas regras de acesso do resto do sistema. Um caminho fora deste formato nao
corresponde a nenhuma politica e o acesso e recusado.

Ficheiros privados sao servidos por URLs assinados temporarios, gerados apenas
no momento da publicacao.

---

## Dados de pagamento

Nunca sao recebidos nem guardados numeros de cartao ou CVV. Nao existe coluna
para isso e nao ha caminho no codigo que os aceite. Guardam-se apenas o token do
gateway, a marca, os ultimos 4 digitos e a validade.

---

## Avisos de seguranca conhecidos

O linter do Supabase reporta:

- `pg_trgm` instalada no schema `public` — usada pelo indice de pesquisa de
  clientes. Nao e uma vulnerabilidade; mover a extensao implicaria recriar o
  indice GIN.
- `social_tokens` e `oauth_states` com RLS sem politicas — **e intencional** e
  esta descrito acima.

---

## Lista de verificacao antes de producao

- [ ] `TOKEN_ENCRYPTION_KEY` gerada e guardada em local seguro
- [ ] `CRON_SECRET` gerado
- [ ] `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor e nos workers
- [ ] Redirect URIs de OAuth a apontar para o dominio de producao
- [ ] Webhooks configurados com os segredos corretos
- [ ] Limites de gasto definidos em cada cliente
- [ ] Pagamentos automaticos bloqueados salvo decisao explicita
- [ ] Dados DEMO removidos (`npm run seed:clean`)
- [ ] Primeira conta ADMIN criada e as restantes com o papel certo
- [ ] `GET /api/health` a devolver `status: ok`
