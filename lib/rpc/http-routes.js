export function sendJson(response, status, payload) {
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(payload));
}
function parseAuthority(value) {
    try {
        const url = new URL(`http://${value}`);
        const canonical = url.port === '' ? url.hostname : `${url.hostname}:${url.port}`;
        return canonical === value.toLowerCase() ? url : null;
    }
    catch {
        return null;
    }
}
export function loopbackAuthority(host) {
    if (host === undefined)
        return false;
    const lower = host.toLowerCase();
    const name = lower.startsWith('[')
        ? lower.slice(0, lower.indexOf(']') + 1)
        : lower.split(':')[0];
    return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}
export function trustedAuthority(host, trustedHosts) {
    const hostUrl = parseAuthority(host);
    if (hostUrl === null)
        return false;
    return trustedHosts.some((entry) => {
        const entryUrl = parseAuthority(entry);
        if (entryUrl === null)
            return false;
        return entryUrl.port === ''
            ? entryUrl.hostname === hostUrl.hostname
            : entryUrl.host === hostUrl.host;
    });
}
export function sameOrigin(request, trustedHosts = []) {
    const host = request.headers.host;
    if (host !== undefined &&
        !loopbackAuthority(host) &&
        !trustedAuthority(host, trustedHosts)) {
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
    }
    catch {
        return false;
    }
}
export async function readJsonBody(request, maxBytes = 4096) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) {
            throw new Error('request body too large');
        }
        chunks.push(buffer);
    }
    if (chunks.length === 0)
        return {};
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw)
        return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('expected JSON object body');
    }
    return parsed;
}
export function mountHitchfinHttpRoutes(webServer, controller, getConnection) {
    const getTrustedHosts = () => {
        const conn = getConnection?.();
        return Array.isArray(conn?.trustedHosts) ? conn.trustedHosts : [];
    };
    const disposers = [
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
                }
                catch (err) {
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
                }
                catch (err) {
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
                }
                catch (err) {
                    sendJson(response, 400, {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/hitchfin/account/add',
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
                    if (typeof body.channelId !== 'string' ||
                        body.channelId.trim() === '') {
                        sendJson(response, 400, { error: 'channelId is required' });
                        return;
                    }
                    if (typeof body.label !== 'string' || body.label.trim() === '') {
                        sendJson(response, 400, { error: 'label is required' });
                        return;
                    }
                    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined;
                    const accessToken = typeof body.accessToken === 'string'
                        ? body.accessToken.trim()
                        : undefined;
                    if (!apiKey && !accessToken) {
                        sendJson(response, 400, {
                            error: 'apiKey or accessToken is required',
                        });
                        return;
                    }
                    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : undefined;
                    const models = Array.isArray(body.models)
                        ? body.models.filter((m) => typeof m === 'string')
                        : undefined;
                    const snapshot = await controller.addAccount({
                        channelId: body.channelId.trim(),
                        slotId: typeof body.slotId === 'string' ? body.slotId.trim() : undefined,
                        label: body.label.trim(),
                        authType: body.authType === 'oauth' || body.authType === 'bearer'
                            ? body.authType
                            : 'api-key',
                        apiKey,
                        accessToken,
                        baseUrl,
                        models,
                    });
                    sendJson(response, 200, snapshot);
                }
                catch (err) {
                    sendJson(response, 400, {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/hitchfin/account/remove',
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
                    if (typeof body.channelId !== 'string' ||
                        body.channelId.trim() === '') {
                        sendJson(response, 400, { error: 'channelId is required' });
                        return;
                    }
                    if (typeof body.slotId !== 'string' || body.slotId.trim() === '') {
                        sendJson(response, 400, { error: 'slotId is required' });
                        return;
                    }
                    const snapshot = await controller.removeAccount(body.channelId.trim(), body.slotId.trim());
                    sendJson(response, 200, snapshot);
                }
                catch (err) {
                    sendJson(response, 400, {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/hitchfin/routing/strategy',
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
                    const strat = body.strategy;
                    if (strat !== 'smart' &&
                        strat !== 'pace' &&
                        strat !== 'rotate' &&
                        strat !== 'order') {
                        sendJson(response, 400, {
                            error: 'strategy must be one of "smart", "pace", "rotate", or "order"',
                        });
                        return;
                    }
                    const snapshot = await controller.updateRoutingStrategy(strat);
                    sendJson(response, 200, snapshot);
                }
                catch (err) {
                    sendJson(response, 400, {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/hitchfin/discovered-subscriptions',
            handler: (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                sendJson(response, 200, controller.getDiscoveredSubscriptions());
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/hitchfin/import-subscriptions',
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
                    const all = Boolean(body.all);
                    const accountIds = Array.isArray(body.accountIds)
                        ? body.accountIds.filter((id) => typeof id === 'string')
                        : [];
                    const snapshot = await controller.importDiscoveredSubscriptions(all ? 'all' : accountIds);
                    sendJson(response, 200, snapshot);
                }
                catch (err) {
                    sendJson(response, 400, {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/hitchfin/auth/copilot/device-code',
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
                    const res = await controller.startCopilotDeviceFlow();
                    sendJson(response, 200, res);
                }
                catch (err) {
                    sendJson(response, 500, {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            },
        }),
        webServer.register({
            kind: 'exact',
            path: '/api/hitchfin/auth/copilot/poll',
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
                    if (typeof body.deviceCode !== 'string' ||
                        body.deviceCode.trim() === '') {
                        sendJson(response, 400, { error: 'deviceCode is required' });
                        return;
                    }
                    const res = await controller.pollCopilotDeviceFlow(body.deviceCode.trim());
                    sendJson(response, 200, res);
                }
                catch (err) {
                    sendJson(response, 500, {
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
