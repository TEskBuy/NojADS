# Estado real do NojAds

Este ficheiro separa, sem ambiguidade, **o que ja funciona** de **o que depende
de configuracao ou aprovacao externa**. E o documento a ler primeiro.

Regra que atravessa todo o produto: quando algo nao esta disponivel, o NojAds
diz-o na interface, com o motivo e o passo seguinte. Nunca devolve um sucesso
falso.

---

## FUNCIONANDO

Implementado, com codigo real, e verificado por testes ou contra a base de dados.

### Base e seguranca
- 36 tabelas com indices, chaves estrangeiras, restricoes e timestamps.
- Row Level Security em todas as tabelas, em tres niveis de acesso.
- `social_tokens` e `oauth_states` sem qualquer politica: nenhum JWT de
  utilizador chega a um token, em nenhum papel.
- Cofre de tokens AES-256-GCM, com versao de chave e deteccao de adulteracao.
- Trigger que impede um utilizador de alterar o proprio papel.
- Autenticacao completa: registo, login, logout, recuperacao e alteracao de senha.
- Papeis ADMIN, MANAGER e CLIENT, verificados no servidor em cada operacao.
- Middleware de protecao de rotas + verificacao independente em cada server action.
- Cabecalhos de seguranca (HSTS, X-Frame-Options, nosniff, Referrer-Policy).
- Segredos redigidos antes de qualquer escrita em log.

### Clientes e marca
- CRUD completo, pesquisa, filtros, arquivo.
- Perfil de marca: cores, tom de voz, palavras proibidas, CTAs, posicionamento.
- Cada cliente nasce com perfil de marca e limites de gasto (com pagamentos
  automaticos bloqueados por omissao).

### Task Engine
- 10 tipos de tarefa, cada um com fila, pre-requisitos e timeout proprios.
- Frequencias: diaria, semanal, mensal, horaria, por intervalo, cron e unica.
- Calculo de proxima execucao com fuso horario por tarefa, correto em mudancas
  de hora — **15 testes**, incluindo a transicao para hora de verao em Lisboa.
- Pausar, retomar, editar, executar agora, remover.
- Remover cancela execucoes futuras e **preserva** historico, conteudos e logs.
- Pre-visualizacao das proximas 5 execucoes, calculada pela mesma funcao que o
  scheduler usa.
- Uma tarefa que falha 5 vezes seguidas e parada e o administrador e notificado.

### Scheduler, fila e workers
- Fila duravel em Postgres com `FOR UPDATE SKIP LOCKED` — **verificado contra a
  base de dados real**.
- Reserva de execucao idempotente: o scheduler pode correr duas vezes no mesmo
  minuto sem duplicar nada — **verificado**.
- Retry com backoff exponencial e jitter; um trabalho sem tentativas fica DEAD e
  visivel, nunca desaparece.
- Recuperacao de trabalhos cujo worker morreu a meio.
- 6 workers: conteudo, publicacao, analytics, ads, billing, notificacoes.
- Processos autonomos de worker e scheduler, com encerramento controlado.
- Vercel Cron como alternativa para disparar o scheduler.

### Meta (Facebook e Instagram)
- OAuth oficial completo, com troca por token de longa duracao.
- Descoberta de Paginas e de contas Instagram Business.
- Facebook: publicacao de texto, imagem, varias imagens e video; agendamento
  nativo; eliminacao; insights de Pagina e de publicacao.
- Instagram: fluxo de contentor em dois passos para post, carrossel, Reel e
  Story, com espera pelo processamento da media; insights de conta e publicacao.
- Marketing API: criacao de campanha, conjunto, criativo e anuncio; pausar;
  retomar; alterar orcamento; eliminar; ler metricas por dia.
- Leitura de faturacao: saldo, moeda, fonte de financiamento e se a conta pode
  gastar.
- Cliente HTTP com `appsecret_proof`, retry nos codigos que a Meta marca como
  transitorios, e traducao de cada erro para portugues com solucao.

### Conteudo e publicacao
- Estados completos, incluindo aprovacao pendente.
- Historico de versoes a cada edicao.
- Publicacao com chave de idempotencia: um retry nunca publica duas vezes.
- `PUBLICADO` so e escrito depois de a plataforma devolver um identificador real.
- Aprovar, rejeitar, publicar agora, cancelar.
- Calendario mensal com conteudo, tarefas e campanhas.

