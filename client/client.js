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
    channelId: "deepseek",
    name: "DeepSeek \u5B98\u65B9",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    authType: "api-key",
    placeholder: "sk-...",
    description: "DeepSeek \u5B98\u65B9\u5F00\u653E\u5E73\u53F0 API (V3 / R1)"
  },
  {
    channelId: "openai-codex",
    name: "OpenAI Codex / ChatGPT",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    authType: "api-key",
    placeholder: "sk-... \u6216 Session Token",
    description: "OpenAI \u5B98\u65B9 API \u6216 ChatGPT \u8BA2\u9605 Token"
  },
  {
    channelId: "copilot",
    name: "GitHub Copilot",
    defaultBaseUrl: "https://api.githubcopilot.com",
    defaultModels: ["copilot-gpt-4o", "copilot-claude-3.5-sonnet", "copilot-o1"],
    authType: "oauth",
    placeholder: "ghu_... \u6216 Copilot Token",
    description: "GitHub Copilot \u8BA2\u9605 Token / \u51ED\u8BC1"
  },
  {
    channelId: "claude",
    name: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModels: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229"
    ],
    authType: "api-key",
    placeholder: "sk-ant-...",
    description: "Anthropic \u5B98\u65B9 API \u6216 Claude \u8BA2\u9605 Token"
  },
  {
    channelId: "gemini",
    name: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModels: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    authType: "api-key",
    placeholder: "AIzaSy...",
    description: "Google AI Studio / Gemini API \u63A5\u53E3"
  },
  {
    channelId: "trae-cn",
    name: "Trae CN",
    defaultBaseUrl: "https://api.trae.ai/v1",
    defaultModels: ["trae-claude-3.5-sonnet", "trae-gpt-4o"],
    authType: "api-key",
    placeholder: "trae_token_...",
    description: "\u5B57\u8282\u8DF3\u52A8 Trae \u8BA2\u9605\u8D26\u53F7 Token"
  },
  {
    channelId: "workbuddy",
    name: "WorkBuddy",
    defaultBaseUrl: "https://api.workbuddy.cn/v1",
    defaultModels: ["workbuddy-chat", "workbuddy-code"],
    authType: "api-key",
    placeholder: "wb_token_...",
    description: "WorkBuddy \u5546\u4E1A\u7248\u8BA2\u9605\u51ED\u8BC1"
  },
  {
    channelId: "zcode",
    name: "ZCode",
    defaultBaseUrl: "https://api.zcode.ai/v1",
    defaultModels: ["zcode-pro", "zcode-fast"],
    authType: "api-key",
    placeholder: "zc_token_...",
    description: "ZCode \u7F16\u7A0B\u52A9\u624B\u8BA2\u9605\u8D26\u53F7"
  },
  {
    channelId: "custom",
    name: "\u81EA\u5B9A\u4E49 OpenAI \u517C\u5BB9\u63A5\u53E3",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: ["gpt-4o", "deepseek-chat"],
    authType: "api-key",
    placeholder: "sk-...",
    description: "\u7B2C\u4E09\u65B9\u4E2D\u8F6C\u3001OneAPI\u3001NewAPI\u3001Ollama\u3001vLLM \u6216\u672C\u5730\u6A21\u578B\u670D\u52A1"
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
  return {
    status,
    busy,
    refresh,
    setMode,
    updateMasking,
    addAccount,
    removeAccount,
    updateStrategy
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
  const badgeText = topQuota ? `${topQuota.windowLabel} ${topQuota.remainingPercent}%` : "\u989D\u5EA6\u6B63\u5E38";
  const tone = topQuota && topQuota.remainingPercent <= 20 ? "warning" : "info";
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
            title: "Hitchfin \u8BA2\u9605\u989D\u5EA6\u4E0E\u8D26\u53F7\u6C60",
            children: [
              "HF \xB7 ",
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
              minWidth: "260px",
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
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Hitchfin \u8BA2\u9605\u6C60" }),
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
                "\u5DF2\u63A5\u5165\u8D26\u53F7: ",
                status.accounts.length,
                " \xB7 \u6D3B\u8DC3\u53EF\u7528: ",
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
function HitchfinUnifiedSettingsDashboard() {
  const {
    status,
    busy,
    refresh,
    setMode,
    updateMasking,
    addAccount,
    removeAccount,
    updateStrategy
  } = useHitchfinStatus();
  const [showAddForm, setShowAddForm] = (0, import_react.useState)(status.accounts.length === 0);
  const [selectedChannel, setSelectedChannel] = (0, import_react.useState)("deepseek");
  const [accountLabel, setAccountLabel] = (0, import_react.useState)("");
  const [authSecret, setAuthSecret] = (0, import_react.useState)("");
  const [showSecret, setShowSecret] = (0, import_react.useState)(false);
  const [baseUrlInput, setBaseUrlInput] = (0, import_react.useState)("https://api.deepseek.com");
  const [modelsInput, setModelsInput] = (0, import_react.useState)(
    "deepseek-chat, deepseek-reasoner"
  );
  const [formError, setFormError] = (0, import_react.useState)("");
  const [formSuccess, setFormSuccess] = (0, import_react.useState)("");
  const [showAdvanced, setShowAdvanced] = (0, import_react.useState)(false);
  const handleChannelChange = (channelId) => {
    setSelectedChannel(channelId);
    const preset = CHANNEL_PRESETS.find((p) => p.channelId === channelId);
    if (preset) {
      setBaseUrlInput(preset.defaultBaseUrl);
      setModelsInput(preset.defaultModels.join(", "));
      if (!accountLabel || CHANNEL_PRESETS.some((p) => p.name === accountLabel)) {
        setAccountLabel(preset.name);
      }
    }
  };
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (!accountLabel.trim()) {
      setFormError("\u8BF7\u8F93\u5165\u8D26\u53F7\u6807\u7B7E\u6216\u5907\u6CE8");
      return;
    }
    if (!authSecret.trim()) {
      setFormError("\u8BF7\u8F93\u5165 API Key \u6216 Token \u51ED\u8BC1");
      return;
    }
    const preset = CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel);
    const models = modelsInput.split(",").map((m) => m.trim()).filter(Boolean);
    try {
      await addAccount({
        channelId: selectedChannel,
        label: accountLabel.trim(),
        authType: preset?.authType ?? "api-key",
        apiKey: authSecret.trim(),
        baseUrl: baseUrlInput.trim() || void 0,
        models: models.length > 0 ? models : void 0
      });
      setFormSuccess("\u8D26\u53F7\u8FDE\u63A5\u6210\u529F\uFF01\u5DF2\u540C\u6B65\u81F3 DSH \u6A21\u578B\u9009\u62E9\u5217\u8868\u3002");
      setAuthSecret("");
      setTimeout(() => {
        setFormSuccess("");
        setShowAddForm(false);
      }, 1800);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };
  const activeStrategy = status.defaultStrategy ?? "smart";
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
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Hitchfin \u8BA2\u9605\u7BA1\u7406\u4E0E\u667A\u80FD\u8DEF\u7531" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "success", children: "\u539F\u751F\u96C6\u6210" })
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
                    children: "\u81EA\u4E3B\u6DFB\u52A0\u7BA1\u7406\u5404\u5E73\u53F0\u8BA2\u9605\u8D26\u53F7\uFF08DeepSeek\u3001OpenAI\u3001Copilot\u3001Claude\u3001Gemini\u3001Trae \u7B49\uFF09\uFF0C\u591A\u8D26\u53F7\u805A\u5408\u8F6E\u8BE2\u4E0E\u51FA\u7AD9\u9690\u79C1\u8131\u654F\u4FDD\u62A4\u3002"
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
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: showAddForm ? "\u2715 \u6536\u8D77\u6DFB\u52A0\u8868\u5355" : "\u2795 \u6DFB\u52A0\u8BA2\u9605\u8D26\u53F7" })
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(128,128,128,0.2)",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.05))"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u6D3B\u8DC3\u8BA2\u9605\u8D26\u53F7" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "22px", fontWeight: 600, marginTop: "2px" }, children: status.accounts.length })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(128,128,128,0.2)",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.05))"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u51FA\u7AD9\u8131\u654F\u4FDD\u62A4" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "22px", fontWeight: 600, marginTop: "2px" }, children: [
                      status.stats.maskedSecretsCount,
                      " ",
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", fontWeight: 400 }, children: "\u6B21" })
                    ] })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(128,128,128,0.2)",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.05))"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u62E6\u622A\u9AD8\u5371\u5916\u53D1" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "22px", fontWeight: 600, marginTop: "2px" }, children: [
                      status.stats.blockedExfiltrationsCount,
                      " ",
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", fontWeight: 400 }, children: "\u6B21" })
                    ] })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(128,128,128,0.2)",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.05))"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u81EA\u52A8\u5BB9\u707E\u5207\u53F7" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "22px", fontWeight: 600, marginTop: "2px" }, children: [
                      status.stats.failoverCount,
                      " ",
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", fontWeight: 400 }, children: "\u6B21" })
                    ] })
                  ]
                }
              )
            ]
          }
        ),
        showAddForm && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "form",
          {
            onSubmit: handleSaveAccount,
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
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0, fontSize: "15px", fontWeight: 600 }, children: "\u2795 \u81EA\u4E3B\u6DFB\u52A0\u8BA2\u9605\u8D26\u53F7" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", opacity: 0.7 }, children: "\u51ED\u8BC1\u76F4\u63A5\u4FDD\u5B58\u5728\u672C\u673A DSH \u51ED\u636E\u5E93\uFF0C\u96F6\u7B2C\u4E09\u65B9\u4E2D\u8F6C" })
                  ]
                }
              ),
              formError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#ef4444",
                    fontSize: "13px"
                  },
                  children: [
                    "\u26A0\uFE0F ",
                    formError
                  ]
                }
              ),
              formSuccess && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                    fontSize: "13px"
                  },
                  children: [
                    "\u2713 ",
                    formSuccess
                  ]
                }
              ),
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
                          children: "\u6E20\u9053\u670D\u52A1\u5546"
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
                          children: CHANNEL_PRESETS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: p.channelId, children: p.name }, p.channelId))
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
                          placeholder: "\u4F8B\u5982\uFF1A\u6211\u7684 DeepSeek \u4E3B\u53F7\u3001Personal Codex",
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
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "\u8BA4\u8BC1\u51ED\u8BC1 (API Key / Token)" }),
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
                    placeholder: CHANNEL_PRESETS.find((p) => p.channelId === selectedChannel)?.placeholder ?? "sk-...",
                    value: authSecret,
                    onChange: (e) => setAuthSecret(e.target.value),
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
                )
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
                          children: "\u63A5\u53E3\u670D\u52A1\u5730\u5740 (Base URL)"
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
                          children: "\u53EF\u7528\u6A21\u578B (\u9017\u53F7\u5206\u9694)"
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
                        children: busy ? "\u6B63\u5728\u4FDD\u5B58..." : "\u4FDD\u5B58\u5E76\u8FDE\u63A5\u8D26\u53F7"
                      }
                    )
                  ]
                }
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
                  "\u5DF2\u8FDE\u63A5\u8BA2\u9605\u8D26\u53F7\u6C60 (",
                  status.accounts.length,
                  ")"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", opacity: 0.7 }, children: "\u5DF2\u6FC0\u6D3B\u7684\u8D26\u53F7\u5C06\u4F5C\u4E3A\u6A21\u578B\u670D\u52A1\u6E90\u6302\u8F7D\u5230 DSH" })
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
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "14px", fontWeight: 600, marginBottom: "6px" }, children: "\u{1F4A1} \u6682\u65E0\u5DF2\u8FDE\u63A5\u7684\u8BA2\u9605\u8D26\u53F7" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "13px", opacity: 0.75, marginBottom: "14px" }, children: "\u70B9\u51FB\u4E0A\u65B9\u3010\u2795 \u6DFB\u52A0\u8BA2\u9605\u8D26\u53F7\u3011\u6309\u94AE\uFF0C\u63A5\u5165\u60A8\u7684 DeepSeek\u3001OpenAI\u3001Claude\u3001Copilot \u6216\u81EA\u5B9A\u4E49\u6A21\u578B\u8D26\u53F7\u3002" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => setShowAddForm(true),
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
                    children: "\u7ACB\u5373\u6DFB\u52A0\u7B2C\u4E00\u679A\u8D26\u53F7"
                  }
                )
              ]
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "12px"
              },
              children: status.accounts.map((acc) => {
                const preset = CHANNEL_PRESETS.find(
                  (p) => p.channelId === acc.channelId || acc.channelId.includes(p.channelId)
                );
                return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "div",
                  {
                    style: {
                      padding: "14px",
                      borderRadius: "8px",
                      border: "1px solid rgba(128,128,128,0.25)",
                      background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.04))",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "10px"
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                          "div",
                          {
                            style: {
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "6px"
                            },
                            children: [
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "14px" }, children: acc.label }),
                              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: acc.state === "Healthy" ? "success" : "warning", children: acc.state === "Healthy" ? "\u6B63\u5E38" : acc.state })
                            ]
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.8, marginBottom: "4px" }, children: [
                          "\u6E20\u9053: ",
                          preset?.name ?? acc.channelId,
                          " \xB7 \u6807\u8BC6: ",
                          acc.slotId
                        ] }),
                        acc.baseUrl && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "div",
                          {
                            style: {
                              fontSize: "11px",
                              opacity: 0.65,
                              fontFamily: "monospace",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginBottom: "6px"
                            },
                            title: acc.baseUrl,
                            children: acc.baseUrl
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" }, children: [
                          (acc.models ?? ["\u9ED8\u8BA4\u6A21\u578B"]).slice(0, 3).map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                            "span",
                            {
                              style: {
                                fontSize: "11px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: "rgba(128,128,128,0.15)"
                              },
                              children: m
                            },
                            m
                          )),
                          (acc.models?.length ?? 0) > 3 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "11px", opacity: 0.6 }, children: [
                            "+",
                            (acc.models?.length ?? 0) - 3
                          ] })
                        ] })
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "div",
                        {
                          style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            paddingTop: "8px",
                            borderTop: "1px solid rgba(128,128,128,0.15)"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "12px", opacity: 0.75 }, children: [
                              "\u989D\u5EA6: ",
                              acc.quotas[0]?.remainingPercent ?? 100,
                              "%"
                            ] }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "button",
                              {
                                type: "button",
                                disabled: busy,
                                onClick: () => {
                                  if (window.confirm(
                                    `\u786E\u5B9A\u8981\u79FB\u9664\u8D26\u53F7 "${acc.label}" \u5417\uFF1F`
                                  )) {
                                    void removeAccount(acc.channelId, acc.slotId);
                                  }
                                },
                                style: {
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid rgba(239,68,68,0.3)",
                                  background: "transparent",
                                  color: "#ef4444",
                                  fontSize: "11px",
                                  cursor: "pointer"
                                },
                                children: "\u5220\u9664"
                              }
                            )
                          ]
                        }
                      )
                    ]
                  },
                  `${acc.channelId}-${acc.slotId}`
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
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { margin: "0 0 4px 0", fontSize: "15px", fontWeight: 600 }, children: "\u667A\u80FD\u8DEF\u7531\u4E0E\u8C03\u5EA6\u7B56\u7565" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: "12px", opacity: 0.75 }, children: "\u5F53\u540C\u4E00\u4E2A\u670D\u52A1\u5546\u4E0B\u914D\u7F6E\u4E86\u591A\u4E2A\u8D26\u53F7\u65F6\uFF0C\u63A7\u5236\u8BF7\u6C42\u5982\u4F55\u5728\u5404\u8D26\u53F7\u4E4B\u95F4\u5206\u53D1\u3002" })
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
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: "12px", opacity: 0.75 }, children: "\u5728\u8BF7\u6C42\u79BB\u5F00 DSH \u8FDB\u7A0B\u524D\uFF0C\u5B9E\u65F6\u5C06\u654F\u611F API Key / \u79C1\u94A5\u66FF\u6362\u4E3A HMAC \u5360\u4F4D\u7B26\uFF0C\u5E76\u5728\u6D41\u8FD4\u56DE\u65F6\u5B89\u5168\u8FD8\u539F\u3002" })
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
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "13px" }, children: "\u51FA\u7AD9\u654F\u611F\u4FE1\u606F\u81EA\u52A8\u8131\u654F (`llm/stream`)" }),
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
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: "\u672C\u5730\u5386\u53F2 Magpie \u51ED\u8BC1" }),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { opacity: 0.75 }, children: [
                              "\u7F51\u5173\u72B6\u6001:",
                              " ",
                              status.magpieBridgeReachable ? "\u{1F7E2} \u5DF2\u68C0\u6D4B\u5230\u672C\u5730\u670D\u52A1" : "\u26AA \u672A\u8FD0\u884C"
                            ] })
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
                              children: "\u63A2\u6D4B\u672C\u5730 Magpie"
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
