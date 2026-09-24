/* JAY customization — application shell.
   Rail (desktop) / bottom nav (phones), topbar, hash router, search palette,
   theme, and the bridge into Hermes' own panels ("Hermes mode").
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

  const state = { route: null, params: {}, dispose: null, mode: 'jay', mobile: JAY.isMobile() };
  const els = {};

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
    const btn = h('button', { type: 'button', id: 'jayTitlebarHome', class: 'jay-hermes-home', 'aria-label': 'Back to JAY Home', onclick: () => { location.hash = '#/home'; } },
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
      mount(b, icon(isDark() ? 'sun' : 'moon', 18));
      b.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
      b.setAttribute('data-tip', isDark() ? 'Light mode' : 'Dark mode');
    });
  }
  function themeButton(extraClass) {
    const b = h('button', { type: 'button', class: ['jay-icon-btn', extraClass || ''], 'data-jay-theme-toggle': '', onclick: toggleTheme });
    return b;
  }

  function registerSkin() {
    if (typeof window.registerHermesSkin !== 'function') return;
    window.registerHermesSkin({
      name: 'JAY', value: 'jay', colors: ['#101210', '#8DC086', '#F5F2EA'],
      tokens: { '--accent': '#8DC086', '--accent-hover': '#7BB074', '--accent-bg': 'rgba(141,192,134,0.09)', '--accent-bg-strong': 'rgba(141,192,134,0.17)', '--accent-text': '#A9D4A2' },
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

  /* ── Profile / more menus ─────────────────────────────────────────── */
  function profileMenu(anchor) {
    JAY.ui.menu(anchor, [
      { label: 'Pat · ' + JAY.chat.shared.context, icon: 'user', run: () => {} },
      '-',
      { label: isDark() ? 'Light mode' : 'Dark mode', icon: isDark() ? 'sun' : 'moon', run: toggleTheme },
      { label: 'Hermes settings', icon: 'sliders', run: () => openHermes('settings') },
      { label: 'System', icon: 'system', run: () => { location.hash = '#/system'; } },
      '-',
      { label: 'Reset demo data', icon: 'refresh', run: () => { JAY.data.resetDemo(); JAY.ui.toast('Demo data reset', { icon: 'refresh' }); } },
    ], { label: 'Account', align: 'right' });
  }

  function openMore() {
    const items = ALL_NAV.filter((n) => !['home', 'tasks'].includes(n.id));
    const grid = h('div', { class: 'jay-more-grid' }, items.map((n) => h('button', {
      type: 'button', class: ['jay-more-item', state.route === n.id ? 'is-active' : ''],
      onclick: () => { panel.close(); location.hash = '#/' + n.id; },
    }, h('span', { class: 'jay-more-icon' }, icon(n.icon, 20)), h('span', { class: 'jay-more-label' }, n.label), n.hermes ? h('span', { class: 'jay-more-hint' }, 'Hermes') : null)));
    const panel = JAY.ui.openPanel({
      eyebrow: 'JAY', title: 'More',
      body: h('div', null, grid,
        h('div', { class: 'jay-more-appearance' },
          h('span', null, 'Appearance'),
          h('button', { type: 'button', class: 'jay-btn is-sm', onclick: () => { toggleTheme(); panel.close(); } }, icon(isDark() ? 'sun' : 'moon', 15), isDark() ? 'Light mode' : 'Dark mode'))),
    });
  }

  function quickAdd(anchor) {
    JAY.ui.menu(anchor, [
      { label: 'New task', icon: 'tasks', run: () => JAY.tasks.openCreate() },
      { label: 'Reminder (tell Jay)', icon: 'bell', run: () => JAY.home.goTalk({ intent: 'reminder' }) },
      { label: 'Capture idea', icon: 'lightbulb', run: () => JAY.home.goTalk({ intent: 'idea' }) },
      { label: 'New project', icon: 'projects', run: () => JAY.projects.openCreate() },
    ], { label: 'Create', align: 'right' });
  }

  /* ── Search palette (JAY preview data only) ───────────────────────── */
  async function openSearch() {
    const input = h('input', { class: 'jay-input is-search is-lg', type: 'search', placeholder: 'Search tasks, projects, people, conversations…', 'aria-label': 'Search JAY', autocomplete: 'off' });
    const results = h('div', { class: 'jay-search-results', role: 'listbox', 'aria-label': 'Results' });
    const panel = JAY.ui.openPanel({
      eyebrow: 'Search', title: 'Search JAY', placement: 'center', size: 'palette', initialFocus: 'input',
      body: h('div', { class: 'jay-search-box' }, h('div', { class: 'jay-search' }, icon('search', 16), input), results,
        h('div', { class: 'jay-search-foot' }, 'Searches JAY preview data only — Hermes history and integrations are not searched yet.')),
    });
    let timer = null;
    let seq = 0;
    async function run() {
      const my = ++seq;
      const q = input.value.trim().toLowerCase();
      const [tasks, projects, people, sessions] = await Promise.all([
        q ? JAY.data.getTasks({ q, status: 'all' }) : Promise.resolve([]),
        JAY.data.getProjects().catch(() => []),
        JAY.data.getPeople().catch(() => []),
        JAY.data.getRecentSessions().catch(() => []),
      ]);
      if (my !== seq) return;
      const match = (s) => !q || String(s).toLowerCase().includes(q);
      const groups = [
        ['Go to', ALL_NAV.filter((n) => match(n.label)).slice(0, q ? 5 : 6).map((n) => ({ icon: n.icon, title: n.label, meta: n.hint || '', run: () => { location.hash = '#/' + n.id; } }))],
        ['Tasks', tasks.slice(0, 5).map((t) => ({ icon: 'tasks', title: t.title, meta: (t.project ? t.project.title + ' · ' : '') + JAY.tasks.STATUS[t.status].label, run: () => JAY.tasks.openTask(t.id) }))],
        ['Projects', (q ? projects.filter((p) => match(p.title) || match(p.description)) : []).slice(0, 4).map((p) => ({ icon: p.icon || 'projects', title: p.title, meta: p.area, run: () => { location.hash = '#/projects/' + p.id; } }))],
        ['People', (q ? people.filter((p) => p.relation !== 'self' && (match(p.name) || match(p.role))) : []).slice(0, 4).map((p) => ({ icon: 'user', title: p.name, meta: p.role, run: () => { location.hash = '#/people'; } }))],
        ['Conversations', (q ? sessions.filter((s) => match(s.title)) : sessions.slice(0, 3)).slice(0, 4).map((s) => ({ icon: 'message-circle', title: s.title, meta: fmt.relative(s.updatedAt), run: () => { JAY.chat.open(s.id); location.hash = '#/talk'; } }))],
      ].filter(([, items]) => items.length);
      if (!groups.length) { mount(results, JAY.ui.state('empty', { icon: 'search', title: 'No matches in JAY preview data.', compact: true })); return; }
      mount(results, groups.map(([label, items]) => h('div', { class: 'jay-search-group' },
        h('div', { class: 'jay-eyebrow' }, label),
        items.map((it) => h('button', { type: 'button', class: 'jay-search-item', role: 'option', onclick: () => { panel.close(); setTimeout(it.run, 10); } },
          icon(it.icon, 16), h('span', { class: 'jay-search-title' }, it.title), h('span', { class: 'jay-search-meta' }, it.meta))))));
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = results.querySelector('.jay-search-item'); if (first) { e.preventDefault(); first.click(); } }
      if (e.key === 'ArrowDown') { const first = results.querySelector('.jay-search-item'); if (first) { e.preventDefault(); first.focus(); } }
    });
    results.addEventListener('keydown', (e) => {
      const items = Array.from(results.querySelectorAll('.jay-search-item'));
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else items[i - 1].focus(); }
    });
    run();
  }

  /* ── Build DOM ─────────────────────────────────────────────────────── */
  function navButton(n, variant) {
    const badge = h('span', { class: 'jay-nav-badge', hidden: true, 'data-badge-for': n.id });
    const btn = h('button', {
      type: 'button', class: ['jay-nav-btn', variant ? 'is-' + variant : ''], 'data-nav': n.id,
      'aria-label': n.label + (n.hint ? ' (' + n.hint + ')' : ''), 'data-tip': n.label,
      onclick: () => { location.hash = '#/' + n.id; },
    }, icon(n.icon, 20), variant === 'bottom' ? h('span', { class: 'jay-nav-label' }, n.label) : null, badge);
    return btn;
  }

  function build() {
    const rail = h('nav', { class: 'jay-rail', 'aria-label': 'JAY' },
      h('button', { type: 'button', class: 'jay-rail-logo', 'aria-label': 'JAY Home', onclick: () => { location.hash = '#/home'; } }, h('span', { class: 'jay-mark' }, 'J')),
      h('div', { class: 'jay-rail-group' }, NAV_MAIN.map((n) => navButton(n))),
      h('div', { class: 'jay-rail-sep', role: 'separator' }),
      h('div', { class: 'jay-rail-group' }, NAV_SECONDARY.map((n) => navButton(n))),
      h('div', { class: 'jay-rail-spacer' }),
      themeButton('jay-rail-theme'),
      h('button', { type: 'button', class: 'jay-rail-profile', 'aria-label': 'Account: Pat', 'data-tip': 'Pat', 'aria-haspopup': 'menu', onclick: (e) => profileMenu(e.currentTarget) }, h('span', { class: 'jay-avatar' }, 'P')));

    els.topTitle = h('h1', { class: 'jay-topbar-title' });
    els.topSub = h('div', { class: 'jay-topbar-sub' });
    const topbar = h('header', { class: 'jay-topbar' },
      h('button', { type: 'button', class: 'jay-brand', 'aria-label': 'JAY Home', onclick: () => { location.hash = '#/home'; } }, h('span', { class: 'jay-mark is-sm' }, 'J'), h('span', { class: 'jay-brand-word' }, 'JAY')),
      h('div', { class: 'jay-topbar-titles' }, els.topTitle, els.topSub),
      h('button', { type: 'button', class: 'jay-search-trigger', onclick: openSearch, 'aria-label': 'Search JAY' },
        icon('search', 16), h('span', { class: 'jay-search-trigger-text' }, 'Search JAY'), h('kbd', null, '/')),
      h('div', { class: 'jay-topbar-actions' },
        h('button', { type: 'button', class: 'jay-icon-btn jay-show-mobile', 'aria-label': 'Search', onclick: openSearch }, icon('search', 19)),
        h('button', { type: 'button', class: 'jay-icon-btn jay-hide-mobile', 'aria-label': 'Create', 'data-tip': 'Create', 'aria-haspopup': 'menu', onclick: (e) => quickAdd(e.currentTarget) }, icon('plus', 19)),
        themeButton('jay-hide-mobile'),
        h('button', { type: 'button', class: 'jay-topbar-avatar jay-show-mobile', 'aria-label': 'Account: Pat', 'aria-haspopup': 'menu', onclick: (e) => profileMenu(e.currentTarget) }, h('span', { class: 'jay-avatar' }, 'P'))));

    els.view = h('div', { class: 'jay-view', id: 'jayView', tabindex: '-1' });
    els.main = h('div', { class: 'jay-main' }, topbar, h('main', { class: 'jay-view-scroll', id: 'jayMain' }, els.view));

    const bottom = h('nav', { class: 'jay-bottomnav', 'aria-label': 'JAY' },
      navButton(NAV_MAIN[0], 'bottom'),
      navButton(NAV_MAIN[2], 'bottom'),
      h('button', { type: 'button', class: 'jay-nav-btn is-bottom is-jay', 'data-nav': 'talk', 'aria-label': 'Talk to Jay', onclick: () => { location.hash = '#/talk'; } },
        h('span', { class: 'jay-nav-jay' }, h('span', { class: 'jay-mark is-sm' }, 'J')), h('span', { class: 'jay-nav-label' }, 'Jay')),
      h('button', { type: 'button', class: 'jay-nav-btn is-bottom', 'data-nav': 'more', 'aria-label': 'More destinations', onclick: openMore }, icon('grid', 20), h('span', { class: 'jay-nav-label' }, 'More')));

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
      const on = b.dataset.nav === id;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  let summaryReq = 0;
  // Home gets the greeting; every page keeps the same one-line day summary so
  // awareness never disappears. Page titles live in each page's own header.
  async function setTopbar(route) {
    els.topTitle.textContent = route === 'home' ? fmt.greeting() + ', Pat' : '';
    els.topSub.textContent = fmt.dayLong(new Date());
    const my = ++summaryReq;
    try {
      const c = await JAY.data.getTaskCounts();
      if (my !== summaryReq || c.__state) return;
      mount(els.topSub, fmt.dayLong(new Date()), h('span', { class: 'jay-dot-sep', 'aria-hidden': 'true' }, '•'), fmt.plural(c.today, 'task') + ' today',
        c.overdue ? [h('span', { class: 'jay-dot-sep', 'aria-hidden': 'true' }, '•'), h('span', { class: 'jay-warn-text' }, c.overdue + ' overdue')] : null);
    } catch (_) { /* summary is optional */ }
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
    setActiveNav(route === 'talk' ? 'talk' : route);
    setTopbar(route);
    if (!view) {
      mount(els.view, JAY.ui.state('empty', { icon: 'alert-circle', title: 'That page doesn’t exist.', action: { label: 'Go home', run: () => { location.hash = '#/home'; } } }));
      return;
    }
    try {
      state.dispose = view.render(els.view, params) || null;
    } catch (err) {
      console.error('[jay] view failed', route, err);
      mount(els.view, JAY.ui.state('error', { title: 'This page failed to render.', text: 'The rest of JAY and Hermes keep working.' }));
    }
    const scroller = document.getElementById('jayMain');
    if (scroller) scroller.scrollTop = 0;
    document.title = (view.title && route !== 'home' ? view.title + ' · ' : '') + 'JAY';
  }

  function route() {
    const parsed = parseHash();
    if (!parsed) return;
    const { route: r, params } = parsed;
    if (JAY.ui.hasOpenPanel()) JAY.ui.closePanel();
    if (HERMES_ROUTES[r] || r === 'hermes') {
      if (state.dispose) { try { state.dispose(); } catch (_) { /* ignore */ } state.dispose = null; }
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
      const [att, counts] = await Promise.all([JAY.data.getAttentionItems(), JAY.data.getTaskCounts()]);
      const urgent = att.filter((a) => a.level === 'critical' || a.level === 'overdue').length;
      setBadge('home', urgent);
      setBadge('tasks', counts.overdue, 'warning');
    } catch (_) { /* badges are optional */ }
  }
  function setBadge(id, n, tone) {
    document.querySelectorAll('[data-badge-for="' + id + '"]').forEach((b) => {
      b.hidden = !n;
      b.textContent = n > 9 ? '9+' : String(n || '');
      b.classList.toggle('is-warning', tone === 'warning');
      b.setAttribute('aria-label', n + ' need attention');
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

  function start() {
    if (document.getElementById('jayApp')) return;
    document.documentElement.classList.add('jay-enabled');
    build();
    registerSkin();
    injectHermesHomeButton();
    setTimeout(injectHermesHomeButton, 1500);
    window.addEventListener('keydown', guardHermesShortcuts, true);
    window.addEventListener('hashchange', route);
    JAY.mqMobile.addEventListener('change', () => {
      state.mobile = JAY.isMobile();
      if (state.mode === 'jay' && state.route) { const r = state.route; const p = state.params; state.route = null; render(r, p); }
    });
    JAY.on('route:rerender', () => { if (state.mode === 'jay' && state.route) { const r = state.route; const p = state.params; state.route = null; render(r, p); } });
    ['attention', 'tasks'].forEach((d) => JAY.on('data:' + d, updateBadges));
    ['data:today', 'data:tasks'].forEach((ev) => JAY.on(ev, () => { if (state.mode === 'jay' && state.route) setTopbar(state.route); }));
    const mo = new MutationObserver(syncThemeButtons);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    trackViewport();
    initialRoute();
    route();
    updateBadges();
  }

  JAY.shell = { start, setTheme, toggleTheme, themePreference, isDark, openHermes, openSearch, state };
})();
