import { createHmac, randomBytes } from 'node:crypto';

export const PLACEHOLDER_PREFIX = '{{HF_SEC_';
export const PLACEHOLDER_SUFFIX = '}}';
export const PLACEHOLDER_EXACT_LEN = 19; // '{{HF_SEC_' (9) + 8 hex + '}}' (2)
export const PLACEHOLDER_REGEX = /\{\{HF_SEC_[0-9a-f]{8}\}\}/g;

/**
 * Built-in high-confidence secret patterns aligned with @deepseek-ai/dsh-client-ui-secret-mask
 * and common cloud/API token formats.
 */
const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  // OpenAI / DeepSeek / Anthropic sk- keys
  /\bsk-(?:proj-|ant-[a-z0-9-]+-)?[A-Za-z0-9_-]{20,}\b/g,
  // GitHub tokens
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  // AWS Access Key ID
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  // Google API key
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  // Slack tokens
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g,
  // Bearer / JWT three-part tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export class SecretVault {
  private salt: string;
  private placeholderToRaw = new Map<string, string>();
  private rawToPlaceholder = new Map<string, string>();
  private maskedCount = 0;

  constructor(salt?: string) {
    this.salt = salt ?? randomBytes(32).toString('hex');
  }

  getSalt(): string {
    return this.salt;
  }

  setSalt(salt: string): void {
    this.salt = salt;
  }

  getMaskedCount(): number {
    return this.maskedCount;
  }

  /**
   * Register an explicit secret value (for example containing quotes, newlines, or custom tokens)
   * and return its deterministic `{{HF_SEC_xxxxxxxx}}` placeholder.
   */
  registerSecret(rawSecret: string): string {
    if (!rawSecret) return rawSecret;
    const existing = this.rawToPlaceholder.get(rawSecret);
    if (existing) return existing;

    const digest = createHmac('sha256', this.salt)
      .update(rawSecret)
      .digest('hex')
      .slice(0, 8);
    const placeholder = `${PLACEHOLDER_PREFIX}${digest}${PLACEHOLDER_SUFFIX}`;
    this.rawToPlaceholder.set(rawSecret, placeholder);
    this.placeholderToRaw.set(placeholder, rawSecret);
    this.maskedCount += 1;
    return placeholder;
  }

  /**
   * Look up the raw secret for a placeholder, if registered.
   */
  resolvePlaceholder(placeholder: string): string | undefined {
    return this.placeholderToRaw.get(placeholder);
  }

  /**
   * Mask all recognized secret patterns and explicitly registered secrets in a text string.
   */
  maskText(input: string): string {
    if (!input) return input;
    let output = input;

    // 1. Replace any explicitly registered secrets first (longest first to avoid partial match)
    const explicitSecrets = [...this.rawToPlaceholder.keys()].sort(
      (a, b) => b.length - a.length,
    );
    for (const secret of explicitSecrets) {
      if (output.includes(secret)) {
        const placeholder = this.rawToPlaceholder.get(secret)!;
        output = output.split(secret).join(placeholder);
      }
    }

    // 2. Scan with built-in regex patterns
    for (const pattern of DEFAULT_SECRET_PATTERNS) {
      output = output.replace(pattern, (match) => this.registerSecret(match));
    }

    return output;
  }

  /**
   * Export vault entries for persistence in ctx.credentials if desired.
   */
  exportEntries(): Record<string, string> {
    return Object.fromEntries(this.placeholderToRaw.entries());
  }

  /**
   * Restore vault entries from persisted storage.
   */
  importEntries(entries: Record<string, string>): void {
    for (const [placeholder, raw] of Object.entries(entries)) {
      this.placeholderToRaw.set(placeholder, raw);
      this.rawToPlaceholder.set(raw, placeholder);
    }
  }
}

/**
 * Safely escape a raw secret so it can be spliced inside a JSON string literal
 * (such as `ToolCallBlock.arguments`) without breaking JSON syntax.
 */
export function escapeForJsonString(raw: string): string {
  return JSON.stringify(raw).slice(1, -1);
}