### Ads Manager
- Criacao manual de anuncio dentro do NojAds, num so ecra.
- Objetivos, posicionamentos, formatos, CTAs, metas de otimizacao e eventos de
  cobranca vindos do registry de capacidades — **nada inventado**.
- Preview do anuncio.
- Publicacao encadeada com retoma: se falhar no passo 3, os passos 1 e 2 mantem
  os identificadores reais e um novo pedido continua em vez de duplicar.
- **Campanhas sao sempre criadas EM PAUSA.** Nada gasta sem a accao Ativar.
- Sincronizacao do estado da plataforma para o NojAds.

### Billing
- Gasto publicitario, taxa NojAds e taxa do gateway em colunas separadas, com
  uma restricao na base de dados a garantir que o total e a soma — **verificado
  contra a base de dados real**.
- Chave de idempotencia deterministica em cada transacao — **verificado**.
- Limites por transacao, por campanha, diario e mensal, verificados antes de
  qualquer cobranca.
- Confirmacao humana obrigatoria: e preciso escrever a palavra CONFIRMAR.
- A automacao nao aumenta orcamentos alem do limite do cliente (0% por omissao).
- Faturas geradas automaticamente com o desdobramento completo.
- Nenhum dado de cartao e guardado. Apenas o token do gateway e os ultimos 4
  digitos.
- Webhooks com verificacao de assinatura e protecao contra reenvio.

### IA
- Anthropic e OpenAI, atras da mesma interface.
- Contexto completo: cliente, marca, publico, produtos, plataforma, formato,
  publicacoes recentes e metricas dos ultimos 30 dias.
- Geracao de publicacoes, guioes de video, copy de anuncio, ideias e analise.
- Cada geracao registada com modelo, tokens e latencia.
- **Sem provider configurado, a tarefa falha com uma mensagem clara em vez de
  produzir texto inventado.**

### Analytics e relatorios
- Uma linha por entidade e por dia; re-sincronizar um periodo sobreposto corrige
  em vez de duplicar.
- Metricas de conta, publicacao e campanha.
- Graficos com paleta validada para daltonismo em modo claro e escuro, legenda,
  tooltip e tabela de dados por baixo de cada grafico.
- Nunca dois eixos verticais no mesmo grafico.
- Relatorios diarios, semanais e mensais.

### Observabilidade
- Logs separados por canal: ADMIN, SYSTEM, AI, PUBLISHING, ADS, BILLING, AUTH,
  WEBHOOK.
- Monitor de filas com trabalhos pendentes, em execucao e sem tentativas.
- Notificacoes por evento.
- Erros humanizados em todo o lado: operacao, etapa, motivo, codigo e solucao.

### Testes
78 testes, todos a passar:
- 15 — calculo de agendamento, fusos horarios e hora de verao
- 22 — validacao de entrada
- 12 — registry de capacidades das plataformas
- 11 — cofre de tokens e idempotencia
- 10 — contrato de erros
- 8 — aritmetica financeira e conversao de moeda

E, contra a base de dados real: restricao de soma de valores, idempotencia de
transacoes, reclamacao de trabalhos da fila e idempotencia da reserva de
execucao.

---

## CONFIGURACAO MANUAL NECESSARIA

Nada disto pode ser feito pelo codigo. Depende de contas, aprovacoes e chaves
que so o administrador pode obter.

