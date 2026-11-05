import { type ChildProcess } from 'node:child_process';
import type { PluginInspectionResult } from './plugin-worker.js';
export declare class MagpiePluginWorkerHost {
    private readonly workerScriptPath?;
    private child;
    private pending;
    constructor(workerScriptPath?: string | undefined);
    private resolveWorkerPath;
    ensureStarted(): ChildProcess;
    inspectPlugin(pluginEntryPath: string, timeoutMs?: number): Promise<PluginInspectionResult>;
    dispose(): Promise<void>;
}
