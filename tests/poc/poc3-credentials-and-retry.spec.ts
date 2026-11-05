import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm';
import { afterEach, describe, expect, it } from '../helpers/expect.ts';
import {
  AccountPool,
  CooldownTracker,
  GroupRouter,
  HitchfinAdapter,
  StickySessionCache,
} from '../../lib/index.js';

/**
 * In-memory serialized CredentialProvider mirroring LocalCredentialProvider's
 * mutex-locked `modifyRecord` semantics for isolated unit/POC verification.
 */
class SerializedTestCredentialProvider {
  private store = new Map<string, CredentialRecord>();
  private lock: Promise<void> = Promise.resolve();

  async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return this.store.get(String(key));
  }

  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const run = this.lock.then(async () => {
      const current = this.store.get(String(key));
      const next = await mutate(current);
      if (next !== undefined) {
        this.store.set(String(key), next);
        return next;
      }
      return current;
    });
    this.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

describe('POC-3: Multi-slot ctx.credentials modifyRecord locking & Step-boundary Failover', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serializes concurrent modifyAccountCredential token refreshes and executes Step-boundary failover on 429', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'hitchfin-poc3-'));
    tempDirs.push(tmpDir);

    const credProvider = new SerializedTestCredentialProvider();
    const pool = new AccountPool(
      () => credProvider as unknown as CredentialProvider,
    );

    pool.registerSlot({
      channelId: 'hitchfin-codex',
      slotId: 'slot-1',
      label: 'Codex Account #1',
      state: 'Healthy',
      quotas: [{ windowLabel: '5h', remainingPercent: 90, confidence: 'exact' }],
    });
    pool.registerSlot({
      channelId: 'hitchfin-codex',
      slotId: 'slot-2',
      label: 'Codex Account #2',
      state: 'Healthy',
      quotas: [{ windowLabel: '5h', remainingPercent: 75, confidence: 'exact' }],
    });

    // Verify concurrent token refresh serialization on slot-1
    let refreshNetworkCalls = 0;
    await Promise.all([
      pool.modifyAccountCredential('hitchfin-codex', 'slot-1', async (curr) => {
        if (curr && curr.expiresAt && curr.expiresAt > Date.now() + 60_000) {
          return curr;
        }
        refreshNetworkCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return {
          channelId: 'hitchfin-codex',
          slotId: 'slot-1',
          label: 'Codex Account #1',
          authType: 'oauth',
          accessToken: 'fresh-token-1',
          refreshToken: 'rotated-rt-1',
          expiresAt: Date.now() + 3600_000,
          updatedAt: Date.now(),
        };
      }),
      pool.modifyAccountCredential('hitchfin-codex', 'slot-1', async (curr) => {
        if (curr && curr.expiresAt && curr.expiresAt > Date.now() + 60_000) {
          return curr;
        }
        refreshNetworkCalls += 1;
        return {
          channelId: 'hitchfin-codex',
          slotId: 'slot-1',
          label: 'Codex Account #1',
          authType: 'oauth',
          accessToken: 'fresh-token-duplicate',
          refreshToken: 'rotated-rt-dup',
          expiresAt: Date.now() + 3600_000,
          updatedAt: Date.now(),
        };
      }),
    ]);

    // Because modifyRecord is serialized, the second caller sees the refreshed token from caller #1!
    expect(refreshNetworkCalls).toBe(1);
    const stored = await pool.readAccountCredential('hitchfin-codex', 'slot-1');
    expect(stored?.accessToken).toBe('fresh-token-1');

    // Now test Step-boundary failover when slot-1 hits HTTP 429
    const cooldown = new CooldownTracker();
    const sticky = new StickySessionCache(cooldown);
    const router = new GroupRouter(pool, cooldown, sticky);

    const attemptedSlots: string[] = [];
    const adapter = new HitchfinAdapter(
      [
        {
          provider: { id: 'hitchfin-codex', name: 'Hitchfin Codex' },
          models: [
            {
              info: {
                provider: 'hitchfin-codex',
                id: 'gpt-5-codex',
                name: 'GPT-5 Codex',
              },
            },
          ],
          strategy: 'smart',
        },
      ],
      router,
      async function* ({ slotId }) {
        attemptedSlots.push(slotId);
        if (slotId === 'slot-1') {
          throw new LlmError('Too Many Requests on slot-1', 'RATE_LIMIT', {
            status: 429,
          });
        }
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield {
          type: 'text-delta',
          index: 0,
          text: `Served by ${slotId}`,
        };
        yield {
          type: 'block-end',
          index: 0,
          block: { type: 'text', text: `Served by ${slotId}` },
        };
        yield {
          type: 'finish',
          reason: { kind: 'stop' },
        };
      },
    );

    const userMsg = createUserMessage({
      content: [{ type: 'text', text: 'Test failover' }],
      source: { kind: 'user' },
    });

    // Step attempt 1: hits slot-1 (90% quota), receives 429, marks slot-1 Cooldown, throws RATE_LIMIT with providerRetryAfterMs=100
    let caughtError: LlmError | undefined;
    try {
      for await (const _chunk of adapter.stream({
        provider: 'hitchfin-codex',
        model: 'gpt-5-codex',
        messages: [userMsg],
      })) {
        // no-op
      }
    } catch (err) {
      caughtError = err as LlmError;
    }

    expect(caughtError).toBeInstanceOf(LlmError);
    expect(caughtError?.code).toBe('RATE_LIMIT');
    expect(caughtError?.failure.providerRetryAfterMs).toBe(100);
    expect(cooldown.getHealth('hitchfin-codex', 'slot-1').state).toBe('Cooldown');

    // Step attempt 2 (triggered by dsh-llm-retry at step boundary): automatically routes to slot-2!
    const chunks = [];
    for await (const chunk of adapter.stream({
      provider: 'hitchfin-codex',
      model: 'gpt-5-codex',
      messages: [userMsg],
    })) {
      chunks.push(chunk);
    }

    expect(attemptedSlots).toEqual(['slot-1', 'slot-2']);
    expect(
      chunks.some(
        (c) => c.type === 'text-delta' && c.text === 'Served by slot-2',
      ),
    ).toBe(true);
  });
});
