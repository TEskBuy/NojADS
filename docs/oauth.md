# Configuracao de OAuth por plataforma

O NojAds **nunca pede nem guarda a palavra-passe de uma rede social**. Todas as
ligacoes usam o OAuth oficial: o utilizador autoriza na propria plataforma e o
NojAds recebe apenas um codigo, que troca por um token no servidor.

## Como o fluxo funciona

```
NojAds  →  /api/oauth/{plataforma}/start?client={id}
        →  cria um state de uso unico, valido 15 minutos
        →  redireciona para a pagina oficial de autorizacao
Utilizador autoriza na plataforma
        →  /api/oauth/{plataforma}/callback?code=…&state=…
        →  valida e consome o state
        →  troca o codigo por token (servidor a servidor)
        →  descobre as contas elegiveis
        →  cifra o token (AES-256-GCM) e guarda em social_tokens
        →  importa as contas publicitarias, quando a API as oferece
        →  redireciona de volta com uma mensagem legivel
```

Se o utilizador recusar, se o state expirar ou se nao houver contas elegiveis, o
NojAds explica exatamente o que aconteceu e o que fazer.

---

## Meta — Facebook e Instagram

**Estado: implementado.** E a unica plataforma com conector completo.

### 1. Criar a aplicacao

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps** →
   **Create App**.
2. Tipo: **Business**.
3. Associe-a ao seu **Business Manager**.

### 2. Adicionar produtos

Em **Add Products**, adicione:
- **Facebook Login** (para o fluxo OAuth)
- **Instagram Graph API** (para publicar no Instagram)
- **Marketing API** (para campanhas)

### 3. Redirect URI

Em **Facebook Login → Settings → Valid OAuth Redirect URIs**, acrescente
exatamente o valor que vai pôr em `META_REDIRECT_URI`:

```
http://localhost:3000/api/oauth/meta/callback      (desenvolvimento)
https://o-seu-dominio.com/api/oauth/meta/callback  (producao)
```

> O erro mais comum e um URI que difere por uma barra final ou por http/https.
> A Meta compara caractere a caractere.

### 4. Permissoes

Em **App Review → Permissions and Features**, peca:

| Permissao | Para que serve |
|---|---|
| `pages_show_list` | listar as Paginas do utilizador |
| `pages_read_engagement` | ler dados da Pagina |
| `pages_manage_posts` | publicar na Pagina |
| `instagram_basic` | ler a conta Instagram |
| `instagram_content_publish` | publicar no Instagram |
| `instagram_manage_insights` | metricas do Instagram |
| `read_insights` | metricas da Pagina |
| `ads_management` | criar e gerir campanhas |
| `ads_read` | ler campanhas e metricas |
| `business_management` | aceder as contas do Business Manager |

### 5. Variaveis de ambiente

Em **Settings → Basic**, copie o App ID e o App Secret:

```
META_APP_ID=
META_APP_SECRET=
META_API_VERSION=v21.0
META_REDIRECT_URI=https://o-seu-dominio.com/api/oauth/meta/callback
META_SCOPES=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,instagram_manage_insights,read_insights,ads_management,ads_read,business_management
META_WEBHOOK_VERIFY_TOKEN=<uma string sua a escolha>
```

### 6. App Review

Enquanto a aplicacao estiver em **modo de desenvolvimento**, so contas com papel
nela (Administrador, Programador, Testador) conseguem ligar. Para clientes
reais e obrigatorio passar o **App Review** da Meta, o que envolve:

- video a demonstrar cada permissao em uso;
- politica de privacidade publicada;
- verificacao do negocio (Business Verification).

Costuma demorar entre alguns dias e algumas semanas.

### 7. Requisitos do lado do cliente

- A Pagina do Facebook tem de existir e o utilizador tem de ser administrador.
- A conta Instagram tem de ser **Business** ou **Creator** e estar **ligada a
  essa Pagina**. Contas pessoais nao podem publicar por API — e uma limitacao da
  Meta, nao do NojAds.
- Para anuncios: conta publicitaria ativa no Business Manager, com metodo de
  pagamento configurado **no painel da Meta**.

### 8. Webhooks (opcional)

Em **Webhooks**, aponte para:

```
https://o-seu-dominio.com/api/webhooks/meta
```

Use o `META_WEBHOOK_VERIFY_TOKEN` no campo de verificacao. O NojAds valida a
assinatura `X-Hub-Signature-256` de cada callback e regista os invalidos como
invalidos, sem os processar.

### 9. Notas sobre tokens

- A Meta **nao emite refresh tokens** para tokens de utilizador. O NojAds troca
  o token curto por um de longa duracao (cerca de 60 dias).
- Sete dias antes de expirar, a conta e marcada como `EXPIRED` e o administrador
  e notificado.
- Renovar significa reconectar a conta. O NojAds diz isso claramente em vez de
  fingir uma renovacao automatica que a API nao oferece.

---

## TikTok — nao implementado

**Estrutura pronta, conector por construir.** As chamadas lancam
`NotImplementedError`.

Para o implementar mais tarde:
1. Aplicacao em [developers.tiktok.com](https://developers.tiktok.com) (TikTok
   for Developers → Login Kit + Content Posting API).
2. Scopes: `user.info.basic`, `video.publish`, `video.list`.
3. `video.publish` passa por revisao manual da TikTok.
4. Redirect URI: `https://<dominio>/api/oauth/tiktok/callback`.
5. Variaveis: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`.
6. Implementar `SocialProvider` em `src/server/providers/social/tiktok.ts` e
   registar em `src/server/providers/social/index.ts`.

---

## YouTube — nao implementado

1. Projeto na [Google Cloud Console](https://console.cloud.google.com).
2. Ativar a **YouTube Data API v3**.
3. Credenciais OAuth 2.0 do tipo Web application.
4. Scopes: `https://www.googleapis.com/auth/youtube.upload`,
   `https://www.googleapis.com/auth/youtube.readonly`.
5. **Auditoria da aplicacao pela Google** para sair do modo de teste; sem ela, o
   limite e de 100 utilizadores e os videos ficam privados.
6. Variaveis: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

O upload de video consome quota diaria significativa (1600 unidades por video,
num total diario de 10 000 por omissao) — ou seja, cerca de 6 videos por dia sem
pedir aumento de quota.

---

## LinkedIn — nao implementado

1. Aplicacao em [linkedin.com/developers](https://www.linkedin.com/developers).
2. Associar a uma Company Page.
3. Produtos: **Share on LinkedIn** e **Community Management API**.
4. A Community Management API exige aprovacao e, normalmente, um parceiro
   comercial.
5. Variaveis: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
   `LINKEDIN_REDIRECT_URI`.

---

## X — nao implementado

1. Aplicacao em [developer.x.com](https://developer.x.com).
2. OAuth 2.0 com PKCE.
3. Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`.
4. **A escrita depende do plano contratado.** O plano gratuito tem limites muito
   baixos.
5. Variaveis: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REDIRECT_URI`.

---

## Google Ads — nao implementado

1. Projeto Google Cloud com a **Google Ads API** ativa.
2. **Developer token** pedido no Google Ads (comeca em acesso de teste; o acesso
   basico exige aprovacao).
3. Se gerir contas de clientes, um **Manager Account (MCC)**.
4. Variaveis: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, e as
   credenciais Google acima.

---

## Verificar o que esta configurado

Duas formas:

- **Definicoes** no NojAds: mostra, por plataforma, se o conector esta
  implementado, se as credenciais estao presentes e que variaveis faltam.
- `GET /api/health`: devolve o mesmo em JSON, sem revelar nenhum valor.
