export interface DeviceCodeStartResult {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
}
export interface DeviceCodePollResult {
    status: 'pending' | 'authorized' | 'expired' | 'error';
    accessToken?: string;
    error?: string;
}
export declare function startGitHubCopilotDeviceFlow(customFetch?: typeof fetch): Promise<DeviceCodeStartResult>;
export declare function pollGitHubCopilotDeviceFlow(deviceCode: string, customFetch?: typeof fetch): Promise<DeviceCodePollResult>;
