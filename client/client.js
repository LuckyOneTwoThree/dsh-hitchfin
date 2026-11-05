window.__ModuleLoader__.load({
  id: "dsh-hitchfin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  HitchfinComposerQuotaCapsule: () => HitchfinComposerQuotaCapsule,
  HitchfinModelLabel: () => HitchfinModelLabel,
  HitchfinUnifiedSettingsDashboard: () => HitchfinUnifiedSettingsDashboard,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/rpc/types.ts
var CHANNEL_PRESETS = [
  {
    channelId: "codex",
    name: "ChatGPT / OpenAI Codex",
    planName: "ChatGPT Plus / Team / Pro \u5957\u9910",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    candidateModels: [
      "gpt-4o",
      "gpt-4o-mini",
      "o1",
      "o1-mini",
      "o3-mini",
      "gpt-4-turbo",
      "gpt-4.5-preview"
    ],
    authType: "oauth",
    placeholder: "ChatGPT Session Token \u6216 Refresh Token",
    description: "\u5B98\u65B9 ChatGPT \u8D26\u53F7\u5957\u9910\uFF0C\u652F\u6301 GPT-4o / o1 / o3-mini \u6A21\u578B"
  },
  {
    channelId: "copilot",
    name: "GitHub Copilot",
    planName: "Copilot Individual / Business \u8BA2\u9605",
    defaultBaseUrl: "https://api.githubcopilot.com",
    defaultModels: ["copilot-gpt-4o", "copilot-claude-3.5-sonnet", "copilot-o1"],
    candidateModels: [
      "copilot-gpt-4o",
      "copilot-claude-3.5-sonnet",
      "copilot-o1",
      "copilot-gpt-4o-mini",
      "copilot-o3-mini"
    ],
    authType: "oauth",
    placeholder: "GitHub \u8BBE\u5907\u7801\u6388\u6743\u6216 ghu_... \u4EE4\u724C",
    description: "GitHub Copilot \u5B98\u65B9\u8BA2\u9605\uFF0C\u652F\u6301\u8BBE\u5907\u7801\u4E00\u952E\u6388\u6743"
  },
  {
    channelId: "trae-cn",
    name: "Trae CN (\u5B57\u8282\u8DF3\u52A8)",
    planName: "Trae \u5B98\u65B9\u79EF\u5206 / \u6A21\u578B\u5957\u9910",
    defaultBaseUrl: "https://trae-api-cn.mchost.guru",
    defaultModels: [
      "Doubao-Seed-2.1-Pro",
      "Doubao-Seed-2.1-Turbo",
      "Doubao-Seed-Evolving",
      "deepseek-v4.1-flash"
    ],
    candidateModels: [
      "Doubao-Seed-2.1-Pro",
      "Doubao-Seed-2.1-Pro-max",
      "Doubao-Seed-2.1-Turbo",
      "Doubao-Seed-Evolving",
      "Doubao-Seed-Evolving-max",
      "Doubao_1_6",
      "Doubao-Seed-Code",
      "deepseek-v4.1-flash",
      "deepseek-v4.1-flash-max",
      "DeepSeek-V4-Flash",
      "DeepSeek-V4-Pro",
      "glm-5.3-flash",
      "glm-5.3-flash-max",
      "glm-5.3",
      "glm-5.2",
      "mimo-v2.6-flash",
      "mimo-v2.6-flash-max",
      "mimo-v2.6-pro",
      "mimo-v2.6-pro-max",
      "minimax-m3.1-flash",
      "minimax-m3",
      "kimi-k3.1-pro",
      "kimi-k3",
      "kimi-k2.7-code",
      "qwen3.8-flash",
      "qwen3.8-max",
      "qwen-3.7-plus"
    ],
    authType: "oauth",
    placeholder: "Trae \u5B98\u65B9\u7F51\u9875\u6388\u6743\u6216 Cloud-IDE-JWT",
    description: "\u5B57\u8282\u8DF3\u52A8 Trae \u5B98\u65B9\u5957\u9910\uFF0C\u652F\u6301\u6BCF\u65E5\u7B7E\u5230\u4E0E\u8C46\u5305\u5927\u6A21\u578B"
  },
  {
    channelId: "workbuddy",
    name: "WorkBuddy (\u817E\u8BAF\u6DF7\u5143)",
    planName: "WorkBuddy \u5546\u4E1A / \u514D\u8D39\u5957\u9910",
    defaultBaseUrl: "https://copilot.tencent.com/v2",
    defaultModels: ["hy4free", "hy4std", "hy3", "deepseek-v4.1-flash"],
    candidateModels: [
      "hy4free",
      "hy4std",
      "hy3",
      "hy3-x",
      "deepseek-v4.1-flash",
      "deepseek-v4-pro",
      "glm-5.3-flash",
      "glm-5.3",
      "glm-5.2",
      "minimax-m3.1-flash",
      "minimax-m3",
      "kimi-k3.1-pro",
      "mimo-v2.6-pro"
    ],
    authType: "oauth",
    placeholder: "\u817E\u8BAF WorkBuddy \u5B98\u65B9\u7F51\u9875\u6388\u6743\u6216 Token",
    description: "\u817E\u8BAF\u6DF7\u5143 WorkBuddy \u5B98\u65B9\u8BA2\u9605\uFF0C\u652F\u6301 DeepSeek \u4E0E\u6DF7\u5143\u5927\u6A21\u578B"
  },
  {
    channelId: "zcode",
    name: "ZCode (\u667A\u8C31 GLM)",
    planName: "\u667A\u8C31 BigModel GLM Coding Plan",
    defaultBaseUrl: "https://open.bigmodel.cn/api/anthropic",
    defaultModels: ["GLM-5.3-Flash", "GLM-5.2", "GLM-5-Turbo"],
    candidateModels: [
      "GLM-5.3-Flash",
      "GLM-5.2",
      "GLM-5-Turbo",
      "glm-5.1",
      "glm-5",
      "glm-4.7",
      "glm-4.6"
    ],
    authType: "oauth",
    placeholder: "\u667A\u8C31 ZCode Coding Plan Token",
    description: "\u667A\u8C31 AI \u5B98\u65B9 GLM Coding Plan \u7F16\u7A0B\u5957\u9910"
  },
  {
    channelId: "claude",
    name: "Anthropic Claude",
    planName: "Claude Pro / Team \u5B98\u65B9\u5957\u9910",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModels: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229"
    ],
    candidateModels: [
      "claude-3-7-sonnet",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229"
    ],
    authType: "oauth",
    placeholder: "Claude sessionKey \u6216 Setup Token",
    description: "Anthropic \u5B98\u65B9 Claude Pro / Team \u8BA2\u9605\u5957\u9910"
  },
  {
    channelId: "gemini",
    name: "Google Gemini",
    planName: "Gemini Advanced \u5B98\u65B9\u5957\u9910",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModels: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    candidateModels: [
      "gemini-2.0-flash",
      "gemini-2.0-flash-thinking-exp",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b"
    ],
    authType: "oauth",
    placeholder: "Google OAuth Token \u6216 Gemini \u51ED\u8BC1",
    description: "Google \u5B98\u65B9 Gemini Advanced \u8BA2\u9605\u4E0E Code Assist \u5957\u9910"
  },
  {
    channelId: "deepseek",
    name: "DeepSeek \u5B98\u65B9",
    planName: "DeepSeek \u5B98\u65B9\u5E73\u53F0",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    candidateModels: ["deepseek-chat", "deepseek-reasoner"],
    authType: "api-key",
    placeholder: "sk-...",
    description: "DeepSeek \u5B98\u65B9\u5F00\u653E\u5E73\u53F0 (V3 / R1 \u63A8\u7406)"
  },
  {
    channelId: "custom",
    name: "\u81EA\u5B9A\u4E49\u517C\u5BB9\u63A5\u53E3",
    planName: "\u7B2C\u4E09\u65B9\u517C\u5BB9\u63A5\u53E3",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: ["gpt-4o", "deepseek-chat"],
    candidateModels: ["gpt-4o", "gpt-4o-mini", "deepseek-chat", "deepseek-reasoner", "claude-3-5-sonnet"],
    authType: "api-key",
    placeholder: "Bearer Token / API Key",
    description: "\u672C\u5730\u6216\u4E2D\u8F6C\u670D\u52A1\uFF08Ollama\u3001vLLM\u3001OneAPI \u7B49\uFF09"
  }
];

// src/client/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-hitchfin";
var inject = ["slots", "locale"];
var zh = {
  "nav.unified": "Hitchfin \u8BA2\u9605\u4E0E\u8DEF\u7531",
  "badge.quota": "{window} {percent}%",
  "capsule.title": "\u8BA2\u9605\u989D\u5EA6\u4E0E\u8D26\u53F7\u6C60"
};
var en = {
  "nav.unified": "Hitchfin Subscriptions & Routing",
  "badge.quota": "{window} {percent}%",
  "capsule.title": "Subscription Quota & Accounts"
};
var FALLBACK_SNAPSHOT = {
  mode: "auto",
  activeMode: "standalone",
  magpieBridgeReachable: false,
  magpieEndpoint: "http://127.0.0.1:3425",
  defaultStrategy: "smart",
  presets: CHANNEL_PRESETS,
  discoveredSubscriptions: [],
  channels: [],
  accounts: [],
  routingGroups: [],
  masking: {
    enabled: true,
    blockHighRiskTools: true,
    highRiskToolNames: ["bash", "run_command", "curl", "web_fetch"]
  },
  stats: {
    maskedSecretsCount: 0,
    blockedExfiltrationsCount: 0,
    failoverCount: 0
  }
};
var cachedSnapshot = FALLBACK_SNAPSHOT;
var listeners = /* @__PURE__ */ new Set();
function notifySnapshot(next) {
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener(next);
  }
}
async function fetchHitchfinStatus() {
  if (typeof fetch !== "function") return cachedSnapshot;
  try {
    const res = await fetch("/api/hitchfin/status", {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (res.ok) {
      const data = await res.json();
      notifySnapshot(data);
      return data;
    }
  } catch {
  }
  return cachedSnapshot;
}
function useHitchfinStatus() {
  const [status, setStatus] = (0, import_react.useState)(cachedSnapshot);
  const [busy, setBusy] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    listeners.add(setStatus);
    void fetchHitchfinStatus();
    return () => {
      listeners.delete(setStatus);
    };
  }, []);
  const refresh = (0, import_react.useCallback)(async () => {
    if (typeof fetch !== "function") return;
    setBusy(true);
    try {
      const res = await fetch("/api/hitchfin/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (res.ok) {
        notifySnapshot(await res.json());
      }
    } finally {
      setBusy(false);
    }
  }, []);
  const setMode = (0, import_react.useCallback)(async (mode) => {
    if (typeof fetch !== "function") return;
    setBusy(true);
    try {
      const res = await fetch("/api/hitchfin/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        notifySnapshot(await res.json());
      }
    } finally {
      setBusy(false);
    }
  }, []);
  const updateMasking = (0, import_react.useCallback)(
    async (patch) => {
      if (typeof fetch !== "function") return;
      setBusy(true);
      try {
        const res = await fetch("/api/hitchfin/masking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        });
        if (res.ok) {
          notifySnapshot(await res.json());
        }
      } finally {
        setBusy(false);
      }
    },
    []
  );
  const addAccount = (0, import_react.useCallback)(
    async (params) => {
      if (typeof fetch !== "function") return;
      setBusy(true);
      try {
        const res = await fetch("/api/hitchfin/account/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params)
        });
        if (res.ok) {
          notifySnapshot(await res.json());
          return true;
        }
        const err = await res.json().catch(() => ({ error: "\u6DFB\u52A0\u8D26\u53F7\u5931\u8D25" }));
        throw new Error(err.error || "\u6DFB\u52A0\u8D26\u53F7\u5931\u8D25");
      } finally {
        setBusy(false);
      }
    },
    []
  );
  const removeAccount = (0, import_react.useCallback)(
    async (channelId, slotId) => {
      if (typeof fetch !== "function") return;
      setBusy(true);
      try {
        const res = await fetch("/api/hitchfin/account/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, slotId })
        });
        if (res.ok) {
          notifySnapshot(await res.json());
          return true;
        }
      } finally {
        setBusy(false);
      }
    },
    []
  );
  const updateStrategy = (0, import_react.useCallback)(async (strategy) => {
    if (typeof fetch !== "function") return;
    setBusy(true);
    try {
      const res = await fetch("/api/hitchfin/routing/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy })
      });
      if (res.ok) {
        notifySnapshot(await res.json());
      }
    } finally {
      setBusy(false);
    }
  }, []);
  const importSubscriptions = (0, import_react.useCallback)(
    async (accountIds) => {
      if (typeof fetch !== "function") throw new Error("fetch unavailable");
      setBusy(true);
      try {
        const res = await fetch("/api/hitchfin/import-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            accountIds === "all" ? { all: true } : { accountIds }
          )
        });
        if (res.ok) {
          notifySnapshot(await res.json());
          return true;
        }
        const err = await res.json().catch(() => ({ error: `\u540C\u6B65\u5931\u8D25 (${res.status})` }));
        throw new Error(err.error || `\u540C\u6B65\u5931\u8D25 (${res.status})`);
      } finally {
        setBusy(false);
      }
    },
    []
  );
  const updateModels = (0, import_react.useCallback)(
    async (channelId, slotId, models) => {
      if (typeof fetch !== "function") throw new Error("fetch unavailable");
      setBusy(true);
      try {
        const res = await fetch("/api/hitchfin/account/update-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, slotId, models })
        });
        if (res.ok) {
          notifySnapshot(await res.json());
          return true;
        }
        const err = await res.json().catch(() => ({ error: `\u66F4\u65B0\u6A21\u578B\u5931\u8D25 (${res.status})` }));
        throw new Error(err.error || `\u66F4\u65B0\u6A21\u578B\u5931\u8D25 (${res.status})`);
      } finally {
        setBusy(false);
      }
    },
    []
  );
  const startCopilotAuth = (0, import_react.useCallback)(async () => {
    if (typeof fetch !== "function") throw new Error("fetch unavailable");
    const res = await fetch("/api/hitchfin/auth/copilot/device-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    if (res.ok) {
      return await res.json();
    }
    const err = await res.json().catch(() => ({ error: "\u542F\u52A8 GitHub Copilot \u8BA4\u8BC1\u5931\u8D25" }));
    throw new Error(err.error || "\u542F\u52A8 GitHub Copilot \u8BA4\u8BC1\u5931\u8D25");
  }, []);
  const pollCopilotAuth = (0, import_react.useCallback)(async (deviceCode) => {
    if (typeof fetch !== "function") throw new Error("fetch unavailable");
    const res = await fetch("/api/hitchfin/auth/copilot/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === "authorized") {
        void fetchHitchfinStatus();
      }
      return data;
    }
    const err = await res.json().catch(() => ({ error: "\u8F6E\u8BE2 Copilot \u72B6\u6001\u5F02\u5E38" }));
    throw new Error(err.error || "\u8F6E\u8BE2 Copilot \u72B6\u6001\u5F02\u5E38");
  }, []);
  return {
    status,
    busy,
    refresh,
    setMode,
    updateMasking,
    addAccount,
    removeAccount,
    updateStrategy,
    importSubscriptions,
    updateModels,
    startCopilotAuth,
    pollCopilotAuth
  };
}
function HitchfinModelLabel({ provider, model }) {
  const isHitchfin = provider.id.startsWith("hitchfin");
  if (!isHitchfin) {
    return model.name;
  }
  const slot = cachedSnapshot.accounts.find(
    (a) => (a.channelId === provider.id || `hitchfin-${a.channelId}` === provider.id) && a.state === "Healthy"
  );
  const topQuota = slot?.quotas?.[0];
  const badgeText = topQuota ? topQuota.remainingPercent < 100 ? `${topQuota.windowLabel}` : topQuota.windowLabel || "\u5957\u9910\u53EF\u7528" : "\u5957\u9910\u53EF\u7528";
  const tone = topQuota && topQuota.remainingPercent <= 20 ? "warning" : "success";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        whiteSpace: "nowrap",
        verticalAlign: "baseline"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: model.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone, children: badgeText })
      ]
    }
  );
}
function HitchfinComposerQuotaCapsule() {
  const [open, setOpen] = (0, import_react.useState)(false);
  const { status, busy, refresh } = useHitchfinStatus();
  const healthyCount = status.accounts.filter(
    (a) => a.state === "Healthy"
  ).length;
  const primaryQuota = status.accounts[0]?.quotas?.[0];
  const summaryPercent = primaryQuota ? primaryQuota.remainingPercent : 100;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        position: "relative",
        display: "inline-flex",
        alignItems: "center"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            onClick: () => setOpen((v) => !v),
            style: {
              fontSize: "12px",
              padding: "2px 8px",
              borderRadius: "999px",
              border: "1px solid rgba(128,128,128,0.3)",
              background: "transparent",
              cursor: "pointer"
            },
            title: "Hitchfin \u5B98\u65B9\u5957\u9910\u989D\u5EA6\u4E0E\u8BA2\u9605\u6C60",
            children: [
              "HF \u5957\u9910 \xB7 ",
              summaryPercent,
              "%"
            ]
          }
        ),
        open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              position: "absolute",
              bottom: "120%",
              right: 0,
              minWidth: "270px",
              padding: "12px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(128,128,128,0.25)",
              background: "var(--dsw-alias-bg-layer-2, #1e1e1e)",
              color: "var(--dsw-alias-text-primary, #f0f0f0)",
              fontSize: "12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              zIndex: 1e3
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "\u5B98\u65B9\u5957\u9910\u8BA2\u9605\u6C60" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        disabled: busy,
                        onClick: () => void refresh(),
                        style: {
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          border: "1px solid rgba(128,128,128,0.3)",
                          background: "transparent",
                          cursor: "pointer"
                        },
                        children: busy ? "..." : "\u5237\u65B0"
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginBottom: "4px" }, children: [
                "\u5DF2\u63A5\u5165\u5957\u9910\u8D26\u53F7: ",
                status.accounts.length,
                " \xB7 \u6B63\u5E38\u53EF\u7528: ",
                healthyCount
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginBottom: "4px" }, children: [
                "\u8C03\u5EA6\u7B56\u7565: ",
                status.defaultStrategy ?? "smart"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                "\u51FA\u7AD9\u8131\u654F: ",
                status.masking.enabled ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED",
                " (\u5DF2\u4FDD\u62A4",
                " ",
                status.stats.maskedSecretsCount,
                " \u6B21)"
              ] })
            ]
          }
        )
      ]
    }
  );
}
function AccountModelEditor({
  currentModels,
  candidateModels,
  defaultModels,
  onSave,
  onClose
}) {
  const [selected, setSelected] = (0, import_react.useState)(
    () => new Set(currentModels && currentModels.length > 0 ? currentModels : defaultModels)
  );
  const [search, setSearch] = (0, import_react.useState)("");
  const [customModel, setCustomModel] = (0, import_react.useState)("");
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [saveMsg, setSaveMsg] = (0, import_react.useState)("");
  const allAvailable = Array.from(
    /* @__PURE__ */ new Set([...candidateModels, ...currentModels, ...defaultModels])
  );
  const filtered = allAvailable.filter(
    (m) => m.toLowerCase().includes(search.trim().toLowerCase())
  );
  const toggleModel = (m) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(allAvailable));
  const clearAll = () => setSelected(/* @__PURE__ */ new Set());
  const resetDefaults = () => setSelected(new Set(defaultModels));
  const handleAddCustom = (e) => {
    if (e) e.preventDefault();
    const trimmed = customModel.trim();
    if (!trimmed) return;
    setSelected((prev) => /* @__PURE__ */ new Set([...prev, trimmed]));
    setCustomModel("");
  };
  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      await onSave(Array.from(selected));
      setSaveMsg("\u2713 \u5DF2\u6210\u529F\u4FDD\u5B58\u5E76\u5728 DSH \u6A21\u578B\u5217\u8868\u751F\u6548\uFF01");
      setTimeout(() => {
        setSaveMsg("");
        onClose();
      }, 1200);
    } catch (err) {
      setSaveMsg(`\u26A0\uFE0F ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        marginTop: "10px",
        padding: "14px",
        borderRadius: "8px",
        border: "1.5px solid #10b981",
        background: "var(--dsw-alias-bg-layer-1, #1e1e1e)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        boxShadow: "0 4px 12px rgba(16,185,129,0.12)"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontWeight: 600, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u2699\uFE0F \u81EA\u5B9A\u4E49\u8981\u5728 DSH \u6A21\u578B\u5217\u8868\u5C55\u793A\u7684\u6A21\u578B" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "11px", opacity: 0.75 }, children: [
                  "(\u5DF2\u9009 ",
                  selected.size,
                  " / \u5171 ",
                  allAvailable.length,
                  " \u4E2A\u5019\u9009)"
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: "6px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: selectAll,
                    style: {
                      padding: "2px 8px",
                      borderRadius: "4px",
                      border: "1px solid rgba(128,128,128,0.3)",
                      background: "transparent",
                      fontSize: "11px",
                      cursor: "pointer"
                    },
                    children: "\u5168\u9009"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: clearAll,
                    style: {
                      padding: "2px 8px",
                      borderRadius: "4px",
                      border: "1px solid rgba(128,128,128,0.3)",
                      background: "transparent",
                      fontSize: "11px",
                      cursor: "pointer"
                    },
                    children: "\u6E05\u7A7A"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: resetDefaults,
                    style: {
                      padding: "2px 8px",
                      borderRadius: "4px",
                      border: "1px solid rgba(128,128,128,0.3)",
                      background: "transparent",
                      fontSize: "11px",
                      cursor: "pointer"
                    },
                    children: "\u6062\u590D\u63A8\u8350\u9ED8\u8BA4"
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "text",
            placeholder: "\u{1F50D} \u641C\u7D22\u6A21\u578B\u540D\u79F0\uFF08\u5982 flash\u3001pro\u3001seed\u3001gpt-4o\u3001claude...\uFF09",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            style: {
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 10px",
              borderRadius: "4px",
              border: "1px solid rgba(128,128,128,0.3)",
              background: "var(--dsw-alias-bg-layer-2, transparent)",
              color: "inherit",
              fontSize: "12px"
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "6px",
              maxHeight: "200px",
              overflowY: "auto",
              padding: "4px",
              border: "1px solid rgba(128,128,128,0.15)",
              borderRadius: "6px"
            },
            children: filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "12px", fontSize: "12px", opacity: 0.6, gridColumn: "1 / -1", textAlign: "center" }, children: "\u672A\u627E\u5230\u5339\u914D\u7684\u6A21\u578B\uFF0C\u53EF\u5728\u4E0B\u65B9\u624B\u52A8\u8F93\u5165\u6DFB\u52A0" }) : filtered.map((m) => {
              const isChecked = selected.has(m);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "label",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 8px",
                    borderRadius: "4px",
                    border: isChecked ? "1px solid rgba(16,185,129,0.5)" : "1px solid rgba(128,128,128,0.15)",
                    background: isChecked ? "rgba(16,185,129,0.1)" : "transparent",
                    cursor: "pointer",
                    fontSize: "12px",
                    userSelect: "none"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: isChecked,
                        onChange: () => toggleModel(m),
                        style: { accentColor: "#10b981", cursor: "pointer" }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "span",
                      {
                        style: {
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontWeight: isChecked ? 600 : 400,
                          color: isChecked ? "#10b981" : "inherit"
                        },
                        title: m,
                        children: m
                      }
                    )
                  ]
                },
                m
              );
            })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: "6px", alignItems: "center" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "text",
              placeholder: "\u8F93\u5165\u672A\u5728\u5217\u8868\u4E2D\u7684\u81EA\u5B9A\u4E49\u6A21\u578B\u6807\u8BC6 (\u5982 qwen3-coder, gpt-4.5) \u5E76\u6DFB\u52A0",
              value: customModel,
              onChange: (e) => setCustomModel(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                }
              },
              style: {
                flex: 1,
                padding: "6px 10px",
                borderRadius: "4px",
                border: "1px solid rgba(128,128,128,0.3)",
                background: "var(--dsw-alias-bg-layer-2, transparent)",
                color: "inherit",
                fontSize: "12px"
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              onClick: () => handleAddCustom(),
              style: {
                padding: "6px 14px",
                borderRadius: "4px",
                border: "none",
                background: "rgba(128,128,128,0.2)",
                color: "inherit",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer"
              },
              children: "+ \u6DFB\u52A0\u6A21\u578B"
            }
          )
        ] }),
        saveMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", color: saveMsg.startsWith("\u2713") ? "#10b981" : "#ef4444" }, children: saveMsg }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: {
                padding: "5px 14px",
                borderRadius: "4px",
                border: "1px solid rgba(128,128,128,0.3)",
                background: "transparent",
                fontSize: "12px",
                cursor: "pointer"
              },
              children: "\u53D6\u6D88"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              disabled: saving,
              onClick: () => void handleSave(),
              style: {
                padding: "5px 18px",
                borderRadius: "4px",
                border: "none",
                background: "#10b981",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer"
              },
              children: saving ? "\u6B63\u5728\u4FDD\u5B58\u5E76\u5728 DSH \u751F\u6548..." : "\u{1F4BE} \u4FDD\u5B58\u5E76\u5728 DSH \u6A21\u578B\u9009\u62E9\u5217\u8868\u751F\u6548"
            }
          )
        ] })
      ]
    }
  );
}
function HitchfinUnifiedSettingsDashboard() {
  const {
    status,
    busy,
    refresh,
    setMode,
    updateMasking,
    addAccount,
    removeAccount,
    updateStrategy,
    importSubscriptions,
    updateModels,
    startCopilotAuth,
    pollCopilotAuth
  } = useHitchfinStatus();
  const [showAddForm, setShowAddForm] = (0, import_react.useState)(
    () => status.accounts.length === 0
  );
  const [activeLoginTab, setActiveLoginTab] = (0, import_react.useState)("oauth");
  const [selectedChannel, setSelectedChannel] = (0, import_react.useState)("codex");
  const [accountLabel, setAccountLabel] = (0, import_react.useState)("");
  const [sessionToken, setSessionToken] = (0, import_react.useState)("");
  const [showSecret, setShowSecret] = (0, import_react.useState)(false);
  const [baseUrlInput, setBaseUrlInput] = (0, import_react.useState)("https://api.openai.com/v1");
  const [modelsInput, setModelsInput] = (0, import_react.useState)("gpt-4o, gpt-4o-mini, o1, o3-mini");
  const [formError, setFormError] = (0, import_react.useState)("");
  const [formSuccess, setFormSuccess] = (0, import_react.useState)("");
  const [editingSlotKey, setEditingSlotKey] = (0, import_react.useState)(null);
  const [importingId, setImportingId] = (0, import_react.useState)(null);
  const [importingAll, setImportingAll] = (0, import_react.useState)(false);
  const [copilotFlow, setCopilotFlow] = (0, import_react.useState)(null);
  const [showAdvanced, setShowAdvanced] = (0, import_react.useState)(false);
  const handleChannelChange = (channelId) => {
    setSelectedChannel(channelId);
    const preset = CHANNEL_PRESETS.find((p) => p.channelId === channelId);
    if (preset) {
      setBaseUrlInput(preset.defaultBaseUrl);
      setModelsInput(preset.defaultModels.join(", "));
      setAccountLabel(preset.name);
    }
  };
  const handleImportSingleDiscovered = async (id, name2) => {
    setImportingId(id);
    setFormError("");
    setFormSuccess("");
    try {
      await importSubscriptions([id]);
      setFormSuccess(`\u2713 \u5DF2\u6210\u529F\u540C\u6B65\u5B98\u65B9\u5957\u9910\u8D26\u53F7\uFF1A${name2}\uFF01\u5DF2\u6302\u8F7D\u81F3 DSH \u6A21\u578B\u5217\u8868\u3002`);
      setTimeout(() => setFormSuccess(""), 4e3);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingId(null);
    }
  };
  const handleImportAllDiscovered = async () => {
    setImportingAll(true);
    setFormSuccess("");
    setFormError("");
    try {
      await importSubscriptions("all");
      setFormSuccess("\u2713 \u5DF2\u6210\u529F\u540C\u6B65\u672C\u673A\u5168\u90E8\u5B98\u65B9\u5957\u9910\u8BA2\u9605\uFF01\u6240\u6709\u6A21\u578B\u5DF2\u6302\u8F7D\u81F3 DSH \u804A\u5929\u8F93\u5165\u6846\u3002");
      setTimeout(() => setFormSuccess(""), 4500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingAll(false);
    }
  };
  const handleStartCopilot = async () => {
    setFormError("");
    setFormSuccess("");
    try {
      const res = await startCopilotAuth();
      setCopilotFlow({
        userCode: res.userCode,
        verificationUri: res.verificationUri,
        deviceCode: res.deviceCode,
        status: "waiting"
      });
      if (typeof window !== "undefined" && window.open) {
        window.open(res.verificationUri, "_blank");
      }
      const pollTimer = setInterval(async () => {
        try {
          const poll = await pollCopilotAuth(res.deviceCode);
          if (poll.status === "authorized") {
            clearInterval(pollTimer);
            setCopilotFlow(
              (prev) => prev ? { ...prev, status: "success" } : null
            );
            setFormSuccess("GitHub Copilot \u8BA2\u9605\u6388\u6743\u6210\u529F\uFF01\u5DF2\u6302\u8F7D\u81F3 DSH \u6A21\u578B\u5217\u8868\u3002");
            setTimeout(() => {
              setCopilotFlow(null);
              setFormSuccess("");
            }, 3e3);
          } else if (poll.status === "expired" || poll.status === "error") {
            clearInterval(pollTimer);
            const finalStatus = poll.status === "expired" ? "expired" : "error";
            setCopilotFlow(
              (prev) => prev ? {
                ...prev,
                status: finalStatus,
                errorMsg: poll.error || "\u6388\u6743\u5DF2\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5"
              } : null
            );
          }
        } catch {
        }
      }, (res.interval || 5) * 1e3);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };
  const handleSaveManualAccount = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (!accountLabel.trim()) {
      setFormError("\u8BF7\u8F93\u5165\u8D26\u53F7\u6807\u7B7E\u6216\u522B\u540D");
      return;
    }
    if (!sessionToken.trim()) {
      setFormError("\u8BF7\u8F93\u5165\u5B98\u65B9 Session Token / Refresh Token");
      return;
    }
    const preset = CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel);
    const models = modelsInput.split(",").map((m) => m.trim()).filter(Boolean);
    try {
      await addAccount({
        channelId: selectedChannel,
        label: accountLabel.trim(),
        authType: "oauth",
        accessToken: sessionToken.trim(),
        baseUrl: baseUrlInput.trim() || void 0,
        models: models.length > 0 ? models : void 0
      });
      setFormSuccess("\u5B98\u65B9\u5957\u9910\u8D26\u53F7\u7ED1\u5B9A\u6210\u529F\uFF01\u5DF2\u540C\u6B65\u81F3 DSH \u6A21\u578B\u9009\u62E9\u5217\u8868\u3002");
      setSessionToken("");
      setTimeout(() => {
        setFormSuccess("");
        setShowAddForm(false);
      }, 1800);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };
  const activeStrategy = status.defaultStrategy ?? "smart";
  const discovered = status.discoveredSubscriptions ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        maxWidth: "960px",
        margin: "0 auto",
        color: "inherit",
        fontFamily: "inherit"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "16px",
              paddingBottom: "16px",
              borderBottom: "1px solid rgba(128,128,128,0.2)"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "h2",
                  {
                    style: {
                      margin: "0 0 6px 0",
                      fontSize: "20px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Hitchfin \xB7 \u5B98\u65B9\u5957\u9910\u8BA2\u9605\u4E0E\u667A\u80FD\u8DEF\u7531" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "success", children: "\u5957\u9910\u805A\u5408" })
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "p",
                  {
                    style: {
                      margin: 0,
                      fontSize: "13px",
                      opacity: 0.8,
                      lineHeight: 1.5
                    },
                    children: "\u539F\u751F\u805A\u5408\u63A5\u5165 ChatGPT Plus/Team\u3001GitHub Copilot\u3001\u5B57\u8282 Trae\u3001\u817E\u8BAF WorkBuddy\u3001\u667A\u8C31 GLM Coding Plan \u7B49\u5B98\u65B9\u8BA2\u9605\u5957\u9910\uFF0C\u76F4\u63A5\u4EE5\u5B98\u65B9\u8D26\u53F7\u767B\u5F55\uFF0C\u65E0\u9700\u8D2D\u4E70\u6309\u91CF API Key\u3002"
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: "10px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => setShowAddForm((v) => !v),
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 16px",
                      borderRadius: "6px",
                      border: "none",
                      background: "#10b981",
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(16,185,129,0.3)"
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: showAddForm ? "\u2715 \u6536\u8D77\u767B\u5F55\u9762\u677F" : "\u2795 \u63A5\u5165\u5B98\u65B9\u8BA2\u9605\u8D26\u53F7" })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    disabled: busy,
                    onClick: () => void refresh(),
                    style: {
                      padding: "7px 14px",
                      borderRadius: "6px",
                      border: "1px solid rgba(128,128,128,0.3)",
                      background: "transparent",
                      fontSize: "13px",
                      cursor: "pointer"
                    },
                    children: busy ? "\u5237\u65B0\u4E2D..." : "\u{1F504} \u5237\u65B0\u72B6\u6001"
                  }
                )
              ] })
            ]
          }
        ),
        formError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              padding: "12px 16px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#ef4444",
              fontSize: "13px",
              fontWeight: 500,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "\u26A0\uFE0F ",
                formError
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => setFormError(""),
                  style: {
                    background: "none",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: "14px"
                  },
                  children: "\u2715"
                }
              )
            ]
          }
        ),
        formSuccess && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              padding: "12px 16px",
              borderRadius: "8px",
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              color: "#10b981",
              fontSize: "13px",
              fontWeight: 500,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "\u2713 ",
                formSuccess
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => setFormSuccess(""),
                  style: {
                    background: "none",
                    border: "none",
                    color: "#10b981",
                    cursor: "pointer",
                    fontSize: "14px"
                  },
                  children: "\u2715"
                }
              )
            ]
          }
        ),
        discovered.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              padding: "16px",
              borderRadius: "10px",
              border: "1.5px solid #10b981",
              background: "var(--dsw-alias-bg-layer-2, rgba(16,185,129,0.06))",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "10px"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "div",
                        {
                          style: {
                            fontWeight: 600,
                            fontSize: "15px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                              "\u2728 \u53D1\u73B0\u672C\u673A\u5DF2\u6709 ",
                              discovered.length,
                              " \u4E2A\u5B98\u65B9\u5957\u9910\u767B\u5F55"
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "success", children: "\u5373\u63D2\u5373\u7528" })
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.8, marginTop: "2px" }, children: "\u68C0\u6D4B\u5230\u672C\u673A\u5DF2\u767B\u5F55\u7684 ChatGPT\u3001Trae\u3001WorkBuddy\u3001ZCode \u7B49\u5B98\u65B9\u8D26\u53F7\u51ED\u8BC1\uFF0C\u53EF\u4E00\u952E\u76F4\u63A5\u540C\u6B65\u81F3 DSH \u4F7F\u7528\u3002" })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        disabled: busy || importingAll,
                        onClick: () => void handleImportAllDiscovered(),
                        style: {
                          padding: "8px 20px",
                          borderRadius: "6px",
                          border: "none",
                          background: "#10b981",
                          color: "#ffffff",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(16,185,129,0.3)"
                        },
                        children: importingAll ? "\u23F3 \u6B63\u5728\u5168\u91CF\u540C\u6B65\u4E2D..." : "\u4E00\u952E\u540C\u6B65\u5168\u90E8\u5DF2\u767B\u5F55\u5B98\u65B9\u5957\u9910"
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "10px"
                  },
                  children: discovered.map((d) => {
                    const isThisImporting = importingId === d.id;
                    const quotaText = d.quotas?.[0]?.windowLabel || "\u5957\u9910\u6B63\u5E38";
                    const totalModels = d.candidateModels?.length ?? d.models.length;
                    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "div",
                      {
                        style: {
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid rgba(128,128,128,0.2)",
                          background: "var(--dsw-alias-bg-layer-1, transparent)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "10px"
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px" }, children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, fontSize: "13px" }, children: d.providerName }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "span",
                                {
                                  style: {
                                    fontSize: "10px",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    background: "rgba(16,185,129,0.15)",
                                    color: "#10b981",
                                    fontWeight: 500
                                  },
                                  children: quotaText
                                }
                              )
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "11px", opacity: 0.8, marginTop: "2px" }, children: [
                              "\u8D26\u53F7: ",
                              d.user,
                              " \xB7 \u5957\u9910: ",
                              d.plan
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "11px", opacity: 0.65, marginTop: "2px" }, children: [
                              "\u63A8\u8350 ",
                              d.models.length,
                              " \u4E2A\u6A21\u578B (\u5171 ",
                              totalModels,
                              " \u4E2A\u53EF\u9009)"
                            ] })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              disabled: busy || isThisImporting,
                              onClick: () => void handleImportSingleDiscovered(d.id, d.providerName),
                              style: {
                                padding: "5px 12px",
                                borderRadius: "5px",
                                border: "1px solid #10b981",
                                background: isThisImporting ? "rgba(16,185,129,0.2)" : "transparent",
                                color: "#10b981",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                whiteSpace: "nowrap"
                              },
                              children: isThisImporting ? "\u5BFC\u5165\u4E2D..." : "\u5355\u72EC\u5BFC\u5165"
                            }
                          )
                        ]
                      },
                      d.id
                    );
                  })
                }
              )
            ]
          }
        ),
        showAddForm && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              padding: "18px",
              borderRadius: "10px",
              border: "1px solid #10b981",
              background: "var(--dsw-alias-bg-layer-2, rgba(16,185,129,0.03))",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 4px 12px rgba(16,185,129,0.1)"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0, fontSize: "15px", fontWeight: 600 }, children: "\u2795 \u63A5\u5165\u5B98\u65B9\u5957\u9910\u8BA2\u9605\u8D26\u53F7 (Official Subscription)" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.7, marginTop: "2px" }, children: "\u652F\u6301\u5B98\u65B9\u6388\u6743\u767B\u5F55\u6216\u7ED1\u5B9A\u5DF2\u767B\u5F55\u7684 Session Token\uFF0C\u76F4\u8FDE\u5B98\u65B9\u5957\u9910\u901A\u9053" })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "div",
                      {
                        style: {
                          display: "flex",
                          background: "rgba(128,128,128,0.15)",
                          borderRadius: "6px",
                          padding: "2px"
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              onClick: () => setActiveLoginTab("oauth"),
                              style: {
                                padding: "4px 12px",
                                borderRadius: "4px",
                                border: "none",
                                fontSize: "12px",
                                fontWeight: activeLoginTab === "oauth" ? 600 : 400,
                                background: activeLoginTab === "oauth" ? "#10b981" : "transparent",
                                color: activeLoginTab === "oauth" ? "#ffffff" : "inherit",
                                cursor: "pointer"
                              },
                              children: "\u5B98\u65B9\u6388\u6743\u767B\u5F55"
                            }
                          ),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              onClick: () => setActiveLoginTab("token"),
                              style: {
                                padding: "4px 12px",
                                borderRadius: "4px",
                                border: "none",
                                fontSize: "12px",
                                fontWeight: activeLoginTab === "token" ? 600 : 400,
                                background: activeLoginTab === "token" ? "#10b981" : "transparent",
                                color: activeLoginTab === "token" ? "#ffffff" : "inherit",
                                cursor: "pointer"
                              },
                              children: "\u7ED1\u5B9A Session Token"
                            }
                          )
                        ]
                      }
                    )
                  ]
                }
              ),
              activeLoginTab === "oauth" ? (
                /* Mode A: Interactive Official Login Buttons */
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "13px", opacity: 0.85 }, children: "\u9009\u62E9\u8981\u767B\u5F55\u7684\u5B98\u65B9\u5E73\u53F0\uFF0C\u70B9\u51FB\u540E\u5C06\u542F\u52A8\u5B98\u65B9\u6388\u6743\u767B\u5F55\u6D41\u7A0B\uFF1A" }),
                  copilotFlow ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "div",
                    {
                      style: {
                        padding: "16px",
                        borderRadius: "8px",
                        border: "1.5px solid #10b981",
                        background: "var(--dsw-alias-bg-layer-1, #1e1e1e)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        alignItems: "center",
                        textAlign: "center"
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "15px" }, children: "GitHub Copilot \u8BBE\u5907\u6388\u6743" }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "13px", opacity: 0.85 }, children: "\u8BF7\u5728\u6253\u5F00\u7684 GitHub \u9875\u9762\u4E2D\u8F93\u5165\u4EE5\u4E0B 8 \u4F4D\u8BBE\u5907\u7801\u5B8C\u6210\u6388\u6743\uFF1A" }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "div",
                          {
                            style: {
                              fontSize: "28px",
                              fontWeight: 700,
                              letterSpacing: "4px",
                              color: "#10b981",
                              padding: "8px 20px",
                              borderRadius: "8px",
                              background: "rgba(16,185,129,0.1)",
                              userSelect: "all"
                            },
                            children: copilotFlow.userCode
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.7 }, children: [
                          "\u6388\u6743\u9875\u9762:",
                          " ",
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "a",
                            {
                              href: copilotFlow.verificationUri,
                              target: "_blank",
                              rel: "noreferrer",
                              style: { color: "#10b981" },
                              children: copilotFlow.verificationUri
                            }
                          )
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", color: "#10b981" }, children: [
                          copilotFlow.status === "waiting" && "\u23F3 \u6B63\u5728\u7B49\u5F85\u60A8\u5728\u7F51\u9875\u7AEF\u786E\u8BA4\u6388\u6743\uFF08\u786E\u8BA4\u540E\u5C06\u81EA\u52A8\u5B8C\u6210\u63A5\u5165\uFF09...",
                          copilotFlow.status === "success" && "\u2713 \u6388\u6743\u6210\u529F\uFF01",
                          copilotFlow.status === "expired" && "\u26A0\uFE0F \u8BBE\u5907\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u70B9\u51FB"
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "button",
                          {
                            type: "button",
                            onClick: () => setCopilotFlow(null),
                            style: {
                              marginTop: "6px",
                              padding: "4px 12px",
                              borderRadius: "4px",
                              border: "1px solid rgba(128,128,128,0.3)",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: "12px"
                            },
                            children: "\u53D6\u6D88"
                          }
                        )
                      ]
                    }
                  ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "div",
                    {
                      style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "10px"
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                          "div",
                          {
                            onClick: () => void handleStartCopilot(),
                            style: {
                              padding: "12px",
                              borderRadius: "8px",
                              border: "1px solid rgba(128,128,128,0.25)",
                              background: "var(--dsw-alias-bg-layer-1, transparent)",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px"
                            },
                            children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "13px" }, children: "\u{1F419} GitHub Copilot \u5B98\u65B9\u6388\u6743" }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", opacity: 0.75 }, children: "\u901A\u8FC7 GitHub \u5B98\u65B9\u8BBE\u5907\u7801\u6388\u6743\uFF0C\u8FDE\u63A5\u60A8\u7684 Copilot \u4E2A\u4EBA/\u4F01\u4E1A\u8BA2\u9605" }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "div",
                                {
                                  style: {
                                    marginTop: "6px",
                                    color: "#10b981",
                                    fontSize: "12px",
                                    fontWeight: 600
                                  },
                                  children: "\u70B9\u51FB\u5F00\u542F\u8BBE\u5907\u7801\u6388\u6743 \u2192"
                                }
                              )
                            ]
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                          "div",
                          {
                            onClick: () => {
                              if (typeof window !== "undefined" && window.open) {
                                window.open("https://www.trae.cn/authorization?login_version=1&auth_from=solo&login_channel=native_ide&client_id=ono9krqynydwx5&auth_type=local", "_blank");
                              }
                              setActiveLoginTab("token");
                              setSelectedChannel("trae-cn");
                              handleChannelChange("trae-cn");
                            },
                            style: {
                              padding: "12px",
                              borderRadius: "8px",
                              border: "1px solid rgba(128,128,128,0.25)",
                              background: "var(--dsw-alias-bg-layer-1, transparent)",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px"
                            },
                            children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "13px" }, children: "\u26A1 \u5B57\u8282\u8DF3\u52A8 Trae \u5B98\u65B9\u6388\u6743" }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", opacity: 0.75 }, children: "\u8DF3\u8F6C Trae \u5B98\u65B9\u6388\u6743\u9875\u767B\u5F55\uFF0C\u83B7\u53D6 Trae \u6BCF\u65E5\u7B7E\u5230\u79EF\u5206\u4E0E\u6A21\u578B\u5957\u9910" }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "div",
                                {
                                  style: {
                                    marginTop: "6px",
                                    color: "#10b981",
                                    fontSize: "12px",
                                    fontWeight: 600
                                  },
                                  children: "\u6253\u5F00 Trae \u6388\u6743\u9875 \u2192"
                                }
                              )
                            ]
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                          "div",
                          {
                            onClick: () => {
                              setActiveLoginTab("token");
                              setSelectedChannel("codex");
                              handleChannelChange("codex");
                            },
                            style: {
                              padding: "12px",
                              borderRadius: "8px",
                              border: "1px solid rgba(128,128,128,0.25)",
                              background: "var(--dsw-alias-bg-layer-1, transparent)",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px"
                            },
                            children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "13px" }, children: "\u{1F4AC} ChatGPT Plus / Team \u8BA2\u9605\u7ED1\u5B9A" }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", opacity: 0.75 }, children: "\u76F4\u63A5\u7ED1\u5B9A\u5DF2\u767B\u5F55 ChatGPT \u7684 Session Token \u6216 Refresh Token" }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "div",
                                {
                                  style: {
                                    marginTop: "6px",
                                    color: "#10b981",
                                    fontSize: "12px",
                                    fontWeight: 600
                                  },
                                  children: "\u524D\u5F80\u8F93\u5165 Token \u2192"
                                }
                              )
                            ]
                          }
                        )
                      ]
                    }
                  )
                ] })
              ) : (
                /* Mode B: Manual Session/Refresh Token Input */
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "form",
                  {
                    onSubmit: handleSaveManualAccount,
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "div",
                        {
                          style: {
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: "14px"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "label",
                                {
                                  style: {
                                    display: "block",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    marginBottom: "4px"
                                  },
                                  children: "\u5B98\u65B9\u5957\u9910\u6E20\u9053"
                                }
                              ),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "select",
                                {
                                  value: selectedChannel,
                                  onChange: (e) => handleChannelChange(e.target.value),
                                  style: {
                                    width: "100%",
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(128,128,128,0.3)",
                                    background: "var(--dsw-alias-bg-layer-1, transparent)",
                                    color: "inherit",
                                    fontSize: "13px"
                                  },
                                  children: CHANNEL_PRESETS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: p.channelId, children: [
                                    p.name,
                                    " (",
                                    p.planName,
                                    ")"
                                  ] }, p.channelId))
                                }
                              ),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", opacity: 0.7, marginTop: "3px" }, children: CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel)?.description })
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "label",
                                {
                                  style: {
                                    display: "block",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    marginBottom: "4px"
                                  },
                                  children: "\u8D26\u53F7\u6807\u7B7E / \u522B\u540D"
                                }
                              ),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "input",
                                {
                                  type: "text",
                                  placeholder: "\u4F8B\u5982\uFF1AChatGPT Plus \u4E2A\u4EBA\u4E3B\u53F7\u3001WorkBuddy \u5546\u4E1A\u7248",
                                  value: accountLabel,
                                  onChange: (e) => setAccountLabel(e.target.value),
                                  style: {
                                    width: "100%",
                                    boxSizing: "border-box",
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(128,128,128,0.3)",
                                    background: "var(--dsw-alias-bg-layer-1, transparent)",
                                    color: "inherit",
                                    fontSize: "13px"
                                  }
                                }
                              )
                            ] })
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                          "div",
                          {
                            style: {
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "4px"
                            },
                            children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "\u5B98\u65B9 Session Token / \u5237\u65B0\u4EE4\u724C (Refresh Token)" }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "button",
                                {
                                  type: "button",
                                  onClick: () => setShowSecret((v) => !v),
                                  style: {
                                    background: "none",
                                    border: "none",
                                    fontSize: "11px",
                                    color: "#10b981",
                                    cursor: "pointer",
                                    padding: 0
                                  },
                                  children: showSecret ? "\u9690\u85CF\u660E\u6587" : "\u663E\u793A\u660E\u6587"
                                }
                              )
                            ]
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "input",
                          {
                            type: showSecret ? "text" : "password",
                            placeholder: CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel)?.placeholder ?? "\u7C98\u8D34\u5B98\u65B9 Session Token \u6216 Refresh Token",
                            value: sessionToken,
                            onChange: (e) => setSessionToken(e.target.value),
                            style: {
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              border: "1px solid rgba(128,128,128,0.3)",
                              background: "var(--dsw-alias-bg-layer-1, transparent)",
                              color: "inherit",
                              fontSize: "13px",
                              fontFamily: showSecret ? "monospace" : "inherit"
                            }
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", opacity: 0.65, marginTop: "3px" }, children: "\u63D0\u793A\uFF1A\u586B\u5165\u5BF9\u5E94\u5B98\u65B9\u5E73\u53F0\u767B\u5F55\u540E\u9881\u53D1\u7684 Session Token\u3001Refresh Token \u6216 OAuth \u4EE4\u724C\u5373\u53EF\uFF0C\u51ED\u8BC1\u4FDD\u5B58\u5728\u672C\u5730\u52A0\u5BC6\u51ED\u636E\u5E93\u3002" })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "div",
                        {
                          style: {
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: "14px"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "label",
                                {
                                  style: {
                                    display: "block",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    marginBottom: "4px"
                                  },
                                  children: "\u5B98\u65B9\u63A5\u53E3\u670D\u52A1\u5730\u5740"
                                }
                              ),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "input",
                                {
                                  type: "text",
                                  value: baseUrlInput,
                                  onChange: (e) => setBaseUrlInput(e.target.value),
                                  style: {
                                    width: "100%",
                                    boxSizing: "border-box",
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(128,128,128,0.3)",
                                    background: "var(--dsw-alias-bg-layer-1, transparent)",
                                    color: "inherit",
                                    fontSize: "13px"
                                  }
                                }
                              )
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "label",
                                {
                                  style: {
                                    display: "block",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    marginBottom: "4px"
                                  },
                                  children: "\u6302\u8F7D\u53EF\u7528\u6A21\u578B (\u9017\u53F7\u5206\u9694)"
                                }
                              ),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "input",
                                {
                                  type: "text",
                                  value: modelsInput,
                                  onChange: (e) => setModelsInput(e.target.value),
                                  style: {
                                    width: "100%",
                                    boxSizing: "border-box",
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(128,128,128,0.3)",
                                    background: "var(--dsw-alias-bg-layer-1, transparent)",
                                    color: "inherit",
                                    fontSize: "13px"
                                  }
                                }
                              )
                            ] })
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "div",
                        {
                          style: {
                            display: "flex",
                            gap: "10px",
                            justifyContent: "flex-end",
                            marginTop: "4px"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "button",
                              {
                                type: "button",
                                onClick: () => setShowAddForm(false),
                                style: {
                                  padding: "6px 14px",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(128,128,128,0.3)",
                                  background: "transparent",
                                  cursor: "pointer",
                                  fontSize: "13px"
                                },
                                children: "\u53D6\u6D88"
                              }
                            ),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "button",
                              {
                                type: "submit",
                                disabled: busy,
                                style: {
                                  padding: "6px 18px",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: "#10b981",
                                  color: "#ffffff",
                                  fontWeight: 600,
                                  fontSize: "13px",
                                  cursor: "pointer"
                                },
                                children: busy ? "\u6B63\u5728\u4FDD\u5B58..." : "\u4FDD\u5B58\u5E76\u8FDE\u63A5\u5B98\u65B9\u5957\u9910"
                              }
                            )
                          ]
                        }
                      )
                    ]
                  }
                )
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600 }, children: [
                  "\u5DF2\u8FDE\u63A5\u5B98\u65B9\u5957\u9910\u8BA2\u9605\u6C60 (",
                  status.accounts.length,
                  ")"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", opacity: 0.7 }, children: "\u6BCF\u4E2A\u5B98\u65B9\u8D26\u53F7\u6620\u5C04\u81F3 DSH \u6A21\u578B\u9009\u62E9\u5217\u8868" })
              ]
            }
          ),
          status.accounts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                padding: "28px",
                textAlign: "center",
                borderRadius: "8px",
                border: "1px dashed rgba(128,128,128,0.3)",
                background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 600, marginBottom: "6px" }, children: "\u{1F4A1} \u6682\u672A\u8FDE\u63A5\u4EFB\u4F55\u5B98\u65B9\u5957\u9910\u8BA2\u9605" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "13px", opacity: 0.75, marginBottom: "14px" }, children: "\u70B9\u51FB\u4E0A\u65B9\u3010\u4E00\u952E\u540C\u6B65\u5168\u90E8\u5DF2\u767B\u5F55\u5B98\u65B9\u5957\u9910\u3011\u6216\u3010\u2795 \u63A5\u5165\u5B98\u65B9\u8BA2\u9605\u8D26\u53F7\u3011\uFF0C\u8FDE\u63A5\u60A8\u7684 ChatGPT\u3001Copilot\u3001Trae\u3001WorkBuddy \u7B49\u5B98\u65B9\u8BA2\u9605\uFF01" }),
                discovered.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "button",
                  {
                    type: "button",
                    onClick: () => void handleImportAllDiscovered(),
                    style: {
                      padding: "6px 16px",
                      borderRadius: "6px",
                      border: "none",
                      background: "#10b981",
                      color: "#ffffff",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer"
                    },
                    children: [
                      "\u7ACB\u5373\u540C\u6B65\u672C\u673A\u53D1\u73B0\u7684 ",
                      discovered.length,
                      " \u4E2A\u8D26\u53F7"
                    ]
                  }
                )
              ]
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              },
              children: status.accounts.map((acc) => {
                const preset = CHANNEL_PRESETS.find(
                  (p) => p.channelId === acc.channelId || acc.channelId.includes(p.channelId)
                );
                const slotKey = `${acc.channelId}::${acc.slotId}`;
                const isEditingModels = editingSlotKey === slotKey;
                const quotaSnapshot = acc.quotas && acc.quotas.length > 0 ? acc.quotas[0] : void 0;
                const quotaLabel = quotaSnapshot?.windowLabel || "\u5957\u9910\u53EF\u7528 (\u65E0\u786C\u9876\u9650\u5236)";
                const enabledModels = acc.models && acc.models.length > 0 ? acc.models : ["\u9ED8\u8BA4\u6A21\u578B"];
                const allCandidates = Array.from(
                  /* @__PURE__ */ new Set([
                    ...acc.candidateModels ?? [],
                    ...preset?.candidateModels ?? [],
                    ...preset?.defaultModels ?? [],
                    ...enabledModels
                  ])
                );
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "div",
                  {
                    style: {
                      padding: "16px",
                      borderRadius: "8px",
                      border: "1px solid rgba(128,128,128,0.25)",
                      background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.04))",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "div",
                        {
                          style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: "8px"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }, children: [
                                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "15px" }, children: acc.label }),
                                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: acc.state === "Healthy" ? "success" : "warning", children: acc.state === "Healthy" ? "\u{1F7E2} \u5957\u9910\u6B63\u5E38" : acc.state })
                              ] }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.8 }, children: [
                                "\u670D\u52A1\u5546: ",
                                preset?.name ?? acc.channelId,
                                " \xB7 \u5957\u9910: ",
                                preset?.planName ?? "\u5B98\u65B9\u8BA2\u9605"
                              ] }),
                              acc.baseUrl && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                                "div",
                                {
                                  style: {
                                    fontSize: "11px",
                                    opacity: 0.65,
                                    fontFamily: "monospace",
                                    marginTop: "2px"
                                  },
                                  children: [
                                    "\u63A5\u53E3: ",
                                    acc.baseUrl
                                  ]
                                }
                              )
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "button",
                                {
                                  type: "button",
                                  onClick: () => setEditingSlotKey(
                                    (prev) => prev === slotKey ? null : slotKey
                                  ),
                                  style: {
                                    padding: "5px 12px",
                                    borderRadius: "5px",
                                    border: isEditingModels ? "1.5px solid #10b981" : "1px solid rgba(16,185,129,0.5)",
                                    background: isEditingModels ? "rgba(16,185,129,0.15)" : "transparent",
                                    color: "#10b981",
                                    fontWeight: 600,
                                    fontSize: "12px",
                                    cursor: "pointer"
                                  },
                                  children: isEditingModels ? "\u2715 \u6536\u8D77\u6A21\u578B\u914D\u7F6E" : `\u2699\uFE0F \u81EA\u5B9A\u4E49\u5C55\u793A\u6A21\u578B (\u5171 ${allCandidates.length} \u4E2A\u5019\u9009)`
                                }
                              ),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                                "button",
                                {
                                  type: "button",
                                  disabled: busy,
                                  onClick: () => {
                                    if (window.confirm(
                                      `\u786E\u5B9A\u8981\u79FB\u9664\u5DF2\u8FDE\u63A5\u7684\u5B98\u65B9\u8D26\u53F7 "${acc.label}" \u5417\uFF1F`
                                    )) {
                                      void removeAccount(acc.channelId, acc.slotId);
                                    }
                                  },
                                  style: {
                                    padding: "5px 10px",
                                    borderRadius: "5px",
                                    border: "1px solid rgba(239,68,68,0.3)",
                                    background: "transparent",
                                    color: "#ef4444",
                                    fontSize: "12px",
                                    cursor: "pointer"
                                  },
                                  children: "\u5220\u9664"
                                }
                              )
                            ] })
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "div",
                        {
                          style: {
                            padding: "8px 12px",
                            borderRadius: "6px",
                            background: "var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.08))",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "12px", fontWeight: 600, color: "#10b981" }, children: [
                                "\u{1F4CA} \u914D\u989D\u72B6\u6001: ",
                                quotaLabel
                              ] }),
                              quotaSnapshot && quotaSnapshot.remainingPercent < 100 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Tag, { tone: quotaSnapshot.remainingPercent < 20 ? "danger" : "warning", children: [
                                "\u5269\u4F59 ",
                                quotaSnapshot.remainingPercent,
                                "%"
                              ] })
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "11px", opacity: 0.65 }, children: [
                              "\u6700\u8FD1\u4F7F\u7528: ",
                              acc.lastUsedAt ? new Date(acc.lastUsedAt).toLocaleTimeString() : "\u521A\u521A\u5C31\u7EEA"
                            ] })
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.75, marginBottom: "6px" }, children: [
                          "\u5F53\u524D\u5728 DSH \u542F\u7528\u7684\u6A21\u578B (",
                          enabledModels.length,
                          " \u4E2A):"
                        ] }),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" }, children: enabledModels.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                          "span",
                          {
                            style: {
                              fontSize: "11px",
                              padding: "3px 8px",
                              borderRadius: "4px",
                              background: "rgba(16,185,129,0.12)",
                              color: "#10b981",
                              border: "1px solid rgba(16,185,129,0.3)",
                              fontWeight: 500
                            },
                            children: [
                              "\u2713 ",
                              m
                            ]
                          },
                          m
                        )) })
                      ] }),
                      isEditingModels && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                        AccountModelEditor,
                        {
                          channelId: acc.channelId,
                          slotId: acc.slotId,
                          label: acc.label,
                          currentModels: acc.models ?? [],
                          candidateModels: allCandidates,
                          defaultModels: preset?.defaultModels ?? [],
                          onSave: async (newModels) => {
                            await updateModels(acc.channelId, acc.slotId, newModels);
                          },
                          onClose: () => setEditingSlotKey(null)
                        }
                      )
                    ]
                  },
                  slotKey
                );
              })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid rgba(128,128,128,0.25)",
              background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: "0 0 4px 0", fontSize: "15px", fontWeight: 600 }, children: "\u591A\u8D26\u53F7\u667A\u80FD\u8C03\u5EA6\u4E0E\u8F6E\u8BE2\u7B56\u7565" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: "12px", opacity: 0.75 }, children: "\u5F53\u540C\u4E00\u4E2A\u670D\u52A1\u5546\u4E0B\u8FDE\u63A5\u4E86\u591A\u4E2A\u5B98\u65B9\u8D26\u53F7\uFF08\u5982\u591A\u4E2A ChatGPT \u6216\u591A\u4E2A Trae \u8D26\u53F7\uFF09\u65F6\uFF0C\u63A7\u5236\u8BF7\u6C42\u5982\u4F55\u5728\u5404\u8D26\u53F7\u4E4B\u95F4\u5206\u53D1\u3002" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "10px"
                  },
                  children: [
                    {
                      id: "smart",
                      name: "Smart \u667A\u80FD\u6700\u4F18",
                      desc: "\u4F18\u5148\u989D\u5EA6\u6700\u5145\u6C9B\u3001\u5F53\u524D\u65E0\u5EF6\u8FDF\u7684\u8D26\u53F7"
                    },
                    {
                      id: "pace",
                      name: "Pace \u5E73\u6ED1\u9650\u901F",
                      desc: "\u81EA\u52A8\u5E73\u644A\u8BF7\u6C42\u95F4\u9694\uFF0C\u9632\u6B62\u77ED\u65F6\u95F4\u7A81\u53D1 429"
                    },
                    {
                      id: "rotate",
                      name: "Rotate \u5747\u5300\u8F6E\u8BE2",
                      desc: "\u591A\u4E2A\u8D26\u53F7\u4E25\u683C\u8F6E\u8F6C\uFF0C\u8D1F\u8F7D\u5747\u8861\u5206\u6D41"
                    },
                    {
                      id: "order",
                      name: "Order \u6545\u969C\u8F6C\u79FB",
                      desc: "\u4E3B\u8D26\u53F7\u4F18\u5148\uFF0C\u9047\u5230\u5F02\u5E38\u81EA\u52A8\u5207\u6362\u5907\u7528\u8D26\u53F7"
                    }
                  ].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "div",
                    {
                      onClick: () => void updateStrategy(item.id),
                      style: {
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: activeStrategy === item.id ? "1.5px solid #10b981" : "1px solid rgba(128,128,128,0.2)",
                        background: activeStrategy === item.id ? "rgba(16,185,129,0.08)" : "transparent",
                        cursor: "pointer"
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "div",
                          {
                            style: {
                              fontWeight: activeStrategy === item.id ? 600 : 500,
                              fontSize: "13px",
                              color: activeStrategy === item.id ? "#10b981" : "inherit",
                              marginBottom: "2px"
                            },
                            children: item.name
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", opacity: 0.75 }, children: item.desc })
                      ]
                    },
                    item.id
                  ))
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              padding: "16px",
              borderRadius: "8px",
              border: "1px solid rgba(128,128,128,0.25)",
              background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: "0 0 4px 0", fontSize: "15px", fontWeight: 600 }, children: "\u51FA\u7AD9\u9690\u79C1\u8131\u654F\u4E0E\u5B89\u5168\u5916\u6CC4\u9632\u62A4" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: "12px", opacity: 0.75 }, children: "\u5728\u8BF7\u6C42\u79BB\u5F00 DSH \u53D1\u5F80\u5916\u90E8\u5B98\u65B9\u670D\u52A1\u5546\u65F6\uFF0C\u81EA\u52A8\u5C06\u4EE3\u7801\u6216\u4F1A\u8BDD\u4E2D\u7684\u654F\u611F\u51ED\u8BC1\u66FF\u6362\u4E3A HMAC \u5360\u4F4D\u7B26\uFF0C\u5E76\u5728\u6D41\u8FD4\u56DE\u65F6\u5B89\u5168\u8FD8\u539F\u3002" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid rgba(128,128,128,0.15)"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "13px" }, children: "\u51FA\u7AD9\u654F\u611F\u51ED\u636E\u81EA\u52A8\u8131\u654F (`llm/stream`)" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u53D1\u5F80\u6A21\u578B\u63D0\u4F9B\u5546\u7684\u8BF7\u6C42\u4E2D\uFF0C\u81EA\u52A8\u8131\u654F\u5BC6\u7801\u3001Key \u548C\u79C1\u94A5\uFF0C\u96F6\u5185\u5B58\u6CC4\u6F0F" })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        disabled: busy,
                        onClick: () => void updateMasking({ enabled: !status.masking.enabled }),
                        style: {
                          padding: "4px 14px",
                          borderRadius: "6px",
                          border: "1px solid rgba(128,128,128,0.3)",
                          background: status.masking.enabled ? "rgba(16,185,129,0.15)" : "transparent",
                          color: status.masking.enabled ? "#10b981" : "inherit",
                          fontWeight: 600,
                          fontSize: "12px",
                          cursor: "pointer"
                        },
                        children: status.masking.enabled ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED"
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "13px" }, children: "\u9AD8\u5371\u5DE5\u5177\u81EA\u52A8\u963B\u65AD (`PolicyGuard`)" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: [
                        "\u62E6\u622A\u6A21\u578B\u5411 ",
                        status.masking.highRiskToolNames.slice(0, 4).join(", "),
                        " ",
                        "\u7B49\u5DE5\u5177\u6CE8\u5165\u654F\u611F\u771F\u503C\uFF0C\u9632\u6B62\u547D\u4EE4\u6267\u884C\u5916\u6CC4"
                      ] })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        disabled: busy,
                        onClick: () => void updateMasking({
                          blockHighRiskTools: !status.masking.blockHighRiskTools
                        }),
                        style: {
                          padding: "4px 14px",
                          borderRadius: "6px",
                          border: "1px solid rgba(128,128,128,0.3)",
                          background: status.masking.blockHighRiskTools ? "rgba(16,185,129,0.15)" : "transparent",
                          color: status.masking.blockHighRiskTools ? "#10b981" : "inherit",
                          fontWeight: 600,
                          fontSize: "12px",
                          cursor: "pointer"
                        },
                        children: status.masking.blockHighRiskTools ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED"
                      }
                    )
                  ]
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              borderRadius: "8px",
              border: "1px solid rgba(128,128,128,0.2)",
              overflow: "hidden"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  onClick: () => setShowAdvanced((v) => !v),
                  style: {
                    width: "100%",
                    padding: "10px 14px",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.03))",
                    border: "none",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 500,
                    opacity: 0.8,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u2699\uFE0F \u9AD8\u7EA7\u9009\u9879\u4E0E\u517C\u5BB9\u8FC1\u79FB (\u53EF\u9009)" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: showAdvanced ? "\u25B2" : "\u25BC" })
                  ]
                }
              ),
              showAdvanced && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    padding: "14px",
                    fontSize: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    borderTop: "1px solid rgba(128,128,128,0.15)"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: "\u8FD0\u884C\u6A21\u5F0F" }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.75 }, children: "\u63A8\u8350\u4F7F\u7528 Standalone \u7EAF\u672C\u5730\u72EC\u7ACB\u8FD0\u884C\uFF0C\u5B8C\u5168\u4E0D\u4F9D\u8D56\u4EFB\u4F55\u5916\u90E8\u7F51\u5173\u3002" })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: "6px" }, children: ["standalone", "auto", "bridge"].map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              disabled: busy,
                              onClick: () => void setMode(m),
                              style: {
                                padding: "3px 8px",
                                borderRadius: "4px",
                                border: "1px solid rgba(128,128,128,0.3)",
                                fontWeight: status.mode === m ? 600 : 400,
                                background: status.mode === m ? "rgba(16,185,129,0.15)" : "transparent",
                                cursor: "pointer"
                              },
                              children: m
                            },
                            m
                          )) })
                        ]
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                      "div",
                      {
                        style: {
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingTop: "8px",
                          borderTop: "1px solid rgba(128,128,128,0.1)"
                        },
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: "\u91CD\u65B0\u68C0\u6D4B\u672C\u673A\u5B98\u65B9\u767B\u5F55" }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.75 }, children: "\u91CD\u65B0\u626B\u63CF\u672C\u673A Codex\u3001Claude\u3001Magpie \u767B\u5F55\u76EE\u5F55" })
                          ] }),
                          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "button",
                            {
                              type: "button",
                              disabled: busy,
                              onClick: () => void refresh(),
                              style: {
                                padding: "3px 8px",
                                borderRadius: "4px",
                                border: "1px solid rgba(128,128,128,0.3)",
                                background: "transparent",
                                cursor: "pointer"
                              },
                              children: "\u91CD\u65B0\u626B\u63CF"
                            }
                          )
                        ]
                      }
                    )
                  ]
                }
              )
            ]
          }
        )
      ]
    }
  );
}
function apply(ctx) {
  const namespace = "dsh-hitchfin";
  ctx.effect(
    () => ctx.locale.register(namespace, { zh, en }),
    "dsh-hitchfin: locale dictionaries"
  );
  ctx.slots.inject(
    "conversation.input.model.label",
    () => ctx.slots.register(
      {
        name: "conversation.input.model.label",
        locale: namespace
      },
      HitchfinModelLabel
    )
  );
  ctx.slots.inject(
    "conversation.input.right",
    () => ctx.slots.register(
      {
        name: "conversation.input.right",
        id: "hitchfin-quota-capsule",
        order: 50,
        locale: namespace
      },
      HitchfinComposerQuotaCapsule
    )
  );
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "hitchfin",
        order: 80,
        label: () => "Hitchfin \u8BA2\u9605\u4E0E\u8DEF\u7531",
        locale: namespace
      },
      HitchfinUnifiedSettingsDashboard
    )
  );
  ctx.slots.inject(
    "plugins.bundle.config",
    () => ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: namespace,
        locale: namespace
      },
      HitchfinUnifiedSettingsDashboard
    )
  );
  ctx.slots.inject(
    "plugins.row.config",
    () => ctx.slots.register(
      {
        name: "plugins.row.config",
        key: `${namespace}#${namespace}`,
        locale: namespace
      },
      HitchfinUnifiedSettingsDashboard
    )
  );
  ctx.slots.inject(
    "plugins.tab",
    () => ctx.slots.register(
      {
        name: "plugins.tab",
        id: namespace,
        order: 20,
        label: () => "Hitchfin \u8BA2\u9605\u4E0E\u8DEF\u7531",
        locale: namespace
      },
      HitchfinUnifiedSettingsDashboard
    )
  );
  ctx.slots.inject(
    "settings.plugins.tab",
    () => ctx.slots.register(
      {
        name: "settings.plugins.tab",
        id: namespace,
        order: 70,
        label: () => "Hitchfin \u8BA2\u9605\u4E0E\u8DEF\u7531",
        locale: namespace
      },
      HitchfinUnifiedSettingsDashboard
    )
  );
  if (typeof ctx.inject === "function") {
    ctx.inject(["settingsScope"], (scoped) => {
      scoped.slots.inject(
        "settings.plugin.item",
        () => scoped.slots.register(
          {
            name: "settings.plugin.item",
            key: namespace,
            locale: namespace
          },
          HitchfinUnifiedSettingsDashboard
        )
      );
    });
  }
}

    return module.exports;
  }
});
