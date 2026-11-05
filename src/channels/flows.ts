import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  AuthorizationFlow,
  AuthorizationSession,
} from '@deepseek-ai/dsh-authorization';
import {
  accountCredentialKey,
  type AccountPool,
  type StoredAccountRecord,
} from './pool.js';

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
export function createSlotAuthorizationFlow(
  options: CreateSlotAuthFlowOptions,
): AuthorizationFlow {
  const { pool, channelId, slotId, label, onOAuthExchange } = options;
  const key = accountCredentialKey(channelId, slotId);

  return {
    key,
    label,
    methods: [
      { id: 'oauth', label: `Sign in to ${label} (OAuth / Device Code)` },
      { id: 'api-key', label: `Enter ${label} API Key / Token` },
    ],
    async run(session: AuthorizationSession): Promise<void> {
      if (session.method === 'oauth' && onOAuthExchange) {
        const tokens = await onOAuthExchange(session);
        const record: StoredAccountRecord = {
          channelId,
          slotId,
          label,
          authType: 'oauth',
          accessToken: tokens.accessToken,
          ...(tokens.refreshToken !== undefined
            ? { refreshToken: tokens.refreshToken }
            : {}),
          ...(tokens.expiresAt !== undefined
            ? { expiresAt: tokens.expiresAt }
            : {}),
          updatedAt: Date.now(),
        };
        await session.commit({
          kind: 'grant',
          payload: record,
        });
        pool.registerSlot({
          slotId,
          channelId,
          label,
          state: 'Healthy',
          quotas: [
            {
              windowLabel: '5h',
              remainingPercent: 100,
              confidence: 'estimated',
            },
          ],
        });
        return;
      }

      // Default / api-key interactive prompt
      session.notify({
        message: `Configure ${label} (${channelId}/${slotId})`,
      });
      const rawKey = await session.prompt({
        kind: 'text',
        message: `Paste your ${label} token or API key:`,
        placeholder: 'sk-...',
      });
      const trimmed = rawKey.trim();
      if (!trimmed) {
        throw new Error('Token or API key cannot be empty');
      }

      const record: StoredAccountRecord = {
        channelId,
        slotId,
        label,
        authType: 'api-key',
        apiKey: trimmed,
        updatedAt: Date.now(),
      };
      await session.commit({
        kind: 'grant',
        payload: record,
      });
      pool.registerSlot({
        slotId,
        channelId,
        label,
        state: 'Healthy',
        quotas: [
          {
            windowLabel: 'monthly',
            remainingPercent: 100,
            confidence: 'local-meter',
          },
        ],
      });
    },
  };
}

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
export function discoverLocalCommunityPluginPackages(
  scopeDir = join(
    homedir(),
    '.config',
    'magpie',
    'plugins',
    'node_modules',
    '@magpie-community',
  ),
): DiscoveredCommunityPlugin[] {
  if (!existsSync(scopeDir)) return [];
  const results: DiscoveredCommunityPlugin[] = [];
  try {
    const entries = readdirSync(scopeDir, { withFileTypes: true });
    for (const dirent of entries) {
      if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
      const entryPath = join(scopeDir, dirent.name, 'opencode.mjs');
      if (!existsSync(entryPath)) continue;

      const lower = dirent.name.toLowerCase();
      let inferredChannelId = `hitchfin-${lower.replace(/^opencode-|-auth$/g, '')}`;
      if (lower.includes('workbuddy')) {
        inferredChannelId = 'hitchfin-workbuddy';
      } else if (lower.includes('trae')) {
        inferredChannelId = 'hitchfin-trae';
      } else if (lower.includes('zcode')) {
        inferredChannelId = 'hitchfin-zcode';
      }

      results.push({
        packageName: `@magpie-community/${dirent.name}`,
        entryPath,
        inferredChannelId,
      });
    }
  } catch {
    return [];
  }
  return results;
}
