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
  HitchfinBundleConfigPanel: () => HitchfinBundleConfigPanel,
  HitchfinComposerQuotaCapsule: () => HitchfinComposerQuotaCapsule,
  HitchfinModelLabel: () => HitchfinModelLabel,
  HitchfinPrivacySettingsPage: () => HitchfinPrivacySettingsPage,
  HitchfinRoutingSettingsPage: () => HitchfinRoutingSettingsPage,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-hitchfin";
var inject = ["slots", "locale"];
var zh = {
  "nav.routing": "Hitchfin \u6E20\u9053\u4E0E\u8DEF\u7531",
  "nav.privacy": "Hitchfin \u9690\u79C1\u4E0E\u914D\u989D",
  "badge.quota": "{window} {percent}%",
  "capsule.title": "\u8BA2\u9605\u989D\u5EA6\u4E0E\u8D26\u53F7\u6C60"
};
var en = {
  "nav.routing": "Hitchfin Channels & Routing",
  "nav.privacy": "Hitchfin Privacy & Quota",
  "badge.quota": "{window} {percent}%",
  "capsule.title": "Subscription Quota & Accounts"
};
var FALLBACK_SNAPSHOT = {
  mode: "auto",
  activeMode: "bridge",
  magpieBridgeReachable: true,
  magpieEndpoint: "http://127.0.0.1:3425",
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
  return { status, busy, refresh, setMode, updateMasking };
}
function HitchfinModelLabel({ provider, model }) {
  const isHitchfin = provider.id.startsWith("hitchfin");
  if (!isHitchfin) {
    return model.name;
  }
  const slot = cachedSnapshot.accounts.find(
    (a) => a.channelId === provider.id && a.state === "Healthy"
  );
  const topQuota = slot?.quotas?.[0];
  const badgeText = topQuota ? `${topQuota.windowLabel} ${topQuota.remainingPercent}%` : "5h 85%";
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
  const summaryPercent = primaryQuota ? primaryQuota.remainingPercent : 85;
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
            title: "Hitchfin Subscription Quota & Account Pool",
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
              minWidth: "250px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(128,128,128,0.25)",
              background: "#1e1e1e",
              color: "#f0f0f0",
              fontSize: "12px",
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
                    marginBottom: "6px"
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
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,255,255,0.2)",
                          background: "transparent",
                          color: "#f0f0f0",
                          cursor: "pointer"
                        },
                        children: busy ? "..." : "\u5237\u65B0"
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                "\u8FD0\u884C\u6A21\u5F0F: ",
                status.activeMode.toUpperCase(),
                " (",
                status.mode,
                ")"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                "\u53EF\u7528\u6E20\u9053: ",
                status.channels.length,
                " \xB7 \u6D3B\u8DC3\u8D26\u53F7: ",
                healthyCount
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
function HitchfinRoutingSettingsPage() {
  const { status, busy, refresh, setMode } = useHitchfinStatus();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "16px", display: "grid", gap: "16px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { marginTop: 0, marginBottom: "4px" }, children: "Hitchfin \xB7 \u6E20\u9053\u8FDE\u63A5\u4E0E\u667A\u80FD\u8DEF\u7531\u7EC4" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { margin: 0, opacity: 0.8, fontSize: "13px" }, children: [
        "\u652F\u6301 Magpie \u672C\u5730\u7F51\u5173\u52A8\u6001\u5206\u62C6\u6865\u63A5 (",
        status.magpieEndpoint,
        ") \u4E0E\u591A\u8D26\u53F7\u8BA2\u9605\u6C60\u8FDB\u7A0B\u5185\u76F4\u8FDE\u3002"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid rgba(128,128,128,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: "\u8FD0\u884C\u6A21\u5F0F (Runtime Mode)" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: [
              "\u5F53\u524D\u751F\u6548: ",
              status.activeMode,
              " \xB7 Magpie \u7F51\u5173:",
              " ",
              status.magpieBridgeReachable ? "\u5728\u7EBF" : "\u672A\u8FDE\u63A5"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: "6px" }, children: [
            ["auto", "bridge", "standalone"].map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                disabled: busy,
                onClick: () => void setMode(m),
                style: {
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(128,128,128,0.35)",
                  fontWeight: status.mode === m ? 600 : 400,
                  cursor: "pointer"
                },
                children: m
              },
              m
            )),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                disabled: busy,
                onClick: () => void refresh(),
                style: {
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(128,128,128,0.35)",
                  cursor: "pointer"
                },
                children: "\u91CD\u65B0\u63A2\u6D4B"
              }
            )
          ] })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h4", { style: { margin: "0 0 8px 0" }, children: [
        "\u5DF2\u53D1\u73B0\u6E20\u9053 (",
        status.channels.length,
        ")"
      ] }),
      status.channels.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "13px", opacity: 0.7 }, children: "\u6682\u65E0\u5DF2\u6FC0\u6D3B\u6E20\u9053\uFF0C\u8BF7\u786E\u8BA4 Magpie \u6B63\u5728\u8FD0\u884C\u6216\u914D\u7F6E\u539F\u751F\u8BA2\u9605\u51ED\u8BC1\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "grid", gap: "8px" }, children: status.channels.map((ch) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          style: {
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(128,128,128,0.2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: ch.displayName }),
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "12px", opacity: 0.7 }, children: [
                "(",
                ch.channelId,
                ")"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.8 }, children: [
                "\u6A21\u578B\u6570: ",
                ch.models.length,
                " \xB7 \u8D26\u53F7\u6C60: ",
                ch.activeAccounts,
                "/",
                ch.totalAccounts
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Tag,
              {
                tone: ch.complianceTier === "high" ? "warning" : ch.complianceTier === "medium" ? "info" : "success",
                children: ch.source
              }
            )
          ]
        },
        ch.channelId
      )) })
    ] })
  ] });
}
function HitchfinPrivacySettingsPage() {
  const { status, busy, updateMasking } = useHitchfinStatus();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "16px", display: "grid", gap: "16px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { marginTop: 0, marginBottom: "4px" }, children: "Hitchfin \xB7 \u7B56\u7565\u5316\u51FA\u7AD9\u8131\u654F\u4E0E\u914D\u989D\u770B\u677F" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, opacity: 0.8, fontSize: "13px" }, children: "\u51FA\u7AD9\u654F\u611F\u51ED\u8BC1\u81EA\u52A8\u66FF\u6362\u4E3A HMAC \u786E\u5B9A\u6027\u5360\u4F4D\u7B26\uFF0C\u5E76\u7531 PolicyGuard \u62E6\u622A\u5411\u9AD8\u5371\u5DE5\u5177\u81EA\u52A8\u8FD8\u539F\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        style: {
          padding: "12px",
          borderRadius: "8px",
          border: "1px solid rgba(128,128,128,0.25)",
          display: "grid",
          gap: "10px"
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
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: "\u51FA\u7AD9\u81EA\u52A8\u8131\u654F (`llm/stream`)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u5BF9\u53D1\u5F80\u5916\u90E8\u6A21\u578B\u670D\u52A1\u5546\u7684 API Key\u3001\u79C1\u94A5\u548C\u8FDE\u63A5\u4E32\u8FDB\u884C\u96F6\u5185\u5B58\u6B8B\u7559\u66FF\u6362" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    disabled: busy,
                    onClick: () => void updateMasking({ enabled: !status.masking.enabled }),
                    style: {
                      padding: "4px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(128,128,128,0.35)",
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
                alignItems: "center"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600 }, children: "\u9AD8\u5371\u5DE5\u5177\u9632\u5916\u6CC4\u62A4\u680F (`PolicyGuard`)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: [
                    "\u7981\u6B62\u5411 ",
                    status.masking.highRiskToolNames.slice(0, 5).join(", "),
                    " ",
                    "\u7B49\u5DE5\u5177\u81EA\u52A8\u6CE8\u5165\u654F\u611F\u771F\u503C"
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
                      padding: "4px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(128,128,128,0.35)",
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
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "10px"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(128,128,128,0.2)"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u5DF2\u8131\u654F\u673A\u5BC6\u6570" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "20px", fontWeight: 600 }, children: status.stats.maskedSecretsCount })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(128,128,128,0.2)"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "\u62E6\u622A\u9AD8\u5371\u5916\u6CC4" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "20px", fontWeight: 600 }, children: status.stats.blockedExfiltrationsCount })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(128,128,128,0.2)"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", opacity: 0.75 }, children: "429 \u81EA\u52A8\u5207\u53F7" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "20px", fontWeight: 600 }, children: status.stats.failoverCount })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function HitchfinBundleConfigPanel(props) {
  const [activeTab, setActiveTab] = (0, import_react.useState)("routing");
  if (props?.view === "summary") {
    return null;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      "data-testid": "hitchfin-bundle-config",
      style: { display: "flex", flexDirection: "column", gap: "16px" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              gap: "8px",
              borderBottom: "1px solid rgba(128,128,128,0.2)",
              paddingBottom: "8px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => setActiveTab("routing"),
                  style: {
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: activeTab === "routing" ? 600 : 400,
                    background: activeTab === "routing" ? "var(--dsw-alias-bg-layer-3, rgba(16,185,129,0.15))" : "transparent",
                    color: "inherit"
                  },
                  children: "\u6E20\u9053\u4E0E\u667A\u80FD\u8DEF\u7531"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => setActiveTab("privacy"),
                  style: {
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: activeTab === "privacy" ? 600 : 400,
                    background: activeTab === "privacy" ? "var(--dsw-alias-bg-layer-3, rgba(16,185,129,0.15))" : "transparent",
                    color: "inherit"
                  },
                  children: "\u9690\u79C1\u8131\u654F\u4E0E\u914D\u989D\u9632\u62A4"
                }
              )
            ]
          }
        ),
        activeTab === "routing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HitchfinRoutingSettingsPage, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HitchfinPrivacySettingsPage, {})
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
        id: "hitchfin-routing",
        order: 80,
        label: () => "Hitchfin \u8DEF\u7531\u4E0E\u8BA2\u9605",
        locale: namespace
      },
      HitchfinRoutingSettingsPage
    )
  );
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "hitchfin-privacy",
        order: 81,
        label: () => "Hitchfin \u9690\u79C1\u4E0E\u914D\u989D",
        locale: namespace
      },
      HitchfinPrivacySettingsPage
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
      HitchfinBundleConfigPanel
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
      HitchfinBundleConfigPanel
    )
  );
  ctx.slots.inject(
    "plugins.tab",
    () => ctx.slots.register(
      {
        name: "plugins.tab",
        id: namespace,
        order: 20,
        label: () => "Hitchfin \u8DEF\u7531\u4E0E\u8BA2\u9605",
        locale: namespace
      },
      HitchfinBundleConfigPanel
    )
  );
  ctx.slots.inject(
    "settings.plugins.tab",
    () => ctx.slots.register(
      {
        name: "settings.plugins.tab",
        id: namespace,
        order: 70,
        label: () => "Hitchfin \u8DEF\u7531\u4E0E\u8BA2\u9605",
        locale: namespace
      },
      HitchfinBundleConfigPanel
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
          HitchfinBundleConfigPanel
        )
      );
    });
  }
}

    return module.exports;
  }
});
