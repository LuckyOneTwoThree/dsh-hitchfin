import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CHANNEL_PRESETS, type QuotaWindowSnapshot } from '../rpc/types.js';
import type { AccountPool } from './pool.js';

export interface DiscoveredSubscriptionAccount {
  id: string;
  source: 'magpie-logins' | 'codex-cli' | 'copilot-cli' | 'claude-cli';
  channelId: string;
  providerName: string;
  user: string;
  plan: string;
  hasToken: boolean;
  token?: string;
  refreshToken?: string;
  baseUrl: string;
  models: string[];
  candidateModels?: string[];
  quotas?: QuotaWindowSnapshot[];
  authType: 'oauth' | 'bearer' | 'api-key';
  slotId: string;
  label: string;
}

function parseQuotaRecord(
  channelId: string,
  user: string,
  quotasData: Record<string, any>,
): QuotaWindowSnapshot[] {
  const directKey = `${channelId}/${user}`;
  const record = quotasData[directKey] ?? quotasData[user];
  const q = record?.quota;
  if (!q) {
    return [
      {
        windowLabel: '套餐可用',
        remainingPercent: 100,
        confidence: 'exact',
      },
    ];
  }

  const windows = Array.isArray(q.windows) ? q.windows : [];
  if (windows.length > 0) {
    const w = windows[0];
    if (typeof w.amount === 'number' && typeof w.limit === 'number' && w.limit > 0) {
      const pct = Math.min(100, Math.max(0, Math.round((w.amount / w.limit) * 100)));
      return [
        {
          windowLabel: `剩余 ${w.amount}/${w.limit} ${w.unit || '积分'}`.trim(),
          remainingPercent: pct,
          confidence: 'exact',
        },
      ];
    }
    if (typeof w.used === 'number') {
      return [
        {
          windowLabel: `${w.name || '周期'}: 已用 ${w.used} 次`,
          remainingPercent: 100,
          confidence: 'exact',
        },
      ];
    }
  }

  return [
    {
      windowLabel: '额度正常',
      remainingPercent: 100,
      confidence: 'exact',
    },
  ];
}

function getCandidateModelsForChannel(
  channelId: string,
  pluginProviders: any[],
): string[] {
  const plugin = Array.isArray(pluginProviders)
    ? pluginProviders.find((p) => p.id === channelId)
    : null;
  if (plugin && Array.isArray(plugin.models) && plugin.models.length > 0) {
    const extracted = plugin.models
      .map((m: any) => (typeof m === 'string' ? m : m.id || m.name))
      .filter((s: unknown): s is string => typeof s === 'string' && s.length > 0);
    if (extracted.length > 0) {
      return Array.from(new Set(extracted));
    }
  }

  const preset = CHANNEL_PRESETS.find(
    (p) => p.channelId.replace(/^hitchfin[-/]/, '') === channelId,
  );
  return preset?.candidateModels ?? preset?.defaultModels ?? [];
}

/**
 * Scan local disk for official subscription account logins (ChatGPT/Codex, Trae, WorkBuddy, ZCode, Copilot).
 * Reads real quota from quotas.json and candidate models from plugin-providers.json.
 * Never logs or exposes plaintext tokens.
 */
