export interface PluginInspectionResult {
    pluginPath: string;
    loaded: boolean;
    exportKeys: string[];
    hookKeys: string[];
    authProvider?: string;
    authMethods?: Array<{
        type: string;
        label: string;
    }>;
    hasConfigHook: boolean;
    hasUsageHook: boolean;
    hasMagpieMeta: boolean;
    error?: string;
}
export interface WorkerRequestMessage {
    id: string;
    type: 'inspect';
    pluginEntryPath: string;
}
export interface WorkerResponseMessage {
    id: string;
    ok: boolean;
    result?: PluginInspectionResult;
    error?: string;
}
export declare function inspectMagpieCommunityPlugin(pluginEntryPath: string): Promise<PluginInspectionResult>;
