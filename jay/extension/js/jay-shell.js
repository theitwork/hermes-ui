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
  const BOTTOM_ROUTES = ['home', 'tasks', 'talk'];
  const HUES = ['blue', 'purple', 'green', 'lime', 'orange', 'red', 'yellow', 'cyan', 'pink', 'neutral'];
  const TONES = ['muted', 'text', 'accent', 'warning', 'danger', 'good', 'info'];
  const ME = { id: 'pat', name: 'Pat' };

  const state = { route: null, params: {}, dispose: null, mode: 'jay', mobile: JAY.isMobile() };
  const els = {};

  function go(route) { location.hash = '#/' + route; }
  function safe(fn) { return (...args) => { try { return fn(...args); } catch (err) { console.warn('[jay] shell action failed', err); return undefined; } }; }

  /* ── Hermes bridge ─────────────────────────────────────────────────── */
  function hermesAvailable() { return typeof window.switchPanel === 'function'; }
  function hermesMobile() { return typeof window._isDesktopWidth === 'function' ? !window._isDesktopWidth() : JAY.isMobile(); }

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
  }
  // Hermes only opens its workspace browser once a session or default
  // workspace is known, which can lag behind a cold page load. Retry briefly,
  // then say so honestly instead of silently showing nothing.
  function openHermesFiles(attempt) {
    const n = attempt || 0;
    if (state.route !== 'files') return;
    if (document.documentElement.dataset.workspacePanel === 'open') return;
    if (typeof window.toggleWorkspacePanel === 'function') window.toggleWorkspacePanel(true);
    if (document.documentElement.dataset.workspacePanel === 'open') return;
    if (n < 4) { setTimeout(() => openHermesFiles(n + 1), 450); return; }
    JAY.ui.toast('Files open with a Hermes workspace — start or pick a conversation in Chat first.', { icon: 'files', duration: 5200 });
  }
  function openHermes(panel) { location.hash = '#/hermes/' + encodeURIComponent(panel); }

  function setMode(mode) {
    state.mode = mode;
    document.documentElement.dataset.jayMode = mode;
    // Hermes stays out of the tab order and away from assistive tech while
    // JAY covers it; JAY's own rail stays usable in Hermes mode.
    const hermesRoots = [document.querySelector('.app-titlebar'), document.querySelector('.layout')];
    hermesRoots.forEach((el) => { if (el) el.inert = mode === 'jay'; });
    if (els.main) els.main.inert = mode !== 'jay';
  }

  function injectHermesHomeButton() {
    if (document.getElementById('jayTitlebarHome')) return;
    const host = document.querySelector('.app-titlebar-left');
    if (!host) return;
    const btn = h('button', { type: 'button', id: 'jayTitlebarHome', class: 'jay-hermes-home', 'aria-label': 'Back to JAY Home', onclick: () => go('home') },
      icon('chevron-left', 16), h('span', { class: 'jay-mark is-xs', 'aria-hidden': 'true' }, 'J'), h('span', null, 'JAY'));
    host.insertBefore(btn, host.firstChild);
  }

  // Hermes binds a few global shortcuts (j/k session nav, Cmd/Ctrl+K new chat,
  // Cmd/Ctrl+B sidebar, Cmd/Ctrl+, settings, Enter-to-approve). While JAY covers
  // Hermes they must not act on the hidden UI.
  function guardHermesShortcuts(e) {
    if (state.mode !== 'jay') return;
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
  function syncThemeButtons() {
    document.querySelectorAll('[data-jay-theme-toggle]').forEach((b) => {
      mount(b, icon(isDark() ? 'sun' : 'moon', Number(b.dataset.iconSize) || 18));
      b.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
      b.setAttribute('data-tip', isDark() ? 'Light mode' : 'Dark mode');
    });
    document.querySelectorAll('[data-jay-theme-choice]').forEach((b) => {
      b.setAttribute('aria-pressed', (b.dataset.jayThemeChoice === 'dark') === isDark() ? 'true' : 'false');
    });
  }
  function themeButton(cls, size) {
    return h('button', { type: 'button', class: cls, 'data-jay-theme-toggle': '', 'data-icon-size': String(size || 18), onclick: toggleTheme });
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

  /* ── Profile / create / more ──────────────────────────────────────── */
  function profileMenu(anchor) {
    const ctx = JAY.chat && JAY.chat.shared && JAY.chat.shared.context;
    JAY.ui.menu(anchor, [
      { label: ME.name + (ctx ? ' · ' + ctx : ''), icon: 'user', run: () => {} },
      '-',
      { label: isDark() ? 'Light mode' : 'Dark mode', icon: isDark() ? 'sun' : 'moon', run: toggleTheme },
      { label: 'Hermes settings', icon: 'sliders', run: () => openHermes('settings') },
      { label: 'System', icon: 'system', run: () => go('system') },
      '-',
      { label: 'Reset demo data', icon: 'refresh', run: () => { JAY.data.resetDemo(); JAY.ui.toast('Demo data reset', { icon: 'refresh' }); } },
    ], { label: 'Account', align: 'right' });
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
    const pick = (id) => { if (panel) panel.close(); go(id); };
    const items = ALL_NAV.filter((n) => !['home', 'tasks'].includes(n.id));
    const grid = h('div', { class: 'jay-sheet-grid' }, items.map((n) => h('button', {
      type: 'button', class: ['jay-sheet-item', state.route === n.id ? 'is-active' : ''],
      'aria-current': state.route === n.id ? 'page' : null, onclick: () => pick(n.id),
    },
    h('span', { class: 'jay-sheet-ic', 'aria-hidden': 'true' }, icon(n.icon, 20)),
    h('span', { class: 'jay-sheet-label' }, n.label),
    n.hermes ? h('span', { class: 'jay-sheet-hint' }, 'Hermes') : null)));
    const choice = (v, label, ic) => h('button', {
      type: 'button', class: 'jay-seg-btn', 'data-jay-theme-choice': v, 'aria-pressed': (v === 'dark') === isDark() ? 'true' : 'false',
      onclick: () => setTheme(v),
    }, icon(ic, 15), label);
    const ctx = JAY.chat && JAY.chat.shared && JAY.chat.shared.context;
    panel = JAY.ui.openPanel({
      eyebrow: 'JAY', title: 'More',
      body: h('div', { class: 'jay-sheet' },
        grid,
        h('div', { class: 'jay-sheet-row' },
          h('span', { class: 'jay-sheet-row-label' }, 'Appearance'),
          h('div', { class: 'jay-seg', role: 'group', 'aria-label': 'Appearance' }, choice('light', 'Light', 'sun'), choice('dark', 'Dark', 'moon'))),
        h('button', { type: 'button', class: 'jay-sheet-row is-button', onclick: (e) => profileMenu(e.currentTarget) },
          JAY.ui.avatar(ME.name, { id: ME.id, size: 'md', decorative: true }),
          h('span', { class: 'jay-sheet-row-main' }, h('span', { class: 'jay-sheet-row-title' }, ME.name), h('span', { class: 'jay-sheet-row-meta' }, ctx || 'Account')),
          icon('chevron-right', 16))),
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
    if (state.mode !== 'jay' || state.route !== 'home') return;
    const el = findRegion(name);
    if (!el) { if (n < 15) setTimeout(() => focusRegion(name, n + 1), 120); return; }
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.scrollIntoView({ block: 'nearest', behavior: JAY.mqReducedMotion.matches ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
    el.classList.add('jay-region-flash');
    setTimeout(() => el.classList.remove('jay-region-flash'), 1400);
  }
  function goAttention() {
    JAY.emit('shell:focus', { region: 'attention' });
    if (state.mode !== 'jay' || state.route !== 'home') go('home');
    setTimeout(() => focusRegion('attention'), 60);
  }

  /* ── Search palette (JAY preview data only) ───────────────────────── */
  function openSearch() {
    const input = h('input', { class: 'jay-pal-input', type: 'search', placeholder: JAY.isMobile() ? 'Search tasks, projects, people…' : 'Search tasks, projects, people, conversations…', 'aria-label': 'Search JAY', autocomplete: 'off', spellcheck: 'false' });
    const results = h('div', { class: 'jay-pal-results', role: 'listbox', 'aria-label': 'Results' });
    const panel = JAY.ui.openPanel({
      eyebrow: 'Search', title: 'Search JAY', placement: 'center', size: 'palette', initialFocus: 'input',
      body: h('div', { class: 'jay-pal' },
        h('label', { class: 'jay-pal-field' }, icon('search', 18), input, h('kbd', { class: 'jay-pal-kbd', 'aria-hidden': 'true' }, 'esc')),
        results,
        h('div', { class: 'jay-pal-foot' },
          h('span', { class: 'jay-pal-keys', 'aria-hidden': 'true' }, h('kbd', null, '↑'), h('kbd', null, '↓'), ' to move', h('kbd', null, '↵'), ' to open'),
          h('span', { class: 'jay-pal-note' }, 'JAY preview data only — Hermes history is not searched yet.'))),
    });
    let timer = null;
    let seq = 0;
    const list = (p) => Promise.resolve(p).then((v) => (Array.isArray(v) ? v : [])).catch(() => []);
    async function run() {
      const my = ++seq;
      const q = input.value.trim().toLowerCase();
      const [tasks, projects, people, sessions] = await Promise.all([
        q ? list(JAY.data.getTasks({ q, status: 'all' })) : Promise.resolve([]),
        list(JAY.data.getProjects()),
        list(JAY.data.getPeople()),
        list(JAY.data.getRecentSessions()),
      ]);
      if (my !== seq || !results.isConnected) return;
      const match = (s) => !q || String(s || '').toLowerCase().includes(q);
      const statusLabel = (t) => (JAY.tasks && JAY.tasks.STATUS && JAY.tasks.STATUS[t.status] ? JAY.tasks.STATUS[t.status].label : t.status);
      const groups = [
        ['Go to', ALL_NAV.filter((n) => match(n.label)).slice(0, q ? 5 : 6).map((n) => ({ icon: n.icon, title: n.label, meta: n.hint || '', run: () => go(n.id) }))],
        ['Tasks', tasks.slice(0, 5).map((t) => ({ icon: 'tasks', title: t.title, meta: (t.project ? t.project.title + ' · ' : '') + (statusLabel(t) || ''), run: () => JAY.tasks.openTask(t.id) }))],
        ['Projects', (q ? projects.filter((p) => match(p.title) || match(p.description)) : []).slice(0, 4).map((p) => ({ icon: p.icon || 'projects', title: p.title, meta: p.area || '', run: () => go('projects/' + encodeURIComponent(p.id)) }))],
        ['People', (q ? people.filter((p) => p.relation !== 'self' && (match(p.name) || match(p.role))) : []).slice(0, 4).map((p) => ({ person: p, title: p.name, meta: p.role || '', run: () => go('people') }))],
        ['Conversations', (q ? sessions.filter((s) => match(s.title)) : sessions.slice(0, 3)).slice(0, 4).map((s) => ({ icon: 'message-circle', title: s.title, meta: fmt.relative(s.updatedAt), run: () => { if (JAY.chat && JAY.chat.open) JAY.chat.open(s.id); go('talk'); } }))],
      ].filter(([, items]) => items.length);
      if (!groups.length) { mount(results, JAY.ui.state('empty', { icon: 'search', title: 'No matches in JAY preview data.', compact: true })); return; }
      mount(results, groups.map(([label, items]) => h('div', { class: 'jay-pal-group', role: 'group', 'aria-label': label },
        h('div', { class: 'jay-pal-label', 'aria-hidden': 'true' }, label),
        items.map((it) => h('button', { type: 'button', class: 'jay-pal-item', role: 'option', onclick: () => { panel.close(); setTimeout(safe(it.run), 10); } },
          it.person ? JAY.ui.avatar(it.person.name, { id: it.person.id, size: 'sm', decorative: true }) : h('span', { class: 'jay-pal-ic', 'aria-hidden': 'true' }, icon(it.icon, 16)),
          h('span', { class: 'jay-pal-title' }, it.title),
          it.meta ? h('span', { class: 'jay-pal-meta' }, it.meta) : null,
          h('span', { class: 'jay-pal-go', 'aria-hidden': 'true' }, icon('enter', 14)))))));
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = results.querySelector('.jay-pal-item'); if (first) { e.preventDefault(); first.click(); } }
      if (e.key === 'ArrowDown') { const first = results.querySelector('.jay-pal-item'); if (first) { e.preventDefault(); first.focus(); } }
    });
    results.addEventListener('keydown', (e) => {
      const items = Array.from(results.querySelectorAll('.jay-pal-item'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else items[i - 1].focus(); }
    });
    run();
  }

  /* ── Header panel ──────────────────────────────────────────────────── */
  const header = { epoch: 0, title: '', pill: null, crumbs: [], crumbsSet: false };

  function defaultTitle(route) {
    if (route === 'home') return fmt.greeting() + ', ' + ME.name;
    const view = JAY.views[route];
    if (view && view.title) return String(view.title);
    const nav = ALL_NAV.find((n) => n.id === route);
    return nav ? nav.label : 'JAY';
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
  function applyHeader() {
    if (!els.headTitle) return;
    els.headTitle.textContent = header.title || '';
    if (els.appbarTitle) els.appbarTitle.textContent = state.route === 'home' ? 'JAY' : (header.title || 'JAY');
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
    header.pill = null;
    header.crumbs = route === 'home' ? [fmt.dayLong(new Date())] : [];
    header.crumbsSet = false;
    applyHeader();
    if (route === 'home') loadHomeSummary(header.epoch);
  }

  // Public: views call this after rendering. Fields that are present replace
  // the current value (pill: null clears, crumbs: [] clears, title: null resets).
  // Pass `route` to have late async calls from a previous view ignored.
  function setHeader(cfg) {
    try {
      if (!els.header || !cfg || typeof cfg !== 'object') return;
      if (cfg.route && cfg.route !== state.route) return;
      if ('title' in cfg) {
        header.title = cfg.title === null || cfg.title === undefined || cfg.title === '' ? defaultTitle(state.route) : String(cfg.title);
        if (state.mode === 'jay' && state.route !== 'home') document.title = header.title + ' · JAY';
      }
      if ('pill' in cfg) header.pill = normalizePill(cfg.pill);
      if ('crumbs' in cfg) {
        header.crumbs = Array.isArray(cfg.crumbs) ? cfg.crumbs.slice(0, 8) : [];
        header.crumbsSet = true;
      }
      applyHeader();
    } catch (err) { console.warn('[jay] setHeader failed', err); }
  }

  /* ── Build DOM ─────────────────────────────────────────────────────── */
  function navButton(n, variant) {
    const badge = h('span', { class: 'jay-nav-badge', hidden: true, 'data-badge-for': n.id });
    return h('button', {
      type: 'button', class: ['jay-nav-btn', variant ? 'is-' + variant : ''], 'data-nav': n.id,
      'aria-label': n.label + (n.hint ? ' (' + n.hint + ')' : ''), 'data-tip': variant ? null : n.label,
      onclick: () => go(n.id),
    }, icon(n.icon, variant === 'bottom' ? 22 : 20), variant === 'bottom' ? h('span', { class: 'jay-nav-label' }, n.label) : null, badge);
  }

  function build() {
    els.bell = h('button', { type: 'button', class: 'jay-nav-btn jay-rail-bell', 'aria-label': 'Attention', 'data-tip': 'Attention', onclick: goAttention },
      icon('bell', 20), h('span', { class: 'jay-bell-dot', hidden: true, 'aria-hidden': 'true' }));
    const rail = h('nav', { class: 'jay-rail jay-box', 'aria-label': 'JAY' },
      h('button', { type: 'button', class: 'jay-rail-logo', 'aria-label': 'JAY Home', onclick: () => go('home') }, h('span', { class: 'jay-mark is-rail', 'aria-hidden': 'true' }, 'J')),
      h('div', { class: 'jay-rail-group' }, NAV_MAIN.map((n) => navButton(n))),
      h('div', { class: 'jay-rail-sep', 'aria-hidden': 'true' }),
      h('div', { class: 'jay-rail-group' }, NAV_SECONDARY.map((n) => navButton(n))),
      h('div', { class: 'jay-rail-spacer' }),
      els.bell,
      themeButton('jay-nav-btn jay-rail-theme', 20),
      h('button', { type: 'button', class: 'jay-rail-profile', 'aria-label': 'Account: ' + ME.name, 'data-tip': ME.name, 'aria-haspopup': 'menu', onclick: (e) => profileMenu(e.currentTarget) },
        JAY.ui.avatar(ME.name, { id: ME.id, size: 'md', decorative: true, title: false })));

    els.headTitle = h('h1', { class: 'jay-header-title' });
    els.headPill = h('span', { class: 'jay-header-pill', hidden: true });
    els.headCrumbs = h('div', { class: 'jay-header-crumbs', hidden: true });
    els.appbarTitle = h('span', { class: 'jay-appbar-title' }, 'JAY');
    els.header = h('header', { class: 'jay-header jay-box' },
      // Phones: compact app bar brand (lime tile + wordmark / page title).
      h('button', { type: 'button', class: 'jay-appbar-brand', 'aria-label': 'JAY Home', onclick: () => go('home') },
        h('span', { class: 'jay-mark is-sm', 'aria-hidden': 'true' }, 'J'), els.appbarTitle),
      h('div', { class: 'jay-header-main' },
        h('div', { class: 'jay-header-row' }, els.headTitle, els.headPill),
        els.headCrumbs),
      h('div', { class: 'jay-header-tools' },
        h('button', { type: 'button', class: 'jay-header-search', onclick: openSearch, 'aria-label': 'Search JAY', 'aria-keyshortcuts': '/' },
          icon('search', 16), h('span', { class: 'jay-header-search-text' }, 'Search JAY'), h('kbd', null, '/')),
        h('button', { type: 'button', class: 'jay-circle-btn jay-header-search-btn', 'aria-label': 'Search JAY', 'data-tip': 'Search', onclick: openSearch }, icon('search', 17)),
        h('button', { type: 'button', class: 'jay-circle-btn jay-header-create', 'aria-label': 'Create', 'data-tip': 'Create', 'aria-haspopup': 'menu', onclick: (e) => quickAdd(e.currentTarget) }, icon('plus', 18)),
        themeButton('jay-circle-btn jay-header-theme', 17),
        h('button', { type: 'button', class: 'jay-header-me', 'aria-label': 'Account: ' + ME.name, 'aria-haspopup': 'menu', onclick: (e) => profileMenu(e.currentTarget) },
          JAY.ui.avatar(ME.name, { id: ME.id, size: 'sm', decorative: true, title: false }),
          h('span', { class: 'jay-header-me-name' }, ME.name),
          icon('chevron-down', 14, 'jay-header-me-chev'))));

    els.view = h('div', { class: 'jay-view', id: 'jayView', tabindex: '-1' });
    els.scroller = h('main', { class: 'jay-view-scroll', id: 'jayMain' }, els.view);
    els.main = h('div', { class: 'jay-main' }, els.header, els.scroller);

    const bottom = h('nav', { class: 'jay-bottomnav', 'aria-label': 'JAY' },
      navButton(NAV_MAIN[0], 'bottom'),
      navButton(NAV_MAIN[2], 'bottom'),
      h('button', { type: 'button', class: 'jay-nav-btn is-bottom is-jay', 'data-nav': 'talk', 'aria-label': 'Talk to Jay', onclick: () => go('talk') },
        h('span', { class: 'jay-nav-jay', 'aria-hidden': 'true' }, 'J'), h('span', { class: 'jay-nav-label' }, 'Jay')),
      h('button', { type: 'button', class: 'jay-nav-btn is-bottom', 'data-nav': 'more', 'aria-label': 'More destinations', 'aria-haspopup': 'dialog', onclick: openMore },
        icon('grid', 22), h('span', { class: 'jay-nav-label' }, 'More')));

    const app = h('div', { id: 'jayApp', class: 'jay-app' }, rail, els.main, bottom, h('div', { id: 'jayOverlays', class: 'jay-overlays' }));
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
      const on = b.dataset.nav === id || (b.dataset.nav === 'more' && !!id && !BOTTOM_ROUTES.includes(id));
      b.classList.toggle('is-active', on);
      if (on && b.dataset.nav !== 'more') b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function render(route, params) {
    const same = state.route === route && JSON.stringify(state.params) === JSON.stringify(params);
    if (same && state.mode === 'jay' && els.view.firstChild) return;
    if (state.dispose) { try { state.dispose(); } catch (err) { console.warn('[jay] view cleanup failed', err); } state.dispose = null; }
    JAY.ui.closeMenu();
    state.route = route;
    state.params = params;
    const view = JAY.views[route];
    els.app.dataset.route = route;
    document.documentElement.dataset.jayRoute = route;
    setMode('jay');
    setActiveNav(route);
    resetHeader(route);
    if (!view) {
      mount(els.view, JAY.ui.state('empty', { icon: 'alert-circle', title: 'That page doesn’t exist.', action: { label: 'Go home', run: () => go('home') } }));
      return;
    }
    try {
      state.dispose = view.render(els.view, params) || null;
    } catch (err) {
      console.error('[jay] view failed', route, err);
      mount(els.view, JAY.ui.state('error', { title: 'This page failed to render.', text: 'The rest of JAY and Hermes keep working.' }));
    }
    if (els.scroller) els.scroller.scrollTop = 0;
    document.title = (view.title && route !== 'home' ? view.title + ' · ' : '') + 'JAY';
  }

  function route() {
    const parsed = parseHash();
    if (!parsed) return;
    const { route: r, params } = parsed;
    if (JAY.ui.hasOpenPanel()) JAY.ui.closePanel();
    if (HERMES_ROUTES[r] || r === 'hermes') {
      if (state.dispose) { try { state.dispose(); } catch (_) { /* ignore */ } state.dispose = null; }
      JAY.ui.closeMenu();
      state.route = r;
      state.params = params;
      if (els.app) els.app.dataset.route = r;
      document.documentElement.dataset.jayRoute = r;
      setActiveNav(r === 'hermes' ? (params._ === 'tasks' ? 'automations' : (params._ === 'chat' ? 'chat' : 'system')) : r);
      document.title = 'Hermes · JAY';
      enterHermes(r, r === 'hermes' ? params._ : null);
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
  function setBadge(id, n, tone, noun) {
    document.querySelectorAll('[data-badge-for="' + id + '"]').forEach((b) => {
      b.hidden = !n;
      b.textContent = n > 9 ? '9+' : String(n || '');
      b.classList.toggle('is-accent', tone === 'accent');
      b.classList.toggle('is-danger', tone === 'danger');
      b.setAttribute('aria-label', n + ' ' + noun);
    });
  }

  /* ── Keyboard-safe viewport height for the mobile composer ─────────── */
  function trackViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => { document.documentElement.style.setProperty('--jay-vvh', vv.height + 'px'); };
    vv.addEventListener('resize', apply);
    apply();
  }

  function rerender() {
    if (state.mode === 'jay' && state.route) { const r = state.route; const p = state.params; state.route = null; render(r, p); }
  }

  function start() {
    if (document.getElementById('jayApp')) return;
    document.documentElement.classList.add('jay-enabled');
    build();
    registerSkin();
    injectHermesHomeButton();
    setTimeout(injectHermesHomeButton, 1500);
    window.addEventListener('keydown', guardHermesShortcuts, true);
    window.addEventListener('hashchange', route);
    JAY.mqMobile.addEventListener('change', () => { state.mobile = JAY.isMobile(); rerender(); });
    JAY.on('route:rerender', rerender);
    ['attention', 'tasks'].forEach((d) => JAY.on('data:' + d, updateBadges));
    ['data:today', 'data:tasks'].forEach((ev) => JAY.on(ev, () => { if (state.mode === 'jay' && state.route === 'home') loadHomeSummary(header.epoch); }));
    const mo = new MutationObserver(syncThemeButtons);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    trackViewport();
    initialRoute();
    route();
    updateBadges();
  }

  JAY.shell = { start, setTheme, toggleTheme, themePreference, isDark, openHermes, openSearch, openMore, setHeader, focusAttention: goAttention, state };
})();
