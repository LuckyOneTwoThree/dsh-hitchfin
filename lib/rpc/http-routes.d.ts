import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HitchfinRuntimeMode, HitchfinStatusSnapshot, RoutingStrategy } from './types.js';
export interface WebServerRouteRegistration {
    kind: 'exact';
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
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
    addAccount(params: {
        channelId: string;
        slotId?: string;
        label: string;
        authType?: 'api-key' | 'oauth' | 'bearer';
        apiKey?: string;
        accessToken?: string;
        baseUrl?: string;
        models?: string[];
    }): Promise<HitchfinStatusSnapshot>;
    removeAccount(channelId: string, slotId: string): Promise<HitchfinStatusSnapshot>;
    updateRoutingStrategy(strategy: RoutingStrategy): Promise<HitchfinStatusSnapshot>;
}
export declare function sendJson(response: ServerResponse, status: number, payload: unknown): void;
export declare function loopbackAuthority(host: string | undefined): boolean;
export declare function trustedAuthority(host: string, trustedHosts: readonly string[]): boolean;
export declare function sameOrigin(request: IncomingMessage, trustedHosts?: readonly string[]): boolean;
export declare function readJsonBody(request: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown>>;
export declare function mountHitchfinHttpRoutes(webServer: WebServerService, controller: HitchfinRouteController, getConnection?: () => HostConnectionService | undefined): () => void;
