import type { AuthorizationFlow, AuthorizationSession } from '@deepseek-ai/dsh-authorization';
import { type AccountPool } from './pool.js';
export interface CreateSlotAuthFlowOptions {
    pool: AccountPool;
    channelId: string;
    slotId: string;
    label: string;
    onOAuthExchange?: (session: AuthorizationSession) => Promise<{
        accessToken: string;
        refreshToken?: string;
        expiresAt?: number;
    }>;
}
/**
 * Create a DSH-native `AuthorizationFlow` (`ctx.authorization.registerFlow`)
 * for a specific `(channelId, slotId)` account slot.
 */
export declare function createSlotAuthorizationFlow(options: CreateSlotAuthFlowOptions): AuthorizationFlow;
export interface DiscoveredCommunityPlugin {
    packageName: string;
    entryPath: string;
    inferredChannelId: string;
}
/**
 * Discover installed `@magpie-community/*` plugin packages on disk
 * (defaults to `~/.config/magpie/plugins/node_modules/@magpie-community`)
 * without reading any user token/auth files.
 */
export declare function discoverLocalCommunityPluginPackages(scopeDir?: string): DiscoveredCommunityPlugin[];
