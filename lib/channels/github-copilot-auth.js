const GITHUB_COPILOT_CLIENT_ID = '01ab8ac94e57ac42e852';
export async function startGitHubCopilotDeviceFlow(customFetch = fetch) {
    const res = await customFetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: GITHUB_COPILOT_CLIENT_ID,
            scope: 'read:user',
        }),
    });
    if (!res.ok) {
        throw new Error(`Failed to request GitHub device code: HTTP ${res.status}`);
    }
    const data = (await res.json());
    return {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        expiresIn: data.expires_in,
        interval: data.interval ?? 5,
    };
}
export async function pollGitHubCopilotDeviceFlow(deviceCode, customFetch = fetch) {
    const res = await customFetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: GITHUB_COPILOT_CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
    });
    if (!res.ok) {
        return { status: 'error', error: `HTTP ${res.status}` };
    }
    const data = (await res.json());
    if (data.access_token) {
        return { status: 'authorized', accessToken: data.access_token };
    }
    if (data.error === 'authorization_pending') {
        return { status: 'pending' };
    }
    if (data.error === 'expired_token') {
        return { status: 'expired', error: 'Device code expired' };
    }
    return { status: 'error', error: data.error_description || data.error };
}
