import { type RequestMessage } from '@deepseek-ai/dsh-llm';
import type { UpstreamStreamTransport } from './hitchfin-adapter.js';
export interface OpenAiSseTransportConfig {
    /** Resolve endpoint base URL (e.g. `http://127.0.0.1:3425/v1` or provider URL) */
    resolveBaseUrl: (params: {
        channelId: string;
        slotId: string;
        modelId: string;
    }) => Promise<string> | string;
    /** Resolve optional Bearer token for the selected channel/slot */
    resolveAuthToken?: (params: {
        channelId: string;
        slotId: string;
        modelId: string;
    }) => Promise<string | undefined> | string | undefined;
    /** Optional custom headers per channel */
    resolveExtraHeaders?: (params: {
        channelId: string;
        slotId: string;
        modelId: string;
    }) => Promise<Record<string, string> | undefined> | Record<string, string> | undefined;
    /** Optional custom fetch implementation (useful for testing or proxy injection) */
    customFetch?: typeof fetch;
}
export declare function buildOpenAiMessages(messages: readonly RequestMessage[], system?: string): Array<Record<string, unknown>>;
export declare function createOpenAiSseTransport(config: OpenAiSseTransportConfig): UpstreamStreamTransport;
