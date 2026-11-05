import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, {
  BlockAssembler,
  createUserMessage,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { describe, expect, it } from '../helpers/expect.ts';
import {
  AccountPool,
  CooldownTracker,
  GroupRouter,
  HitchfinAdapter,
  probeMagpieGateway,
  StickySessionCache,
} from '../../lib/index.js';

describe('POC-1: LlmAdapter registration, Magpie bridge probe & StreamChunk contract', () => {
  it('registers HitchfinAdapter on real LlmRuntime, emits payload-free llm/adapters-updated, and passes BlockAssembler', async () => {
    const ctx = new Context();

    const llm = new LlmRuntime(ctx);
    let adaptersUpdatedCount = 0;
    let receivedPayloadLength = -1;

    ctx.on('llm/adapters-updated', (...args: unknown[]) => {
      adaptersUpdatedCount += 1;
      receivedPayloadLength = args.length;
    });

    const pool = new AccountPool(() => undefined);
    pool.registerSlot({
      channelId: 'hitchfin-codex',
      slotId: 'slot-1',
      label: 'Plus Account #1',
      state: 'Healthy',
      quotas: [
        { windowLabel: '5h', remainingPercent: 85, confidence: 'exact' },
      ],
    });

    const cooldown = new CooldownTracker();
    const sticky = new StickySessionCache(cooldown);
    const router = new GroupRouter(pool, cooldown, sticky);

    const adapter = new HitchfinAdapter(
      [
        {
          provider: {
            id: 'hitchfin-codex',
            name: 'Hitchfin · OpenAI Codex',
          },
          models: [
            {
              info: {
                provider: 'hitchfin-codex',
                id: 'gpt-5-codex',
                name: 'GPT-5 Codex',
                inputModalities: ['text', 'image'],
              },
            },
          ],
        },
      ],
      router,
      async function* () {
        yield { type: 'block-start', index: 0, blockType: 'reasoning' };
        yield {
          type: 'reasoning-delta',
          index: 0,
          text: 'Analyzing repository structure...',
        };
        yield {
          type: 'block-end',
          index: 0,
          block: {
            type: 'reasoning',
            text: 'Analyzing repository structure...',
          },
        };
        yield { type: 'block-start', index: 1, blockType: 'text' };
        yield { type: 'text-delta', index: 1, text: 'Hello from Hitchfin!' };
        yield {
          type: 'block-end',
          index: 1,
          block: { type: 'text', text: 'Hello from Hitchfin!' },
        };
        yield {
          type: 'usage',
          usage: {
            inputTokens: 42,
            outputTokens: 12,
            cacheReadTokens: 100,
            totalTokens: 154,
          },
        };
        yield {
          type: 'finish',
          reason: { kind: 'stop' },
        };
      },
    );

    const handle = llm.registerAdapter(adapter.providerIds(), adapter);
    expect(adaptersUpdatedCount).toBe(1);
    expect(receivedPayloadLength).toBe(0);

    const providers = llm.listProviders();
    expect(providers).toEqual([
      { id: 'hitchfin-codex', name: 'Hitchfin · OpenAI Codex' },
    ]);

    const models = await llm.listModels('hitchfin-codex');
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('gpt-5-codex');

    const assembler = new BlockAssembler();
    const chunks: StreamChunk[] = [];
    const userMsg = createUserMessage({
      content: [{ type: 'text', text: 'Hi' }],
      source: { kind: 'user' },
    });

    for await (const chunk of llm.stream({
      provider: 'hitchfin-codex',
      model: 'gpt-5-codex',
      messages: [userMsg],
    })) {
      chunks.push(chunk);
      assembler.push(chunk);
    }

    const assembled = assembler.blocks();
    expect(assembled).toHaveLength(2);
    expect(assembled[0]).toEqual({
      type: 'reasoning',
      text: 'Analyzing repository structure...',
    });
    expect(assembled[1]).toEqual({
      type: 'text',
      text: 'Hello from Hitchfin!',
    });

    handle();
    expect(adaptersUpdatedCount).toBe(2);
  });

  it('probes local Magpie gateway (127.0.0.1:3425) or mock gateway and groups channels cleanly', async () => {
    const liveProbe = await probeMagpieGateway('http://127.0.0.1:3425', 1000);
    // Whether local Magpie is currently running or stopped, verify schema + mock fallback
    if (liveProbe.reachable) {
      expect(liveProbe.endpoint).toBe('http://127.0.0.1:3425');
      expect(Array.isArray(liveProbe.models)).toBe(true);
    }

    const mockProbe = await probeMagpieGateway(
      'http://127.0.0.1:3425',
      1000,
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-5.2-codex', owned_by: 'codex' },
              { id: 'claude-sonnet-4-5', owned_by: 'workbuddy' },
              { id: 'deepseek-v3', owned_by: 'trae-cn' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    expect(mockProbe.reachable).toBe(true);
    expect(mockProbe.channels.map((c) => c.channelId)).toEqual([
      'hitchfin-codex',
      'hitchfin-workbuddy',
      'hitchfin-trae',
    ]);
  });
});
