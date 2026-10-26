import { createApp } from './app.ts';
import { d1Adapter, type D1DatabaseLike } from './db.ts';
import { ensureSeed } from './seed.ts';

export interface Env {
  DB: D1DatabaseLike;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  MEDIA?: {
    get(
      key: string,
      options?: { range?: { headers: Headers } },
    ): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string }; range?: { offset: number; length: number } } | null>;
  };
}

/** Minimal shape of the Workers execution context (avoids pulling in workers-types). */
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

let app: ReturnType<typeof createApp> | null = null;

async function getApp(env: Env) {
  if (!app) {
    app = createApp(d1Adapter(env.DB));
    // Seed the demo accounts on the first request of a cold isolate.
    await ensureSeed(d1Adapter(env.DB));
  }
  return app;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const api = await getApp(env);
      return api.fetch(request, env as never, ctx as never);
    }

    // Static assets are served by the Workers asset binding; SPA fallback is
    // configured in wrangler.jsonc (not_found_handling: single-page-application).
    if (env.ASSETS) return env.ASSETS.fetch(request);

    return new Response('Not found', { status: 404 });
  },
};