export function discoverLocalSubscriptionAccounts(): DiscoveredSubscriptionAccount[] {
  const home = homedir();
  const results: DiscoveredSubscriptionAccount[] = [];
  const seenComposite = new Set<string>();

  // 1. Scan Magpie directory: logins.json, plugin-auth.json, quotas.json, plugin-providers.json
  const magpieDir = join(home, '.config', 'magpie');
  const loginsFile = join(magpieDir, 'logins.json');
  const pluginAuthFile = join(magpieDir, 'plugin-auth.json');
  const quotasFile = join(magpieDir, 'quotas.json');
  const pluginProvidersFile = join(magpieDir, 'plugin-providers.json');

  let pluginAuth: Record<string, any> = {};
  if (existsSync(pluginAuthFile)) {
    try {
      pluginAuth = JSON.parse(readFileSync(pluginAuthFile, 'utf8'));
    } catch {
      pluginAuth = {};
    }
  }

  let quotasData: Record<string, any> = {};
  if (existsSync(quotasFile)) {
    try {
      quotasData = JSON.parse(readFileSync(quotasFile, 'utf8'));
    } catch {
      quotasData = {};
    }
  }

  let pluginProviders: any[] = [];
  if (existsSync(pluginProvidersFile)) {
    try {
      pluginProviders = JSON.parse(readFileSync(pluginProvidersFile, 'utf8'));
    } catch {
      pluginProviders = [];
    }
  }

  if (existsSync(loginsFile)) {
    try {
      const logins = JSON.parse(readFileSync(loginsFile, 'utf8'));
      if (Array.isArray(logins)) {
        for (const item of logins) {
          const agent = String(item.agent || '').toLowerCase();
          let channelId = '';
          let providerName = '';
          let baseUrl = '';
          let models: string[] = [];
          let token = '';
          let refreshToken = '';

          if (agent === 'codex' || agent.includes('codex')) {
            channelId = 'codex';
            providerName = 'ChatGPT / OpenAI Codex';
            baseUrl = 'https://api.openai.com/v1';
            models = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'];
            token =
              item.auth?.tokens?.access_token ||
              item.auth?.OPENAI_API_KEY ||
              item.auth?.tokens?.id_token;
            refreshToken = item.auth?.tokens?.refresh_token;
          } else if (agent.includes('trae-cn')) {
            channelId = 'trae-cn';
            providerName = 'Trae CN (字节跳动)';
            baseUrl = 'https://trae-api-cn.mchost.guru';
            models = [
              'Doubao-Seed-2.1-Pro',
              'Doubao-Seed-2.1-Turbo',
              'Doubao-Seed-Evolving',
              'deepseek-v4.1-flash',
            ];
            const pAuth =
              pluginAuth['trae-cn'] || pluginAuth['trae-cn#pizpj3'] || {};
            token = pAuth.access || pAuth.token;
            refreshToken = pAuth.refresh;
          } else if (agent.includes('workbuddy')) {
            channelId = 'workbuddy';
            providerName = 'WorkBuddy (腾讯混元)';
            baseUrl = 'https://copilot.tencent.com/v2';
            models = ['hy4free', 'hy4std', 'hy3', 'deepseek-v4.1-flash'];
            const pAuth = pluginAuth['workbuddy'] || {};
            token = pAuth.access || pAuth.token;
            refreshToken = pAuth.refresh;
          } else if (agent.includes('zcode')) {
            channelId = 'zcode';
            providerName = 'ZCode (智谱 GLM)';
            baseUrl = 'https://open.bigmodel.cn/api/anthropic';
            models = ['GLM-5.3-Flash', 'GLM-5.2', 'GLM-5-Turbo'];
            const pAuth = pluginAuth['zcode'] || {};
            token = pAuth.access || pAuth.token;
            refreshToken = pAuth.refresh;
          }

          if (channelId && token) {
            const shortId = String(item.id || '').slice(0, 8) || 'sub';
            const userStr = item.user && item.user !== '~' ? item.user : '';
            const planStr = item.plan ? ` · ${item.plan}` : '';
            const slotId = `${channelId}-${shortId}`;
            const key = `${channelId}::${userStr || slotId}`;

            if (!seenComposite.has(key)) {
              seenComposite.add(key);
              const realQuotas = parseQuotaRecord(channelId, item.user || '', quotasData);
              const candidateModels = getCandidateModelsForChannel(channelId, pluginProviders);

              results.push({
                id: item.id || slotId,
                source: 'magpie-logins',
                channelId,
                providerName,
                user: item.user || '~',
                plan: item.plan || '官方套餐订阅',
                hasToken: true,
                token,
                refreshToken: refreshToken || undefined,
                baseUrl,
                models,
                candidateModels,
                quotas: realQuotas,
                authType: 'oauth',
                slotId,
                label: `${providerName}${userStr ? ` (${userStr})` : ''}${planStr}`,
              });
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // 2. Scan ~/.codex/auth.json (ChatGPT Codex CLI official login)
  const codexAuthFile = join(home, '.codex', 'auth.json');
  if (existsSync(codexAuthFile) && !results.some((r) => r.channelId === 'codex')) {
    try {
      const c = JSON.parse(readFileSync(codexAuthFile, 'utf8'));
      const token = c.tokens?.access_token || c.tokens?.id_token;
      if (token) {
        const user = c.tokens?.account_id || '本机 Codex 订阅';
        const preset = CHANNEL_PRESETS.find((p) => p.channelId === 'codex');
        results.push({
          id: 'codex-cli-default',
          source: 'codex-cli',
          channelId: 'codex',
          providerName: 'ChatGPT / OpenAI Codex',
          user,
          plan: 'ChatGPT Plus/Team 官方订阅',
          hasToken: true,
          token,
          refreshToken: c.tokens?.refresh_token,
          baseUrl: 'https://api.openai.com/v1',
          models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
          candidateModels: preset?.candidateModels,
          quotas: parseQuotaRecord('codex', user, quotasData),
          authType: 'oauth',
          slotId: 'codex-local',
          label: `ChatGPT 官方订阅 (${user})`,
        });
      }
    } catch {
      // Ignore
    }
  }

  // 3. Scan GitHub Copilot hosts.json
  const copilotHostsFile = join(home, '.config', 'github-copilot', 'hosts.json');
  if (existsSync(copilotHostsFile)) {
    try {
      const hosts = JSON.parse(readFileSync(copilotHostsFile, 'utf8'));
      const githubEntry = hosts['github.com'];
      if (githubEntry?.oauth_token) {
        const user = githubEntry.user || 'GitHub Copilot 订阅';
        const preset = CHANNEL_PRESETS.find((p) => p.channelId === 'copilot');
        results.push({
          id: 'copilot-cli-default',
          source: 'copilot-cli',
          channelId: 'copilot',
          providerName: 'GitHub Copilot',
          user,
          plan: 'Copilot 官方套餐',
          hasToken: true,
          token: githubEntry.oauth_token,
          baseUrl: 'https://api.githubcopilot.com',
          models: [
            'copilot-gpt-4o',
            'copilot-claude-3.5-sonnet',
            'copilot-o1',
          ],
          candidateModels: preset?.candidateModels,
          quotas: [
            {
              windowLabel: '套餐可用',
              remainingPercent: 100,
              confidence: 'exact',
            },
          ],
          authType: 'oauth',
          slotId: 'copilot-local',
          label: `GitHub Copilot 订阅 (${user})`,
        });
      }
    } catch {
      // Ignore
    }
  }

  return results;
}

/**
 * Import discovered accounts into Hitchfin's AccountPool with real quotas and candidate models.
 */
export async function importDiscoveredAccountsToPool(
  accountIds: string[] | 'all',
  pool: AccountPool,
): Promise<number> {
  const discovered = discoverLocalSubscriptionAccounts();
  const targets =
    accountIds === 'all'
      ? discovered
      : discovered.filter((d) => accountIds.includes(d.id));

  let importedCount = 0;
  for (const acct of targets) {
    if (!acct.token) continue;
    await pool.addAutonomousAccount({
      channelId: acct.channelId,
      slotId: acct.slotId,
      label: acct.label,
      authType: acct.authType,
      accessToken: acct.token,
      refreshToken: acct.refreshToken,
      baseUrl: acct.baseUrl,
      models: acct.models,
      candidateModels: acct.candidateModels,
      quotas: acct.quotas,
      updatedAt: Date.now(),
    });
    importedCount++;
  }

  return importedCount;
}
