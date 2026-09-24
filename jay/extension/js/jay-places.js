/* JAY customization — focused conversation, placeholder destinations and System.
   Placeholders are honest: they explain what the area will do and never
   pretend an integration is live. System links into real Hermes surfaces. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;

  /* ── Talk (focused Jay conversation) ───────────────────────────────── */
  JAY.views = JAY.views || {};
  JAY.views.talk = {
    title: 'Jay',
    immersiveMobile: true,
    render(root) {
      const chat = JAY.chat.create({ mode: 'focus' });
      mount(root, h('div', { class: 'jay-talk-page' }, chat.el));
      setTimeout(() => { if (!JAY.isMobile() || JAY.chat.shared.intent || JAY.chat.shared.draft) chat.focus(); }, 60);
      return () => chat.destroy();
    },
  };

  /* ── Placeholder scaffold ──────────────────────────────────────────── */
  function placeholder(cfg) {
    return {
      title: cfg.title,
      render(root) {
        const hero = h('section', { class: 'jay-place-hero' },
          h('span', { class: 'jay-place-icon', 'aria-hidden': 'true' }, icon(cfg.icon, 26)),
          h('h2', { class: 'jay-place-headline' }, cfg.headline),
          h('p', { class: 'jay-place-text' }, cfg.text),
          h('ul', { class: 'jay-place-list' }, cfg.bullets.map((b) => h('li', null, icon('check', 15), b))),
          h('div', { class: 'jay-place-actions' },
            cfg.primary ? h('button', { type: 'button', class: 'jay-btn is-primary', onclick: cfg.primary.run }, cfg.primary.icon ? icon(cfg.primary.icon, 16) : null, cfg.primary.label) : null,
            cfg.connect ? h('button', { type: 'button', class: 'jay-btn', disabled: true, 'aria-describedby': 'jayPlaceLater' }, icon('plug', 16), cfg.connect) : null),
          cfg.connect ? h('p', { class: 'jay-place-later', id: 'jayPlaceLater' }, 'Connections arrive in a later phase. Credentials will be stored server-side, never in the browser.') : null);
        const page = h('div', { class: ['jay-page', 'jay-place', 'is-' + cfg.key] },
          h('header', { class: 'jay-page-head' },
            h('div', { class: 'jay-page-titles' }, h('h1', { class: 'jay-page-title' }, cfg.title), h('span', { class: 'jay-pill is-quiet' }, cfg.badge || 'Not connected'))),
          h('div', { class: 'jay-place-body' }, hero, cfg.preview ? cfg.preview() : null));
        mount(root, page);
        return cfg.cleanup || null;
      },
    };
  }

  function calendarPreview() {
    const days = [];
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    for (let i = 0; i < 7; i += 1) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
    const blocks = { 0: [[2, 2], [6, 1]], 1: [[1, 1], [4, 3]], 2: [[3, 2]], 3: [[1, 1], [3, 1], [6, 2]], 4: [[2, 3]], 5: [[5, 2]], 6: [] };
    const todayIdx = (new Date().getDay() + 6) % 7;
    return h('section', { class: 'jay-place-preview', 'aria-hidden': 'true' },
      h('div', { class: 'jay-place-preview-label' }, 'Illustration'),
      h('div', { class: 'jay-cal-ghost' }, days.map((d, i) => h('div', { class: ['jay-cal-day', i === todayIdx ? 'is-today' : ''] },
        h('div', { class: 'jay-cal-dayname' }, d.toLocaleDateString(undefined, { weekday: 'short' }), h('span', null, String(d.getDate()))),
        h('div', { class: 'jay-cal-slots' }, (blocks[i] || []).map(([top, len]) => h('span', { class: 'jay-cal-block', style: { gridRow: (top + 1) + ' / span ' + len } })))))));
  }

  function sampleList(title, rows) {
    return h('section', { class: 'jay-place-preview' },
      h('div', { class: 'jay-place-preview-label' }, title),
      rows);
  }

  JAY.views.calendar = placeholder({
    key: 'calendar', title: 'Calendar', icon: 'calendar',
    headline: 'Your calendar will appear here once connected.',
    text: 'JAY will merge events with your tasks, reminders and follow-ups into one calm view of your day and week.',
    bullets: ['Events alongside tasks and reminders', 'Conflicts surfaced in Attention', 'Ask Jay to find time or reschedule'],
    connect: 'Connect Calendar',
    primary: { label: 'Ask Jay to plan my day', icon: 'chat', run: () => { JAY.chat.shared.draft = 'Plan my day around my calendar and tasks'; location.hash = '#/talk'; } },
    preview: calendarPreview,
  });

  JAY.views.notes = placeholder({
    key: 'notes', title: 'Notes', icon: 'notes', badge: 'Coming soon',
    headline: 'Capture now, organise later.',
    text: 'Notes will collect ideas, meeting notes and research from your conversations with Jay and link them to projects and people.',
    bullets: ['Ideas captured from chat or voice', 'Linked to projects and people', 'Searchable alongside Hermes memory'],
    primary: { label: 'Capture an idea', icon: 'lightbulb', run: () => { location.hash = '#/talk'; setTimeout(() => JAY.chat.prime('idea'), 80); } },
    preview: () => {
      const box = h('div', { class: 'jay-notes' });
      JAY.data.getProject('hermes-jay').then((p) => mount(box, (p ? p.notes : []).map((n) => h('article', { class: 'jay-note-card' }, h('div', { class: 'jay-note-title' }, n.title), h('p', { class: 'jay-note-excerpt' }, n.excerpt))))).catch(() => {});
      return sampleList('Sample notes from Hermes / Jay', box);
    },
  });

  JAY.views.people = placeholder({
    key: 'people', title: 'People', icon: 'people', badge: 'Coming soon',
    headline: 'The people behind your work and life.',
    text: 'People will track relationships, last contact and open follow-ups, so Jay can remind you who is waiting on you — and who you are waiting on.',
    bullets: ['Last contact and open threads', 'Follow-ups generated from conversations', 'Linked projects, notes and files'],
    connect: 'Connect Contacts',
    preview: () => {
      const box = h('ul', { class: 'jay-people is-grid' });
      JAY.data.getPeople().then((ps) => mount(box, ps.filter((p) => p.relation !== 'self' && p.relation !== 'assistant').map((p) => h('li', { class: 'jay-person' },
        h('span', { class: 'jay-avatar' }, fmt.initials(p.name)),
        h('span', null, h('span', { class: 'jay-person-name' }, p.name), h('span', { class: 'jay-muted jay-person-role' }, p.role + (p.lastContact ? ' · ' + fmt.relative(p.lastContact).toLowerCase() : ''))))))).catch(() => {});
      return sampleList('Sample people', box);
    },
  });

  /* ── Integrations ──────────────────────────────────────────────────── */
  JAY.views.integrations = {
    title: 'Integrations',
    render(root) {
      const grid = h('div', { class: 'jay-int-grid' });
      mount(root, h('div', { class: 'jay-page jay-integrations' },
        h('header', { class: 'jay-page-head' },
          h('div', { class: 'jay-page-titles' }, h('h1', { class: 'jay-page-title' }, 'Integrations'), h('span', { class: 'jay-pill is-quiet' }, 'None connected'))),
        h('p', { class: 'jay-page-lede' }, 'Integrations will feed Today and Attention and let Jay act on your behalf. None are connected in this preview, and nothing here can be set up yet.'),
        grid,
        h('p', { class: 'jay-note is-block' }, icon('lock', 15), 'When integrations arrive, credentials live server-side in jay-core — never in the browser, mock data or Git.')));
      JAY.widget(grid, {
        name: 'integrations', domains: ['integrations'], load: () => JAY.data.getIntegrations(), skeletonRows: 4,
        render: (items) => items.map((it) => h('article', { class: 'jay-int-card' },
          h('div', { class: 'jay-int-top' }, h('span', { class: 'jay-int-icon' }, icon(it.icon, 18)), h('span', { class: 'jay-pill is-quiet' }, 'Planned')),
          h('h2', { class: 'jay-int-title' }, it.title),
          h('p', { class: 'jay-int-text' }, it.text),
          h('div', { class: 'jay-int-foot' }, h('span', { class: 'jay-status-val is-offline' }, h('span', { class: 'jay-status-dot', 'aria-hidden': 'true' }), 'Not connected')))),
      });
    },
  };

  /* ── System ────────────────────────────────────────────────────────── */
  const HERMES_LINKS = [
    { panel: 'settings', label: 'Settings', icon: 'sliders', text: 'Providers, appearance, voice, auth' },
    { panel: 'profiles', label: 'Agent profiles', icon: 'user', text: 'Profiles and models' },
    { panel: 'skills', label: 'Skills', icon: 'sparkle', text: 'Installed Hermes skills' },
    { panel: 'memory', label: 'Memory', icon: 'database', text: 'Personal memory' },
    { panel: 'insights', label: 'Insights', icon: 'system', text: 'Usage and cost' },
    { panel: 'logs', label: 'Logs', icon: 'file-text', text: 'Agent, gateway and error logs' },
  ];
  const SIM_DOMAINS = [['today', 'Today'], ['attention', 'Attention'], ['tasks', 'Tasks'], ['projects', 'Projects'], ['sessions', 'Continue'], ['system', 'Status']];
  const SIM_STATES = [['normal', 'Normal'], ['loading', 'Loading'], ['empty', 'Empty'], ['error', 'Error'], ['disconnected', 'Disconnected'], ['not-connected', 'Not connected']];

  function segmented(options, value, onPick, label) {
    const seg = h('div', { class: 'jay-segmented', role: 'radiogroup', 'aria-label': label });
    options.forEach(([v, l, ic]) => seg.appendChild(h('button', {
      type: 'button', role: 'radio', class: v === value ? 'is-active' : '', 'aria-checked': v === value ? 'true' : 'false',
      onclick: (e) => {
        seg.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        onPick(v);
      },
    }, ic ? icon(ic, 15) : null, l)));
    return seg;
  }

  JAY.views.system = {
    title: 'System',
    render(root) {
      const statusBox = h('div');
      const autoBox = h('div');
      const themeNow = JAY.shell ? JAY.shell.themePreference() : 'dark';
      const sim = JAY.data.simulated();
      const simGrid = h('div', { class: 'jay-sim-grid' }, SIM_DOMAINS.map(([d, l]) => {
        const id = JAY.nextId('sim');
        const sel = h('select', { class: 'jay-input is-compact', id }, SIM_STATES.map(([v, t]) => h('option', { value: v, selected: (sim[d] || 'normal') === v }, t)));
        sel.addEventListener('change', () => JAY.data.simulate(d, sel.value));
        return h('div', { class: 'jay-field is-inline' }, h('label', { class: 'jay-label', for: id }, l), sel);
      }));

      mount(root, h('div', { class: 'jay-page jay-system' },
        h('header', { class: 'jay-page-head' },
          h('div', { class: 'jay-page-titles' }, h('h1', { class: 'jay-page-title' }, 'System'), h('span', { class: 'jay-page-count' }, 'JAY ' + JAY.version + ' · preview'))),
        h('div', { class: 'jay-sys-grid' },
          h('section', { class: 'jay-card jay-sys-status' },
            h('div', { class: 'jay-block-head' }, h('h2', { class: 'jay-eyebrow' }, 'Jay status'), h('span', { class: 'jay-pill is-quiet' }, JAY.data.isMock('system') ? 'Sample data' : 'Hermes health')),
            statusBox),
          h('section', { class: 'jay-card' },
            h('div', { class: 'jay-block-head' }, h('h2', { class: 'jay-eyebrow' }, 'Hermes'), h('span', { class: 'jay-pill is-ok' }, 'Live')),
            h('p', { class: 'jay-card-lede' }, 'The full Hermes WebUI is still here, unchanged. These open the real Hermes panels.'),
            h('ul', { class: 'jay-hermes-links' }, HERMES_LINKS.map((l) => h('li', null, h('button', {
              type: 'button', class: 'jay-hlink', onclick: () => JAY.shell.openHermes(l.panel),
            }, h('span', { class: 'jay-hlink-icon' }, icon(l.icon, 16)), h('span', { class: 'jay-hlink-main' }, h('span', { class: 'jay-hlink-title' }, l.label), h('span', { class: 'jay-muted' }, l.text)), icon('arrow-up-right', 15)))))),
          h('section', { class: 'jay-card' },
            h('div', { class: 'jay-block-head' }, h('h2', { class: 'jay-eyebrow' }, 'Automations'),
              h('button', { type: 'button', class: 'jay-link', onclick: () => { location.hash = '#/automations'; } }, 'Scheduled jobs', icon('chevron-right', 14))),
            autoBox),
          h('section', { class: 'jay-card' },
            h('div', { class: 'jay-block-head' }, h('h2', { class: 'jay-eyebrow' }, 'Appearance')),
            h('div', { class: 'jay-field' }, h('span', { class: 'jay-label' }, 'Theme'),
              segmented([['dark', 'Dark', 'moon'], ['light', 'Light', 'sun'], ['system', 'System', 'monitor']], themeNow, (v) => JAY.shell.setTheme(v), 'Theme')),
            h('p', { class: 'jay-card-lede' }, 'Shared with Hermes. The “JAY” skin is also available in Hermes Settings → Appearance.')),
          h('section', { class: 'jay-card' },
            h('div', { class: 'jay-block-head' }, h('h2', { class: 'jay-eyebrow' }, 'Data sources')),
            h('p', { class: 'jay-card-lede' }, 'Everything is mock by default. Two read-only Hermes bridges exist to prove the adapter swap; they only read and never send anything.'),
            h('div', { class: 'jay-field' }, h('span', { class: 'jay-label' }, 'Continue (recent work)'),
              segmented([['mock', 'Mock'], ['hermes', 'Hermes sessions']], JAY.data.adapterName('sessions'), (v) => JAY.data.useAdapter('sessions', v), 'Continue data source')),
            h('div', { class: 'jay-field' }, h('span', { class: 'jay-label' }, 'Status'),
              segmented([['mock', 'Mock'], ['hermes', 'Hermes health']], JAY.data.adapterName('system'), (v) => JAY.data.useAdapter('system', v), 'Status data source'))),
          h('section', { class: 'jay-card' },
            h('div', { class: 'jay-block-head' }, h('h2', { class: 'jay-eyebrow' }, 'Preview tools')),
            h('p', { class: 'jay-card-lede' }, 'Simulate widget states to review loading, empty, error and disconnected designs on Home.'),
            simGrid,
            h('div', { class: 'jay-card-actions' },
              h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => { JAY.data.clearSimulations(); simGrid.querySelectorAll('select').forEach((s) => { s.value = 'normal'; }); JAY.ui.toast('Simulations cleared', { icon: 'check' }); } }, 'Clear simulations'),
              h('button', { type: 'button', class: 'jay-btn is-ghost is-danger', onclick: () => { JAY.data.resetDemo(); JAY.chat.shared.convId = 'main'; JAY.chat.shared.draft = ''; JAY.ui.toast('Demo data reset', { icon: 'refresh' }); } }, icon('refresh', 15), 'Reset demo data'))))));

      const w1 = JAY.widget(statusBox, {
        name: 'system-status', domains: ['system'], load: () => JAY.data.getSystemStatus(), isEmpty: () => false, skeletonRows: 5,
        render: (st) => h('div', null,
          h('ul', { class: 'jay-sys-list' }, st.items.map((it) => h('li', { class: 'jay-sys-row' },
            h('span', { class: 'jay-sys-name' }, it.label),
            h('span', { class: 'jay-muted jay-sys-detail' }, it.detail || ''),
            h('span', { class: ['jay-status-val', 'is-' + it.state] }, h('span', { class: 'jay-status-dot', 'aria-hidden': 'true' }), it.value)))),
          h('div', { class: 'jay-status-foot' }, h('span', null, 'Last check'), h('span', null, fmt.time(st.checkedAt)),
            h('button', { type: 'button', class: 'jay-link', onclick: () => w1.refresh() }, icon('refresh', 13), 'Check now'))),
        states: { disconnected: { title: 'Status service unreachable', compact: true } },
      });
      const w2 = JAY.widget(autoBox, {
        name: 'automations', domains: ['system'], load: () => JAY.data.getAutomations(), skeletonRows: 4,
        render: (items) => h('ul', { class: 'jay-sys-list' }, items.map((a) => h('li', { class: 'jay-sys-row' },
          h('span', { class: 'jay-sys-name' }, a.title),
          h('span', { class: 'jay-muted jay-sys-detail' }, a.schedule),
          h('span', { class: ['jay-status-val', a.state === 'failed' ? 'is-offline' : 'is-online'] }, h('span', { class: 'jay-status-dot', 'aria-hidden': 'true' }), a.state === 'failed' ? 'Failed' : 'OK')))),
        empty: { title: 'No automations yet.', compact: true },
      });
      return () => { w1.dispose(); w2.dispose(); };
    },
  };
})();
