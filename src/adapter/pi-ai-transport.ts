import {
  type FinishReason,
  LlmError,
  type ReplayEnvelope,
  type StreamChunk,
  type TokenUsage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm';
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Usage,
} from '@earendil-works/pi-ai';

/**
 * Project a completed `@earendil-works/pi-ai` AssistantMessage into DSH's
 * durable version-2 `ReplayEnvelope` (`kind: 'pi-ai', version: 2`).
 */
export function toPiReplayState(
  message: AssistantMessage,
  requestedModel = message.model,
): ReplayEnvelope {
  return {
    response: {
      kind: 'pi-ai',
      version: 2,
      api: message.api,
      provider: message.provider,
      model: requestedModel,
      ...(message.responseModel === undefined
        ? {}
        : { responseModel: message.responseModel }),
      ...(message.responseId === undefined
        ? {}
        : { responseId: message.responseId }),
      ...(message.providerThinkingLevel === undefined
        ? {}
        : { providerThinkingLevel: message.providerThinkingLevel }),
      stopReason: message.stopReason,
    },
    blocks: message.content.map((block) => {
      switch (block.type) {
        case 'text':
          return {
            type: 'text',
            ...(block.textSignature === undefined
              ? {}
              : { textSignature: block.textSignature }),
          };
        case 'thinking':
          return {
            type: 'reasoning',
            ...(block.thinkingSignature === undefined
              ? {}
              : { thinkingSignature: block.thinkingSignature }),
            ...(block.redacted === undefined
              ? {}
              : { redacted: block.redacted }),
          };
        case 'toolCall':
          return {
            type: 'tool-call',
            ...(block.thoughtSignature === undefined
              ? {}
              : { thoughtSignature: block.thoughtSignature }),
            ...(block.namespace === undefined
              ? {}
              : { namespace: block.namespace }),
          };
      }
    }),
  };
}

export function mapPiAiUsage(usage: Usage): TokenUsage {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
    ...(usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {}),
    ...(usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {}),
    ...(usage.reasoning !== undefined && usage.reasoning > 0
      ? { reasoningTokens: usage.reasoning }
      : {}),
  };
}

function classifyPiAiErrorText(message: string): string {
  if (/\b(?:401|403)\b/.test(message)) return 'AUTH';
  if (/\b429\b|rate.?limit/i.test(message)) return 'RATE_LIMIT';
  if (/\b400\b|invalid.?request/i.test(message)) return 'INVALID_REQUEST';
  if (/\b5\d\d\b/.test(message)) return 'SERVER';
  if (/\btime(?:d)?\s*out\b|timeout/i.test(message)) return 'TIMEOUT';
  return 'PI_AI_ERROR';
}

function mapPiAiStopReason(message: AssistantMessage): FinishReason {
  switch (message.stopReason) {
    case 'stop':
      return { kind: 'stop' };
    case 'length':
      return { kind: 'max-tokens' };
    case 'toolUse':
      return { kind: 'tool-calls' };
    case 'aborted':
      return {
        kind: 'aborted',
        failure: {
          message: message.errorMessage ?? 'pi-ai stream aborted',
          code: 'ABORTED',
        },
      };
    case 'error':
    case 'pending':
    case 'deferred': {
      const text =
        message.errorMessage ?? `pi-ai stream ended (${message.stopReason})`;
      return {
        kind: 'error',
        failure: {
          message: text,
          code: classifyPiAiErrorText(text),
        },
      };
    }
  }
}

/**
 * Translate an `@earendil-works/pi-ai` `AssistantMessageEvent` stream into
 * DSH `StreamChunk`s, preserving `ReplayEnvelope` on terminal `done`.
 */
export async function* mapPiAiEventsToStreamChunks(
  events: AsyncIterable<AssistantMessageEvent>,
  requestedModel: string,
  callerSignal?: AbortSignal,
): AsyncGenerator<StreamChunk, void, unknown> {
  const toolIds = new Map<number, { id: string; name: string }>();

  for await (const event of events) {
    switch (event.type) {
      case 'start':
        break;
      case 'text_start':
        yield {
          type: 'block-start',
          index: event.contentIndex,
          blockType: 'text',
        };
        break;
      case 'text_delta':
        yield {
          type: 'text-delta',
          index: event.contentIndex,
          text: event.delta,
        };
        break;
      case 'text_end':
        yield {
          type: 'block-end',
          index: event.contentIndex,
          block: {
            type: 'text',
            text: event.content,
          },
        };
        break;
      case 'thinking_start':
        yield {
          type: 'block-start',
          index: event.contentIndex,
          blockType: 'reasoning',
        };
        break;
      case 'thinking_delta':
        yield {
          type: 'reasoning-delta',
          index: event.contentIndex,
          text: event.delta,
        };
        break;
      case 'thinking_end':
        yield {
          type: 'block-end',
          index: event.contentIndex,
          block: {
            type: 'reasoning',
            text: event.content,
          },
        };
        break;
      case 'toolcall_start': {
        const partial = event.partial.content[event.contentIndex];
        const id = partial?.type === 'toolCall' ? partial.id : '';
        const name = partial?.type === 'toolCall' ? partial.name : '';
        toolIds.set(event.contentIndex, { id, name });
        yield {
          type: 'block-start',
          index: event.contentIndex,
          blockType: 'tool-call',
        };
        break;
      }
      case 'toolcall_delta': {
        const known = toolIds.get(event.contentIndex);
        yield {
          type: 'tool-call-delta',
          index: event.contentIndex,
          id: ToolCallId(known?.id ?? ''),
          ...(known?.name !== undefined && known.name.length > 0
            ? { name: known.name }
            : {}),
          argumentsDelta: event.delta,
        };
        break;
      }
      case 'toolcall_end':
        yield {
          type: 'block-end',
          index: event.contentIndex,
          block: {
            type: 'tool-call',
            id: ToolCallId(event.toolCall.id),
            name: event.toolCall.name,
            arguments: JSON.stringify(event.toolCall.arguments),
          },
        };
        break;
      case 'done':
        yield {
          type: 'usage',
          usage: mapPiAiUsage(event.message.usage),
        };
        yield {
          type: 'finish',
          reason: mapPiAiStopReason(event.message),
          replayState: toPiReplayState(event.message, requestedModel),
        };
        return;
      case 'error':
        yield {
          type: 'usage',
          usage: mapPiAiUsage(event.error.usage),
        };
        yield {
          type: 'finish',
          reason: mapPiAiStopReason(
            callerSignal?.aborted
              ? { ...event.error, stopReason: 'aborted' }
              : event.error,
          ),
        };
        return;
    }
  }

  throw new LlmError(
    'dsh-hitchfin: pi-ai event stream ended without done/error',
    'STREAM_CLOSED',
  );
}
