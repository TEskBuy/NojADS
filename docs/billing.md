# Billing e pagamentos

## O principio

Dinheiro real exige uma decisao humana. O NojAds mostra tudo o que vai acontecer
antes de acontecer, separa cada parcela, verifica os limites e depois pede
confirmacao explicita. A automacao pode propor; nao pode gastar.

---

## O que as plataformas permitem — e o que nao permitem

Isto vale a pena dizer de forma direta porque o pedido original imaginava um
fluxo mais amplo do que as APIs oferecem.

**Nenhuma API publicitaria oficial — Meta, TikTok, LinkedIn, Google Ads —
permite a uma aplicacao externa adicionar um metodo de pagamento ou cobrar um
cartao para pagar investimento publicitario.** Nao e uma limitacao de
implementacao. E o desenho dessas plataformas, por razoes de responsabilidade e
regulacao.

O que o NojAds faz, dentro disso:

| Operacao | Meta | TikTok | LinkedIn | Google Ads |
|---|---|---|---|---|
| Ler saldo e moeda | Implementado | Nao implementado | Nao implementado | Nao implementado |
| Ler fonte de financiamento | Implementado | Nao implementado | Nao implementado | Nao implementado |
| Saber se a conta pode gastar | Implementado | Nao implementado | Nao implementado | Nao implementado |
| Listar metodos de pagamento | **A API nao permite** | A API nao permite | A API nao permite | A API nao permite |
| Adicionar metodo de pagamento | **A API nao permite** | A API nao permite | A API nao permite | A API nao permite |
| Cobrar dentro do NojAds | **A API nao permite** | A API nao permite | A API nao permite | A API nao permite |

O ecra de Billing mostra esta tabela ao administrador. Sem rodeios.

### O que isso significa na pratica

- O investimento publicitario e cobrado **pela plataforma**, com o metodo ja
  associado a conta publicitaria, configurado no painel oficial.
- O NojAds le esse estado e **bloqueia a publicacao** quando a plataforma diz
  que a conta nao pode gastar — o que evita campanhas que falhariam.
- O `PaymentProvider` (Stripe) existe para o que o NojAds pode legitimamente
  cobrar: a sua propria taxa, subscricoes e carregamentos de saldo interno.

---

## Separacao de valores

Quatro numeros, sempre distintos:

| Valor | O que e |
|---|---|
| **Gasto publicitario** | Vai para a plataforma |
| **Taxa NojAds** | A sua comissao, se existir |
| **Taxa do gateway** | O que o Stripe cobra |
| **Total** | O que e efetivamente cobrado |

Guardados em colunas separadas, com uma restricao na base de dados:

```sql
constraint transactions_total_matches_parts
  check (total_amount = ad_spend_amount + nojads_fee + gateway_fee)
```

Um erro de calculo falha no insert. Nao ha forma de gravar valores que nao
batem certo.

Exemplo com taxa NojAds de 10% e Stripe padrao:

```
Gasto publicitario   100.00 USD
Taxa NojAds (10%)     10.00 USD
Taxa gateway (2.9%+0.30) 3.49 USD
─────────────────────────────────
Total                113.49 USD
```

---

## Limites de gasto

Por cliente, em Billing & Pagamentos:

| Limite | Efeito |
|---|---|
| Por transacao | Recusa cobrancas acima do valor |
| Por campanha | Soma o que ja foi cobrado a essa campanha |
| Diario | Soma tudo desde a meia-noite |
| Mensal | Soma tudo desde o dia 1 |
| Exigir aprovacao acima de | Marca a transacao para aprovacao explicita |
| Aumento maximo pela IA | Teto para alteracoes automaticas de orcamento |
| Bloquear pagamentos automaticos | Impede qualquer cobranca desencadeada por automacao |

Todos verificados **no servidor, antes** da cobranca. Nao dependem da interface.

Um limite excedido produz um `SpendLimitError` que diz qual o limite, qual o
valor pedido e onde alterar.

### Limite global

```
BILLING_MAX_SINGLE_TRANSACTION=500
```

