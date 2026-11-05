import { pathToFileURL } from 'node:url';
export async function inspectMagpieCommunityPlugin(pluginEntryPath) {
    try {
        const fileUrl = pathToFileURL(pluginEntryPath).href;
        const mod = await import(fileUrl);
        const exportKeys = Object.keys(mod);
        // Find plugin factory function (usually default export or named Plugin export)
        const factory = typeof mod.default === 'function'
            ? mod.default
            : Object.values(mod).find((v) => typeof v === 'function');
        if (typeof factory !== 'function') {
            return {
                pluginPath: pluginEntryPath,
                loaded: true,
                exportKeys,
                hookKeys: [],
                hasConfigHook: false,
                hasUsageHook: false,
                hasMagpieMeta: false,
                error: 'No factory function exported',
            };
        }
        // Invoke with minimal mock OpenCode/Magpie plugin context (never reading real credentials)
        const hooks = await factory({
            client: {},
            project: {},
            directory: process.cwd(),
            worktree: process.cwd(),
            $: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
        });
        const hookKeys = hooks && typeof hooks === 'object' ? Object.keys(hooks) : [];
        const authObj = hooks && typeof hooks.auth === 'object' && hooks.auth !== null
            ? hooks.auth
            : undefined;
        const authProvider = typeof authObj?.provider === 'string' ? authObj.provider : undefined;
        const rawMethods = Array.isArray(authObj?.methods) ? authObj.methods : [];
        const authMethods = rawMethods
            .filter((m) => typeof m === 'object' && m !== null)
            .map((m) => ({
            type: String(m.type ?? 'unknown'),
            label: String(m.label ?? ''),
        }));
        return {
            pluginPath: pluginEntryPath,
            loaded: true,
            exportKeys,
            hookKeys,
            authProvider,
            authMethods,
            hasConfigHook: typeof hooks?.config === 'function',
            hasUsageHook: typeof hooks?.usage === 'function' || typeof authObj?.usage === 'function',
            hasMagpieMeta: typeof hooks?.magpie === 'object' && hooks.magpie !== null,
        };
    }
    catch (err) {
        return {
            pluginPath: pluginEntryPath,
            loaded: false,
            exportKeys: [],
            hookKeys: [],
            hasConfigHook: false,
            hasUsageHook: false,
            hasMagpieMeta: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
// When launched via child_process.fork(), listen for IPC messages
if (typeof process.send === 'function') {
    process.on('message', async (msg) => {
        if (!msg || typeof msg !== 'object')
            return;
        const req = msg;
        if (req.type === 'inspect' && typeof req.id === 'string') {
            const result = await inspectMagpieCommunityPlugin(req.pluginEntryPath);
            const res = {
                id: req.id,
                ok: result.loaded && !result.error,
                result,
                error: result.error,
            };
            process.send?.(res);
        }
    });
}
