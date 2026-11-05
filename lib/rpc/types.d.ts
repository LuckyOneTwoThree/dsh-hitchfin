export type HitchfinRuntimeMode = 'auto' | 'bridge' | 'standalone';
export type RoutingStrategy = 'order' | 'rotate' | 'smart' | 'pace';
export type AccountHealthState = 'Healthy' | 'Cooldown' | 'QuotaExhausted' | 'ReauthRequired' | 'Disabled';
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
    candidateModels?: string[];
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
    candidateModels?: string[];
    updatedAt: number;
}
export interface DiscoveredSubscriptionSummary {
    id: string;
    source: string;
    channelId: string;
    providerName: string;
    user: string;
    plan: string;
    hasToken: boolean;
    baseUrl: string;
    models: string[];
    candidateModels?: string[];
    quotas?: QuotaWindowSnapshot[];
    slotId: string;
    label: string;
}
export interface ChannelPreset {
    channelId: string;
    name: string;
    planName: string;
    defaultBaseUrl: string;
    defaultModels: string[];
    candidateModels: string[];
    authType: 'oauth' | 'bearer' | 'api-key';
    placeholder: string;
    description: string;
}
export declare const CHANNEL_PRESETS: ChannelPreset[];
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
    discoveredSubscriptions?: DiscoveredSubscriptionSummary[];
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
