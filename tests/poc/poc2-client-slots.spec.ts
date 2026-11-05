import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from '../helpers/expect.ts';

describe('POC-2: Client bundle window.__ModuleLoader__.load & native UI slot mounting', () => {
  it('loads built client/client.js via window.__ModuleLoader__.load and registers all 4 UI slot contributions', () => {
    const clientBundlePath = resolve(process.cwd(), 'client/client.js');
    const code = readFileSync(clientBundlePath, 'utf8');

    let registeredId = '';
    let registeredFactory: ((req: (id: string) => unknown) => Record<string, unknown>) | null =
      null;

    const fakeWindow = {
      __ModuleLoader__: {
        load(entry: {
          id: string;
          factory: (req: (id: string) => unknown) => Record<string, unknown>;
        }) {
          registeredId = entry.id;
          registeredFactory = entry.factory;
        },
      },
    };

    const runner = new Function('window', code);
    runner(fakeWindow);

    expect(registeredId).toBe('dsh-hitchfin');
    expect(typeof registeredFactory).toBe('function');

    const nodeRequire = createRequire(import.meta.url);
    const customRequire = (spec: string) => {
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
        return {
          Tag: ({ children }: { children: unknown }) => children,
        };
      }
      return nodeRequire(spec);
    };

    const exportsObj = registeredFactory!(customRequire) as {
      name: string;
      inject: string[];
      apply: (ctx: unknown) => void;
    };

    expect(exportsObj.name).toBe('dsh-hitchfin');
    expect(exportsObj.inject).toEqual(['slots', 'locale']);

    const registeredSlots: Array<{
      slotName: string;
      options: Record<string, unknown>;
    }> = [];
    let registeredLocaleNs = '';

    const mockClientCtx = {
      effect(fn: () => void) {
        fn();
      },
      locale: {
        register(ns: string) {
          registeredLocaleNs = ns;
          return () => {};
        },
      },
      slots: {
        inject(slotName: string, cb: () => () => void) {
          cb();
        },
        register(options: Record<string, unknown>, _component: unknown) {
          registeredSlots.push({
            slotName: String(options.name),
            options,
          });
          return () => {};
        },
      },
    };

    exportsObj.apply(mockClientCtx);

    expect(registeredLocaleNs).toBe('dsh-hitchfin');
    expect(registeredSlots.map((s) => s.slotName)).toEqual([
      'conversation.input.model.label',
      'conversation.input.right',
      'settings.section',
      'settings.section',
    ]);
  });
});
