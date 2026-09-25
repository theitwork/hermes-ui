/* JAY customization — application shell (v2: floating panels + lime).
   Canvas with a floating icon rail and a header panel (desktop), compact app
   bar + bottom nav (phones), hash router, search palette, theme, and the
   bridge into Hermes' own panels ("Hermes mode").
   Hermes remains fully intact underneath; JAY only calls its public globals,
   each feature-detected, and never rewrites Hermes markup. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.views) return;
  const { h, icon, fmt, mount } = JAY;

  const NAV_MAIN = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'chat', label: 'Chat', icon: 'chat', hermes: true, hint: 'Hermes conversations' },
    { id: 'tasks', label: 'Tasks', icon: 'tasks' },
    { id: 'projects', label: 'Projects', icon: 'projects' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'notes', label: 'Notes', icon: 'notes' },
    { id: 'files', label: 'Files', icon: 'files', hermes: true, hint: 'Hermes workspace' },
    { id: 'automations', label: 'Automations', icon: 'automations', hermes: true, hint: 'Hermes scheduled jobs' },
    { id: 'people', label: 'People', icon: 'people' },
  ];
  const NAV_SECONDARY = [
    { id: 'integrations', label: 'Integrations', icon: 'integrations' },
    { id: 'system', label: 'System', icon: 'system' },
  ];
  const ALL_NAV = NAV_MAIN.concat(NAV_SECONDARY);
  const HERMES_ROUTES = { chat: 'chat', files: 'chat', automations: 'tasks' };
  // Hermes panels JAY may open (#/hermes/<panel>); anything else is refused.
  const HERMES_PANELS = ['chat', 'tasks', 'settings', 'profiles', 'skills', 'memory', 'insights', 'logs', 'workspaces', 'kanban', 'todos'];
  const BOTTOM_ROUTES = ['home', 'tasks', 'talk'];
  const TAB_RESTORE = ['home', 'tasks']; // bottom-nav tabs that keep their scroll position
  const HUES = ['blue', 'purple', 'green', 'lime', 'orange', 'red', 'yellow', 'cyan', 'pink', 'neutral'];
  const TONES = ['muted', 'text', 'accent', 'warning', 'danger', 'good', 'info'];
  // Shown only when the data layer cannot name the user.
  const FALLBACK_ME = Object.freeze({ id: 'me', name: 'You' });
  const USER_TIMEOUT = 600;

  const state = { route: null, params: {}, hash: '', dispose: null, mode: 'jay', mobile: JAY.isMobile(), jayOpenedFiles: false };
  const els = {};
  // One-shot hints for the next render: why it happens and whether the page
  // heading should take focus (rail / bottom nav / More / palette navigation).
  const nav = { cause: null, focus: false, popAt: 0, popHash: null };
  const run = { offs: [], timers: [], observers: [] };

  function me() { return JAY.me || FALLBACK_ME; }
  function go(route) {
    const hash = '#/' + route;
    // Same address: no hashchange will follow, so drop the one-shot nav hints.
    if (location.hash === hash) { nav.cause = null; nav.focus = false; return; }
    location.hash = hash;
  }
  function safe(fn) { return (...args) => { try { return fn(...args); } catch (err) { console.warn('[jay] shell action failed', err); return undefined; } }; }
  function alive() { return !!(els.app && els.app.isConnected) && state.mode !== 'off'; }
  function listen(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    run.offs.push(() => target.removeEventListener(type, fn, opts));
  }
  function later(fn, ms) {
    const t = setTimeout(() => {
      const i = run.timers.indexOf(t);
      if (i >= 0) run.timers.splice(i, 1);
      fn();
    }, ms);
    run.timers.push(t);
    return t;
  }
  function cleanHistoryState() {
    const s = history.state;
    if (!s || typeof s !== 'object') return s === undefined ? null : s;
    const copy = Object.assign({}, s);
    delete copy.jaySheet; // a phone sheet's own entry marker must never travel to a new entry
    return copy;
  }

  /* ── Hash helpers (the shell owns the URL; views go through these) ─── */
  function normalizeParams(params) {
    const out = {};
    if (!params || typeof params !== 'object') return out;
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null || v === false || v === '') return;
      out[k] = String(v);
    });
    return out;
  }
  function paramsKey(params) {
    const p = params || {};
    return JSON.stringify(Object.keys(p).sort().map((k) => [k, String(p[k])]));
  }
  function buildHash(route, params) {
    const p = normalizeParams(params);
    const qs = new URLSearchParams();
    Object.keys(p).forEach((k) => { if (k !== '_') qs.set(k, p[k]); });
    const q = qs.toString();
    return '#/' + route + (p._ ? '/' + p._ : '') + (q ? '?' + q : '');
  }
  function toHash(target) {
    const t = String(target || '').trim();
    if (!t) return '#/home';
    if (t.startsWith('#')) return t.startsWith('#/') ? t : '#/' + t.slice(1);
    return '#/' + t.replace(/^\/+/, '');
  }
  // Public: navigate synchronously (the view is rendered when this returns), so a
  // caller can focus something in the new view inside the same user gesture.
  // `target` is a route ('projects', '#/projects/x?tab=y'); `params` (same
  // shape as replaceParams: `_` is the already-encoded path remainder, the
  // rest become the query) replaces whatever path and query `target` carried.
  // `replace` swaps the current history entry instead of adding one.
  function navigate(target, opts) {
    if (!alive()) return;
    const o = opts || {};
    let hash = toHash(target);
    if (o.params && typeof o.params === 'object') {
      const name = hash.slice(2).split('?')[0].split('/')[0] || 'home';
      hash = buildHash(name, o.params);
    }
    const url = location.pathname + location.search + hash;
    if (o.replace) history.replaceState(history.state, '', url);
    else if (location.hash !== hash) history.pushState(cleanHistoryState(), '', url);
    route();
  }
  // Public: a view changes its own URL state (tab, view mode …) without a
  // re-render; the shell keeps state.params in step so re-renders and the
  // "same page" check see what the address bar says.
  function replaceParams(route, params) {
    if (!alive() || !route || route !== state.route) return false;
    const next = normalizeParams(params);
    const hash = buildHash(route, next);
    if (location.hash !== hash) history.replaceState(history.state, '', location.pathname + location.search + hash);
    state.params = next;
    state.hash = location.hash;
    return true;
  }

  /* ── Hermes bridge ─────────────────────────────────────────────────── */
  function hermesAvailable() { return typeof window.switchPanel === 'function'; }
  function hermesMobile() { return typeof window._isDesktopWidth === 'function' ? !window._isDesktopWidth() : JAY.isMobile(); }
  function hermesPanelOk(name) {
    if (!HERMES_PANELS.includes(name)) return false;
    return !!document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1));
  }

  function enterHermes(target, panelOverride) {
    setMode('hermes');
    if (!hermesAvailable()) { JAY.ui.toast('Hermes panels are unavailable in this build.', { tone: 'danger', icon: 'alert-circle' }); return; }
    const panel = panelOverride || HERMES_ROUTES[target] || 'chat';
    try {
      if (hermesMobile() && panel !== 'chat' && typeof window.mobileSwitchPanel === 'function') window.mobileSwitchPanel(panel);
      else window.switchPanel(panel);
      if (panel === 'chat' && hermesMobile() && typeof window.closeMobileSidebar === 'function') window.closeMobileSidebar();
      if (target === 'files') openHermesFiles();
    } catch (err) {
      console.warn('[jay] Hermes panel switch failed', err);
    }
    // Phones: Hermes' full-screen drawer covers the titlebar button, so the
    // drawer carries its own way back to JAY.
    injectDrawerHomeButton();
  }
  // Hermes only opens its workspace browser once a session or default
  // workspace is known, which can lag behind a cold page load. Retry briefly,
  // then say so honestly instead of silently showing nothing.
  function openHermesFiles(attempt) {
    const n = attempt || 0;
    if (!alive() || state.route !== 'files') return;
    if (document.documentElement.dataset.workspacePanel === 'open') return;
    if (typeof window.toggleWorkspacePanel === 'function') {
      window.toggleWorkspacePanel(true);
      state.jayOpenedFiles = true;
    }
    if (document.documentElement.dataset.workspacePanel === 'open') return;
    if (n < 4) { later(() => openHermesFiles(n + 1), 450); return; }
    JAY.ui.toast('Files open with a Hermes workspace — start or pick a conversation in Chat first.', { icon: 'files', duration: 5200 });
  }
  // On phones the workspace panel JAY opened for "Files" would otherwise stay
  // over Chat and every later Hermes page. Desktop keeps the user's layout.
  function closeJayOpenedFiles() {
    if (!state.jayOpenedFiles) return;
    state.jayOpenedFiles = false;
    if (!hermesMobile() || document.documentElement.dataset.workspacePanel !== 'open') return;
    if (typeof window.toggleWorkspacePanel === 'function') {
      try { window.toggleWorkspacePanel(false); } catch (err) { console.warn('[jay] closing Hermes files failed', err); }
    }
  }
  function openHermes(panel) { location.hash = '#/hermes/' + encodeURIComponent(panel); }

  let hermesTitle = '';
  function setMode(mode) {
    const prev = state.mode;
    state.mode = mode;
    document.documentElement.dataset.jayMode = mode;
    // Hermes stays out of the tab order and away from assistive tech while
    // JAY covers it; JAY's own rail stays usable in Hermes mode.
    const hermesRoots = [document.querySelector('.app-titlebar'), document.querySelector('.layout')];
    hermesRoots.forEach((el) => { if (el) el.inert = mode === 'jay'; });
    if (els.main) els.main.inert = mode !== 'jay';
    if (mode === 'hermes' && prev !== 'hermes') {
      // Hermes owns its title and browser-chrome colour while it is on screen.
      if (hermesTitle) document.title = hermesTitle;
      if (typeof window._syncThemeColorMeta === 'function') { try { window._syncThemeColorMeta(); } catch (_) { /* ignore */ } }
    }
    if (mode === 'jay') applyDocTitle();
  }

  function injectHermesHomeButton() {
    if (!alive() || document.getElementById('jayTitlebarHome')) return;
    const host = document.querySelector('.app-titlebar-left');
    if (!host) return;
    const btn = h('button', { type: 'button', id: 'jayTitlebarHome', class: 'jay-hermes-home', 'aria-label': 'Back to JAY Home', onclick: () => go('home') },
      icon('chevron-left', 16), h('span', { class: 'jay-mark is-xs', 'aria-hidden': 'true' }, 'J'), h('span', null, 'JAY'));
    host.insertBefore(btn, host.firstChild);
  }
  function injectDrawerHomeButton() {
    const strip = document.querySelector('.sidebar > .sidebar-nav');
    if (!strip) return;
    let btn = document.getElementById('jayDrawerHome');
    if (btn && btn.parentNode === strip && strip.firstElementChild === btn) return;
    if (!btn) {
      btn = h('button', {
        type: 'button', id: 'jayDrawerHome', class: 'jay-hermes-home is-drawer', 'aria-label': 'Back to JAY Home', title: 'JAY Home',
        onclick: () => {
          if (typeof window.closeMobileSidebar === 'function') { try { window.closeMobileSidebar(); } catch (_) { /* ignore */ } }
          go('home');
        },
      }, h('span', { class: 'jay-mark is-xs', 'aria-hidden': 'true' }, 'J'));
    }
    strip.insertBefore(btn, strip.firstChild);
  }

  // Hermes binds a few global shortcuts (j/k session nav, Cmd/Ctrl+K new chat,
  // Cmd/Ctrl+B sidebar, Cmd/Ctrl+, settings, Enter-to-approve). While JAY covers
  // Hermes they must not act on the hidden UI.
  function guardHermesShortcuts(e) {
    if (!alive() || state.mode !== 'jay') return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    let block = false;
    if (!mod && !e.altKey && (key === 'j' || key === 'k')) block = true;
    if (mod && ['k', 'K', 'b', 'B', ',', '/'].includes(key)) block = true;
    if (key === 'Enter' && !mod && !typing) {
      const card = document.getElementById('approvalCard');
      if (card && card.classList.contains('visible')) block = true;
    }
    if (block) e.stopPropagation();
    if (!typing && !mod && key === '/' && !JAY.ui.hasOpenPanel()) { e.preventDefault(); openSearch(); }
  }

  /* ── Theme ─────────────────────────────────────────────────────────── */
  function themePreference() {
    try { return (localStorage.getItem('hermes-theme') || 'dark').toLowerCase(); } catch (_) { return 'dark'; }
  }
  function isDark() { return document.documentElement.classList.contains('dark'); }
  function setTheme(v) {
    if (typeof window._pickTheme === 'function') window._pickTheme(v);
    else {
      try { localStorage.setItem('hermes-theme', v); } catch (_) { /* ignore */ }
      const dark = v === 'dark' || (v === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    }
    syncThemeButtons();
  }
  function toggleTheme() { setTheme(isDark() ? 'light' : 'dark'); }

  /* ── Density ───────────────────────────────────────────────────────── */
  // Comfortable: floating panels. Dense: one flush window with hairline
  // dividers, smaller type and tighter rows (tablet and desktop; phones keep
  // touch sizes). Dense is the default; the choice is stored per browser, and
  // a page may set another default with <html data-jay-density-default="comfortable">.
  const DENSITIES = ['comfortable', 'dense'];
  function density() {
    const v = JAY.storage.get('density', null);
    if (DENSITIES.includes(v)) return v;
    const d = document.documentElement.getAttribute('data-jay-density-default');
    return DENSITIES.includes(d) ? d : 'dense';
  }
  function applyDensity() { document.documentElement.dataset.jayDensity = density(); }
  function setDensity(v) {
    if (!DENSITIES.includes(v)) return;
    JAY.storage.set('density', v);
    applyDensity();
    JAY.emit('density', v);
  }
  // Every theme control on the page stays in step, whichever one was used:
  // toggles ([data-jay-theme-toggle]), pressed buttons and radio options
  // ([data-jay-theme-choice]); radios follow the stored preference so
  // "System" stays checked when the preference is system.
  function syncThemeButtons() {
    const dark = isDark();
    const pref = themePreference();
    document.querySelectorAll('[data-jay-theme-toggle]').forEach((b) => {
      mount(b, icon(dark ? 'sun' : 'moon', Number(b.dataset.iconSize) || 18));
      b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      b.setAttribute('data-tip', dark ? 'Light mode' : 'Dark mode');
    });
    document.querySelectorAll('[data-jay-theme-choice]').forEach((b) => {
      const choice = b.dataset.jayThemeChoice;
      if (b.getAttribute('role') === 'radio') {
        const on = choice === pref;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.classList.toggle('is-active', on);
        if (b.hasAttribute('tabindex')) b.tabIndex = on ? 0 : -1; // roving radio groups
      } else {
        b.setAttribute('aria-pressed', (choice === 'dark') === dark ? 'true' : 'false');
      }
    });
  }
  function themeButton(cls, size) {
    return h('button', { type: 'button', class: cls, 'data-jay-theme-toggle': '', 'data-icon-size': String(size || 18), onclick: toggleTheme });
  }
  // Browser / status-bar tint follows the JAY surface under it (Hermes'
  // own sync writes its sidebar colour, which never matches the app bar).
  function syncThemeColor() {
    if (!alive() || state.mode !== 'jay') return;
    const token = JAY.isMobile() && state.route === 'talk' ? '--jay-surface' : '--jay-canvas';
    const v = getComputedStyle(els.app).getPropertyValue(token).trim();
    if (!v) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (m.getAttribute('content') !== v) m.setAttribute('content', v);
      if (m.hasAttribute('media')) m.removeAttribute('media');
    });
  }

  function registerSkin() {
    if (typeof window.registerHermesSkin !== 'function') return;
    window.registerHermesSkin({
      name: 'JAY', value: 'jay', colors: ['#0A0A0A', '#A7E05F', '#F4F4F4'],
      tokens: { '--accent': '#A7E05F', '--accent-hover': '#B9EC7B', '--accent-bg': 'rgba(167,224,95,0.10)', '--accent-bg-strong': 'rgba(167,224,95,0.18)', '--accent-text': '#B4E878' },
    });
    // First run only: adopt the JAY palette for Hermes' own chrome unless the
    // user already chose a non-default skin. Later choices are always respected.
    if (!JAY.storage.get('skin-initialized', false)) {
      let current = 'default';
      try { current = (localStorage.getItem('hermes-skin') || 'default').toLowerCase(); } catch (_) { /* ignore */ }
      if (current === 'default' && typeof window._pickSkin === 'function') window._pickSkin('jay');
      JAY.storage.set('skin-initialized', true);
    }
  }

  /* ── Document title ────────────────────────────────────────────────── */
  // One desired title, re-applied whenever Hermes' boot or session code
  // rewrites <title> while JAY is on screen. In Hermes mode Hermes owns it.
  let desiredTitle = 'JAY';
  function applyDocTitle() {
    if (!alive() || state.mode !== 'jay') return;
    if (document.title !== desiredTitle) document.title = desiredTitle;
  }
  function setDocTitle(name) {
    desiredTitle = name ? String(name) + ' · JAY' : 'JAY';
    applyDocTitle();
  }
  function onTitleMutation() {
    const t = document.title;
    if (t === desiredTitle) return; // our own write
    hermesTitle = t;
    if (state.mode === 'jay') applyDocTitle();
  }

  /* ── Identity (from the data layer; never hard-coded here) ────────── */
  function pickUser(u) {
    if (!u || typeof u !== 'object' || !u.name) return null;
    return { id: String(u.id || 'me'), name: String(u.name), context: u.context ? String(u.context) : undefined };
  }
  function lookupUser() {
    const d = JAY.data || {};
    const viaUser = typeof d.getUser === 'function'
      ? Promise.resolve().then(() => d.getUser()).then(pickUser).catch(() => null)
      : Promise.resolve(null);
    return viaUser.then((u) => {
      if (u || typeof d.getPeople !== 'function') return u;
      return Promise.resolve().then(() => d.getPeople())
        .then((list) => pickUser(Array.isArray(list) ? list.find((p) => p && p.relation === 'self') : null))
        .catch(() => null);
    });
  }
  // Resolves JAY.me before the first route (capped, so a slow or simulated
  // "loading" people domain never blocks JAY); a late answer still lands.
  function resolveUser() {
    let settled = false;
    const lookup = lookupUser();
    lookup.then((u) => {
      if (!settled || !u || !alive() || sameUser(JAY.me, u)) return;
      JAY.me = u;
      applyIdentity();
    });
    const cap = new Promise((resolve) => { later(() => resolve(null), USER_TIMEOUT); });
    return Promise.race([lookup, cap]).then((u) => {
      settled = true;
      if (u) JAY.me = u;
      else if (!JAY.me) JAY.me = FALLBACK_ME;
      applyIdentity();
    });
  }
  function sameUser(a, b) { return !!(a && b && a.id === b.id && a.name === b.name && a.context === b.context); }
  // The people domain changed (demo reset, a cleared "loading"/"error"
  // simulation, another adapter): pick up a user the start-up lookup missed.
  // A failed lookup keeps the user JAY already knows.
  function refreshUser() {
    lookupUser().then((u) => {
      if (!u || !alive() || sameUser(JAY.me, u)) return;
      JAY.me = u;
      applyIdentity();
    });
  }
  function applyIdentity() {
    const u = me();
    if (els.railProfile) {
      els.railProfile.setAttribute('aria-label', 'Account: ' + u.name);
      els.railProfile.setAttribute('data-tip', u.name);
      mount(els.railProfile, JAY.ui.avatar(u.name, { id: u.id, size: 'md', decorative: true, title: false }));
    }
    if (els.headerMe) {
      els.headerMe.setAttribute('aria-label', 'Account: ' + u.name);
      mount(els.headerMe,
        JAY.ui.avatar(u.name, { id: u.id, size: 'sm', decorative: true, title: false }),
        h('span', { class: 'jay-header-me-name' }, u.name),
        icon('chevron-down', 14, 'jay-header-me-chev'));
    }
    if (state.route === 'home' && !header.titleSet) { header.title = defaultTitle('home'); applyHeader(); }
  }
  function context() { return (JAY.chat && JAY.chat.shared && JAY.chat.shared.context) || me().context || ''; }

  /* ── Profile / create / more ──────────────────────────────────────── */
  function resetDemo() {
    JAY.data.resetDemo();
    JAY.ui.toast('Demo data reset', { icon: 'refresh' });
  }
  function identityNode(size) {
    const u = me();
    const ctx = context();
    return [
      JAY.ui.avatar(u.name, { id: u.id, size, decorative: true, title: false }),
      h('span', { class: 'jay-id-main' },
        h('span', { class: 'jay-id-name' }, u.name),
        h('span', { class: 'jay-id-meta' }, ctx || 'Account')),
    ];
  }
  function profileMenu(anchor) {
    const u = me();
    const ctx = context();
    const m = JAY.ui.menu(anchor, [
      { label: isDark() ? 'Light mode' : 'Dark mode', icon: isDark() ? 'sun' : 'moon', run: toggleTheme },
      density() === 'dense'
        ? { label: 'Comfortable layout', icon: 'board', run: () => setDensity('comfortable') }
        : { label: 'Dense layout', icon: 'table', run: () => setDensity('dense') },
      { label: 'Hermes settings', icon: 'sliders', run: () => openHermes('settings') },
      { label: 'System', icon: 'system', run: () => go('system') },
      '-',
      { label: 'Reset demo data', icon: 'refresh', run: resetDemo },
    ], { label: 'Account: ' + u.name + (ctx ? ', ' + ctx : ''), align: 'right' });
    // Who is signed in, as a plain header (the menu's name already says it
    // for assistive tech, so the header is visual only and never focusable).
    const list = m && m.el;
    if (!list) return;
    const flipped = list.getBoundingClientRect().top < anchor.getBoundingClientRect().top;
    list.insertBefore(h('div', { class: 'jay-menu-sep', 'aria-hidden': 'true' }), list.firstChild);
    list.insertBefore(h('div', { class: 'jay-menu-head', 'aria-hidden': 'true' }, identityNode('sm')), list.firstChild);
    const r = anchor.getBoundingClientRect();
    const ht = list.offsetHeight;
    let top = flipped ? r.top - ht - 6 : r.bottom + 6;
    if (!flipped && top + ht > window.innerHeight - 8) top = r.top - ht - 6;
    list.style.top = Math.max(8, top) + 'px';
  }

  function quickAdd(anchor) {
    const has = (mod, fn) => JAY[mod] && typeof JAY[mod][fn] === 'function';
    JAY.ui.menu(anchor, [
      has('tasks', 'openCreate') ? { label: 'New task', icon: 'tasks', run: () => JAY.tasks.openCreate() } : null,
      has('home', 'goTalk') ? { label: 'Reminder (tell Jay)', icon: 'bell', run: () => JAY.home.goTalk({ intent: 'reminder' }) } : null,
      has('home', 'goTalk') ? { label: 'Capture idea', icon: 'lightbulb', run: () => JAY.home.goTalk({ intent: 'idea' }) } : null,
      has('projects', 'openCreate') ? { label: 'New project', icon: 'projects', run: () => JAY.projects.openCreate() } : null,
    ], { label: 'Create', align: 'right' });
  }

  function openMore() {
    let panel = null;
    const leave = (fn) => { if (panel) panel.close({ fromNav: true }); nav.focus = true; fn(); };
    const items = ALL_NAV.filter((n) => !['home', 'tasks'].includes(n.id));
    const grid = h('div', { class: 'jay-sheet-grid' }, items.map((n) => h('button', {
      type: 'button', class: ['jay-sheet-item', state.route === n.id ? 'is-active' : ''],
      'aria-current': state.route === n.id ? 'page' : null, onclick: () => leave(() => go(n.id)),
    },
    h('span', { class: 'jay-sheet-ic', 'aria-hidden': 'true' }, icon(n.icon, 20)),
    h('span', { class: 'jay-sheet-label' }, n.label),
    n.hermes ? h('span', { class: 'jay-sheet-hint' }, 'Hermes') : null)));
    const choice = (v, label, ic) => h('button', {
      type: 'button', class: 'jay-seg-btn', 'data-jay-theme-choice': v, 'aria-pressed': (v === 'dark') === isDark() ? 'true' : 'false',
      onclick: () => setTheme(v),
    }, icon(ic, 15), label);
    const row = (label, ic, onclick) => h('button', { type: 'button', class: 'jay-sheet-row is-button', onclick },
      h('span', { class: 'jay-sheet-row-ic', 'aria-hidden': 'true' }, icon(ic, 18)),
      h('span', { class: 'jay-sheet-row-label' }, label),
      icon('chevron-right', 16));
    panel = JAY.ui.openPanel({
      eyebrow: 'JAY', title: 'More',
      body: h('div', { class: 'jay-sheet' },
        grid,
        h('div', { class: 'jay-sheet-row' },
          h('span', { class: 'jay-sheet-row-label' }, 'Appearance'),
          h('div', { class: 'jay-seg', role: 'group', 'aria-label': 'Appearance' }, choice('light', 'Light', 'sun'), choice('dark', 'Dark', 'moon'))),
        h('div', { class: 'jay-sheet-account' },
          h('div', { class: 'jay-sheet-row is-identity' }, identityNode('md')),
          row('Hermes settings', 'sliders', () => leave(() => openHermes('settings'))),
          row('Reset demo data', 'refresh', () => { if (panel) panel.close(); resetDemo(); }))),
    });
  }

  /* ── Attention shortcut (rail bell) ────────────────────────────────── */
  // Home marks its Attention panel with data-jay-region="attention" (or
  // #jayAttention); a heading match is the fallback so the bell never dead-ends.
  function findRegion(name) {
    const view = els.view;
    if (!view) return null;
    const direct = view.querySelector('[data-jay-region="' + name + '"]') || (name === 'attention' ? view.querySelector('#jayAttention') : null);
    if (direct) return direct;
    const heads = Array.from(view.querySelectorAll('h2, h3, .jay-box-title, .jay-eyebrow'));
    const hit = heads.find((el) => el.textContent.trim().toLowerCase().startsWith(name));
    return hit ? (hit.closest('.jay-box, section') || hit) : null;
  }
  function focusRegion(name, attempt) {
    const n = attempt || 0;
    if (!alive() || state.mode !== 'jay' || state.route !== 'home') return;
    const el = findRegion(name);
    if (!el) { if (n < 15) later(() => focusRegion(name, n + 1), 120); return; }
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.scrollIntoView({ block: 'nearest', behavior: JAY.mqReducedMotion.matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
    el.classList.add('jay-region-flash');
    later(() => el.classList.remove('jay-region-flash'), 1400);
  }
  function goAttention() {
    if (state.mode !== 'jay' || state.route !== 'home') go('home');
    later(() => focusRegion('attention'), 60);
  }

  /* ── Search palette (JAY preview data only) ───────────────────────── */
  const norm = (s) => String(s || '').trim().toLowerCase();
  // Stable relevance tiers: title starts with q, a title word starts with q,
  // title contains q, then everything else (description, tags, project …).
  function tierer(q) {
    if (!q) return () => 0;
    const word = new RegExp('(^|[^a-z0-9])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return (text) => {
      const t = String(text || '').toLowerCase();
      if (t.startsWith(q)) return 0;
      if (word.test(t)) return 1;
      if (t.includes(q)) return 2;
      return 3;
    };
  }
  function ranked(list, key, tier) {
    return list.map((it, i) => ({ it, i, t: tier(key(it)) })).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.it);
  }

  function openSearch() {
    if (!alive()) return;
    const resultsId = JAY.nextId('jay-pal-results');
    const input = h('input', {
      class: 'jay-pal-input', type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': resultsId, 'aria-autocomplete': 'list',
      placeholder: JAY.isMobile() ? 'Search tasks, projects, people…' : 'Search tasks, projects, people, conversations…',
      'aria-label': 'Search JAY', autocomplete: 'off', spellcheck: 'false',
    });
    const results = h('div', { class: 'jay-pal-results', id: resultsId, role: 'listbox', 'aria-label': 'Results' });
    const status = h('div', { class: 'jay-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const panel = JAY.ui.openPanel({
      eyebrow: 'Search', title: 'Search JAY', placement: 'center', size: 'palette', initialFocus: 'input',
      body: h('div', { class: 'jay-pal' },
        h('label', { class: 'jay-pal-field' }, icon('search', 18), input, h('kbd', { class: 'jay-pal-kbd', 'aria-hidden': 'true' }, 'esc')),
        results,
        status,
        h('div', { class: 'jay-pal-foot' },
          h('span', { class: 'jay-pal-keys', 'aria-hidden': 'true' }, h('kbd', null, '↑'), h('kbd', null, '↓'), ' to move', h('kbd', null, '↵'), ' to open'),
          h('span', { class: 'jay-pal-note' }, 'JAY preview data only — Hermes history is not searched yet.'))),
    });
    let timer = null;
    let seq = 0;
    let pending = null;
    let shownFor = null; // the query the visible results belong to
    let active = -1;
    const options = () => Array.from(results.querySelectorAll('.jay-pal-item'));
    function setActive(i) {
      const opts = options();
      active = opts.length && i >= 0 ? Math.min(i, opts.length - 1) : -1;
      opts.forEach((o, j) => { const on = j === active; o.classList.toggle('is-active', on); o.setAttribute('aria-selected', on ? 'true' : 'false'); });
      if (active >= 0) {
        input.setAttribute('aria-activedescendant', opts[active].id);
        opts[active].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    const list = (p) => Promise.resolve(p).then((v) => (Array.isArray(v) ? v : [])).catch(() => []);
    async function runQuery() {
      const my = ++seq;
      const q = norm(input.value);
      const [tasks, projects, people, sessions] = await Promise.all([
        q ? list(JAY.data.getTasks({ q, status: 'all' })) : Promise.resolve([]),
        list(JAY.data.getProjects()),
        list(JAY.data.getPeople()),
        list(JAY.data.getRecentSessions()),
      ]);
      if (my !== seq || !results.isConnected) return;
      const match = (s) => !q || String(s || '').toLowerCase().includes(q);
      const tier = tierer(q);
      const statusLabel = (t) => (JAY.tasks && JAY.tasks.STATUS && JAY.tasks.STATUS[t.status] ? JAY.tasks.STATUS[t.status].label : t.status);
      const goNav = (fn) => () => { nav.focus = true; fn(); };
      const groups = [
        ['Go to', ranked(ALL_NAV.filter((n) => match(n.label)), (n) => n.label, tier).slice(0, q ? 5 : 6)
          .map((n) => ({ icon: n.icon, title: n.label, meta: n.hint || '', nav: true, run: goNav(() => go(n.id)) }))],
        ['Tasks', ranked(tasks, (t) => t.title, tier).slice(0, 5)
          .map((t) => ({ icon: 'tasks', title: t.title, meta: (t.project ? t.project.title + ' · ' : '') + (statusLabel(t) || ''), run: () => JAY.tasks.openTask(t.id) }))],
        ['Projects', ranked(q ? projects.filter((p) => match(p.title) || match(p.description)) : [], (p) => p.title, tier).slice(0, 4)
          .map((p) => ({ icon: p.icon || 'projects', title: p.title, meta: p.area || '', nav: true, run: goNav(() => go('projects/' + encodeURIComponent(p.id))) }))],
        ['People', ranked(q ? people.filter((p) => p.relation !== 'self' && (match(p.name) || match(p.role))) : [], (p) => p.name, tier).slice(0, 4)
          .map((p) => ({ person: p, title: p.name, meta: p.role || '', nav: true, run: goNav(() => go('people')) }))],
        ['Conversations', ranked(q ? sessions.filter((s) => match(s.title)) : sessions.slice(0, 3), (s) => s.title, tier).slice(0, 4)
          .map((s) => ({ icon: 'message-circle', title: s.title, meta: fmt.relative(s.updatedAt), nav: true, run: goNav(() => { if (JAY.chat && JAY.chat.open) JAY.chat.open(s.id); go('talk'); }) }))],
      ].filter(([, items]) => items.length);
      shownFor = q;
      if (!groups.length) {
        mount(results, JAY.ui.state('empty', { icon: 'search', title: 'No matches in JAY preview data.', compact: true }));
        setActive(-1);
        status.textContent = 'No matches';
        return;
      }
      let n = 0;
      mount(results, groups.map(([label, items]) => h('div', { class: 'jay-pal-group', role: 'group', 'aria-label': label },
        h('div', { class: 'jay-pal-label', 'aria-hidden': 'true' }, label),
        items.map((it) => h('button', {
          type: 'button', class: 'jay-pal-item', role: 'option', id: resultsId + '-' + (n++), tabindex: '-1', 'aria-selected': 'false',
          onclick: () => { panel.close(it.nav ? { fromNav: true } : undefined); setTimeout(safe(it.run), 10); },
          onpointermove: (e) => { const i = options().indexOf(e.currentTarget); if (i !== active) setActive(i); },
        },
        it.person ? JAY.ui.avatar(it.person.name, { id: it.person.id, size: 'sm', decorative: true }) : h('span', { class: 'jay-pal-ic', 'aria-hidden': 'true' }, icon(it.icon, 16)),
        h('span', { class: 'jay-pal-title' }, it.title),
        it.meta ? h('span', { class: 'jay-pal-meta' }, it.meta) : null,
        h('span', { class: 'jay-pal-go', 'aria-hidden': 'true' }, icon('enter', 14)))))));
      // A typed query pre-selects its best match (what Enter opens).
      setActive(q ? 0 : -1);
      status.textContent = fmt.plural(n, 'result');
    }
    function flush() { clearTimeout(timer); timer = null; pending = runQuery(); return pending; }
    // Wait until the visible results belong to what is typed now (Enter or an
    // arrow key right after typing must not act on the previous query).
    async function settle() {
      for (let i = 0; i < 3; i += 1) {
        if (timer) await flush();
        else if (pending) await pending;
        if (shownFor === norm(input.value)) return true;
        if (!timer) await flush();
      }
      return shownFor === norm(input.value);
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { timer = null; pending = runQuery(); }, 120); });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!(await settle()) || !results.isConnected) return;
        const count = options().length;
        if (!count) return;
        if (e.key === 'ArrowDown') setActive(active + 1 >= count ? 0 : active + 1);
        else setActive(active <= 0 ? count - 1 : active - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!(await settle()) || !results.isConnected) return;
        const opts = options();
        const target = opts[active >= 0 ? active : 0];
        if (target) target.click();
      }
    });
    pending = runQuery();
  }

  /* ── Header panel ──────────────────────────────────────────────────── */
  const header = { epoch: 0, title: '', titleSet: false, pill: null, crumbs: [], crumbsSet: false, back: null };

  function defaultTitle(route) {
    if (route === 'home') return fmt.greeting() + (JAY.me && JAY.me !== FALLBACK_ME ? ', ' + JAY.me.name : '');
    const view = JAY.views[route];
    if (view && view.title) return String(view.title);
    const n = ALL_NAV.find((x) => x.id === route);
    return n ? n.label : 'JAY';
  }
  function pageName(route) {
    if (route === 'home') return 'Home';
    const view = JAY.views[route];
    if (view && view.title) return String(view.title);
    const n = ALL_NAV.find((x) => x.id === route);
    return n ? n.label : '';
  }
  function normalizePill(p) {
    if (!p) return null;
    if (typeof p === 'string') return { label: p, hue: 'green' };
    if (typeof p !== 'object' || p.label === undefined || p.label === null || p.label === '') return null;
    return { label: String(p.label), hue: HUES.includes(p.hue) ? p.hue : 'green' };
  }
  function crumbNode(c) {
    if (c === null || c === undefined || c === false || c === '') return null;
    if (c instanceof Node) return c;
    if (typeof c !== 'object') return h('span', { class: 'jay-crumb' }, String(c));
    const tone = TONES.includes(c.tone) ? 'is-' + c.tone : '';
    const body = [c.icon ? icon(String(c.icon), 13) : null, h('span', null, String(c.label === undefined || c.label === null ? '' : c.label))];
    if (typeof c.run === 'function') return h('button', { type: 'button', class: ['jay-crumb', 'is-link', tone], onclick: safe(c.run) }, body);
    return h('span', { class: ['jay-crumb', tone] }, body);
  }
  function normalizeBack(b) {
    if (!b || typeof b !== 'object' || typeof b.run !== 'function') return null;
    const label = b.label === undefined || b.label === null || b.label === '' ? 'Back' : String(b.label);
    return { label, run: b.run };
  }
  // Phones: the view's own "up" step, as a chevron before the app bar brand.
  // Navigation, so the next page is announced (settleNavFocus).
  function runBack() {
    const b = header.back;
    if (!b || !alive() || state.mode !== 'jay') return;
    nav.focus = true;
    safe(b.run)();
  }
  function applyBack() {
    const btn = els.appbarBack;
    if (!btn) return;
    const b = header.back;
    const hadFocus = document.activeElement === btn;
    btn.hidden = !b;
    if (b) btn.setAttribute('aria-label', b.label); else btn.removeAttribute('aria-label');
    els.header.classList.toggle('has-back', !!b);
    // The button leaves with the page that set it: keep focus in the app bar
    // (on the brand, where the chevron was) instead of dropping it to <body>.
    if (hadFocus && !b) {
      requestAnimationFrame(() => {
        if (!alive() || !btn.hidden) return;
        const ae = document.activeElement;
        if (ae && ae !== btn && ae !== document.body) return;
        if (els.appbarBrand && els.appbarBrand.offsetParent !== null) els.appbarBrand.focus({ preventScroll: true });
      });
    }
  }
  function applyHeader() {
    if (!els.headTitle) return;
    els.headTitle.textContent = header.title || '';
    if (els.appbarTitle) els.appbarTitle.textContent = state.route === 'home' ? 'JAY' : (header.title || 'JAY');
    applyBack();
    const pill = header.pill ? JAY.ui.dotPill(header.pill.label, header.pill.hue) : null;
    mount(els.headPill, pill);
    els.headPill.hidden = !pill;
    const nodes = header.crumbs.map(crumbNode).filter(Boolean);
    mount(els.headCrumbs, nodes.map((n, i) => [i ? h('span', { class: 'jay-crumb-sep', 'aria-hidden': 'true' }, '|') : null, n]));
    els.headCrumbs.hidden = !nodes.length;
    els.header.classList.toggle('has-crumbs', nodes.length > 0);
  }

  let summaryReq = 0;
  // Home's header carries the one-line day summary: date | N tasks today | N overdue.
  async function loadHomeSummary(epoch) {
    const my = ++summaryReq;
    try {
      const c = await JAY.data.getTaskCounts();
      if (my !== summaryReq || epoch !== header.epoch || header.crumbsSet || state.route !== 'home') return;
      if (!c || c.__state) return;
      header.crumbs = [fmt.dayLong(new Date()), fmt.plural(Number(c.today) || 0, 'task') + ' today'];
      if (c.overdue) header.crumbs.push({ label: c.overdue + ' overdue', tone: 'warning' });
      applyHeader();
    } catch (_) { /* summary is optional */ }
  }

  function resetHeader(route) {
    header.epoch += 1;
    header.title = defaultTitle(route);
    header.titleSet = false;
    header.pill = null;
    header.crumbs = route === 'home' ? [fmt.dayLong(new Date())] : [];
    header.crumbsSet = false;
    header.back = null;
    applyHeader();
    setDocTitle(JAY.views[route] ? pageName(route) : '');
    if (route === 'home') loadHomeSummary(header.epoch);
  }

  // Public: views call this after rendering. Fields that are present replace
  // the current value (pill: null clears, crumbs: [] clears, title: null resets).
  // `docTitle` names the browser tab when it should differ from the title.
  // `back: { label, run }` adds a back chevron before the phone app bar's
  // title (label is its accessible name; back: null removes it). It is cleared
  // on every route change, so a view sets it again after each render.
  // Pass `route` to have late async calls from a previous view ignored.
  function setHeader(cfg) {
    try {
      if (!els.header || !cfg || typeof cfg !== 'object') return;
      if (cfg.route && cfg.route !== state.route) return;
      if ('title' in cfg) {
        const reset = cfg.title === null || cfg.title === undefined || cfg.title === '';
        header.title = reset ? defaultTitle(state.route) : String(cfg.title);
        header.titleSet = !reset;
        if (!('docTitle' in cfg) && state.route !== 'home') setDocTitle(reset ? pageName(state.route) : header.title);
      }
      if ('docTitle' in cfg) setDocTitle(cfg.docTitle ? String(cfg.docTitle) : pageName(state.route));
      if ('pill' in cfg) header.pill = normalizePill(cfg.pill);
      if ('crumbs' in cfg) {
        header.crumbs = Array.isArray(cfg.crumbs) ? cfg.crumbs.slice(0, 8) : [];
        header.crumbsSet = true;
      }
      if ('back' in cfg) header.back = normalizeBack(cfg.back);
      applyHeader();
    } catch (err) { console.warn('[jay] setHeader failed', err); }
  }

  /* ── Build DOM ─────────────────────────────────────────────────────── */
  function navButton(n, variant) {
    const label = n.label + (n.hint ? ' (' + n.hint + ')' : '');
    const badge = h('span', { class: 'jay-nav-badge', hidden: true, 'aria-hidden': 'true', 'data-badge-for': n.id });
    return h('button', {
      type: 'button', class: ['jay-nav-btn', variant ? 'is-' + variant : ''], 'data-nav': n.id,
      'aria-label': label, 'data-label': label, 'data-tip': variant ? null : n.label, 'data-tip-base': variant ? null : n.label,
      onclick: () => {
        // Re-tapping the current tab scrolls it back to the top, like native tab bars.
        if (state.mode === 'jay' && state.route === n.id && !state.params._) {
          if (els.scroller) els.scroller.scrollTo({ top: 0, behavior: JAY.mqReducedMotion.matches ? 'auto' : 'smooth' });
          return;
        }
        nav.focus = true;
        if (variant === 'bottom') nav.cause = 'tab';
        go(n.id);
      },
    }, icon(n.icon, variant === 'bottom' ? 22 : 20), variant === 'bottom' ? h('span', { class: 'jay-nav-label' }, n.label) : null, badge);
  }

  function skipToContent() {
    const main = els.scroller;
    if (!main) return;
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: false });
  }

  function build() {
    els.bell = h('button', { type: 'button', class: 'jay-nav-btn jay-rail-bell', 'aria-label': 'Attention', 'data-tip': 'Attention', onclick: goAttention },
      icon('bell', 20), h('span', { class: 'jay-bell-dot', hidden: true, 'aria-hidden': 'true' }));
    els.railProfile = h('button', { type: 'button', class: 'jay-rail-profile', 'aria-label': 'Account', 'data-tip': 'Account', 'aria-haspopup': 'menu', onclick: (e) => profileMenu(e.currentTarget) });
    els.rail = h('nav', { class: 'jay-rail jay-box', 'aria-label': 'JAY' },
      h('button', { type: 'button', class: 'jay-rail-logo', 'aria-label': 'JAY Home', onclick: () => { nav.focus = true; go('home'); } }, h('span', { class: 'jay-mark is-rail', 'aria-hidden': 'true' }, 'J')),
      h('div', { class: 'jay-rail-group' }, NAV_MAIN.map((n) => navButton(n))),
      h('div', { class: 'jay-rail-sep', 'aria-hidden': 'true' }),
      h('div', { class: 'jay-rail-group' }, NAV_SECONDARY.map((n) => navButton(n))),
      h('div', { class: 'jay-rail-spacer' }),
      els.bell,
      themeButton('jay-nav-btn jay-rail-theme', 20),
      els.railProfile);

    els.headTitle = h('h1', { class: 'jay-header-title', tabindex: '-1' });
    els.headPill = h('span', { class: 'jay-header-pill', hidden: true });
    els.headCrumbs = h('div', { class: 'jay-header-crumbs', hidden: true });
    els.appbarTitle = h('span', { class: 'jay-appbar-title' }, 'JAY');
    els.headerMe = h('button', { type: 'button', class: 'jay-header-me', 'aria-label': 'Account', 'aria-haspopup': 'menu', onclick: (e) => profileMenu(e.currentTarget) });
    // Phones only (CSS): the view's back step, shown while a view sets `back`.
    els.appbarBack = h('button', { type: 'button', class: 'jay-appbar-back', hidden: true, onclick: runBack }, icon('chevron-left', 22));
    // Phones: compact app bar brand (lime tile + wordmark / page title).
    els.appbarBrand = h('button', { type: 'button', class: 'jay-appbar-brand', 'aria-label': 'JAY Home', onclick: () => go('home') },
      h('span', { class: 'jay-mark is-sm', 'aria-hidden': 'true' }, 'J'), els.appbarTitle);
    els.header = h('header', { class: 'jay-header jay-box' },
      els.appbarBack,
      els.appbarBrand,
      h('div', { class: 'jay-header-main' },
        h('div', { class: 'jay-header-row' }, els.headTitle, els.headPill),
        els.headCrumbs),
      h('div', { class: 'jay-header-tools' },
        h('button', { type: 'button', class: 'jay-header-search', onclick: openSearch, 'aria-label': 'Search JAY', 'aria-keyshortcuts': '/' },
          icon('search', 16), h('span', { class: 'jay-header-search-text' }, 'Search JAY'), h('kbd', null, '/')),
        h('button', { type: 'button', class: 'jay-circle-btn jay-header-search-btn', 'aria-label': 'Search JAY', 'data-tip': 'Search', onclick: openSearch }, icon('search', 17)),
        h('button', { type: 'button', class: 'jay-circle-btn jay-header-create', 'aria-label': 'Create', 'data-tip': 'Create', 'aria-haspopup': 'menu', onclick: (e) => quickAdd(e.currentTarget) }, icon('plus', 18)),
        themeButton('jay-circle-btn jay-header-theme', 17),
        els.headerMe));

    els.view = h('div', { class: 'jay-view', id: 'jayView', tabindex: '-1' });
    els.scroller = h('main', { class: 'jay-view-scroll', id: 'jayMain' }, els.view);
    els.main = h('div', { class: 'jay-main' }, els.header, els.scroller);

    const bottom = h('nav', { class: 'jay-bottomnav', 'aria-label': 'JAY' },
      navButton(NAV_MAIN[0], 'bottom'),
      navButton(NAV_MAIN[2], 'bottom'),
      h('button', {
        type: 'button', class: 'jay-nav-btn is-bottom is-jay', 'data-nav': 'talk', 'aria-label': 'Talk to Jay',
        onclick: () => { if (state.mode === 'jay' && state.route === 'talk') return; nav.focus = true; go('talk'); },
      }, h('span', { class: 'jay-nav-jay', 'aria-hidden': 'true' }, 'J'), h('span', { class: 'jay-nav-label' }, 'Jay')),
      h('button', { type: 'button', class: 'jay-nav-btn is-bottom', 'data-nav': 'more', 'aria-label': 'More destinations', 'aria-haspopup': 'dialog', onclick: openMore },
        icon('grid', 22), h('span', { class: 'jay-nav-label' }, 'More')));

    // Skip link: a button, because the hash router owns location.hash.
    els.skip = h('button', { type: 'button', class: 'jay-skip', onclick: skipToContent }, 'Skip to content');
    els.live = h('div', { class: 'jay-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const app = h('div', { id: 'jayApp', class: 'jay-app' }, els.skip, els.rail, els.main, bottom, els.live, h('div', { id: 'jayOverlays', class: 'jay-overlays' }));
    document.body.appendChild(app);
    els.app = app;
    syncThemeButtons();
  }

  /* ── Router ────────────────────────────────────────────────────────── */
  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = {};
    if (query) new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
    if (parts[1]) params._ = parts.slice(1).join('/');
    return { route: parts[0] || 'home', params };
  }

  function setActiveNav(id) {
    document.querySelectorAll('#jayApp [data-nav]').forEach((b) => {
      const more = b.dataset.nav === 'more';
      const on = b.dataset.nav === id || (more && !!id && !BOTTOM_ROUTES.includes(id));
      b.classList.toggle('is-active', on);
      // "More" holds the current page among its destinations: current, not page.
      if (on) b.setAttribute('aria-current', more ? 'true' : 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ── Scroll memory (Back and bottom-nav tabs return where you were) ── */
  const scrollMemo = new Map();
  let scrollToken = 0;
  function rememberScroll() {
    if (!state.hash || !els.scroller || state.mode !== 'jay') return;
    scrollMemo.delete(state.hash);
    scrollMemo.set(state.hash, els.scroller.scrollTop);
    if (scrollMemo.size > 40) scrollMemo.delete(scrollMemo.keys().next().value);
  }
  function navCause() {
    const cause = nav.cause;
    const popped = nav.popAt && Date.now() - nav.popAt < 1500 && nav.popHash === location.hash;
    nav.cause = null;
    nav.popAt = 0;
    return popped ? 'pop' : cause;
  }
  function placeScroll(route, cause) {
    const token = ++scrollToken;
    const scroller = els.scroller;
    if (!scroller) return;
    scroller.scrollTop = 0;
    const want = cause === 'pop' || (cause === 'tab' && TAB_RESTORE.includes(route)) ? scrollMemo.get(state.hash) || 0 : 0;
    if (!want) return;
    // Views paint async widgets after render: wait until the page is tall
    // enough, and give up as soon as the user scrolls or navigates.
    const cancel = () => { if (token === scrollToken) scrollToken += 1; };
    const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    inputs.forEach((t) => scroller.addEventListener(t, cancel, { passive: true, once: true }));
    const done = () => inputs.forEach((t) => scroller.removeEventListener(t, cancel, { passive: true, once: true }));
    let tries = 0;
    const attempt = () => {
      if (token !== scrollToken || !scroller.isConnected) { done(); return; }
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max >= want || tries >= 40) {
        scroller.scrollTop = Math.min(want, Math.max(0, max));
        later(() => {
          if (token === scrollToken && Math.abs(scroller.scrollTop - want) > 2 && scroller.scrollHeight - scroller.clientHeight >= want) scroller.scrollTop = want;
          done();
        }, 250);
        return;
      }
      tries += 1;
      later(attempt, 50);
    };
    requestAnimationFrame(attempt);
  }

  // After a rail / bottom-nav / More / palette navigation, focus moves to the
  // page heading (or the page name is announced where the heading is hidden),
  // unless the new view already took focus itself.
  function settleNavFocus(route) {
    if (!nav.focus) return;
    nav.focus = false;
    const name = pageName(route) || 'Page';
    requestAnimationFrame(() => {
      if (!alive() || state.mode !== 'jay' || state.route !== route) return;
      const ae = document.activeElement;
      if (ae && ae !== document.body && els.view.contains(ae)) return;
      if (JAY.ui.hasOpenPanel()) return;
      if (els.headTitle && els.headTitle.offsetParent !== null) els.headTitle.focus({ preventScroll: true });
      else if (els.live) { els.live.textContent = ''; later(() => { els.live.textContent = name; }, 60); }
    });
  }

  function render(route, params) {
    const same = state.route === route && paramsKey(state.params) === paramsKey(params);
    if (same && state.mode === 'jay' && els.view.firstChild) { nav.cause = null; nav.focus = false; return; }
    rememberScroll();
    if (state.dispose) { try { state.dispose(); } catch (err) { console.warn('[jay] view cleanup failed', err); } state.dispose = null; }
    JAY.ui.closeMenu();
    const cause = navCause();
    state.route = route;
    state.params = params;
    state.hash = location.hash;
    const view = JAY.views[route];
    els.app.dataset.route = route;
    document.documentElement.dataset.jayRoute = route;
    setMode('jay');
    setActiveNav(route);
    resetHeader(route);
    if (!view) {
      mount(els.view, JAY.ui.state('empty', { icon: 'alert-circle', title: 'That page doesn’t exist.', action: { label: 'Go home', run: () => go('home') } }));
      placeScroll(route, null);
      settleNavFocus(route);
      return;
    }
    try {
      state.dispose = view.render(els.view, params) || null;
    } catch (err) {
      console.error('[jay] view failed', route, err);
      mount(els.view, JAY.ui.state('error', { title: 'This page failed to render.', text: 'The rest of JAY and Hermes keep working.' }));
    }
    placeScroll(route, cause);
    syncThemeColor();
    settleNavFocus(route);
  }

  function route() {
    if (!alive()) return;
    const parsed = parseHash();
    if (!parsed) return;
    const { route: r, params } = parsed;
    if (r !== 'files') closeJayOpenedFiles();
    if (JAY.ui.hasOpenPanel()) JAY.ui.closePanel();
    if (HERMES_ROUTES[r] || r === 'hermes') {
      const panel = r === 'hermes' ? (params._ || 'chat') : null;
      if (panel && hermesAvailable() && !hermesPanelOk(panel)) {
        history.replaceState(history.state, '', location.pathname + location.search + '#/system');
        JAY.ui.toast('Unknown Hermes panel', { tone: 'danger', icon: 'alert-circle' });
        route();
        return;
      }
      rememberScroll();
      if (state.dispose) { try { state.dispose(); } catch (_) { /* ignore */ } state.dispose = null; }
      JAY.ui.closeMenu();
      // The disposed view's back step must not survive into Hermes mode.
      if (header.back) { header.back = null; applyBack(); }
      nav.cause = null;
      nav.focus = false;
      nav.popAt = 0;
      state.route = r;
      state.params = params;
      state.hash = location.hash;
      if (els.app) els.app.dataset.route = r;
      document.documentElement.dataset.jayRoute = r;
      setActiveNav(r === 'hermes' ? (panel === 'tasks' ? 'automations' : (panel === 'chat' ? 'chat' : 'system')) : r);
      enterHermes(r, panel);
      mount(els.view);
      return;
    }
    render(r, params);
  }

  function initialRoute() {
    if (parseHash()) return;
    const inSession = /\/session\//.test(location.pathname);
    history.replaceState(history.state, '', location.pathname + location.search + (inSession ? '#/chat' : '#/home'));
  }

  /* ── Badges ────────────────────────────────────────────────────────── */
  async function updateBadges() {
    try {
      const [att, counts] = await Promise.all([
        JAY.data.getAttentionItems().catch(() => null),
        JAY.data.getTaskCounts().catch(() => null),
      ]);
      if (!alive()) return;
      const items = Array.isArray(att) ? att : [];
      const urgent = items.filter((a) => a && (a.level === 'critical' || a.level === 'overdue')).length;
      setBadge('home', urgent, 'accent', 'urgent');
      setBadge('tasks', counts && !counts.__state ? Number(counts.overdue) || 0 : 0, 'danger', 'overdue');
      if (els.bell) {
        const dot = els.bell.querySelector('.jay-bell-dot');
        if (dot) dot.hidden = !items.length;
        els.bell.setAttribute('aria-label', items.length ? 'Attention, ' + fmt.plural(items.length, 'item') : 'Attention');
      }
    } catch (_) { /* badges are optional */ }
  }
  // Desktop rail: a plain dot (Deepsleep's rail carries no numbers); the count
  // moves into the button's name and tooltip. Phone bottom nav keeps numbers.
  function setBadge(id, n, tone, noun) {
    document.querySelectorAll('#jayApp [data-nav="' + id + '"]').forEach((btn) => {
      const b = btn.querySelector('.jay-nav-badge');
      if (!b) return;
      const inRail = !!btn.closest('.jay-rail');
      b.hidden = !n;
      b.textContent = inRail || !n ? '' : (n > 9 ? '9+' : String(n));
      b.classList.toggle('is-dot', inRail);
      b.classList.toggle('is-accent', tone === 'accent');
      b.classList.toggle('is-danger', tone === 'danger');
      const base = btn.dataset.label || '';
      btn.setAttribute('aria-label', n ? base + ', ' + n + ' ' + noun : base);
      if (btn.dataset.tipBase) btn.setAttribute('data-tip', n ? btn.dataset.tipBase + ' · ' + n + ' ' + noun : btn.dataset.tipBase);
    });
  }

  /* ── Keyboard-safe viewport for sheets and the mobile composer ─────── */
  // --jay-vvh: visible height; --jay-kb: how much of the layout viewport the
  // soft keyboard (or pinch-zoom offset) covers at the bottom.
  function trackViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--jay-vvh', vv.height + 'px');
      const kb = Math.max(0, Math.round(root.clientHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--jay-kb', kb + 'px');
    };
    listen(vv, 'resize', apply);
    listen(vv, 'scroll', apply);
    apply();
  }

  function rerender() {
    if (alive() && state.mode === 'jay' && state.route) { const r = state.route; const p = state.params; state.route = null; render(r, p); }
  }

  function attachListeners() {
    listen(window, 'keydown', guardHermesShortcuts, true);
    listen(window, 'popstate', () => { nav.popAt = Date.now(); nav.popHash = location.hash; });
    listen(window, 'hashchange', route);
    listen(JAY.mqMobile, 'change', () => { state.mobile = JAY.isMobile(); rerender(); syncThemeColor(); });
    run.offs.push(JAY.on('route:rerender', rerender));
    ['attention', 'tasks'].forEach((d) => run.offs.push(JAY.on('data:' + d, updateBadges)));
    ['data:people', 'data:reset'].forEach((ev) => run.offs.push(JAY.on(ev, refreshUser)));
    ['data:today', 'data:tasks'].forEach((ev) => run.offs.push(JAY.on(ev, () => { if (state.mode === 'jay' && state.route === 'home') loadHomeSummary(header.epoch); })));
    const themeMo = new MutationObserver(() => { syncThemeButtons(); requestAnimationFrame(syncThemeColor); });
    themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-skin'] });
    run.observers.push(themeMo);
    if (document.head) {
      const titleMo = new MutationObserver(onTitleMutation);
      titleMo.observe(document.head, { childList: true, characterData: true, subtree: true });
      run.observers.push(titleMo);
    }
    trackViewport();
    later(injectHermesHomeButton, 1500);
  }

  // Public: detach everything start() attached (used by the boot fallback when
  // JAY fails to start, so Hermes is left exactly as it was).
  function stop() {
    run.offs.splice(0).forEach((off) => { try { off(); } catch (_) { /* ignore */ } });
    run.timers.splice(0).forEach((t) => clearTimeout(t));
    run.observers.splice(0).forEach((mo) => { try { mo.disconnect(); } catch (_) { /* ignore */ } });
    if (state.dispose) { try { state.dispose(); } catch (_) { /* ignore */ } state.dispose = null; }
    try { JAY.ui.closeMenu(); } catch (_) { /* ignore */ }
    ['jayTitlebarHome', 'jayDrawerHome'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });
    header.back = null;
    state.mode = 'off';
    // Hermes owns its title and browser-chrome colour again.
    if (hermesTitle && document.title !== hermesTitle) document.title = hermesTitle;
    if (typeof window._syncThemeColorMeta === 'function') { try { window._syncThemeColorMeta(); } catch (_) { /* ignore */ } }
  }
  function fallBackToHermes(err) {
    console.error('[jay] failed to start; falling back to Hermes', err);
    stop();
    if (els.app) els.app.remove();
    document.documentElement.classList.remove('jay-enabled');
    delete document.documentElement.dataset.jayMode;
    delete document.documentElement.dataset.jayDensity;
    delete document.documentElement.dataset.jayRoute;
    document.querySelectorAll('.app-titlebar, .layout').forEach((el) => { el.inert = false; });
  }

  function start() {
    if (document.getElementById('jayApp')) return;
    document.documentElement.classList.add('jay-enabled');
    applyDensity();
    hermesTitle = document.title;
    state.mode = 'jay';
    build();
    registerSkin();
    injectHermesHomeButton();
    initialRoute();
    // Cover Hermes right away; the first view renders once the user is known.
    const first = parseHash();
    setMode(first && (HERMES_ROUTES[first.route] || first.route === 'hermes') ? 'hermes' : 'jay');
    return resolveUser().then(() => {
      if (!alive()) return;
      route();
      attachListeners();
      updateBadges();
    }).catch((err) => { if (alive()) fallBackToHermes(err); });
  }

  JAY.shell = {
    start, stop, setTheme, toggleTheme, themePreference, isDark, density, setDensity, openHermes, openSearch, openMore, setHeader,
    navigate, replaceParams, focusAttention: goAttention, state,
  };
})();
