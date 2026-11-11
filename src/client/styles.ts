/**
 * Design system for the subscription-bridge settings section.
 *
 * Tokens follow a 4px spacing baseline, a six-step type scale and a four-step
 * radius scale. Colour tokens are tuned for WCAG AA body text (>= 4.5:1) in
 * both themes. Class names are kept stable so the markup in index.tsx only
 * needs structural changes, not a rename.
 */
export const CSS = `
.hf-wrap {
  /* Spacing: 4px baseline */
  --hf-s1: 4px;
  --hf-s2: 8px;
  --hf-s3: 12px;
  --hf-s4: 16px;
  --hf-s5: 20px;
  --hf-s6: 24px;
  --hf-s8: 32px;
  /* Radius */
  --hf-r-xs: 6px;
  --hf-r-sm: 9px;
  --hf-r-md: 12px;
  --hf-r-lg: 18px;
  /* Type scale */
  --hf-fs-xs: 11.5px;
  --hf-fs-sm: 12.5px;
  --hf-fs-base: 14px;
  --hf-fs-md: 15px;
  --hf-fs-lg: 17px;
  --hf-fs-xl: 24px;
  /* Light palette */
  --hf-bg: #ffffff;
  --hf-bg-soft: #f7f8fa;
  --hf-bg-sunken: #eef0f3;
  --hf-text: #16181c;
  --hf-text-2: #3b3f47;
  --hf-muted: #5b6068;
  --hf-faint: #686e78;
  --hf-border: rgba(22, 24, 28, .10);
  --hf-border-strong: rgba(22, 24, 28, .18);
  --hf-hover: rgba(22, 24, 28, .045);
  --hf-success: #1d6b52;
  --hf-success-soft: rgba(29, 107, 82, .09);
  --hf-danger: #ad2b22;
  --hf-danger-soft: rgba(173, 43, 34, .07);
  --hf-danger-border: rgba(173, 43, 34, .22);
  --hf-warning: #855500;
  --hf-warning-soft: rgba(133, 85, 0, .08);
  --hf-shadow: 0 1px 2px rgba(16, 18, 22, .04), 0 12px 32px rgba(16, 18, 22, .06);
  --hf-shadow-sm: 0 1px 2px rgba(16, 18, 22, .05);
  --hf-shadow-menu: 0 12px 32px rgba(16, 18, 22, .16);
  --hf-brand: #1f5bc4;
  --hf-brand-soft: rgba(31, 91, 196, .08);
  max-width: 820px;
  padding: var(--hf-s1) 0 var(--hf-s8);
  color: var(--hf-text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif;
  font-size: var(--hf-fs-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.hf-dark {
  --hf-bg: #1b1c1f;
  --hf-bg-soft: #232428;
  --hf-bg-sunken: #2c2e33;
  --hf-text: #f4f5f7;
  --hf-text-2: #d3d6dc;
  --hf-muted: #a9aeb8;
  --hf-faint: #9298a3;
  --hf-border: rgba(255, 255, 255, .10);
  --hf-border-strong: rgba(255, 255, 255, .19);
  --hf-hover: rgba(255, 255, 255, .06);
  --hf-success: #74c9ab;
  --hf-success-soft: rgba(116, 201, 171, .12);
  --hf-danger: #ff948c;
  --hf-danger-soft: rgba(255, 148, 140, .10);
  --hf-danger-border: rgba(255, 148, 140, .28);
  --hf-warning: #f0bd72;
  --hf-warning-soft: rgba(240, 189, 114, .10);
  --hf-shadow: 0 1px 2px rgba(0, 0, 0, .24), 0 14px 36px rgba(0, 0, 0, .26);
  --hf-shadow-sm: 0 1px 2px rgba(0, 0, 0, .28);
  --hf-shadow-menu: 0 14px 34px rgba(0, 0, 0, .44);
  /* Accents lighten in dark mode so tinted labels stay >= 4.5:1. */
  --hf-brand: #7aa7f5;
  --hf-brand-soft: rgba(122, 167, 245, .13);
}
/* Channel accents: darkened to stay legible on light surfaces. */
.hf-panel.wb { --hf-brand: #1f5bc4; --hf-brand-soft: rgba(31, 91, 196, .08); }
.hf-panel.qd { --hf-brand: #5942b8; --hf-brand-soft: rgba(89, 66, 184, .09); }
.hf-panel.tr { --hf-brand: #0d6b58; --hf-brand-soft: rgba(13, 107, 88, .09); }
.hf-dark .hf-panel.wb { --hf-brand: #7aa7f5; --hf-brand-soft: rgba(122, 167, 245, .13); }
.hf-dark .hf-panel.qd { --hf-brand: #ab94f2; --hf-brand-soft: rgba(171, 148, 242, .13); }
.hf-dark .hf-panel.tr { --hf-brand: #68cdb0; --hf-brand-soft: rgba(104, 205, 176, .13); }
/* A light accent needs dark label text on filled buttons in dark mode. */
.hf-dark .hf-btn.primary, .hf-dark .hf-method.primary { color: #12141a; }

.hf-wrap * { box-sizing: border-box; }
.hf-wrap button { font: inherit; }
.hf-wrap :is(button, a, input, label):focus-visible {
  outline: 2px solid var(--hf-brand);
  outline-offset: 2px;
  border-radius: var(--hf-r-xs);
}
.hf-wrap ::-webkit-scrollbar { width: 9px; height: 9px; }
.hf-wrap ::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--hf-border-strong);
  background-clip: content-box;
}
.hf-wrap ::-webkit-scrollbar-thumb:hover { background-color: var(--hf-faint); }

/* ---------- Page header ---------- */
.hf-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--hf-s6);
  margin: var(--hf-s1) 0 var(--hf-s5);
}
.hf-title {
  margin: 0;
  font-size: var(--hf-fs-xl);
  line-height: 1.25;
  font-weight: 680;
  letter-spacing: -.028em;
}
.hf-subtitle {
  max-width: 590px;
  margin: var(--hf-s1) 0 0;
  color: var(--hf-muted);
  font-size: var(--hf-fs-sm);
  line-height: 1.6;
}
.hf-privacy {
  display: inline-flex;
  align-items: center;
  gap: var(--hf-s1);
  flex: 0 0 auto;
  margin-top: var(--hf-s1);
  padding: 5px var(--hf-s2);
  border: 1px solid var(--hf-border);
  border-radius: 999px;
  background: var(--hf-bg);
  color: var(--hf-muted);
  font-size: var(--hf-fs-xs);
  font-weight: 550;
  white-space: nowrap;
}
.hf-privacy svg { color: var(--hf-success); }

/* ---------- Overview strip ---------- */
.hf-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--hf-s2);
  margin-bottom: var(--hf-s4);
}
.hf-overview-item {
  display: flex;
  align-items: center;
  gap: var(--hf-s3);
  min-height: 66px;
  padding: var(--hf-s3) var(--hf-s4);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-md);
  background: var(--hf-bg);
  box-shadow: var(--hf-shadow-sm);
  animation: hf-rise .32s cubic-bezier(.2, .8, .2, 1) both;
}
.hf-overview-item:nth-child(2) { animation-delay: .04s; }
.hf-overview-item:nth-child(3) { animation-delay: .08s; }
.hf-overview-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: var(--hf-r-sm);
  background: var(--hf-brand-soft);
  color: var(--hf-brand);
}
.hf-overview-mark svg { width: 16px; height: 16px; }
.hf-overview-copy { min-width: 0; }
.hf-overview-value {
  display: block;
  font-size: 19px;
  font-weight: 680;
  line-height: 1.2;
  letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
}
.hf-overview-value small {
  margin-left: 2px;
  color: var(--hf-faint);
  font-size: var(--hf-fs-sm);
  font-weight: 500;
}
.hf-overview-label {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hf-muted);
  font-size: var(--hf-fs-xs);
}

/* ---------- Alerts ---------- */
.hf-alert {
  display: flex;
  align-items: flex-start;
  gap: var(--hf-s2);
  margin: 0 0 var(--hf-s4);
  padding: var(--hf-s3) var(--hf-s3);
  border: 1px solid var(--hf-danger-border);
  border-radius: var(--hf-r-md);
  background: var(--hf-danger-soft);
  color: var(--hf-danger);
  font-size: var(--hf-fs-sm);
  line-height: 1.55;
}
.hf-alert > svg { flex: 0 0 auto; margin-top: 2px; }
.hf-alert > span { flex: 1; min-width: 0; }
.hf-alert .hf-btn { flex: 0 0 auto; }

/* ---------- Channel tabs ---------- */
.hf-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--hf-s1);
  margin-bottom: var(--hf-s3);
  padding: var(--hf-s1);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-md);
  background: var(--hf-bg-soft);
}
.hf-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--hf-s2);
  min-width: 0;
  min-height: 56px;
  padding: var(--hf-s2) var(--hf-s3);
  border: 1px solid transparent;
  border-radius: var(--hf-r-sm);
  background: transparent;
  color: var(--hf-text);
  text-align: left;
  cursor: pointer;
  transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}
.hf-tab:hover { background: var(--hf-hover); }
.hf-tab:active { transform: translateY(1px); }
.hf-tab.active {
  border-color: var(--hf-border);
  background: var(--hf-bg);
  box-shadow: var(--hf-shadow-sm);
}
.hf-tab.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 999px;
  background: var(--hf-brand);
}
.hf-logo {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: var(--hf-r-sm);
  background: #101114;
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1);
}
.hf-logo.wb { background: transparent; box-shadow: none; }
.hf-logo.tab { width: 32px; height: 32px; border-radius: var(--hf-r-sm); }
.hf-logo.header { width: 44px; height: 44px; border-radius: var(--hf-r-md); }
.hf-logo.empty { width: 56px; height: 56px; margin: 0 auto var(--hf-s3); border-radius: var(--hf-r-md); }
.hf-logo.qd, .hf-logo.tr { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .09); }
.hf-logo-art { display: grid; place-items: center; width: 100%; height: 100%; }
.hf-logo.qd .hf-logo-art, .hf-logo.tr .hf-logo-art { width: 60%; height: 60%; }
.hf-logo-art svg { display: block; width: 100% !important; height: 100% !important; }
.hf-tab:not(.active) .hf-logo { opacity: .72; transition: opacity .18s ease; }
.hf-tab:hover .hf-logo { opacity: 1; }
.hf-tab-copy { min-width: 0; flex: 1; }
.hf-tab-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--hf-fs-base);
  font-weight: 620;
  line-height: 1.35;
}
.hf-tab-meta {
  display: block;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hf-muted);
  font-size: var(--hf-fs-xs);
  line-height: 1.4;
}
.hf-tab-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--hf-faint);
  box-shadow: 0 0 0 3px var(--hf-bg-soft);
}
.hf-tab.active .hf-tab-dot { box-shadow: 0 0 0 3px var(--hf-bg); }
.hf-tab-dot.on { background: var(--hf-success); }
.hf-tab-dot.pending { background: var(--hf-warning); animation: hf-pulse 1.4s ease-in-out infinite; }
.hf-tab-dot.error { background: var(--hf-danger); }

/* ---------- Panel ---------- */
.hf-panel {
  position: relative;
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-lg);
  background: var(--hf-bg);
  box-shadow: var(--hf-shadow);
  animation: hf-rise .24s cubic-bezier(.2, .8, .2, 1);
}
/* Round only the header; the panel itself must not clip account menus. */
.hf-channel-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--hf-s3);
  padding: var(--hf-s5) var(--hf-s5);
  border-bottom: 1px solid var(--hf-border);
  border-radius: var(--hf-r-lg) var(--hf-r-lg) 0 0;
  background: linear-gradient(100deg, var(--hf-brand-soft), transparent 62%);
}
.hf-channel-head::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--hf-brand);
}
.hf-channel-copy { min-width: 0; flex: 1; }
.hf-channel-title {
  display: flex;
  align-items: center;
  gap: var(--hf-s2);
  min-width: 0;
  font-size: var(--hf-fs-lg);
  font-weight: 660;
  line-height: 1.3;
  letter-spacing: -.016em;
}
.hf-channel-title > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-mini-tag {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: 20px;
  padding: 0 var(--hf-s2);
  border-radius: var(--hf-r-xs);
  background: var(--hf-bg-sunken);
  color: var(--hf-text-2);
  font-size: var(--hf-fs-xs);
  font-weight: 600;
  white-space: nowrap;
}
.hf-mini-tag.primary { background: var(--hf-brand-soft); color: var(--hf-brand); }
.hf-mini-tag.plan { background: transparent; box-shadow: inset 0 0 0 1px var(--hf-border); color: var(--hf-muted); }
.hf-mini-tag.warn { background: var(--hf-warning-soft); color: var(--hf-warning); }
.hf-channel-meta {
  margin-top: var(--hf-s1);
  color: var(--hf-muted);
  font-size: var(--hf-fs-sm);
  line-height: 1.5;
}
.hf-channel-actions { display: flex; align-items: center; gap: var(--hf-s2); flex: 0 0 auto; }

/* ---------- Buttons ---------- */
.hf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--hf-s1);
  min-height: 34px;
  padding: 0 var(--hf-s3);
  border: 1px solid var(--hf-border-strong);
  border-radius: var(--hf-r-sm);
  background: var(--hf-bg);
  color: var(--hf-text);
  font-size: var(--hf-fs-sm);
  font-weight: 580;
  line-height: 1.2;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease, opacity .16s ease;
}
.hf-btn:hover:not(:disabled) {
  background: var(--hf-bg-soft);
  border-color: var(--hf-faint);
  box-shadow: var(--hf-shadow-sm);
}
.hf-btn:active:not(:disabled) { transform: translateY(1px); box-shadow: none; }
.hf-btn.primary {
  border-color: var(--hf-brand);
  background: var(--hf-brand);
  color: #fff;
}
.hf-btn.primary:hover:not(:disabled) {
  background: var(--hf-brand);
  border-color: var(--hf-brand);
  opacity: .9;
}
.hf-btn.ghost { border-color: transparent; background: transparent; color: var(--hf-muted); }
.hf-btn.ghost:hover:not(:disabled) { background: var(--hf-hover); color: var(--hf-text); border-color: transparent; box-shadow: none; }
.hf-btn.danger { border-color: var(--hf-danger-border); background: transparent; color: var(--hf-danger); }
.hf-btn.danger:hover:not(:disabled) { background: var(--hf-danger-soft); border-color: var(--hf-danger-border); box-shadow: none; }
.hf-btn.small { min-height: 30px; padding: 0 var(--hf-s2); font-size: var(--hf-fs-sm); }
.hf-btn:disabled { opacity: .45; cursor: default; box-shadow: none; }
.hf-spinner {
  width: 13px;
  height: 13px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: hf-spin .7s linear infinite;
  opacity: .8;
}

/* ---------- Empty / connect states ---------- */
.hf-empty { padding: var(--hf-s8) var(--hf-s6); text-align: center; }
.hf-empty-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin: 0 auto var(--hf-s3);
  border-radius: var(--hf-r-md);
  background: var(--hf-brand-soft);
  color: var(--hf-brand);
}
.hf-empty h3 { margin: 0; font-size: var(--hf-fs-lg); font-weight: 660; letter-spacing: -.016em; }
.hf-empty p {
  max-width: 460px;
  margin: var(--hf-s2) auto 0;
  color: var(--hf-muted);
  font-size: var(--hf-fs-sm);
  line-height: 1.65;
}
.hf-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: var(--hf-s2);
  max-width: 640px;
  margin: var(--hf-s5) auto 0;
}
.hf-method {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--hf-s1);
  min-height: 62px;
  padding: var(--hf-s3) var(--hf-s3);
  border: 1px solid var(--hf-border-strong);
  border-radius: var(--hf-r-md);
  background: var(--hf-bg);
  color: var(--hf-text);
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
.hf-method:hover:not(:disabled) {
  border-color: var(--hf-brand);
  background: var(--hf-brand-soft);
  box-shadow: var(--hf-shadow-sm);
  transform: translateY(-1px);
}
.hf-method:active:not(:disabled) { transform: translateY(0); }
.hf-method.primary { border-color: var(--hf-brand); background: var(--hf-brand); color: #fff; }
.hf-method.primary:hover:not(:disabled) { opacity: .9; background: var(--hf-brand); border-color: var(--hf-brand); }
.hf-method:disabled { opacity: .45; cursor: default; }
.hf-method > span { font-size: var(--hf-fs-sm); font-weight: 620; line-height: 1.4; }
.hf-method > small { font-size: var(--hf-fs-xs); line-height: 1.45; opacity: .72; }

/* ---------- Login banner ---------- */
.hf-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--hf-s3);
  margin: var(--hf-s4) var(--hf-s5) 0;
  padding: var(--hf-s3) var(--hf-s4);
  border: 1px solid var(--hf-border);
  border-left: 3px solid var(--hf-warning);
  border-radius: var(--hf-r-md);
  background: var(--hf-warning-soft);
}
.hf-banner.error { border-left-color: var(--hf-danger); background: var(--hf-danger-soft); }
.hf-banner > svg { flex: 0 0 auto; margin-top: 2px; color: var(--hf-warning); }
.hf-banner.error > svg { color: var(--hf-danger); }
.hf-banner-body { min-width: 0; flex: 1; }
.hf-banner-title { font-size: var(--hf-fs-base); font-weight: 650; line-height: 1.4; }
.hf-banner-text {
  margin-top: var(--hf-s1);
  color: var(--hf-text-2);
  font-size: var(--hf-fs-sm);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.hf-banner.error .hf-banner-text { color: var(--hf-danger); }
.hf-banner-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--hf-s2); margin-top: var(--hf-s3); }
.hf-code-row { display: flex; flex-wrap: wrap; gap: var(--hf-s2); margin-top: var(--hf-s3); }
.hf-code-row .hf-input { flex: 1 1 200px; }
.hf-pulse {
  display: block;
  flex: 0 0 auto;
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--hf-warning);
  animation: hf-pulse 1.4s ease-in-out infinite;
}

/* ---------- Forms ---------- */
.hf-form-panel {
  margin: var(--hf-s4) var(--hf-s5) 0;
  padding: var(--hf-s4);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-md);
  background: var(--hf-bg-soft);
  animation: hf-drop-in .2s cubic-bezier(.2, .8, .2, 1);
}
.hf-form-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--hf-s3); }
.hf-form-title { font-size: var(--hf-fs-base); font-weight: 650; line-height: 1.4; }
.hf-form-desc { margin-top: var(--hf-s1); color: var(--hf-muted); font-size: var(--hf-fs-sm); line-height: 1.55; }
.hf-methods.compact { max-width: none; margin-top: var(--hf-s3); grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.hf-field { margin-top: var(--hf-s4); }
.hf-label {
  display: block;
  margin-bottom: var(--hf-s1);
  color: var(--hf-text-2);
  font-size: var(--hf-fs-sm);
  font-weight: 580;
}
.hf-input {
  width: 100%;
  height: 36px;
  padding: 0 var(--hf-s3);
  border: 1px solid var(--hf-border-strong);
  border-radius: var(--hf-r-sm);
  background: var(--hf-bg);
  color: var(--hf-text);
  font: inherit;
  font-size: var(--hf-fs-sm);
  line-height: 1.4;
  outline: none;
  transition: border-color .16s ease, box-shadow .16s ease;
}
.hf-input::placeholder { color: var(--hf-faint); }
.hf-input:focus { border-color: var(--hf-brand); box-shadow: 0 0 0 3px var(--hf-brand-soft); }
.hf-input:disabled { opacity: .55; }
.hf-inline-input { display: flex; flex-wrap: wrap; align-items: center; gap: var(--hf-s2); }
.hf-inline-input .hf-input { flex: 1 1 220px; }
.hf-help { margin: var(--hf-s2) 0 0; color: var(--hf-muted); font-size: var(--hf-fs-xs); line-height: 1.6; }
.hf-help a { color: var(--hf-brand); text-decoration: underline; text-underline-offset: 2px; }
.hf-field-error { margin: var(--hf-s1) 0 0; color: var(--hf-danger); font-size: var(--hf-fs-sm); line-height: 1.5; }

/* ---------- Accounts (card layout) ---------- */
.hf-accounts {
  display: flex;
  flex-direction: column;
  gap: var(--hf-s3);
  padding: var(--hf-s4) var(--hf-s5);
}
.hf-account {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--hf-s3);
  padding: var(--hf-s4);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-md);
  background: var(--hf-bg-soft);
  transition: border-color .18s ease, box-shadow .18s ease, opacity .18s ease;
  animation: hf-rise .26s cubic-bezier(.2, .8, .2, 1) both;
}
.hf-account:nth-child(2) { animation-delay: .05s; }
.hf-account:nth-child(3) { animation-delay: .1s; }
.hf-account:hover { border-color: var(--hf-border-strong); box-shadow: var(--hf-shadow-sm); }
.hf-account.off { background: transparent; }
.hf-account.off .hf-account-main { opacity: .6; }
.hf-account-main { min-width: 0; }
.hf-account-top { display: flex; align-items: center; gap: var(--hf-s2); min-width: 0; flex-wrap: wrap; }
.hf-channel-note { margin-top: var(--hf-s2); color: var(--hf-muted); font-size: var(--hf-fs-sm); line-height: 1.55; }
.hf-channel-note.warn { color: var(--hf-warning); }
.hf-account-meta { display: flex; align-items: center; gap: var(--hf-s2); flex-wrap: wrap; margin-top: var(--hf-s3); }
.hf-account-meta-info { flex: 1 1 auto; min-width: 0; color: var(--hf-muted); font-size: var(--hf-fs-xs); line-height: 1.5; }
.hf-account-actions { display: flex; align-items: center; gap: var(--hf-s1); flex: 0 0 auto; }
.hf-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--hf-success);
  box-shadow: 0 0 0 3px var(--hf-success-soft);
}
.hf-dot.off { background: var(--hf-faint); box-shadow: none; }
.hf-dot.warn { background: var(--hf-warning); box-shadow: 0 0 0 3px var(--hf-warning-soft); }
.hf-account-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--hf-fs-md);
  font-weight: 640;
  line-height: 1.35;
  letter-spacing: -.01em;
}
.hf-account-id {
  flex: 0 0 auto;
  color: var(--hf-faint);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--hf-fs-xs);
}
.hf-quotas { margin-top: var(--hf-s3); display: flex; flex-direction: column; gap: var(--hf-s3); }
.hf-quota-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--hf-s3);
  font-size: var(--hf-fs-xs);
  line-height: 1.45;
}
.hf-quota-label {
  display: inline-flex;
  align-items: center;
  gap: var(--hf-s1);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 580;
  color: var(--hf-text-2);
}
.hf-quota-free {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 var(--hf-s1);
  border-radius: var(--hf-r-xs);
  background: var(--hf-success-soft);
  color: var(--hf-success);
  font-size: var(--hf-fs-xs);
  font-weight: 620;
}
.hf-quota-value {
  flex: 0 0 auto;
  text-align: right;
  white-space: nowrap;
  color: var(--hf-text);
  font-variant-numeric: tabular-nums;
}
.hf-quota-amount { font-size: var(--hf-fs-sm); font-weight: 650; letter-spacing: -.01em; }
.hf-quota-reset { color: var(--hf-muted); font-weight: 400; }
.hf-progress {
  height: 6px;
  margin-top: var(--hf-s2);
  overflow: hidden;
  border-radius: 999px;
  background: var(--hf-bg-sunken);
}
.hf-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--hf-brand);
  transition: width .4s cubic-bezier(.2, .8, .2, 1);
}
.hf-progress.free > span { background: var(--hf-success); }
.hf-progress.warn > span { background: var(--hf-warning); }
.hf-progress.full > span { background: var(--hf-danger); }
.hf-account-sub { margin-top: var(--hf-s2); color: var(--hf-muted); font-size: var(--hf-fs-sm); line-height: 1.55; }
.hf-account-error {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--hf-s1) var(--hf-s2);
  margin-top: var(--hf-s2);
  color: var(--hf-danger);
  font-size: var(--hf-fs-sm);
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.hf-account-error svg { flex: 0 0 auto; margin-top: 2px; }
.hf-error-action {
  min-height: 22px;
  padding: 0;
  color: var(--hf-danger);
  font-size: var(--hf-fs-xs);
  font-weight: 620;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.hf-account-side { display: flex; align-items: flex-start; gap: var(--hf-s1); }

/* Switches: one base component, a compact variant for account rows.
   Previously .hf-switch was declared twice and the second declaration
   silently overrode the account switch. */
.hf-switch {
  position: relative;
  flex: 0 0 auto;
  width: 42px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--hf-bg-sunken);
  box-shadow: inset 0 0 0 1px var(--hf-border);
  cursor: pointer;
  transition: background .2s ease, box-shadow .2s ease;
}
.hf-switch:hover:not(:disabled) { box-shadow: inset 0 0 0 1px var(--hf-border-strong); }
.hf-switch.on { background: var(--hf-success); box-shadow: inset 0 0 0 1px transparent; }
.hf-switch:disabled { opacity: .45; cursor: default; }
.hf-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .24);
  transition: transform .2s cubic-bezier(.2, .8, .2, 1);
}
.hf-switch.on .hf-switch-knob { transform: translateX(18px); }
.hf-switch.compact { width: 36px; height: 24px; }
.hf-switch.compact.on { background: var(--hf-brand); }
.hf-switch.compact .hf-switch-knob { top: 2px; left: 2px; width: 20px; height: 20px; }
.hf-switch.compact.on .hf-switch-knob { transform: translateX(12px); }

/* ---------- Small controls ---------- */
.hf-reorder {
  display: inline-flex;
  align-items: center;
  height: 28px;
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-sm);
  overflow: hidden;
}
.hf-reorder button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hf-muted);
  font-size: var(--hf-fs-sm);
  line-height: 1;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.hf-reorder button + button { border-left: 1px solid var(--hf-border); }
.hf-reorder button:hover:not(:disabled) { background: var(--hf-hover); color: var(--hf-text); }
.hf-reorder button:disabled { opacity: .32; cursor: default; }
.hf-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--hf-s1);
  min-height: 28px;
  padding: 0 var(--hf-s2);
  border: 1px solid transparent;
  border-radius: var(--hf-r-xs);
  background: transparent;
  color: var(--hf-muted);
  font-size: var(--hf-fs-xs);
  font-weight: 580;
  white-space: nowrap;
  cursor: pointer;
  transition: background .16s ease, color .16s ease, border-color .16s ease;
}
.hf-mini-btn:hover:not(:disabled) { border-color: var(--hf-border); background: var(--hf-bg); color: var(--hf-text); }
.hf-mini-btn svg { opacity: .85; }
.hf-icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--hf-r-xs);
  background: transparent;
  color: var(--hf-muted);
  cursor: pointer;
  transition: background .16s ease, color .16s ease, border-color .16s ease;
}
.hf-icon-btn:hover:not(:disabled), .hf-icon-btn[aria-expanded="true"] {
  border-color: var(--hf-border);
  background: var(--hf-bg);
  color: var(--hf-text);
}
.hf-icon-btn:disabled { opacity: .4; cursor: default; }
.hf-menu {
  position: absolute;
  z-index: 20;
  top: 38px;
  right: 0;
  min-width: 168px;
  padding: var(--hf-s1);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-md);
  background: var(--hf-bg);
  box-shadow: var(--hf-shadow-menu);
  animation: hf-drop-in .16s cubic-bezier(.2, .8, .2, 1);
}
.hf-menu > button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 32px;
  padding: 0 var(--hf-s2);
  border: 0;
  border-radius: var(--hf-r-xs);
  background: transparent;
  color: var(--hf-text);
  font-size: var(--hf-fs-sm);
  text-align: left;
  cursor: pointer;
}
.hf-menu > button:hover:not(:disabled) { background: var(--hf-hover); }
.hf-menu > button.danger { color: var(--hf-danger); }
.hf-menu > button:disabled { opacity: .4; cursor: default; }
.hf-menu-confirm { padding: var(--hf-s2) var(--hf-s2) var(--hf-s1); }
.hf-menu-confirm p { margin: 0 0 var(--hf-s2); color: var(--hf-muted); font-size: var(--hf-fs-xs); line-height: 1.55; }
.hf-menu-actions { display: flex; gap: var(--hf-s1); justify-content: flex-end; }
.hf-inline-panel {
  grid-column: 1 / -1;
  margin-top: var(--hf-s1);
  padding: var(--hf-s3);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-md);
  background: var(--hf-bg);
  animation: hf-drop-in .18s cubic-bezier(.2, .8, .2, 1);
}
.hf-inline-panel .hf-help { margin-top: var(--hf-s2); }

/* ---------- Preferences ---------- */
.hf-prefs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border-top: 1px solid var(--hf-border);
  background: var(--hf-bg-soft);
}
.hf-pref {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--hf-s4);
  min-height: 76px;
  padding: var(--hf-s4) var(--hf-s5);
}
.hf-pref + .hf-pref { border-left: 1px solid var(--hf-border); }
.hf-pref-copy { min-width: 0; }
.hf-pref-title { font-size: var(--hf-fs-base); font-weight: 620; line-height: 1.4; }
.hf-pref-desc { margin-top: var(--hf-s1); color: var(--hf-muted); font-size: var(--hf-fs-xs); line-height: 1.5; }
.hf-pref-desc .hf-mini-tag { margin-right: var(--hf-s1); }

/* ---------- Model visibility panel ---------- */
.hf-models-panel {
  padding: var(--hf-s4) var(--hf-s5) var(--hf-s5);
  border-top: 1px solid var(--hf-border);
  background: var(--hf-bg);
  animation: hf-drop-in .2s cubic-bezier(.2, .8, .2, 1);
}
.hf-models-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--hf-s3); }
.hf-models-title { font-size: var(--hf-fs-base); font-weight: 650; line-height: 1.4; }
.hf-models-sub { margin-top: var(--hf-s1); color: var(--hf-muted); font-size: var(--hf-fs-xs); line-height: 1.5; }
.hf-model-progress {
  height: 4px;
  margin-top: var(--hf-s3);
  overflow: hidden;
  border-radius: 999px;
  background: var(--hf-bg-sunken);
}
.hf-model-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--hf-brand);
  transition: width .4s cubic-bezier(.2, .8, .2, 1);
}
.hf-model-tools { display: flex; align-items: center; gap: var(--hf-s2); margin-top: var(--hf-s4); flex-wrap: wrap; }
.hf-tool-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  padding: var(--hf-s1);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-sm);
  background: var(--hf-bg-soft);
}
.hf-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 220px;
  min-width: 170px;
}
.hf-search > svg { position: absolute; left: 10px; color: var(--hf-faint); pointer-events: none; }
.hf-search .hf-input { height: 34px; padding-left: 32px; padding-right: 30px; }
.hf-search-clear {
  position: absolute;
  right: 4px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--hf-r-xs);
  background: transparent;
  color: var(--hf-faint);
  cursor: pointer;
}
.hf-search-clear:hover { background: var(--hf-hover); color: var(--hf-text); }
.hf-link-btn {
  min-height: 28px;
  padding: 0 var(--hf-s2);
  border: 0;
  border-radius: var(--hf-r-xs);
  background: transparent;
  color: var(--hf-text-2);
  font-size: var(--hf-fs-xs);
  font-weight: 580;
  cursor: pointer;
  white-space: nowrap;
  transition: background .16s ease, color .16s ease;
}
.hf-link-btn:hover:not(:disabled) { background: var(--hf-bg); color: var(--hf-brand); }
.hf-link-btn:disabled { opacity: .4; cursor: default; }
.hf-models-warn, .hf-filter-note {
  display: flex;
  align-items: flex-start;
  gap: var(--hf-s2);
  margin-top: var(--hf-s3);
  padding: var(--hf-s2) var(--hf-s3);
  border-radius: var(--hf-r-sm);
  background: var(--hf-warning-soft);
  color: var(--hf-text-2);
  font-size: var(--hf-fs-xs);
  line-height: 1.6;
}
.hf-filter-note { align-items: center; }
.hf-model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: var(--hf-s2);
  max-height: 340px;
  margin-top: var(--hf-s4);
  padding: var(--hf-s1);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.hf-model-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--hf-s2);
  min-height: 38px;
  padding: 0 var(--hf-s3);
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-r-sm);
  background: var(--hf-bg);
  color: var(--hf-text);
  cursor: pointer;
  user-select: none;
  transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, opacity .16s ease;
}
.hf-model-item:hover { border-color: var(--hf-brand); background: var(--hf-brand-soft); box-shadow: var(--hf-shadow-sm); }
.hf-model-item input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  font-size: inherit;
}
.hf-check {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border: 1px solid var(--hf-border-strong);
  border-radius: var(--hf-r-xs);
  background: var(--hf-bg);
  color: transparent;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.hf-model-item input:checked + .hf-check { border-color: var(--hf-brand); background: var(--hf-brand); color: #fff; }
.hf-model-item input:focus-visible + .hf-check { outline: 2px solid var(--hf-brand); outline-offset: 2px; }
.hf-model-item.off { opacity: .58; }
.hf-model-item.off .hf-model-name { color: var(--hf-faint); }
.hf-model-item.filtered { opacity: .62; }
.hf-model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--hf-fs-sm);
}
.hf-model-tag {
  flex: 0 0 auto;
  color: var(--hf-muted);
  font-size: var(--hf-fs-xs);
  font-weight: 580;
}
.hf-model-tag.free { color: var(--hf-success); }
.hf-empty-line {
  margin: var(--hf-s5) 0 var(--hf-s1);
  padding: var(--hf-s5);
  border: 1px dashed var(--hf-border-strong);
  border-radius: var(--hf-r-md);
  color: var(--hf-muted);
  font-size: var(--hf-fs-sm);
  text-align: center;
}

/* ---------- Footer / toast / skeleton ---------- */
.hf-foot {
  margin: var(--hf-s4) var(--hf-s1) 0;
  color: var(--hf-faint);
  font-size: var(--hf-fs-xs);
  line-height: 1.6;
}
.hf-toast {
  position: fixed;
  z-index: 80;
  left: 50%;
  bottom: var(--hf-s8);
  display: flex;
  align-items: center;
  gap: var(--hf-s2);
  max-width: min(440px, calc(100vw - 40px));
  padding: var(--hf-s3) var(--hf-s4);
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: var(--hf-r-md);
  background: var(--hf-text);
  color: var(--hf-bg);
  box-shadow: 0 12px 34px rgba(0, 0, 0, .24);
  font-size: var(--hf-fs-sm);
  line-height: 1.45;
  transform: translateX(-50%);
  animation: hf-toast-in .22s cubic-bezier(.2, .8, .2, 1);
}
.hf-toast.error { background: var(--hf-danger); color: #fff; }
.hf-toast svg { flex: 0 0 auto; }
.hf-skeleton-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--hf-s1); padding: var(--hf-s1); border: 1px solid var(--hf-border); border-radius: var(--hf-r-md); background: var(--hf-bg-soft); }
.hf-skel { position: relative; overflow: hidden; border-radius: var(--hf-r-sm); background: var(--hf-bg-sunken); }
.hf-skel::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .28), transparent);
  transform: translateX(-100%);
  animation: hf-shimmer 1.3s ease-in-out infinite;
}
.hf-dark .hf-skel::after { background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .07), transparent); }
.hf-skel-tab { height: 56px; }
.hf-panel-skeleton { margin-top: var(--hf-s3); padding: var(--hf-s5); display: flex; flex-direction: column; gap: var(--hf-s4); }
.hf-skel-head { width: 42%; height: 40px; }
.hf-skel-row { width: 100%; height: 62px; }
.hf-skel-row.short { width: 72%; }

/* ---------- Motion ---------- */
@keyframes hf-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes hf-drop-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes hf-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes hf-spin { to { transform: rotate(360deg); } }
@keyframes hf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes hf-shimmer { 100% { transform: translateX(100%); } }

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .hf-head { gap: var(--hf-s3); }
  .hf-overview { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .hf-overview-item { flex-direction: column; align-items: flex-start; gap: var(--hf-s2); padding: var(--hf-s3); }
  .hf-overview-mark { width: 30px; height: 30px; }
  .hf-channel-head { padding: var(--hf-s4); }
  .hf-accounts { padding: var(--hf-s4); }
  .hf-pref { padding: var(--hf-s3) var(--hf-s4); }
  .hf-models-panel { padding: var(--hf-s4); }
  .hf-banner, .hf-form-panel { margin-left: var(--hf-s4); margin-right: var(--hf-s4); }
  .hf-model-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
}
@media (max-width: 640px) {
  .hf-privacy { display: none; }
  .hf-tab { flex-direction: column; align-items: flex-start; gap: var(--hf-s1); padding: var(--hf-s2); min-height: 72px; }
  .hf-tab-copy { width: 100%; }
  .hf-tab.active::before { top: 0; bottom: auto; left: 0; right: 0; width: auto; height: 3px; border-radius: var(--hf-r-md) var(--hf-r-md) 0 0; }
  .hf-tab-dot { position: absolute; top: var(--hf-s3); right: var(--hf-s2); }
  .hf-channel-head { flex-wrap: wrap; align-items: flex-start; }
  .hf-channel-actions { width: 100%; margin-top: var(--hf-s1); }
  .hf-channel-actions .hf-btn { width: 100%; }
  .hf-account { grid-template-columns: minmax(0, 1fr); }
  .hf-account-main { padding-right: 56px; }
  .hf-account-side { position: absolute; top: var(--hf-s4); right: var(--hf-s4); margin-top: 0; }
  .hf-prefs { grid-template-columns: 1fr; }
  .hf-pref + .hf-pref { border-top: 1px solid var(--hf-border); border-left: 0; }
  .hf-methods { grid-template-columns: 1fr; max-width: 380px; }
  .hf-model-tools { align-items: stretch; }
  .hf-search { flex: 1 1 100%; }
  .hf-tool-group { flex: 1 1 100%; justify-content: space-between; }
  .hf-quota-line { flex-wrap: wrap; gap: var(--hf-s1) var(--hf-s3); }
  .hf-quota-value { width: 100%; text-align: left; white-space: normal; }
  .hf-account-actions { flex-wrap: wrap; }
  .hf-menu { top: 36px; }
}
@media (max-width: 420px) {
  .hf-overview { grid-template-columns: 1fr; }
  .hf-overview-item { flex-direction: row; align-items: center; min-height: 56px; }
  .hf-tab-name { font-size: var(--hf-fs-sm); }
  .hf-model-grid { grid-template-columns: 1fr; }
  .hf-tool-group { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) {
  .hf-wrap *, .hf-wrap *::before, .hf-wrap *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
`
