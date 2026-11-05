export type HitchfinRuntimeMode = 'auto' | 'bridge' | 'standalone';

export type RoutingStrategy = 'order' | 'rotate' | 'smart' | 'pace';

export type AccountHealthState =
  | 'Healthy'
  | 'Cooldown'
  | 'QuotaExhausted'
  | 'ReauthRequired'
  | 'Disabled';

export interface QuotaWindowSnapshot {
  /** e.g. "5h", "7d", "monthly", "credits" */
  windowLabel: string;
  /** Remaining percentage [0..100] */
  remainingPercent: number;
  /** Optional ISO timestamp when window resets */
  resetAt?: string;
  /** Confidence level of quota source */
  confidence: 'exact' | 'estimated' | 'local-meter';
}

export interface AccountSlotSummary {
  slotId: string;
  channelId: string;
  label: string;
  state: AccountHealthState;
  cooldownUntil?: number;
  quotas: QuotaWindowSnapshot[];
  lastUsedAt?: number;
  baseUrl?: string;
  models?: string[];
}

export interface AutonomousAccountConfig {
  channelId: string;
  slotId: string;
  label: string;
  authType: 'api-key' | 'oauth' | 'bearer';
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  baseUrl?: string;
  models?: string[];
  updatedAt: number;
}

export interface ChannelPreset {
  channelId: string;
  name: string;
  defaultBaseUrl: string;
  defaultModels: string[];
  authType: 'api-key' | 'oauth' | 'bearer';
  placeholder: string;
  description: string;
}

export const CHANNEL_PRESETS: ChannelPreset[] = [
  {
    channelId: 'deepseek',
    name: 'DeepSeek 官方',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
    authType: 'api-key',
    placeholder: 'sk-...',
    description: 'DeepSeek 官方开放平台 API (V3 / R1)',
  },
  {
    channelId: 'openai-codex',
    name: 'OpenAI Codex / ChatGPT',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    authType: 'api-key',
    placeholder: 'sk-... 或 Session Token',
    description: 'OpenAI 官方 API 或 ChatGPT 订阅 Token',
  },
  {
    channelId: 'copilot',
    name: 'GitHub Copilot',
    defaultBaseUrl: 'https://api.githubcopilot.com',
    defaultModels: ['copilot-gpt-4o', 'copilot-claude-3.5-sonnet', 'copilot-o1'],
    authType: 'oauth',
    placeholder: 'ghu_... 或 Copilot Token',
    description: 'GitHub Copilot 订阅 Token / 凭证',
  },
  {
    channelId: 'claude',
    name: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModels: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    authType: 'api-key',
    placeholder: 'sk-ant-...',
    description: 'Anthropic 官方 API 或 Claude 订阅 Token',
  },
  {
    channelId: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    authType: 'api-key',
    placeholder: 'AIzaSy...',
    description: 'Google AI Studio / Gemini API 接口',
  },
  {
    channelId: 'trae-cn',
    name: 'Trae CN',
    defaultBaseUrl: 'https://api.trae.ai/v1',
    defaultModels: ['trae-claude-3.5-sonnet', 'trae-gpt-4o'],
    authType: 'api-key',
    placeholder: 'trae_token_...',
    description: '字节跳动 Trae 订阅账号 Token',
  },
  {
    channelId: 'workbuddy',
    name: 'WorkBuddy',
    defaultBaseUrl: 'https://api.workbuddy.cn/v1',
    defaultModels: ['workbuddy-chat', 'workbuddy-code'],
    authType: 'api-key',
    placeholder: 'wb_token_...',
    description: 'WorkBuddy 商业版订阅凭证',
  },
  {
    channelId: 'zcode',
    name: 'ZCode',
    defaultBaseUrl: 'https://api.zcode.ai/v1',
    defaultModels: ['zcode-pro', 'zcode-fast'],
    authType: 'api-key',
    placeholder: 'zc_token_...',
    description: 'ZCode 编程助手订阅账号',
  },
  {
    channelId: 'custom',
    name: '自定义 OpenAI 兼容接口',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o', 'deepseek-chat'],
    authType: 'api-key',
    placeholder: 'sk-...',
    description: '第三方中转、OneAPI、NewAPI、Ollama、vLLM 或本地模型服务',
  },
];

export interface ChannelSummary {
  channelId: string;
  displayName: string;
  source: 'magpie-bridge' | 'native-oauth' | 'community-plugin' | 'api-key';
  complianceTier: 'low' | 'medium' | 'high';
  activeAccounts: number;
  totalAccounts: number;
  models: string[];
}

export interface RoutingGroupConfig {
  groupId: string;
  displayName: string;
  strategy: RoutingStrategy;
  members: Array<{
    channelId: string;
    modelId: string;
    weight?: number;
  }>;
}

export interface MaskingPolicyConfig {
  enabled: boolean;
  blockHighRiskTools: boolean;
  highRiskToolNames: string[];
}

export interface HitchfinStatusSnapshot {
  mode: HitchfinRuntimeMode;
  activeMode: 'bridge' | 'standalone';
  magpieBridgeReachable: boolean;
  magpieEndpoint: string;
  defaultStrategy?: RoutingStrategy;
  presets?: ChannelPreset[];
  channels: ChannelSummary[];
  accounts: AccountSlotSummary[];
  routingGroups: RoutingGroupConfig[];
  masking: MaskingPolicyConfig;
  stats: {
    maskedSecretsCount: number;
    blockedExfiltrationsCount: number;
    failoverCount: number;
  };
}
