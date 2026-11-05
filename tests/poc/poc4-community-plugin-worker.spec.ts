import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '../helpers/expect.ts';
import { MagpiePluginWorkerHost } from '../../lib/index.js';

describe('POC-4: Isolated child_process.fork worker for @magpie-community plugins', () => {
  it('loads local @magpie-community/opencode-{workbuddy,trae,zcode}-auth in a forked subprocess and inspects hooks', async () => {
    const builtWorkerPath = resolve(process.cwd(), 'lib/channels/plugin-worker.js');
    const host = new MagpiePluginWorkerHost(builtWorkerPath);

    try {
      const pluginsBase = join(
        homedir(),
        '.config',
        'magpie',
        'plugins',
        'node_modules',
        '@magpie-community',
      );
      const pluginNames = [
        'opencode-workbuddy-auth',
        'opencode-trae-auth',
        'opencode-zcode-auth',
      ];

      let inspectedCount = 0;
      for (const pkgName of pluginNames) {
        const entryPath = join(pluginsBase, pkgName, 'opencode.mjs');
        if (!existsSync(entryPath)) {
          continue;
        }
        const res = await host.inspectPlugin(entryPath, 10_000);
        expect(res.loaded).toBe(true);
        expect(res.error).toBeUndefined();
        expect(res.hookKeys).toContain('auth');
        expect(typeof res.authProvider).toBe('string');
        expect(Array.isArray(res.authMethods)).toBe(true);
        inspectedCount += 1;
      }
      expect(inspectedCount).toBe(3);
    } finally {
      await host.dispose();
    }
  });
});
