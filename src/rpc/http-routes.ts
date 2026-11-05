import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HitchfinRuntimeMode, HitchfinStatusSnapshot } from './types.js';

export interface WebServerRouteRegistration {
  kind: 'exact';
  path: string;
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>;
}

export interface WebServerService {
  register(route: WebServerRouteRegistration): () => void;
}

export interface HostConnectionService {
  trustedHosts?: readonly string[];
  requestRejection?: (request: IncomingMessage) => number | undefined;
}

export interface HitchfinRouteController {
  getStatusSnapshot(): HitchfinStatusSnapshot;
  refreshAndSyncRoutes(): Promise<HitchfinStatusSnapshot>;
  setRuntimeMode(mode: HitchfinRuntimeMode): Promise<HitchfinStatusSnapshot>;
  updateMaskingConfig(patch: {
    enabled?: boolean;
    blockHighRiskTools?: boolean;
  }): HitchfinStatusSnapshot;
}

export function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function parseAuthority(value: string): URL | null {
  try {
    const url = new URL(`http://${value}`);
    const canonical =
      url.port === '' ? url.hostname : `${url.hostname}:${url.port}`;
    return canonical === value.toLowerCase() ? url : null;
  } catch {
    return null;
  }
}

export function loopbackAuthority(host: string | undefined): boolean {
  if (host === undefined) return false;
  const lower = host.toLowerCase();
  const name = lower.startsWith('[')
    ? lower.slice(0, lower.indexOf(']') + 1)
    : lower.split(':')[0];
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}

export function trustedAuthority(
  host: string,
  trustedHosts: readonly string[],
): boolean {
  const hostUrl = parseAuthority(host);
  if (hostUrl === null) return false;
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === null) return false;
    return entryUrl.port === ''
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host;
  });
}

export function sameOrigin(
  request: IncomingMessage,
  trustedHosts: readonly string[] = [],
): boolean {
  const host = request.headers.host;
  if (
    host !== undefined &&
    !loopbackAuthority(host) &&
    !trustedAuthority(host, trustedHosts)
  ) {
    return false;
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    return false;
  }
  const origin = request.headers.origin;
  if (origin === undefined) {
    return true;
  }
  try {
    const originUrl = new URL(origin);
    if (originUrl.host === host) {
      return true;
    }
    if (originUrl.port === '' && host !== undefined && loopbackAuthority(host)) {
      const hostUrl = parseAuthority(host);
      return hostUrl !== null && originUrl.hostname === hostUrl.hostname;
    }
    return false;
  } catch {
    return false;
  }
}

export async function readJsonBody(
  request: IncomingMessage,
  maxBytes = 4096,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new Error('request body too large');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('expected JSON object body');
  }
  return parsed as Record<string, unknown>;
}

export function mountHitchfinHttpRoutes(
  webServer: WebServerService,
  controller: HitchfinRouteController,
  getConnection?: () => HostConnectionService | undefined,
): () => void {
  const getTrustedHosts = (): readonly string[] => {
    const conn = getConnection?.();
    return Array.isArray(conn?.trustedHosts) ? conn.trustedHosts : [];
  };

  const disposers: Array<() => void> = [
    webServer.register({
      kind: 'exact',
      path: '/api/hitchfin/status',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' });
          response.end();
          return;
        }
        sendJson(response, 200, controller.getStatusSnapshot());
      },
    }),

    webServer.register({
      kind: 'exact',
      path: '/api/hitchfin/refresh',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        if (!sameOrigin(request, getTrustedHosts())) {
          sendJson(response, 403, { error: 'untrusted origin' });
          return;
        }
        try {
          const snapshot = await controller.refreshAndSyncRoutes();
          sendJson(response, 200, snapshot);
        } catch (err) {
          sendJson(response, 500, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),

    webServer.register({
      kind: 'exact',
      path: '/api/hitchfin/mode',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        if (!sameOrigin(request, getTrustedHosts())) {
          sendJson(response, 403, { error: 'untrusted origin' });
          return;
        }
        try {
          const body = await readJsonBody(request);
          const mode = body.mode;
          if (mode !== 'auto' && mode !== 'bridge' && mode !== 'standalone') {
            sendJson(response, 400, {
              error: 'mode must be one of "auto", "bridge", or "standalone"',
            });
            return;
          }
          const snapshot = await controller.setRuntimeMode(mode);
          sendJson(response, 200, snapshot);
        } catch (err) {
          sendJson(response, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),

    webServer.register({
      kind: 'exact',
      path: '/api/hitchfin/masking',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        if (!sameOrigin(request, getTrustedHosts())) {
          sendJson(response, 403, { error: 'untrusted origin' });
          return;
        }
        try {
          const body = await readJsonBody(request);
          const snapshot = controller.updateMaskingConfig({
            ...(typeof body.enabled === 'boolean'
              ? { enabled: body.enabled }
              : {}),
            ...(typeof body.blockHighRiskTools === 'boolean'
              ? { blockHighRiskTools: body.blockHighRiskTools }
              : {}),
          });
          sendJson(response, 200, snapshot);
        } catch (err) {
          sendJson(response, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    }),
  ];

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
