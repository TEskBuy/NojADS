import 'server-only';
/**
 * VideoProvider.
 *
 * NojAds prepares a video: the script, the scenes, the on-screen text, the
 * assets and the audio. Rendering pixels is a different job and needs a render
 * farm (Shotstack, Creatomate, Remotion Lambda, or ffmpeg on your own worker).
 *
 * Until one is wired up, `render` refuses. The rule from the brief is explicit:
 * never claim a video was rendered when it was not.
 */
import { NotConfiguredError } from '@/lib/errors';
import type { VideoProvider, VideoRenderRequest, VideoRenderResult } from '@/server/providers/types';

export class UnconfiguredVideoProvider implements VideoProvider {
  readonly name = 'none';
  isConfigured() { return false; }
  missingConfiguration() { return ['VIDEO_RENDER_PROVIDER', 'VIDEO_RENDER_API_KEY']; }

  private fail(operation: string): never {
    throw new NotConfiguredError({
      operation,
      provider: 'Renderizacao de video',
      missing: this.missingConfiguration(),
      docsPath: 'docs/video.md',
    });
  }

  render(_request: VideoRenderRequest): Promise<VideoRenderResult> {
    this.fail('renderizacao de video');
  }

  getRender(_renderId: string): Promise<VideoRenderResult> {
    this.fail('consulta de renderizacao');
  }
}

export function videoProvider(): VideoProvider {
  return new UnconfiguredVideoProvider();
}
