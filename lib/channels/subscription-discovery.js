import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
/**
 * Scan local disk for official subscription account logins (ChatGPT/Codex, Trae, WorkBuddy, ZCode, Copilot).
 * Never logs or exposes plaintext tokens.
 */
export function discoverLocalSubscriptionAccounts() {
    const home = homedir();
    const results = [];
    const seenComposite = new Set();
    // 1. Scan Magpie logins.json + plugin-auth.json
    const magpieDir = join(home, '.config', 'magpie');
    const loginsFile = join(magpieDir, 'logins.json');
    const pluginAuthFile = join(magpieDir, 'plugin-auth.json');
    let pluginAuth = {};
    if (existsSync(pluginAuthFile)) {
        try {
            pluginAuth = JSON.parse(readFileSync(pluginAuthFile, 'utf8'));
        }
        catch {
            pluginAuth = {};
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
                    let models = [];
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
                    }
                    else if (agent.includes('trae-cn')) {
                        channelId = 'trae-cn';
                        providerName = 'Trae CN (字节跳动)';
                        baseUrl = 'https://trae-api-cn.mchost.guru';
                        models = [
                            'Doubao-Seed-2.1-Pro',
                            'Doubao-Seed-2.1-Turbo',
                            'Doubao-Seed-Evolving',
                        ];
                        const pAuth = pluginAuth['trae-cn'] || pluginAuth['trae-cn#pizpj3'] || {};
                        token = pAuth.access || pAuth.token;
                        refreshToken = pAuth.refresh;
                    }
                    else if (agent.includes('workbuddy')) {
                        channelId = 'workbuddy';
                        providerName = 'WorkBuddy (腾讯混元)';
                        baseUrl = 'https://copilot.tencent.com/v2';
                        models = ['hy4free', 'hy4std', 'deepseek-v4.1-flash'];
                        const pAuth = pluginAuth['workbuddy'] || {};
                        token = pAuth.access || pAuth.token;
                        refreshToken = pAuth.refresh;
                    }
                    else if (agent.includes('zcode')) {
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
                                authType: 'oauth',
                                slotId,
                                label: `${providerName}${userStr ? ` (${userStr})` : ''}${planStr}`,
                            });
                        }
                    }
                }
            }
        }
        catch {
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
                    authType: 'oauth',
                    slotId: 'codex-local',
                    label: `ChatGPT 官方订阅 (${user})`,
                });
            }
        }
        catch {
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
                    authType: 'oauth',
                    slotId: 'copilot-local',
                    label: `GitHub Copilot 订阅 (${user})`,
                });
            }
        }
        catch {
            // Ignore
        }
    }
    return results;
}
/**
 * Import discovered accounts into Hitchfin's AccountPool.
 */
export async function importDiscoveredAccountsToPool(accountIds, pool) {
    const discovered = discoverLocalSubscriptionAccounts();
    const targets = accountIds === 'all'
        ? discovered
        : discovered.filter((d) => accountIds.includes(d.id));
    let importedCount = 0;
    for (const acct of targets) {
        if (!acct.token)
            continue;
        await pool.addAutonomousAccount({
            channelId: acct.channelId,
            slotId: acct.slotId,
            label: acct.label,
            authType: acct.authType,
            accessToken: acct.token,
            refreshToken: acct.refreshToken,
            baseUrl: acct.baseUrl,
            models: acct.models,
            updatedAt: Date.now(),
        });
        importedCount++;
    }
    return importedCount;
}
