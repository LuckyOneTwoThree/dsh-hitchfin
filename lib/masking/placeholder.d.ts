import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
export declare const PLACEHOLDER_PREFIX = "{{HF_SEC_";
export declare const PLACEHOLDER_SUFFIX = "}}";
export declare const PLACEHOLDER_EXACT_LEN = 19;
export declare const PLACEHOLDER_REGEX: RegExp;
export declare class SecretVault {
    private salt;
    private placeholderToRaw;
    private rawToPlaceholder;
    private maskedCount;
    constructor(salt?: string);
    getSalt(): string;
    setSalt(salt: string): void;
    getMaskedCount(): number;
    /**
     * Register an explicit secret value (for example containing quotes, newlines, or custom tokens)
     * and return its deterministic `{{HF_SEC_xxxxxxxx}}` placeholder.
     */
    registerSecret(rawSecret: string): string;
    /**
     * Look up the raw secret for a placeholder, if registered.
     */
    resolvePlaceholder(placeholder: string): string | undefined;
    /**
     * Mask all recognized secret patterns and explicitly registered secrets in a text string.
     */
    maskText(input: string): string;
    /**
     * Export vault entries for persistence in ctx.credentials if desired.
     */
    exportEntries(): Record<string, string>;
    /**
     * Restore vault entries from persisted storage.
     */
    importEntries(entries: Record<string, string>): void;
    /**
     * Persist salt + placeholder table into `ctx.credentials` (`dsh-hitchfin/masking-vault`)
     * so placeholders remain resolvable across Host restarts.
     */
    saveToCredentials(credentials: CredentialProvider): Promise<void>;
    /**
     * Load persisted salt + placeholder table from `ctx.credentials` (`dsh-hitchfin/masking-vault`).
     */
    loadFromCredentials(credentials: CredentialProvider): Promise<boolean>;
}
/**
 * Safely escape a raw secret so it can be spliced inside a JSON string literal
 * (such as `ToolCallBlock.arguments`) without breaking JSON syntax.
 */
export declare function escapeForJsonString(raw: string): string;