### 1. Projeto Supabase
- Criar um projeto **exclusivo para o NojAds**.
- Aplicar `supabase/migrations/0001` a `0010`, por ordem.
- Definir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY`.
- Configurar Site URL e Redirect URLs em Authentication.

### 2. Chaves locais
- `TOKEN_ENCRYPTION_KEY` — `openssl rand -base64 32`. Sem ela, nenhuma conta
  social pode ser ligada. **Se a perder, todos os tokens guardados ficam
  ilegiveis e as contas tem de ser reconectadas.**
- `CRON_SECRET` — `openssl rand -hex 32`. Protege `/api/cron/*`.

### 3. Meta (Facebook + Instagram)
Aplicacao em [developers.facebook.com](https://developers.facebook.com):
- Produtos: Facebook Login, Instagram Graph API, Marketing API.
- Redirect URI exatamente igual ao `META_REDIRECT_URI`.
- Permissoes: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
  `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`,
  `read_insights`, `ads_management`, `ads_read`, `business_management`.
- **App Review da Meta** para sair do modo de desenvolvimento. Sem isso, so
  contas com papel na aplicacao conseguem ligar.
- Business Manager verificado para usar a Marketing API em producao.
- A conta Instagram tem de ser **Business ou Creator, ligada a uma Pagina**.
- Passo a passo em [oauth.md](oauth.md).

### 4. Provider de IA
- `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, ou
- `AI_PROVIDER=openai` + `OPENAI_API_KEY`.
- Sem isto, as tarefas de geracao falham explicitamente.

### 5. Gateway de pagamento
- Conta Stripe, `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
- Webhook para `https://<dominio>/api/webhooks/stripe` com os eventos
  `payment_intent.*` e `charge.refunded`.
- Sem isto, o modulo funciona como registo e consulta; nenhuma cobranca e
  simulada.

### 6. Worker e scheduler
- Um servico que mantenha processos vivos: Railway, Render, Fly.io ou um VPS.
- `npm run worker` e `npm run scheduler`, com as mesmas variaveis de ambiente.
- Em alternativa ao scheduler: Vercel Cron para `/api/cron/scheduler`
  (ja declarado em `vercel.json`).
- **Nao ponha o worker em funcoes serverless.** Tem limite de tempo por
  desenho, que e exatamente o oposto do que um worker de fila precisa.

### 7. Vercel
- Importar o repositorio, framework Next.js.
- Definir todas as variaveis de ambiente para Production e Preview
  separadamente.
- Ligar o dominio e atualizar `NEXT_PUBLIC_APP_URL` e os Redirect URIs.

### 8. Renderizacao de video
- Escolher um servico (Shotstack, Creatomate, Remotion Lambda) ou preparar
  ffmpeg no seu worker.
- Implementar `VideoProvider` em `src/server/providers/video/`.
- Enquanto nao existir, o Video Studio prepara guioes e diz claramente que nao
  renderiza.

### 9. Geracao de imagens
- O Creative Studio guarda e organiza media enviada por si.
- A geracao de imagens por IA exige um provider de imagem, que ainda nao esta
  implementado. A IA escreve o briefing visual; a producao e sua.

---

## NAO IMPLEMENTADO

Declarado explicitamente para nao haver duvida.

| Item | Situacao |
|---|---|
| TikTok | Registry, provider e OAuth desenhados. Metodos lancam `NotImplementedError`. Publicar exige app aprovada com scope `video.publish`. |
| YouTube | Idem. Upload exige quota aprovada na Google Cloud e auditoria da app. |
| LinkedIn | Idem. Publicar em nome de pagina exige Community Management API aprovada. |
| X | Idem. A escrita pela API v2 depende do plano contratado. |
| Google Ads | Idem. Exige developer token aprovado. |
| Renderizacao de video | Interface pronta, provider nao ligado. |
| Geracao de imagens por IA | Nao implementada. |
| Lookalike e remarketing na Meta | A API suporta; o NojAds ainda nao envia. Marcado como tal na interface. |
| Duplicar campanha | A API suporta; o NojAds ainda nao implementa. |
| Gestao de comentarios | Nao implementada. |
| Exportacao de relatorios em PDF | Os relatorios existem em base de dados e na interface; a exportacao nao. |

Todos estes casos lancam `NotImplementedError`, que na interface aparece como
*ainda nao implementado no NojAds — nada foi enviado nem cobrado*, distinto de
*nao suportado pela plataforma*.

---

## O que nenhuma plataforma permite

Independentemente de esforco de implementacao. E por isso que o NojAds nao o
promete:

- **Adicionar um metodo de pagamento por API** — Meta, TikTok, LinkedIn e Google
  Ads exigem o painel oficial.
- **Cobrar um cartao para investimento publicitario a partir de uma aplicacao
  externa** — o mesmo.
- **Publicar num perfil pessoal do Facebook** — so Paginas.
- **Publicar numa conta pessoal do Instagram** — so Business ou Creator ligada a
  uma Pagina.
- **Agendar nativamente no Instagram** — o NojAds agenda com o seu proprio
  scheduler.
- **Apagar uma publicacao do Instagram por API**.
- **Trocar o criativo de um anuncio Meta ja publicado** — e preciso criar outro.

O `PaymentProvider` existe para o que o NojAds pode legitimamente cobrar: a sua
propria taxa, subscricoes e carregamentos. Nao para pagar a Meta em nome do
cliente, porque isso a Meta nao permite.
