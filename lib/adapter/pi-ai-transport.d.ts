import { type ReplayEnvelope, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm';
import type { AssistantMessage, AssistantMessageEvent, Usage } from '@earendil-works/pi-ai';
/**
 * Project a completed `@earendil-works/pi-ai` AssistantMessage into DSH's
 * durable version-2 `ReplayEnvelope` (`kind: 'pi-ai', version: 2`).
 */
export declare function toPiReplayState(message: AssistantMessage, requestedModel?: string): ReplayEnvelope;
export declare function mapPiAiUsage(usage: Usage): TokenUsage;
/**
 * Translate an `@earendil-works/pi-ai` `AssistantMessageEvent` stream into
 * DSH `StreamChunk`s, preserving `ReplayEnvelope` on terminal `done`.
 */
export declare function mapPiAiEventsToStreamChunks(events: AsyncIterable<AssistantMessageEvent>, requestedModel: string, callerSignal?: AbortSignal): AsyncGenerator<StreamChunk, void, unknown>;
