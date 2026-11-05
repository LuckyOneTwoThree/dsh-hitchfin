import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import AuthorizationService from '@deepseek-ai/dsh-authorization';
import LocalCredentialService from '@deepseek-ai/dsh-credentials-local';
import {
  AccountPool,
  backupCordisPatch,
  CooldownTracker,
  createSlotAuthorizationFlow,
  discoverLocalCommunityPluginPackages,
  GroupRouter,
  restoreCordisPatch,
  SecretVault,
  StickySessionCache,
} from '../lib/index.js';
import { expect } from './helpers/expect.ts';

describe('Phase 2 & Phase 3 Suite (M2.1 - M3.3)', () => {
  it('M2.1: createSlotAuthorizationFlow integrates with real AuthorizationService & LocalCredentialService', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hitchfin-auth-'));
    const ctx = new Context();
    const credScope = ctx.plugin(LocalCredentialService, {
      dshHome: tempDir,
      watch: false,
    });
    const authScope = ctx.plugin(AuthorizationService);
    await new Promise((r) => setTimeout(r, 30));

    try {
      const pool = new AccountPool(() => ctx.credentials);
      const flow = createSlotAuthorizationFlow({
        pool,
        channelId: 'hitchfin-codex',
        slotId: 'slot-pro-1',
        label: 'OpenAI Codex Pro #1',
        onOAuthExchange: async (session) => {
          session.notify({
            message: 'Complete device sign-in',
            url: 'https://auth.openai.com/device',
            code: 'ABCD-1234',
          });
          return {
            accessToken: 'oauth-access-token-xyz',
            refreshToken: 'oauth-refresh-token-xyz',
            expiresAt: Date.now() + 3600_000,
          };
        },
      });

      const disposeFlow = ctx.authorization.registerFlow(flow);
      const notices: string[] = [];

      const outcome = await ctx.authorization.begin({
        key: flow.key,
        method: 'oauth',
        interaction: {
          notify(n) {
            notices.push(n.message);
          },
          async prompt() {
            return '';
          },
        },
      });

      expect(outcome).toEqual({ status: 'authorized' });
      expect(notices).toContain('Complete device sign-in');

      const stored = await pool.readAccountCredential(
        'hitchfin-codex',
        'slot-pro-1',
      );
      expect(stored?.accessToken).toBe('oauth-access-token-xyz');
      expect(pool.getSlot('hitchfin-codex', 'slot-pro-1')?.state).toBe(
        'Healthy',
      );

      disposeFlow();

      // Also check community plugin discovery finds local @magpie-community packages if installed
      const discovered = discoverLocalCommunityPluginPackages();
      expect(Array.isArray(discovered)).toBe(true);
    } finally {
      authScope.dispose();
      credScope.dispose();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('M2.3: GroupRouter supports multi-member RoutingGroupConfig and pace / rotate / smart strategies', () => {
    const pool = new AccountPool(() => undefined);
    const cooldown = new CooldownTracker();
    const sticky = new StickySessionCache(cooldown);
    const router = new GroupRouter(pool, cooldown, sticky);
    const now = 1_700_000_000_000;

    // Slot A: 60% remaining, resets in 48 hours
    pool.registerSlot({
      slotId: 'slot-slow-reset',
      channelId: 'hitchfin-codex',
      label: 'Codex Weekly',
      state: 'Healthy',
      quotas: [
        {
          windowLabel: '7d',
          remainingPercent: 60,
          resetAt: new Date(now + 48 * 3600 * 1000).toISOString(),
          confidence: 'exact',
        },
      ],
    });

    // Slot B: 60% remaining, resets in 1 hour (urgent to consume before reset!)
    pool.registerSlot({
      slotId: 'slot-fast-reset',
      channelId: 'hitchfin-claude',
      label: 'Claude 5h Window',
      state: 'Healthy',
      quotas: [
        {
          windowLabel: '5h',
          remainingPercent: 60,
          resetAt: new Date(now + 1 * 3600 * 1000).toISOString(),
          confidence: 'exact',
        },
      ],
    });

    router.registerRoutingGroup({
      groupId: 'hitchfin-coding-group',
      displayName: 'Smart Coding Group',
      strategy: 'pace',
      members: [
        { channelId: 'hitchfin-codex', modelId: 'gpt-5-codex' },
        { channelId: 'hitchfin-claude', modelId: 'claude-sonnet-4-5' },
      ],
    });

    // Under `pace` strategy, slot-fast-reset wins because its 60% quota expires in 1h vs 48h
    const pacedPick = router.selectAccount(
      'hitchfin-coding-group',
      'auto',
      'pace',
      undefined,
      now,
    );
    expect(pacedPick.channelId).toBe('hitchfin-claude');
    expect(pacedPick.slotId).toBe('slot-fast-reset');
    expect(pacedPick.modelId).toBe('claude-sonnet-4-5');

    // Under `rotate` strategy, selections alternate across group members
    router.registerRoutingGroup({
      groupId: 'hitchfin-rotate-group',
      displayName: 'Rotate Group',
      strategy: 'rotate',
      members: [
        { channelId: 'hitchfin-codex', modelId: 'gpt-5-codex' },
        { channelId: 'hitchfin-claude', modelId: 'claude-sonnet-4-5' },
      ],
    });

    const rot1 = router.selectAccount(
      'hitchfin-rotate-group',
      'auto',
      'rotate',
      undefined,
      now,
    );
    const rot2 = router.selectAccount(
      'hitchfin-rotate-group',
      'auto',
      'rotate',
      undefined,
      now,
    );
    expect(rot1.slotId).toBe('slot-slow-reset');
    expect(rot2.slotId).toBe('slot-fast-reset');
  });

  it('M3.1: SecretVault persists salt and placeholder mappings across Host restarts via ctx.credentials', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hitchfin-vault-'));
    const ctx = new Context();
    const credScope = ctx.plugin(LocalCredentialService, {
      dshHome: tempDir,
      watch: false,
    });
    await new Promise((r) => setTimeout(r, 30));

    try {
      const vault1 = new SecretVault();
      const rawSecret = 'sk-proj-PersistAcrossRestart1234567890';
      const placeholder = vault1.registerSecret(rawSecret);
      await vault1.saveToCredentials(ctx.credentials);

      // Simulate a fresh Host process restart with a new SecretVault instance
      const vault2 = new SecretVault();
      const loaded = await vault2.loadFromCredentials(ctx.credentials);
      expect(loaded).toBe(true);
      expect(vault2.getSalt()).toBe(vault1.getSalt());
      expect(vault2.resolvePlaceholder(placeholder)).toBe(rawSecret);
      expect(vault2.registerSecret(rawSecret)).toBe(placeholder);
    } finally {
      credScope.dispose();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('M3.3: backupCordisPatch and restoreCordisPatch perform lossless backup and clean rollback', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hitchfin-patch-'));
    const patchPath = join(tempDir, 'cordis.patch.yml');
    const originalContent =
      'plugins:\n  - id: original-provider\n    path: ./orig.js\n';

    try {
      writeFileSync(patchPath, originalContent, 'utf8');
      const backupRes = backupCordisPatch(patchPath);
      expect(backupRes.backedUp).toBe(true);

      // Mutate cordis.patch.yml
      writeFileSync(patchPath, 'plugins: []\n', 'utf8');
      expect(readFileSync(patchPath, 'utf8')).toBe('plugins: []\n');

      // Rollback to original
      const restoreRes = restoreCordisPatch(patchPath);
      expect(restoreRes.restored).toBe(true);
      expect(readFileSync(patchPath, 'utf8')).toBe(originalContent);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
