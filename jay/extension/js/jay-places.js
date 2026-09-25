/* JAY customization — focused conversation wrapper, placeholder destinations
   (Calendar, Notes, People), Integrations and System, as floating panels.
   Placeholders are honest: they explain what the area will do, say "not
   connected" once (the header pill), and never pretend an integration is live.
   System links into the real Hermes surfaces. Markup comes from
   JAY.h()/textContent and JAY.ui.*. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;
  const UI = JAY.ui;

  function list(v) { return Array.isArray(v) ? v : []; }
  function has(mod, fn) { return !!(JAY[mod] && typeof JAY[mod][fn] === 'function'); }
  function setHeader(route, cfg) {
    if (has('shell', 'setHeader')) JAY.shell.setHeader(Object.assign({ route }, cfg));
  }
  function go(hash) { location.hash = hash; }
  // Open Talk through Home's goTalk: the composer takes focus in the same
  // gesture (a phone opens its keyboard on the first tap), `draft` is added
  // to what the user typed, `intent` primes a mode such as "idea".
  function talk(req) {
    const r = req || {};
    if (has('home', 'goTalk')) { JAY.home.goTalk(r); return; }
    if ((r.draft || r.intent) && has('chat', 'prefill')) JAY.chat.prefill(r.draft || null, r.intent ? { intent: r.intent } : {});
    go('#/talk');
  }
  function panelHead(title, opts) {
    const o = opts || {};
    return h('div', { class: 'jay-box-head jay-pl-head' },
      o.icon ? h('span', { class: 'jay-pl-head-ic', 'aria-hidden': 'true' }, icon(o.icon, 16)) : null,
      h('div', { class: 'jay-box-titles' }, h('h2', { class: 'jay-box-title' }, title), o.sub ? h('div', { class: 'jay-box-sub' }, o.sub) : null),
      o.actions ? h('div', { class: 'jay-box-actions' }, o.actions) : null);
  }

  /* ── Talk (focused Jay conversation) ───────────────────────────────── */
  JAY.views = JAY.views || {};
  JAY.views.talk = {
    title: 'Jay',
    immersiveMobile: true,
    render(root) {
      const chat = JAY.chat.create({ mode: 'focus' });
      mount(root, h('div', { class: 'jay-talk-page' }, chat.el));
      // The conversation panel names itself; the header only says what this is.
      setHeader('talk', { title: 'Talk to Jay', pill: { label: 'Preview', hue: 'lime' }, crumbs: [] });
      // Focus now, while a tap that opened Talk is still the current gesture
      // (phones only when something was asked), with a late retry for layout.
      const want = () => !JAY.isMobile() || JAY.chat.shared.focusNext || JAY.chat.shared.intent || JAY.chat.shared.draft;
      if (want()) chat.focus();
      const t = setTimeout(() => { if (want() && !chat.el.contains(document.activeElement)) chat.focus(); }, 60);
      return () => { clearTimeout(t); chat.destroy(); };
    },
  };

  /* ── Placeholder scaffold: hero panel + preview panel ──────────────── */
  // State is said once, by the header pill. The hero explains the area; the
  // footnote says when it arrives.
  function placeholder(cfg) {
    return {
      title: cfg.title,
      render(root) {
        const laterId = JAY.nextId('later');
        const hero = UI.box({ class: 'jay-pl-hero' },
          h('div', { class: 'jay-pl-hero-top' },
            h('span', { class: 'jay-pl-tile', 'aria-hidden': 'true' }, icon(cfg.icon, 22))),
          h('h2', { class: 'jay-pl-headline' }, cfg.headline),
          h('p', { class: 'jay-pl-text' }, cfg.text),
          h('ul', { class: 'jay-pl-points' }, cfg.bullets.map((b) => h('li', null, h('span', { class: 'jay-pl-check', 'aria-hidden': 'true' }, icon('check', 13)), h('span', null, b)))),
          h('div', { class: 'jay-pl-actions' },
            cfg.primary ? h('button', { type: 'button', class: 'jay-btn is-primary is-lg', onclick: cfg.primary.run }, cfg.primary.icon ? icon(cfg.primary.icon, 16) : null, cfg.primary.label) : null,
            cfg.connect ? h('button', { type: 'button', class: 'jay-btn is-outline is-lg', disabled: true, 'aria-describedby': laterId }, icon('plug', 16), cfg.connect) : null),
          h('p', { class: 'jay-pl-later', id: laterId }, icon('lock', 14), h('span', null, cfg.connect
            ? 'Connections arrive in a later phase; credentials will live server-side, never in the browser.'
            : 'This area arrives in a later phase.')));
        const preview = cfg.preview ? cfg.preview() : null;
        mount(root, h('div', { class: ['jay-layout', 'jay-pl', 'is-fill', 'is-' + cfg.key] }, hero, preview));
        setHeader(cfg.key, { title: cfg.title, pill: { label: cfg.badge || 'Not connected', hue: cfg.badgeHue || 'neutral' }, crumbs: cfg.crumbs || [] });
        return cfg.cleanup || null;
      },
    };
  }

  function previewBox(cls, title, sub, body, extra) {
    return UI.box({ class: ['jay-pl-preview', 'is-col', cls] },
      panelHead(title, { sub, actions: [UI.tag(extra || 'Sample', { hue: 'neutral' })] }),
      h('div', { class: 'jay-pl-preview-body' }, body));
  }

  /* Calendar: an illustrated week (no events are read). */
  function calendarPreview() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const todayIdx = (new Date().getDay() + 6) % 7;
    // [startSlot, length, hue] — decorative blocks only.
    const blocks = {
      0: [[1, 2, 'blue'], [5, 1, 'lime']], 1: [[0, 1, 'purple'], [3, 3, 'blue']], 2: [[2, 2, 'orange']],
      3: [[0, 1, 'lime'], [2, 1, 'blue'], [5, 2, 'purple']], 4: [[1, 3, 'orange']], 5: [[4, 2, 'pink']], 6: [],
    };
    const hours = ['09', '10', '11', '12', '13', '14', '15', '16'];
    const grid = h('div', { class: 'jay-pl-week', 'aria-hidden': 'true' },
      h('div', { class: 'jay-pl-week-hours' }, h('span', { class: 'jay-pl-week-corner' }), hours.map((hr) => h('span', null, hr + ':00'))),
      days.map((d, i) => h('div', { class: ['jay-pl-day', i === todayIdx ? 'is-today' : ''] },
        h('div', { class: 'jay-pl-day-head' }, h('span', { class: 'jay-pl-day-name' }, d.toLocaleDateString(undefined, { weekday: 'short' })), h('span', { class: 'jay-pl-day-num' }, String(d.getDate()))),
        h('div', { class: 'jay-pl-day-slots' },
          hours.map((_, r) => h('i', { class: 'jay-pl-cell', style: { gridRow: String(r + 1) } })),
          (blocks[i] || []).map(([top, len, hue]) => h('span', { class: ['jay-pl-block', 'is-' + hue], style: { gridRow: (top + 1) + ' / span ' + len } }))))));
    return previewBox('is-calendar', 'This week', 'Events appear here once a calendar is connected', grid, 'Illustration');
  }

  /* Notes: real sample notes from the demo projects. */
  function notesPreview() {
    const body = h('div', { class: 'jay-pl-notes' }, UI.state('loading', { rows: 4 }));
    (async () => {
      try {
        const projects = list(await JAY.data.getProjects());
        const full = await Promise.all(projects.map((p) => JAY.data.getProject(p.id).catch(() => null)));
        const notes = [];
        full.filter((p) => p && !p.__state).forEach((p) => list(p.notes).forEach((n) => notes.push({ n, p })));
        notes.sort((a, b) => new Date(b.n.updatedAt) - new Date(a.n.updatedAt));
        if (!notes.length) { mount(body, UI.state('empty', { title: 'No notes in the demo data.', compact: true })); return; }
        mount(body, notes.slice(0, 6).map(({ n, p }) => h('article', { class: 'jay-pl-note' },
          h('div', { class: 'jay-pl-note-top' }, UI.tag(p.title, { hue: UI.toneHue(p), solid: true }), h('span', { class: 'jay-pl-note-time' }, fmt.short(n.updatedAt))),
          h('h3', { class: 'jay-pl-note-title' }, n.title),
          h('p', { class: 'jay-pl-note-text' }, n.excerpt))));
      } catch (_) { mount(body, UI.state('error', { title: 'Couldn’t load sample notes.', compact: true })); }
    })();
    return previewBox('is-notes', 'Sample notes', 'From your demo projects', body);
  }

  /* People: CRM-style table of the demo contacts. */
  // "6 days ago" beside the date; nothing once the relative label is the date itself.
  function agoLabel(d) { const rel = fmt.short(d); return rel && rel !== fmt.dateShort(d) ? rel : null; }
  const RELATION = { client: 'blue', supplier: 'orange', partner: 'purple', family: 'green', friend: 'pink' };
  function peoplePreview() {
    const body = h('div', { class: 'jay-pl-ptable' }, UI.state('loading', { rows: 5 }));
    (async () => {
      try {
        const [people, projects] = await Promise.all([JAY.data.getPeople(), JAY.data.getProjects().catch(() => [])]);
        const ps = list(people).filter((p) => p.relation !== 'self' && p.relation !== 'assistant');
        if (!ps.length) { mount(body, UI.state('empty', { title: 'No people in the demo data.', compact: true })); return; }
        const projOf = (id) => list(projects).filter((p) => list(p.people).includes(id)).map((p) => ({ label: p.title, hue: UI.toneHue(p) }));
        mount(body,
          h('div', { class: 'jay-pl-prow is-head', 'aria-hidden': 'true' }, h('span', null, 'Name'), h('span', null, 'Relation'), h('span', null, 'Projects'), h('span', null, 'Last contact')),
          h('ul', { class: 'jay-pl-plist', 'aria-label': 'Sample people' }, ps.map((p) => h('li', { class: 'jay-pl-prow' },
            h('span', { class: 'jay-pl-pname' }, UI.avatar(p.name, { id: p.id, size: 'md', decorative: true }),
              h('span', { class: 'jay-pl-pname-main' }, h('span', { class: 'jay-pl-pname-t' }, p.name), h('span', { class: 'jay-pl-pname-r' }, p.role || ''))),
            h('span', { class: 'jay-pl-prel' }, UI.tag(p.relation ? fmt.titleCase(p.relation) : 'Contact', { hue: RELATION[p.relation] || 'neutral' })),
            h('span', { class: 'jay-pl-pproj' }, projOf(p.id).length ? UI.tags(projOf(p.id), { max: 1 }) : h('span', { class: 'jay-pl-none' }, '—')),
            h('span', { class: 'jay-pl-plast' }, p.lastContact ? UI.dateCell(p.lastContact, agoLabel(p.lastContact)) : h('span', { class: 'jay-pl-none' }, 'No contact yet'))))));
      } catch (_) { mount(body, UI.state('error', { title: 'Couldn’t load sample people.', compact: true })); }
    })();
    return previewBox('is-people', 'Sample people', 'Demo contacts — nothing is synced', body);
  }

  JAY.views.calendar = placeholder({
    key: 'calendar', title: 'Calendar', icon: 'calendar',
    headline: 'Your calendar will appear here once connected.',
    text: 'JAY will merge events with your tasks, reminders and follow-ups into one calm view of your day and week.',
    bullets: ['Events alongside tasks and reminders', 'Conflicts surfaced in Attention', 'Ask Jay to find time or reschedule'],
    connect: 'Connect Calendar',
    crumbs: ['Week view'],
    primary: { label: 'Ask Jay to plan my day', icon: 'chat', run: () => talk({ draft: 'Plan my day around my calendar and tasks' }) },
    preview: calendarPreview,
  });

  JAY.views.notes = placeholder({
    key: 'notes', title: 'Notes', icon: 'notes', badge: 'Coming soon', badgeHue: 'blue',
    headline: 'Capture now, organise later.',
    text: 'Notes will collect ideas, meeting notes and research from your conversations with Jay and link them to projects and people.',
    bullets: ['Ideas captured from chat or voice', 'Linked to projects and people', 'Searchable alongside Hermes memory'],
    crumbs: ['Sample notes from your projects'],
    primary: { label: 'Capture an idea', icon: 'lightbulb', run: () => talk({ intent: 'idea' }) },
    preview: notesPreview,
  });

  JAY.views.people = placeholder({
    key: 'people', title: 'People', icon: 'people', badge: 'Coming soon', badgeHue: 'blue',
    headline: 'The people behind your work and life.',
    text: 'People will track relationships, last contact and open follow-ups, so Jay can remind you who is waiting on you — and who you are waiting on.',
    bullets: ['Last contact and open threads', 'Follow-ups generated from conversations', 'Linked projects, notes and files'],
    connect: 'Connect Contacts',
    crumbs: ['Sample contacts'],
    preview: peoplePreview,
  });

  /* ── Integrations ──────────────────────────────────────────────────── */
  const INT_GROUP = { email: 'messaging', whatsapp: 'messaging', telegram: 'messaging', calendar: 'productivity', contacts: 'productivity', finance: 'life', weather: 'life', news: 'life' };
  const INT_TABS = [['all', 'All'], ['messaging', 'Messaging'], ['productivity', 'Productivity'], ['life', 'Life']];
  const INT_HUE = { calendar: 'blue', email: 'purple', whatsapp: 'green', telegram: 'cyan', contacts: 'orange', finance: 'yellow', weather: 'cyan', news: 'pink' };
  const INT_CRUMB = 'Credentials stay server-side';

  JAY.views.integrations = {
    title: 'Integrations',
    render(root) {
      let items = [];
      let group = 'all';
      const grid = h('div', { class: 'jay-int-grid' }, UI.state('loading', { rows: 4 }));
      const tabsHost = h('div', { class: 'jay-int-tabs' });
      // Each card says "planned" once (the tag); the header pill says none are connected.
      function draw() {
        const shown = group === 'all' ? items : items.filter((it) => (INT_GROUP[it.id] || 'other') === group);
        if (!shown.length) { mount(grid, UI.box({ class: 'jay-pl-emptybox' }, UI.state('empty', { title: 'Nothing in this group yet.', compact: true }))); return; }
        mount(grid, shown.map((it) => UI.box({ class: 'jay-int-card' },
          h('div', { class: 'jay-int-top' },
            h('span', { class: ['jay-feed-icon', 'jay-int-icon', 'is-' + (INT_HUE[it.id] || 'neutral')], 'aria-hidden': 'true' }, icon(it.icon, 18)),
            UI.tag('Planned', { hue: 'neutral' })),
          h('h2', { class: 'jay-int-title' }, it.title),
          h('p', { class: 'jay-int-text' }, it.text),
          h('div', { class: 'jay-int-foot' },
            h('button', { type: 'button', class: 'jay-btn is-inset is-sm', disabled: true, 'aria-label': 'Connect ' + it.title + ' (arrives in a later phase)' }, icon('plug', 14), 'Connect')))));
      }
      function drawTabs() {
        const count = (g) => (g === 'all' ? items.length : items.filter((it) => (INT_GROUP[it.id] || 'other') === g).length);
        mount(tabsHost, UI.tabs(INT_TABS.map(([id, label]) => ({ id, label, badge: count(id) || undefined, badgeAccent: false })), {
          variant: 'boxed', active: group, label: 'Integration groups',
          onSelect: (g) => { group = g; draw(); },
        }));
      }
      function header() {
        setHeader('integrations', { pill: { label: 'None connected', hue: 'neutral' }, crumbs: (items.length ? [items.length + ' planned'] : []).concat([INT_CRUMB]) });
      }
      mount(root, h('div', { class: 'jay-layout jay-int' }, UI.box({ class: 'jay-int-bar' }, tabsHost), grid));
      header();
      drawTabs();
      let disposed = false;
      let seq = 0;
      async function load() {
        const my = ++seq;
        if (!items.length) mount(grid, UI.state('loading', { rows: 4 }));
        try {
          const res = await JAY.data.getIntegrations();
          if (disposed || my !== seq) return;
          if (res && res.__state) { items = []; drawTabs(); header(); mount(grid, UI.box({ class: 'jay-pl-emptybox' }, UI.state(res.__state))); return; }
          items = list(res);
          drawTabs();
          header();
          if (!items.length) { mount(grid, UI.box({ class: 'jay-pl-emptybox' }, UI.state('empty', { title: 'No integrations planned.', compact: true }))); return; }
          draw();
        } catch (_) {
          if (disposed || my !== seq) return;
          mount(grid, UI.box({ class: 'jay-pl-emptybox' }, UI.state('error', { title: 'Couldn’t load integrations.', action: { label: 'Retry', icon: 'refresh', run: load } })));
        }
      }
      load();
      const off = JAY.on('data:integrations', load);
      return () => { disposed = true; off(); };
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
  const STATE_HUE = { online: 'green', warning: 'yellow', offline: 'red' };
  const STATUS_ICON = { jay: 'sparkle', hermes: 'server', voice: 'mic', automations: 'automations', oci: 'database' };

  // Runs over the last 14 days: 1 = ran, 0 = not scheduled, -1 = failed (one
  // red bar). Uses the automation's own run history; without one, the cadence
  // is derived from the schedule text and only the latest run can show failed.
  const WEEKDAYS = { sundays: 0, mondays: 1, tuesdays: 2, wednesdays: 3, thursdays: 4, fridays: 5, saturdays: 6 };
  function runsOf(a) {
    if (Array.isArray(a.runs) && a.runs.length) return a.runs.slice(-14).map((n) => Math.max(-1, Math.min(1, Math.round(Number(n) || 0))));
    const s = String(a.schedule || '').toLowerCase();
    const wk = Object.keys(WEEKDAYS).find((k) => s.includes(k));
    const today = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today.getTime() - (13 - i) * 86400000);
      const runs = s.startsWith('daily') ? 1 : (wk && d.getDay() === WEEKDAYS[wk] ? 1 : 0);
      return i === 13 && a.state === 'failed' ? -1 : runs;
    });
  }
  // "▢ Daily | 07:30"
  function scheduleCell(a) {
    const m = /^(.*?)\s+(\d{1,2}:\d{2})$/.exec(String(a.schedule || ''));
    return UI.dateCell(null, m ? m[2] : null, { text: m ? m[1] : (a.schedule || '—') });
  }

  JAY.views.system = {
    title: 'System',
    render(root) {
      const statusBox = h('div', { class: 'jay-box-body jay-sys-body' });
      const autoBox = h('div', { class: 'jay-box-body jay-sys-body' });
      const eventsBox = h('div', { class: 'jay-sys-events' });
      const sim = JAY.data.simulated();
      const simGrid = h('div', { class: 'jay-sim-grid' }, SIM_DOMAINS.map(([d, l]) => {
        const id = JAY.nextId('sim');
        const sel = h('select', { class: 'jay-input is-compact', id }, SIM_STATES.map(([v, t]) => h('option', { value: v, selected: (sim[d] || 'normal') === v }, t)));
        sel.addEventListener('change', () => JAY.data.simulate(d, sel.value));
        return h('div', { class: 'jay-field is-inline' }, h('label', { class: 'jay-label', for: id }, l), sel);
      }));

      // "Sample data" is said once, beside the data it describes; the header
      // mentions the source only when the Hermes bridge is live.
      const statusSub = h('div', { class: 'jay-box-sub' });
      const statusPill = h('div', { class: 'jay-box-actions' });
      const sysHeader = (mock) => setHeader('system', { pill: { label: 'Preview', hue: 'lime' }, crumbs: ['JAY ' + JAY.version].concat(mock ? [] : ['Hermes health bridge on']) });
      function syncSource() {
        const mock = JAY.data.isMock('system');
        statusSub.textContent = mock ? 'Services Jay depends on' : 'The Hermes row reads live /health';
        mount(statusPill, UI.dotPill(mock ? 'Sample data' : 'Hermes health', mock ? 'neutral' : 'green'));
        sysHeader(mock);
      }

      const main = h('div', { class: 'jay-sys-grid' },
        UI.box({ class: 'jay-sys-card is-status' },
          h('div', { class: 'jay-box-head jay-pl-head' },
            h('span', { class: 'jay-pl-head-ic', 'aria-hidden': 'true' }, icon('system', 16)),
            h('div', { class: 'jay-box-titles' }, h('h2', { class: 'jay-box-title' }, 'Jay status'), statusSub),
            statusPill),
          statusBox),
        UI.box({ class: 'jay-sys-card is-auto' },
          panelHead('Automations', { icon: 'automations', sub: 'Runs, last 14 days', actions: [h('button', { type: 'button', class: 'jay-link', onclick: () => go('#/automations') }, 'Scheduled jobs', icon('chevron-right', 14))] }),
          autoBox),
        UI.box({ class: 'jay-sys-card is-hermes' },
          panelHead('Hermes', { icon: 'server', sub: 'The full Hermes WebUI is still here, unchanged. These open the real Hermes panels.', actions: [UI.dotPill('Live', 'green')] }),
          h('div', { class: 'jay-box-body' }, h('ul', { class: 'jay-hlinks' }, HERMES_LINKS.map((l) => h('li', null, h('button', {
            type: 'button', class: 'jay-hlink', onclick: () => JAY.shell.openHermes(l.panel),
          }, h('span', { class: 'jay-hlink-ic', 'aria-hidden': 'true' }, icon(l.icon, 17)),
          h('span', { class: 'jay-hlink-main' }, h('span', { class: 'jay-hlink-title' }, l.label), h('span', { class: 'jay-hlink-text' }, l.text)),
          icon('arrow-up-right', 15, 'jay-hlink-go'))))))),
        UI.box({ class: 'jay-sys-card is-tools' },
          panelHead('Preview tools', { icon: 'sliders', sub: 'Simulate widget states to review loading, empty, error and disconnected designs on Home.' }),
          h('div', { class: 'jay-box-body' }, simGrid,
            h('div', { class: 'jay-sys-actions' },
              h('button', { type: 'button', class: 'jay-btn is-outline', onclick: () => { JAY.data.clearSimulations(); simGrid.querySelectorAll('select').forEach((s) => { s.value = 'normal'; }); UI.toast('Simulations cleared', { icon: 'check' }); } }, 'Clear simulations'),
              h('button', {
                type: 'button', class: 'jay-btn is-outline is-danger',
                onclick: () => {
                  JAY.data.resetDemo();
                  if (JAY.chat && JAY.chat.shared) Object.assign(JAY.chat.shared, { convId: 'main', draft: '', draftSource: null });
                  UI.toast('Demo data reset', { icon: 'refresh' });
                },
              }, icon('refresh', 15), 'Reset demo data')))));

      // Radio groups (one tab stop, arrow keys). The theme group also follows
      // changes made from the header or rail toggle.
      const themeSeg = UI.segmented([['dark', 'Dark', 'moon'], ['light', 'Light', 'sun'], ['system', 'System', 'monitor']],
        JAY.shell ? JAY.shell.themePreference() : 'dark', (v) => JAY.shell.setTheme(v), 'Theme');
      themeSeg.querySelectorAll('button[data-value]').forEach((b) => { b.dataset.jayThemeChoice = b.dataset.value; });
      const themeMo = new MutationObserver(() => {
        if (!JAY.shell) return;
        themeSeg.setValue(JAY.shell.themePreference());
        if (densitySeg) densitySeg.setValue(JAY.shell.density());
      });
      themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-jay-density'] });
      const densitySeg = JAY.shell && typeof JAY.shell.density === 'function'
        ? UI.segmented([['comfortable', 'Comfortable', 'board'], ['dense', 'Dense', 'table']], JAY.shell.density(), (v) => JAY.shell.setDensity(v), 'Density')
        : null;

      const aside = h('div', { class: 'jay-stack jay-sys-aside' },
        UI.box({ class: 'jay-sys-card' },
          panelHead('Appearance', { icon: 'sun' }),
          h('div', { class: 'jay-box-body' },
            themeSeg,
            h('p', { class: 'jay-sys-lede' }, 'Shared with Hermes. The “JAY” skin is also available in Hermes Settings → Appearance.'),
            densitySeg ? h('div', { class: 'jay-field jay-sys-density' }, h('span', { class: 'jay-label' }, 'Density'), densitySeg,
              h('p', { class: 'jay-sys-lede' }, 'Dense fits more rows on screen: one flush window, hairline dividers, smaller type. Phones keep touch sizes.')) : null)),
        UI.box({ class: 'jay-sys-card' },
          panelHead('Data sources', { icon: 'database', sub: 'Mock by default. The Hermes bridges only read and never send anything.' }),
          h('div', { class: 'jay-box-body jay-sys-sources' },
            h('div', { class: 'jay-field' }, h('span', { class: 'jay-label' }, 'Continue (recent work)'),
              UI.segmented([['mock', 'Mock'], ['hermes', 'Hermes sessions']], JAY.data.adapterName('sessions'), (v) => JAY.data.useAdapter('sessions', v), 'Continue data source')),
            h('div', { class: 'jay-field' }, h('span', { class: 'jay-label' }, 'Status'),
              UI.segmented([['mock', 'Mock'], ['hermes', 'Hermes health']], JAY.data.adapterName('system'), (v) => JAY.data.useAdapter('system', v), 'Status data source')))),
        UI.box({ class: ['jay-sys-card', 'is-events'] },
          panelHead('Recent events', { icon: 'history', sub: 'From automations and Hermes' }),
          eventsBox));

      mount(root, h('div', { class: 'jay-layout has-aside jay-sys' }, main, aside));
      syncSource();
      const offSource = JAY.on('data:system', syncSource);

      const w1 = JAY.widget(statusBox, {
        name: 'system-status', domains: ['system'], load: () => JAY.data.getSystemStatus(), skeletonRows: 5,
        isEmpty: (s) => !s || !Array.isArray(s.items) || !s.items.length,
        empty: { icon: 'system', title: 'No services reported.', text: 'The status source returned nothing to show.', compact: true, action: { label: 'Check now', icon: 'refresh', run: () => w1.refresh() } },
        render: (st) => h('div', { class: 'jay-sys-status' },
          h('ul', { class: 'jay-sys-rows' }, list(st.items).map((it) => {
            const disk = /(\d{1,3})%\s*disk/i.exec(it.detail || '');
            const used = disk ? Math.min(100, Number(disk[1])) : 0;
            // Disk is a "used" gauge: one flat colour, amber from 75%, red from 90%.
            const tone = used >= 90 ? 'danger' : (used >= 75 ? 'warning' : undefined);
            return h('li', { class: 'jay-sys-row' },
              h('span', { class: 'jay-sys-ic', 'aria-hidden': 'true' }, icon(STATUS_ICON[it.key] || 'circle', 15)),
              h('span', { class: 'jay-sys-main' }, h('span', { class: 'jay-sys-name' }, it.label), h('span', { class: 'jay-sys-detail' }, it.detail || '')),
              disk ? h('span', { class: 'jay-sys-meter' }, UI.meter(used, Object.assign({ segments: 12, label: 'Disk used', ramp: false }, tone ? { tone } : {}))) : h('span', { class: 'jay-sys-meter' }),
              UI.dotPill(it.value, STATE_HUE[it.state] || 'neutral'));
          })),
          h('div', { class: 'jay-sys-foot' },
            // No "NaN:NaN": the time shows only when the source gave a valid one.
            st.checkedAt && Number.isFinite(new Date(st.checkedAt).getTime()) ? h('span', null, 'Last check ', h('strong', null, fmt.time(st.checkedAt))) : null,
            h('span', { class: 'jay-spacer' }),
            h('button', { type: 'button', class: 'jay-btn is-inset is-sm', onclick: () => w1.refresh() }, icon('refresh', 14), 'Check now'))),
        states: { disconnected: { title: 'Status service unreachable', compact: true } },
      });
      const w2 = JAY.widget(autoBox, {
        name: 'automations', domains: ['system'], load: () => JAY.data.getAutomations(), skeletonRows: 4,
        render: (items) => h('ul', { class: 'jay-sys-rows' }, list(items).map((a) => {
          const failed = a.state === 'failed';
          const runs = runsOf(a);
          const fails = runs.filter((n) => n < 0).length;
          const ran = runs.filter((n) => n > 0).length;
          return h('li', { class: ['jay-sys-row', 'is-auto', failed ? 'is-failed' : ''] },
            h('span', { class: 'jay-sys-ic', 'aria-hidden': 'true' }, icon(failed ? 'alert-triangle' : 'repeat', 15)),
            h('span', { class: 'jay-sys-main' }, h('span', { class: 'jay-sys-name' }, a.title), scheduleCell(a)),
            UI.spark(runs, { label: 'Last 14 days: ' + fmt.plural(ran, 'run') + (fails ? ', ' + fails + ' failed' : '') }),
            UI.dotPill(failed ? 'Failed' : 'OK', failed ? 'red' : 'green'));
        })),
        empty: { title: 'No automations yet.', compact: true },
      });
      const w3 = JAY.widget(eventsBox, {
        name: 'system-events', domains: ['attention', 'system'], skeletonRows: 3,
        load: async () => {
          const items = await JAY.data.getAttentionItems();
          if (items && items.__state) return items;
          return list(items).filter((a) => a.source === 'automation');
        },
        // A target opens the Attention item (Home's drawer), else the jobs list.
        render: (items) => items.map((a) => UI.feedItem({
          who: a.actor ? { id: a.actor, name: a.actor === 'jay' ? 'Jay' : (a.personName || a.actor) } : null,
          icon: a.icon || 'automations', hue: a.hue || (a.level === 'critical' ? 'red' : 'neutral'),
          verb: a.verb || a.title, target: a.verb ? a.target : null,
          onTarget: () => { if (has('home', 'openAttention')) JAY.home.openAttention(a); else go('#/automations'); },
          context: list(a.context), time: fmt.short(a.at), attachment: a.attachment || null,
          level: a.level, unread: a.level === 'critical',
        })),
        empty: { title: 'No recent events.', compact: true },
      });
      return () => { offSource(); themeMo.disconnect(); w1.dispose(); w2.dispose(); w3.dispose(); };
    },
  };
})();
