# Video Studio

## O que faz hoje

O NojAds prepara o video por completo:

- guiao cena a cena, com duracao;
- texto no ecra por cena;
- narracao sugerida;
- proporcao e limites por plataforma;
- assets associados.

## O que ainda nao faz

**Nao renderiza o ficheiro.** Transformar um guiao num MP4 exige um servico de
renderizacao, que esta declarado como interface mas nao ligado.

`UnconfiguredVideoProvider.render()` lanca `NotConfiguredError`. Nenhum video e
dado como renderizado — porque nao foi. Essa distincao e deliberada.

---

## Ligar um provider

### Opcao 1 — Shotstack

```ts
// src/server/providers/video/shotstack.ts
export class ShotstackVideoProvider implements VideoProvider {
  readonly name = 'shotstack';
  isConfigured() { return Boolean(process.env.SHOTSTACK_API_KEY); }
  missingConfiguration() { return this.isConfigured() ? [] : ['SHOTSTACK_API_KEY']; }

  async render(request: VideoRenderRequest): Promise<VideoRenderResult> {
    // POST https://api.shotstack.io/v1/render
    // devolve { renderId, status: 'QUEUED' }
  }

  async getRender(renderId: string): Promise<VideoRenderResult> {
    // GET https://api.shotstack.io/v1/render/{id}
  }
}
```

Registe em `videoProvider()`.

### Opcao 2 — Creatomate
API semelhante, com templates visuais.

### Opcao 3 — Remotion Lambda
Videos definidos em React, renderizados em AWS Lambda. Mais controlo, mais
infraestrutura.

### Opcao 4 — ffmpeg no seu worker
Sem custo por render, mas exige gerir CPU, fontes e filas de renderizacao. O
worker do NojAds ja tem a fila; falta o binario e o codigo de composicao.

---

## Fluxo quando estiver ligado

```
Tarefa GENERATE_REELS
   ↓
IA escreve o guiao por cenas
   ↓
Conteudo criado com o guiao em ai_metadata
   ↓
Video Studio: rever, ajustar, anexar media
   ↓
VideoProvider.render() → renderId
   ↓
Worker consulta o estado periodicamente
   ↓
READY → asset guardado no Storage
   ↓
Conteudo pronto a agendar
```

---

## Limites por plataforma

| Plataforma | Formato | Proporcao | Duracao |
|---|---|---|---|
| Instagram Reels | MP4/MOV | 9:16 | 3 a 90 s |
| Instagram Stories | MP4/MOV | 9:16 | ate 60 s |
| Facebook Reels | MP4 | 9:16 | 3 a 90 s |
| TikTok | MP4 | 9:16 | ate 10 min |
| YouTube Shorts | MP4 | 9:16 | ate 60 s |

Fora destes limites, a plataforma recusa. O Video Studio mostra-os.

---

## Geracao de imagens

Tambem nao implementada. A IA escreve o **briefing visual** de cada peca —
visivel na ficha do conteudo — e a producao fica consigo, ou com um provider de
imagem que venha a ser ligado.
