import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { BlockAssembler } from '@deepseek-ai/dsh-llm';
import type { AssistantMessageEvent } from '@earendil-works/pi-ai';
import {
  createOpenAiSseTransport,
  HitchfinHostController,
  mapPiAiEventsToStreamChunks,
  mountHitchfinHttpRoutes,
  type WebServerRouteRegistration,
} from '../lib/index.js';
import { expect } from './helpers/expect.ts';

function createSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n\n`));
      }
      controller.close();
    },
  });
}

describe('Phase 1 MVP Integration Suite (M1.2 - M1.4)', () => {
  it('M1.2: createOpenAiSseTransport streams reasoning, text, tool-calls, disjoint usage, and sends attributionHeaders()', async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const sseLines = [
      `data: ${JSON.stringify({
        choices: [
          {
            delta: { reasoning_content: 'Analyzing repository...' },
          },
        ],
      })}`,
      `data: ${JSON.stringify({
        choices: [
          {
            delta: { content: 'Here is the plan.' },
          },
        ],
      })}`,
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_read_1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"/tmp/',
                  },
                },
              ],
            },
          },
        ],
      })}`,
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: 'config.json"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 40,
          total_tokens: 140,
          prompt_tokens_details: { cached_tokens: 30 },
          completion_tokens_details: { reasoning_tokens: 15 },
        },
      })}`,
      'data: [DONE]',
    ];

    const transport = createOpenAiSseTransport({
      resolveBaseUrl: () => 'http://127.0.0.1:3425',
      resolveAuthToken: () => 'test-slot-token',
      customFetch: async (_input, init) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        capturedBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(createSseStream(sseLines), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      },
    });

    const assembler = new BlockAssembler();
    for await (const chunk of transport({
      channelId: 'hitchfin-codex',
      slotId: 'slot-1',
      modelId: 'gpt-5-codex',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Inspect config' }],
        },
      ],
      options: {
        provider: 'hitchfin-codex',
        model: 'gpt-5-codex',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Inspect config' }],
          },
        ],
      },
    })) {
      assembler.push(chunk);
    }

    expect(typeof capturedHeaders['user-agent']).toBe('string');
    expect(capturedHeaders['user-agent'].length).toBeGreaterThan(0);
    expect(capturedHeaders.authorization).toBe('Bearer test-slot-token');
    expect(capturedBody.model).toBe('gpt-5-codex');
    expect(capturedBody.stream).toBe(true);

    const blocks = assembler.blocks();
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toEqual({
      type: 'reasoning',
      text: 'Analyzing repository...',
    });
    expect(blocks[1]).toEqual({
      type: 'text',
      text: 'Here is the plan.',
    });
    expect(blocks[2]).toEqual({
      type: 'tool-call',
      id: 'call_read_1',
      name: 'read_file',
      arguments: '{"path":"/tmp/config.json"}',
    });

    // Disjoint inputTokens: 100 prompt_tokens - 30 cached_tokens = 70
    expect(assembler.usage).toEqual({
      inputTokens: 70,
      outputTokens: 40,
      totalTokens: 140,
      cacheReadTokens: 30,
      reasoningTokens: 15,
    });
    expect(assembler.finish).toEqual({ kind: 'tool-calls' });
  });

  it('M1.3: mapPiAiEventsToStreamChunks preserves version-2 pi-ai ReplayEnvelope', async () => {
    async function* mockPiEvents(): AsyncGenerator<
      AssistantMessageEvent,
      void,
      unknown
    > {
      const baseMessage = {
        role: 'assistant' as const,
        content: [
          {
            type: 'thinking' as const,
            thinking: 'Deep thought',
            thinkingSignature: 'sig-think-1',
          },
          {
            type: 'text' as const,
            text: 'Final answer',
            textSignature: 'sig-text-1',
          },
        ],
        api: 'anthropic-messages',
        provider: 'hitchfin-claude',
        model: 'claude-sonnet-4-5',
        responseId: 'resp_123',
        usage: {
          input: 50,
          output: 25,
          cacheRead: 10,
          cacheWrite: 0,
          totalTokens: 85,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: 'stop' as const,
        timestamp: Date.now(),
      };

      yield {
        type: 'thinking_start',
        contentIndex: 0,
        partial: baseMessage,
      };
      yield {
        type: 'thinking_delta',
        contentIndex: 0,
        delta: 'Deep thought',
        partial: baseMessage,
      };
      yield {
        type: 'thinking_end',
        contentIndex: 0,
        content: 'Deep thought',
        partial: baseMessage,
      };
      yield {
        type: 'text_start',
        contentIndex: 1,
        partial: baseMessage,
      };
      yield {
        type: 'text_delta',
        contentIndex: 1,
        delta: 'Final answer',
        partial: baseMessage,
      };
      yield {
        type: 'text_end',
        contentIndex: 1,
        content: 'Final answer',
        partial: baseMessage,
      };
      yield {
        type: 'done',
        reason: 'stop',
        message: baseMessage,
      };
    }

    const assembler = new BlockAssembler();
    for await (const chunk of mapPiAiEventsToStreamChunks(
      mockPiEvents(),
      'claude-sonnet-4-5',
    )) {
      assembler.push(chunk);
    }

    expect(assembler.blocks()).toEqual([
      { type: 'reasoning', text: 'Deep thought' },
      { type: 'text', text: 'Final answer' },
    ]);
    expect(assembler.replayState).toEqual({
      response: {
        kind: 'pi-ai',
        version: 2,
        api: 'anthropic-messages',
        provider: 'hitchfin-claude',
        model: 'claude-sonnet-4-5',
        responseId: 'resp_123',
        stopReason: 'stop',
      },
      blocks: [
        { type: 'reasoning', thinkingSignature: 'sig-think-1' },
        { type: 'text', textSignature: 'sig-text-1' },
      ],
    });
  });

  it('M1.4: HitchfinHostController dynamically syncs Magpie routes and exposes /api/hitchfin/* HTTP endpoints', async () => {
    const ctx = new Context();
    ctx.plugin(LlmRuntime);
    await new Promise((r) => setTimeout(r, 20));

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-5-codex', owned_by: 'openai-codex' },
              { id: 'workbuddy/deepseek-v3', owned_by: 'workbuddy' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const controller = new HitchfinHostController(ctx, {
      mode: 'auto',
      customFetch: mockFetch,
    });
    controller.attachLlmRuntime(ctx.llm);

    const initialSnapshot = await controller.refreshAndSyncRoutes();
    expect(initialSnapshot.magpieBridgeReachable).toBe(true);
    expect(initialSnapshot.activeMode).toBe('bridge');
    expect(initialSnapshot.channels.length).toBe(2);

    const providers = ctx.llm.listProviders().map((p) => p.id);
    expect(providers).toContain('hitchfin-codex');
    expect(providers).toContain('hitchfin-workbuddy');

    // Mount HTTP routes and test GET / POST + same-origin CSRF protection
    const registeredRoutes = new Map<string, WebServerRouteRegistration>();
    const disposeRoutes = mountHitchfinHttpRoutes(
      {
        register(route) {
          registeredRoutes.set(route.path, route);
          return () => registeredRoutes.delete(route.path);
        },
      },
      controller,
    );

    async function callRoute(
      path: string,
      method: 'GET' | 'POST',
      body?: Record<string, unknown>,
      headers: Record<string, string> = { host: '127.0.0.1:3080' },
    ): Promise<{ status: number; json: any }> {
      const route = registeredRoutes.get(path);
      if (!route) throw new Error(`Route not found: ${path}`);
      const reqStream = Readable.from(
        body ? [Buffer.from(JSON.stringify(body))] : [],
      ) as any;
      reqStream.method = method;
      reqStream.headers = headers;

      let status = 200;
      let responseText = '';
      const res = {
        writeHead(code: number) {
          status = code;
          return this;
        },
        end(chunk?: string | Buffer) {
          if (chunk) responseText += String(chunk);
          return this;
        },
      } as any;

      await route.handler(reqStream, res);
      return {
        status,
        json: responseText ? JSON.parse(responseText) : null,
      };
    }

    const getRes = await callRoute('/api/hitchfin/status', 'GET');
    expect(getRes.status).toBe(200);
    expect(getRes.json.activeMode).toBe('bridge');

    // Cross-site POST must be rejected with 403
    const evilPost = await callRoute(
      '/api/hitchfin/mode',
      'POST',
      { mode: 'standalone' },
      {
        host: '127.0.0.1:3080',
        origin: 'https://evil.example.com',
      },
    );
    expect(evilPost.status).toBe(403);

    // Legitimate loopback POST switches mode to standalone and hot-reloads routes via handle.replace([])
    const modePost = await callRoute('/api/hitchfin/mode', 'POST', {
      mode: 'standalone',
    });
    expect(modePost.status).toBe(200);
    expect(modePost.json.activeMode).toBe('standalone');
    expect(ctx.llm.listProviders().map((p) => p.id)).toEqual([]);

    // Masking toggle POST updates masking configuration
    const maskPost = await callRoute('/api/hitchfin/masking', 'POST', {
      enabled: false,
      blockHighRiskTools: false,
    });
    expect(maskPost.status).toBe(200);
    expect(maskPost.json.masking.enabled).toBe(false);
    expect(maskPost.json.masking.blockHighRiskTools).toBe(false);

    disposeRoutes();
    await controller.dispose();
  });

  it('M1.5: unwrapConfig and probeMagpieGateway handle Cosmokit Volatile objects without throwing', async () => {
    const volatileEndpoint = {
      get: () => 'http://127.0.0.1:3425',
    };
    const volatileMode = {
      get: () => 'auto',
    };

    const ctx = new Context();
    const controller = new HitchfinHostController(ctx, {
      magpieEndpoint: volatileEndpoint as any,
      mode: volatileMode as any,
      customFetch: (async () => {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }) as any,
    });

    const snapshot = controller.getStatusSnapshot();
    expect(snapshot.magpieEndpoint).toBe('http://127.0.0.1:3425');
    expect(snapshot.mode).toBe('auto');

    const probe = await controller.refreshMagpieBridgeStatus();
    expect(probe).toBe(true);

    await controller.dispose();
  });

  it('M1.6: Autonomous account management endpoints (add, remove, strategy) run standalone without Magpie', async () => {
    const ctx = new Context();
    ctx.plugin(LlmRuntime);
    await new Promise((r) => setTimeout(r, 20));

    // Standalone controller - Magpie is completely offline / unreachable
    const mockFailingFetch: typeof fetch = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:3425');
    };

    const controller = new HitchfinHostController(ctx, {
      mode: 'standalone',
      customFetch: mockFailingFetch,
    });
    controller.attachLlmRuntime(ctx.llm);

    const initial = await controller.refreshAndSyncRoutes();
    expect(initial.activeMode).toBe('standalone');
    expect(initial.magpieBridgeReachable).toBe(false);
    expect(initial.accounts.length).toBe(0);

    const registeredRoutes = new Map<string, WebServerRouteRegistration>();
    const disposeRoutes = mountHitchfinHttpRoutes(
      {
        register(route) {
          registeredRoutes.set(route.path, route);
          return () => registeredRoutes.delete(route.path);
        },
      },
      controller,
    );

    async function callRoute(
      path: string,
      method: 'GET' | 'POST',
      body?: Record<string, unknown>,
    ): Promise<{ status: number; json: any }> {
      const route = registeredRoutes.get(path);
      if (!route) throw new Error(`Route not found: ${path}`);
      const reqStream = Readable.from(
        body ? [Buffer.from(JSON.stringify(body))] : [],
      ) as any;
      reqStream.method = method;
      reqStream.headers = { host: '127.0.0.1:3080' };

      let status = 200;
      let responseText = '';
      const res = {
        writeHead(code: number) {
          status = code;
          return this;
        },
        end(chunk?: string | Buffer) {
          if (chunk) responseText += String(chunk);
          return this;
        },
      } as any;

      await route.handler(reqStream, res);
      return {
        status,
        json: responseText ? JSON.parse(responseText) : null,
      };
    }

    // 1. Add autonomous DeepSeek account
    const addDeepSeek = await callRoute('/api/hitchfin/account/add', 'POST', {
      channelId: 'deepseek',
      label: 'DeepSeek 主号',
      apiKey: 'sk-test-deepseek-key',
      baseUrl: 'https://api.deepseek.com',
      models: ['deepseek-chat', 'deepseek-reasoner'],
    });
    expect(addDeepSeek.status).toBe(200);
    expect(addDeepSeek.json.accounts.length).toBe(1);
    expect(addDeepSeek.json.accounts[0].label).toBe('DeepSeek 主号');

    // LLM runtime immediately has hitchfin-deepseek provider
    const providersAfterAdd = ctx.llm.listProviders().map((p) => p.id);
    expect(providersAfterAdd).toContain('hitchfin-deepseek');

    const models = await ctx.llm.listModels('hitchfin-deepseek');
    expect(models.map((m) => m.id)).toEqual([
      'deepseek-chat',
      'deepseek-reasoner',
    ]);

    // 2. Add second account (OpenAI Codex)
    const addCodex = await callRoute('/api/hitchfin/account/add', 'POST', {
      channelId: 'openai-codex',
      label: 'Personal ChatGPT Plus',
      apiKey: 'sk-test-openai-key',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'o1'],
    });
    expect(addCodex.status).toBe(200);
    expect(addCodex.json.accounts.length).toBe(2);

    // 2.1 Update account models via /api/hitchfin/account/update-models
    const updateModelsRes = await callRoute(
      '/api/hitchfin/account/update-models',
      'POST',
      {
        channelId: 'openai-codex',
        slotId: addCodex.json.accounts[1].slotId,
        models: ['gpt-4o', 'o3-mini', 'gpt-4o-mini'],
      },
    );
    expect(updateModelsRes.status).toBe(200);
    const updatedAccount = updateModelsRes.json.accounts.find(
      (a: any) => a.channelId === 'openai-codex',
    );
    expect(updatedAccount.models).toEqual(['gpt-4o', 'o3-mini', 'gpt-4o-mini']);

    const codexModels = await ctx.llm.listModels('hitchfin-openai-codex');
    expect(codexModels.map((m) => m.id)).toEqual([
      'gpt-4o',
      'o3-mini',
      'gpt-4o-mini',
    ]);

    // 3. Update routing strategy to rotate
    const stratRes = await callRoute(
      '/api/hitchfin/routing/strategy',
      'POST',
      { strategy: 'rotate' },
    );
    expect(stratRes.status).toBe(200);
    expect(stratRes.json.defaultStrategy).toBe('rotate');

    // 4. Remove the DeepSeek account
    const removeRes = await callRoute(
      '/api/hitchfin/account/remove',
      'POST',
      {
        channelId: 'deepseek',
        slotId: addDeepSeek.json.accounts[0].slotId,
      },
    );
    expect(removeRes.status).toBe(200);
    expect(removeRes.json.accounts.length).toBe(1);
    expect(removeRes.json.accounts[0].channelId).toBe('openai-codex');

    disposeRoutes();
    await controller.dispose();
  });
});
