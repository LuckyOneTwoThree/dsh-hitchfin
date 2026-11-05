import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  PluginInspectionResult,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './plugin-worker.js';

export class MagpiePluginWorkerHost {
  private child: ChildProcess | null = null;
  private pending = new Map<
    string,
    {
      resolve: (res: PluginInspectionResult) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(private readonly workerScriptPath?: string) {}

  private resolveWorkerPath(): string {
    if (this.workerScriptPath) return this.workerScriptPath;
    const currentDir = dirname(fileURLToPath(import.meta.url));
    return resolve(currentDir, 'plugin-worker.js');
  }

  ensureStarted(): ChildProcess {
    if (this.child && !this.child.killed && this.child.connected) {
      return this.child;
    }

    const scriptPath = this.resolveWorkerPath();
    const child = fork(scriptPath, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });

    child.on('message', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const msg = raw as WorkerResponseMessage;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(msg.id);
      if (msg.result) {
        entry.resolve(msg.result);
      } else {
        entry.reject(new Error(msg.error ?? 'Unknown plugin worker error'));
      }
    });

    child.on('exit', (code, signal) => {
      for (const [, entry] of this.pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(
          new Error(
            `MagpiePluginWorker exited unexpectedly (code=${String(code)}, signal=${String(signal)})`,
          ),
        );
      }
      this.pending.clear();
      if (this.child === child) {
        this.child = null;
      }
    });

    this.child = child;
    return child;
  }

  async inspectPlugin(
    pluginEntryPath: string,
    timeoutMs = 10_000,
  ): Promise<PluginInspectionResult> {
    const child = this.ensureStarted();
    const id = randomUUID();
    return new Promise<PluginInspectionResult>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(
          new Error(`MagpiePluginWorker inspect timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolvePromise,
        reject: rejectPromise,
        timer,
      });

      const req: WorkerRequestMessage = {
        id,
        type: 'inspect',
        pluginEntryPath,
      };
      child.send(req);
    });
  }

  async dispose(): Promise<void> {
    const child = this.child;
    this.child = null;
    for (const [, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('MagpiePluginWorkerHost disposed'));
    }
    this.pending.clear();
    if (child && !child.killed) {
      child.kill('SIGTERM');
    }
  }
}