Teto absoluto da instalacao, acima de qualquer configuracao por cliente.

---

## A regra para a IA

A IA analisa desempenho e propoe alteracoes. O que ela **nao** pode:

- efetuar pagamentos;
- aumentar orcamento acima do limite do cliente (por omissao **0%**, ou seja,
  apenas propoe);
- publicar uma campanha quando "bloquear pagamentos automaticos" esta ativo;
- eliminar campanhas.

Cada proposta que toque em orcamento vira um pedido de aprovacao com o motivo,
o impacto estimado e a razao pela qual foi bloqueada.

---

## Confirmacao humana

Uma cobranca real exige:

1. sessao ativa de um utilizador com permissao de escrita no cliente;
2. limites de gasto satisfeitos;
3. a palavra **CONFIRMAR** escrita a mao no formulario.

O `confirmedByUserId` e obrigatorio na assinatura de `charge()`. Sem ele, o
provider recusa. Nenhum caminho automatico consegue satisfazer estes tres.

---

## Idempotencia

Cada transacao tem uma chave deterministica:

```
tx_<sha256(clientId | campaignId | purpose | valor | moeda)>
```

Um duplo clique, um retry de rede ou um webhook reenviado produzem a mesma
chave, e a chave e unica na tabela. Verificado contra a base de dados real.

Nos webhooks, ha uma segunda protecao: uma transacao em estado terminal nunca
volta a mudar.

---

## Dados de cartao

Nunca sao recebidos nem guardados. O que fica em base de dados:

- o identificador do metodo no gateway (`pm_...`);
- a marca do cartao;
- os ultimos 4 digitos (com uma restricao a garantir que sao 4 digitos);
- o mes e ano de validade.

Nao existe coluna para numero de cartao ou CVV, e nao ha caminho no codigo que
os aceite.

---

## Moedas

A moeda da conta publicitaria e definida na plataforma e nao pode ser alterada
por API. O NojAds mostra sempre a moeda real da conta.

Sobre AOA: **as plataformas publicitarias internacionais nao operam contas em
AOA.** Uma conta publicitaria angolana costuma estar em USD ou EUR.

O NojAds trata isso assim:

- os orcamentos sao introduzidos na moeda real da conta;
- os relatorios podem usar a moeda de referencia do cliente;
- a conversao so acontece com uma taxa configurada:

```
FX_PROVIDER=manual
FX_MANUAL_RATES={"AOA_USD":0.0011,"USD_AOA":910}
```

Com `FX_PROVIDER=none` (o padrao), pedir uma conversao **falha** com uma
mensagem clara em vez de usar uma taxa inventada. Uma taxa de cambio errada num
sistema financeiro e pior do que uma recusa.

---

## Configurar o Stripe

1. Conta em [stripe.com](https://stripe.com).
2. Chave secreta em Developers → API keys.
3. Webhook para `https://<dominio>/api/webhooks/stripe`, com os eventos
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.processing`, `payment_intent.canceled`, `charge.refunded`.
4. Variaveis:

```
PAYMENT_GATEWAY=stripe
STRIPE_SECRET_KEY=sk_live_…
STRIPE_PUBLISHABLE_KEY=pk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
```

Sem estas variaveis, o modulo funciona como registo e consulta. Nenhum pagamento
e simulado — tentar cobrar devolve `PAYMENT_GATEWAY_NOT_CONFIGURED`.

### Verificacao de assinatura

Cada webhook e verificado antes de ser guardado:
- HMAC SHA-256 sobre `timestamp.corpo`, comparado em tempo constante;
- eventos com mais de 5 minutos sao recusados (bloqueia reenvios);
- eventos invalidos ficam registados como invalidos e nao sao processados.

---

## Faturas

Geradas automaticamente quando um pagamento e confirmado, com numeracao
sequencial `NOJ-YYYY-NNNNNN` e linhas separadas para publicidade, taxa NojAds e
taxa do gateway.

---

## Definir a taxa NojAds

Em Billing & Pagamentos (apenas ADMIN), entre 0 e 50%. Fica em `app_settings`,
com registo de quem alterou e quando.
