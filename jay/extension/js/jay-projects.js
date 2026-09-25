/* JAY customization — Projects.
   Deepsleep-style project board: a tree of projects (favorites, active
   projects by area with streams, finished, archive) | header panel + tabs
   panel + content (kanban board / list, overview, timeline, files, notes) |
   activity feed aside. Below 1280px the feed becomes an "Activity" tab; phones
   get a list of project cards and a stacked detail.
   Data comes only from JAY.data.*; markup only from JAY.h()/textContent and
   the shared JAY.ui.* components, so every screen renders identical parts. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;
  const UI = JAY.ui;

  /* ── Vocabulary ─────────────────────────────────────────────────────── */
  const STATUS = {
    active: { label: 'Active', hue: 'green' },
    ongoing: { label: 'Ongoing', hue: 'blue' },
    paused: { label: 'Paused', hue: 'yellow' },
    done: { label: 'Completed', hue: 'neutral' },
    archived: { label: 'Archived', hue: 'neutral' },
  };
  const AREAS = ['Work', 'Business', 'Personal'];
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'files', label: 'Files' },
    { id: 'notes', label: 'Notes' },
  ];
  // Below 1280px the activity aside folds into a first tab (Deepsleep's
  // "Notifications" tab) instead of dropping under the board. Never persisted.
  const ACTIVITY = 'activity';
  const BOARD_COLUMNS = [
    { id: 'new', label: 'New', hue: 'red', statuses: ['inbox', 'next'] },
    { id: 'progress', label: 'In Progress', hue: 'blue', statuses: ['in_progress', 'waiting'] },
    { id: 'done', label: 'Completed', hue: 'lime', statuses: ['done'] },
  ];
  const FILTERS = [
    { id: 'all', label: 'All tasks' },
    { id: 'open', label: 'Open only' },
    { id: 'mine', label: 'Assigned to me' },
    { id: 'week', label: 'Due this week' },
    { id: 'overdue', label: 'Overdue' },
  ];
  const VIEWS = ['list', 'board'];
  // Attention requests a project's activity can answer in place (same wording as Home).
  const REQUEST_ACTIONS = {
    approve: { label: 'Approve', primary: true, toast: 'Approved', icon: 'check' },
    decline: { label: 'Decline', toast: 'Declined', icon: 'x' },
  };
  const DAY = 86400000;
  const TL_DAYS = 14; // Timeline window
  const TL_LEAD = 4;  // days shown before today
  const mqWide = window.matchMedia('(min-width: 1024px)');
  const mqAside = window.matchMedia('(min-width: 1280px)');

  /* ── Browser-local UI prefs (view choices, favorites/mute overrides and
        "seen" markers until jay-core stores them; never data or secrets).
        Every field is coerced: the key lives on the shared Hermes origin, so a
        corrupt or legacy value must never break the screen. ── */
  const PREFS_KEY = 'projects-ui';
  function plain(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function prefs() {
    const p = plain(JAY.storage.get(PREFS_KEY, {}));
    return {
      tab: TABS.some((t) => t.id === p.tab) ? p.tab : 'tasks',
      view: VIEWS.includes(p.view) ? p.view : null, // null: not chosen yet (see defaultView)
      filter: FILTERS.some((f) => f.id === p.filter) ? p.filter : 'all',
      collapsed: Array.isArray(p.collapsed) ? p.collapsed.filter((s) => typeof s === 'string') : [],
      sections: plain(p.sections),
      fav: plain(p.fav),
      mute: plain(p.mute),
      seen: plain(p.seen),
    };
  }
  function savePrefs(patch) { JAY.storage.set(PREFS_KEY, Object.assign(prefs(), patch)); }
  // Until a layout is chosen, phones open the list (a board there shows one
  // squeezed column at a time); wider screens open the board.
  function defaultView() { return JAY.isMobile() ? 'list' : 'board'; }
  // pf: prefs read once per draw (callers pass it; never an Array#filter index).
  function isFav(p, pf) { const f = (pf || prefs()).fav; return own(f, p.id) ? !!f[p.id] : !!p.favorite; }
  function isMuted(p, pf) { return !!(pf || prefs()).mute[p.id]; }
  function unreadSince(p, pf) {
    const t = new Date((pf || prefs()).seen[p.id]).getTime();
    return Number.isFinite(t) ? t : Date.now() - DAY;
  }

  /* ── Small helpers ──────────────────────────────────────────────────── */
  function list(v) { return Array.isArray(v) ? v : []; }
  function meId() { return (JAY.me && JAY.me.id) || 'me'; }
  // UI.state() merges options over its defaults, so never pass undefined keys.
  function stateBox(kind, opts) { return UI.box({ class: 'jay-pj-empty' }, UI.state(kind, opts || {})); }
  function dataState(res, notFound, action) {
    if (res && res.__state) return stateBox(res.__state, action ? { action } : null);
    return stateBox('empty', Object.assign({ title: notFound }, action ? { action } : {}));
  }
  function statusOf(p) { return STATUS[p.status] || { label: String(p.status || 'Active'), hue: 'neutral' }; }
  function isLive(p) { return p.status !== 'done' && p.status !== 'archived'; }
  function areasOf(projects) { return AREAS.concat(Array.from(new Set(projects.map((p) => p.area || 'Personal'))).filter((a) => !AREAS.includes(a))); }
  function openCount(p) { return Number.isFinite(p.openTasks) ? p.openTasks : list(p.tasks).filter((t) => t.status !== 'done').length; }
  function go(id) { location.hash = '#/projects/' + encodeURIComponent(id); }
  function has(mod, fn) { return !!(JAY[mod] && typeof JAY[mod][fn] === 'function'); }
  function openTask(id) { if (has('tasks', 'openTask')) JAY.tasks.openTask(id); }
  function newTask(prefill) { if (has('tasks', 'openCreate')) JAY.tasks.openCreate(prefill); }
  // Adds to the composer draft (a typed draft is kept) and focuses it in the
  // same gesture, so a phone opens its keyboard on the first tap.
  function askJay(p) {
    const text = 'About ' + p.title + ': ';
    if (has('chat', 'prefill')) JAY.chat.prefill(text);
    else if (JAY.chat && JAY.chat.shared) JAY.chat.shared.draft = text;
    if (has('shell', 'navigate')) {
      JAY.shell.navigate('#/talk');
      if (has('chat', 'focus')) JAY.chat.focus();
    } else location.hash = '#/talk';
  }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function validDate(d) { return !!d && Number.isFinite(new Date(d).getTime()); }
  function dayIndex(start, d) { return Math.round((startOfDay(d) - start) / DAY); }

  // Relative due label that never repeats the date ("Today", "Overdue", "Sat").
  function dueLabel(d) {
    const st = fmt.dueState(d);
    if (st === 'overdue') return 'Overdue';
    if (st === 'today') return 'Today';
    const rel = fmt.due(d);
    return rel === fmt.dateShort(d) ? null : rel;
  }

  function crumbs(items, onPick, active) {
    const arr = list(items);
    if (!arr.length) return null;
    // Each separator travels with its crumb so wrapped lines never start with "|".
    return h('div', { class: 'jay-pj-crumbs' }, arr.map((s, i) => h('span', { class: 'jay-pj-crumb-i' },
      i ? h('span', { class: 'jay-sep', 'aria-hidden': 'true' }, '|') : null,
      onPick ? h('button', { type: 'button', class: ['jay-pj-crumb', active === s ? 'is-active' : ''], 'aria-pressed': active === s ? 'true' : 'false', 'aria-label': 'Stream: ' + s, 'data-pj-tool': 'crumb:' + s, onclick: () => onPick(s) }, s)
        : h('span', { class: 'jay-pj-crumb' }, s))));
  }

  // The shell header is the portfolio line on every Projects screen: it stays
  // put while you move between projects; the project itself is the header panel.
  function portfolioHeader(projects, extra) {
    if (!has('shell', 'setHeader')) return;
    const live = list(projects).filter(isLive);
    JAY.shell.setHeader(Object.assign({
      route: 'projects', title: 'Projects', pill: { label: live.length + ' active', hue: 'green' },
      crumbs: areasOf(live).map((a) => { const n = live.filter((p) => (p.area || 'Personal') === a).length; return n ? a + ' ' + n : null; }).filter(Boolean),
    }, extra || {}));
  }

  /* ── Streams ────────────────────────────────────────────────────────── */
  // A task belongs to its own `stream`. Until every task carries one, a tag
  // that names the stream places it there ("content" → Content, "proposal" →
  // Proposals, "design" → Website Design).
  function streamOf(t, streams) {
    if (t && typeof t.stream === 'string' && t.stream) return t.stream;
    const tags = list(t && t.tags).map((x) => String(x).toLowerCase()).filter(Boolean);
    if (!tags.length) return null;
    return list(streams).find((s) => {
      const name = String(s).toLowerCase();
      const words = name.split(/\s+/);
      return tags.some((tg) => tg === name || words.some((w) => w === tg || w === tg + 's'));
    }) || null;
  }
  function scopedTasks(p, stream) {
    const all = list(p.tasks);
    return stream ? all.filter((t) => streamOf(t, p.streams) === stream) : all;
  }
  function scopedActivity(p, stream) { return list(p.activity).filter((a) => !stream || list(a.context).includes(stream)); }

  /* ── People (names for activity actors) ─────────────────────────────── */
  const peopleCache = new Map();
  function personOf(id, fallback) {
    if (peopleCache.has(id)) return peopleCache.get(id);
    const f = list(fallback).find((p) => p && p.id === id);
    if (f) return f;
    return { id, name: fmt.titleCase(id || 'Someone') };
  }
  async function loadPeople() {
    try {
      const ps = await JAY.data.getPeople();
      list(ps).forEach((p) => { if (p && p.id) peopleCache.set(p.id, p); });
    } catch (_) { /* names fall back to ids */ }
  }

  /* ── Requests (Approve / Decline) ───────────────────────────────────── */
  // Activity links to an open Attention request by `attentionId`; activity
  // without a link matches the open request from the same person about the
  // same thing. Answering it here resolves it on Home as well.
  function requestFor(a, requests) {
    const rs = list(requests);
    if (!rs.length) return null;
    if (a.attentionId) return rs.find((r) => r.id === a.attentionId) || null;
    return a.actor && a.target ? rs.find((r) => r.actor === a.actor && r.target === a.target) || null : null;
  }
  async function loadRequests() {
    const items = await JAY.data.getAttentionItems();
    return list(items).filter((r) => r && r.id && list(r.actions).some((x) => REQUEST_ACTIONS[x]));
  }
  async function answerRequest(r, action) {
    const spec = REQUEST_ACTIONS[action];
    try {
      await JAY.data.resolveAttention(r.id, action);
      UI.toast(spec.toast + ': ' + (r.target || r.title), { icon: spec.icon, action: { label: 'Undo', run: () => JAY.data.restoreAttention(r.id) } });
    } catch (_) {
      UI.toast('Couldn’t update that request.', { tone: 'danger', icon: 'alert-circle' });
    }
  }

  /* ── Feed items (Deepsleep activity cards) ──────────────────────────── */
  function taskFor(p, target) {
    const t = String(target || '').trim().toLowerCase();
    if (!t) return null;
    const tasks = list(p.tasks);
    return tasks.find((x) => x.title.toLowerCase() === t)
      || (t.split(/\s+/).length >= 2 ? tasks.find((x) => x.title.toLowerCase().includes(t)) : null)
      || null;
  }
  // opts: { since (unread cut-off; omit for none), requests, onAnswer, showProject }
  function feedCard(a, p, opts) {
    const o = opts || {};
    const who = a.actor ? personOf(a.actor, p.people) : null;
    const task = taskFor(p, a.target);
    const req = requestFor(a, o.requests);
    const node = UI.feedItem({
      who: who ? { id: who.id, name: who.name } : null,
      icon: 'history', hue: 'neutral',
      verb: (req && a.verb && req.verb) || a.verb || a.text || '',
      target: a.verb ? a.target : null,
      onTarget: task ? () => openTask(task.id) : null,
      context: a.verb ? list(a.context).concat(o.showProject ? [p.title] : []) : [],
      time: fmt.short(a.at),
      attachment: a.attachment || null,
      quote: a.quote || null,
      actions: req ? Object.keys(REQUEST_ACTIONS).filter((k) => list(req.actions).includes(k)).map((k) => ({
        label: REQUEST_ACTIONS[k].label,
        primary: !!REQUEST_ACTIONS[k].primary,
        aria: REQUEST_ACTIONS[k].label + ': ' + (req.target || req.title),
        run: () => { if (o.onAnswer) o.onAnswer(a); answerRequest(req, k); },
      })) : null,
      unread: Number.isFinite(o.since) && new Date(a.at).getTime() > o.since,
    });
    node.dataset.act = a.id || '';
    return node;
  }
  function isMention(a) { return !!a.actor && a.actor !== meId(); }
  // Counts for the feed tabs and the Activity tab badge. A muted project has no unread.
  function feedStats(p, stream, pf) {
    const all = scopedActivity(p, stream);
    const since = unreadSince(p, pf);
    const unread = isMuted(p, pf) ? 0 : all.filter((a) => new Date(a.at).getTime() > since).length;
    return { all, mentions: all.filter(isMention), since, unread };
  }

  /* ── Side tree ──────────────────────────────────────────────────────── */
  // cfg: { projects, activeId, query, stream, streamsOpen, prefs, onArea, onStream, onToggleStreams }
  function treeSections(cfg) {
    const pf = cfg.prefs;
    const collapsed = new Set(pf.collapsed);
    const q = String(cfg.query || '').trim().toLowerCase();
    const projects = list(cfg.projects);
    const expanded = (p) => p.id === cfg.activeId && cfg.streamsOpen;
    // Deepsleep: project rows carry a lime chevron (down = open, up = closed);
    // stream leaves are hollow lime squares, favorites filled lime squares.
    const item = (p, depth) => ({
      id: 'project:' + p.id, label: p.title, depth, icon: expanded(p) ? 'chevron-down' : 'chevron-up',
      count: openCount(p) || null, countAccent: true, active: p.id === cfg.activeId,
      run: () => (p.id === cfg.activeId ? cfg.onToggleStreams() : go(p.id)),
    });
    const streamRow = (p, s, depth) => ({
      id: 'stream:' + p.id + ':' + s, label: s, depth, dot: 'lime', hollow: cfg.stream !== s || p.id !== cfg.activeId, active: p.id === cfg.activeId && cfg.stream === s,
      run: () => { if (p.id === cfg.activeId) cfg.onStream(s); else go(p.id); },
    });
    const withStreams = (p, depth) => [item(p, depth)].concat(expanded(p) ? list(p.streams).map((s) => streamRow(p, s, depth + 1)) : []);
    if (q) {
      const hits = [];
      projects.forEach((p) => {
        const streams = list(p.streams).filter((s) => s.toLowerCase().includes(q));
        if (p.title.toLowerCase().includes(q) || String(p.area || '').toLowerCase().includes(q) || streams.length) {
          hits.push(item(p, 0));
          streams.forEach((s) => hits.push(streamRow(p, s, 1)));
        }
      });
      return [{ id: 'results', title: 'Results', collapsible: false, items: hits, empty: 'No projects match “' + cfg.query.trim() + '”.' }];
    }
    const live = projects.filter(isLive);
    const activeItems = [];
    areasOf(live).forEach((area) => {
      const inArea = live.filter((p) => (p.area || 'Personal') === area);
      if (!inArea.length) return;
      const open = !collapsed.has(area);
      activeItems.push({ id: 'area:' + area, label: area, icon: open ? 'chevron-down' : 'chevron-up', run: () => cfg.onArea(area) });
      if (open) inArea.forEach((p) => activeItems.push(...withStreams(p, 1)));
    });
    const secOpen = (id, dflt) => (own(pf.sections, id) ? !!pf.sections[id] : dflt);
    const flat = (ps) => ps.reduce((acc, p) => acc.concat(withStreams(p, 0)), []);
    return [
      { id: 'favorites', title: 'Favorites', open: secOpen('favorites', true), items: projects.filter((p) => isFav(p, pf)).map((p) => ({ id: 'fav:' + p.id, label: p.title, dot: 'lime', run: () => go(p.id) })), empty: 'Star a project to pin it here.' },
      // id stays "areas" so the stored open/closed choice survives the rename.
      { id: 'areas', title: 'Active', open: secOpen('areas', true), items: activeItems, empty: 'No active projects.' },
      { id: 'finished', title: 'Finished', open: secOpen('finished', false), items: flat(projects.filter((p) => p.status === 'done')), empty: 'Nothing finished yet.' },
      { id: 'archive', title: 'Archive', open: secOpen('archive', false), items: flat(projects.filter((p) => p.status === 'archived')), empty: 'Nothing archived.' },
    ];
  }
  // Build the tree's scroll area with the shared sideNav helper, then add the
  // bits the helper leaves to screens: empty rows, expand state, and
  // persisting which sections are open.
  function treeScroll(cfg) {
    const sections = treeSections(cfg);
    const nav = UI.sideNav({ label: 'Projects', navLabel: 'Project tree', sections });
    const scroll = nav.querySelector('.jay-side-scroll');
    scroll.setAttribute('aria-label', 'Project tree');
    const secEls = Array.from(scroll.querySelectorAll(':scope > .jay-side-section'));
    secEls.forEach((el, i) => {
      const sec = sections[i];
      if (!sec) return;
      const ul = el.querySelector('.jay-side-list');
      if (ul && !ul.children.length && sec.empty) ul.appendChild(h('li', { class: 'jay-pj-side-empty' }, sec.empty));
      const head = el.querySelector(':scope > .jay-side-head');
      if (head) {
        head.addEventListener('click', () => {
          const sectionsPref = Object.assign({}, prefs().sections);
          sectionsPref[sec.id] = head.getAttribute('aria-expanded') === 'true';
          savePrefs({ sections: sectionsPref });
        });
      }
    });
    scroll.querySelectorAll('.jay-side-item[data-side^="area:"]').forEach((b) => {
      b.classList.add('jay-pj-area');
      b.setAttribute('aria-expanded', cfg.prefs.collapsed.includes(b.dataset.side.slice(5)) ? 'false' : 'true');
    });
    scroll.querySelectorAll('.jay-side-item[data-side^="project:"]').forEach((b) => {
      b.classList.add('jay-pj-proj');
      if (b.classList.contains('is-active')) b.setAttribute('aria-expanded', cfg.streamsOpen ? 'true' : 'false');
    });
    return scroll;
  }

  /* ── Task list (compact rows, grouped like the board) ──────────────── */
  const LIST_COLS = [['', ''], ['Task', 'is-task'], ['Owner', 'is-owner'], ['Progress', 'is-meter'], ['Due', 'is-due']];
  function taskRow(t) {
    const done = t.status === 'done';
    const tags = list(t.tags).map((tg) => ({ label: fmt.titleCase(tg), hue: UI.tagHue(tg) }));
    const owner = t.assignee ? personOf(t.assignee) : null;
    const progress = done ? 100 : (Number.isFinite(t.progress) ? t.progress : 0);
    return h('li', { class: ['jay-pj-trow', done ? 'is-done' : ''] },
      has('tasks', 'checkToggle') ? JAY.tasks.checkToggle(t, JAY.tasks.toggleDone) : h('span'),
      // Title and its first tag share one cell; the tag hides first when the list is narrow.
      h('span', { class: 'jay-pj-trow-main' },
        h('button', { type: 'button', class: 'jay-pj-trow-title', onclick: () => openTask(t.id), title: t.title }, t.title),
        tags.length ? h('span', { class: 'jay-pj-trow-tags' }, UI.tags(tags, { max: 1 })) : null),
      h('span', { class: 'jay-pj-trow-owner jay-who' }, owner ? UI.avatar(owner.name, { id: owner.id, size: 'sm', decorative: true }) : null, owner ? h('span', null, owner.name.split(' ')[0]) : null),
      h('span', { class: 'jay-pj-trow-meter' }, UI.meter(progress, { segments: 10, label: t.title + ' progress' })),
      h('span', { class: 'jay-pj-trow-due' }, has('tasks', 'dueNode') ? JAY.tasks.dueNode(t) : (t.due ? fmt.due(t.due) : '—')));
  }
  function taskList(tasks, p, prefill) {
    const groups = BOARD_COLUMNS.map((c) => ({ col: c, items: tasks.filter((t) => c.statuses.includes(t.status)) }));
    return h('div', { class: 'jay-box jay-pj-list' },
      // One column header for the whole list (CRM table head); rows are not a table.
      h('div', { class: 'jay-pj-trow is-head', 'aria-hidden': 'true' }, LIST_COLS.map(([label, cls]) => h('span', { class: cls || null }, label))),
      groups.map(({ col, items }) => h('section', { class: 'jay-pj-lgroup', 'aria-label': col.label + ', ' + fmt.plural(items.length, 'task') },
        h('header', { class: 'jay-pj-lgroup-head' },
          h('span', { class: ['jay-kcol-mark', 'is-' + col.hue], 'aria-hidden': 'true' }),
          h('h3', { class: 'jay-pj-lgroup-title' }, col.label),
          UI.badge(items.length),
          h('span', { class: 'jay-spacer' }),
          h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Add task to ' + col.label, onclick: () => newTask(prefill(col.statuses[0])) }, icon('plus', 16))),
        items.length ? h('ul', { class: 'jay-pj-trows' }, items.map(taskRow)) : h('div', { class: 'jay-pj-lgroup-empty' }, 'No tasks here.'))));
  }
  function applyFilter(tasks, filter) {
    const now = new Date();
    const me = meId();
    return tasks.filter((t) => {
      if (filter === 'open') return t.status !== 'done';
      if (filter === 'mine') return t.assignee === me;
      if (filter === 'week') { const s = t.due ? fmt.dueState(t.due, now) : 'none'; return t.status !== 'done' && (s === 'today' || s === 'soon' || s === 'overdue'); }
      if (filter === 'overdue') return t.status !== 'done' && t.due && fmt.dueState(t.due, now) === 'overdue';
      return true;
    });
  }

  /* ── Tab contents ──────────────────────────────────────────────────── */
  function panelHead(title, extra, sub) {
    return h('div', { class: 'jay-box-head jay-pj-phead' },
      h('div', { class: 'jay-box-titles' }, h('h3', { class: 'jay-box-title' }, title), sub ? h('div', { class: 'jay-box-sub' }, sub) : null),
      extra ? h('div', { class: 'jay-box-actions' }, extra) : null);
  }
  function fileRows(files) {
    if (!files.length) return h('div', { class: 'jay-empty-line' }, 'No files yet.');
    return h('ul', { class: 'jay-pj-files' }, files.map((f) => h('li', { class: 'jay-pj-file' },
      UI.fileBadge(f, { fromName: true }),
      h('span', { class: 'jay-pj-file-main' }, h('span', { class: 'jay-pj-file-name' }, f.name), h('span', { class: 'jay-pj-file-meta' }, [f.size, fmt.titleCase(f.kind || '')].filter(Boolean).join(' · '))),
      UI.dateCell(f.updatedAt, null, { text: fmt.short(f.updatedAt), title: validDate(f.updatedAt) ? fmt.dateShort(f.updatedAt) : null }))));
  }
  // Inside a project the project's own name is not repeated on its notes.
  function noteCards(notes) {
    if (!notes.length) return h('div', { class: 'jay-empty-line' }, 'No notes yet.');
    return h('div', { class: 'jay-pj-notes' }, notes.map((n) => h('article', { class: 'jay-pj-note' },
      h('div', { class: 'jay-pj-note-top' },
        n.stream ? UI.tag(n.stream, { hue: 'neutral' }) : null,
        h('span', { class: 'jay-pj-note-time' }, fmt.short(n.updatedAt))),
      h('h4', { class: 'jay-pj-note-title' }, n.title),
      h('p', { class: 'jay-pj-note-text' }, n.excerpt))));
  }
  function peopleRows(people) {
    if (!people.length) return h('div', { class: 'jay-empty-line' }, 'Just you.');
    return h('ul', { class: 'jay-pj-people' }, people.map((pp) => h('li', { class: 'jay-pj-person' },
      UI.avatar(pp.name, { id: pp.id, size: 'md', decorative: true }),
      h('span', { class: 'jay-pj-person-main' }, h('span', { class: 'jay-pj-person-name' }, pp.name), h('span', { class: 'jay-pj-person-role' }, pp.role || '')))));
  }
  function convRows(convs) {
    if (!convs.length) return h('div', { class: 'jay-empty-line' }, 'No conversations linked yet.');
    return h('ul', { class: 'jay-pj-convs' }, convs.map((c) => h('li', null, h('button', {
      type: 'button', class: 'jay-pj-conv',
      onclick: () => { if (has('chat', 'open')) JAY.chat.open(c.id); location.hash = '#/talk'; },
    }, h('span', { class: 'jay-pj-conv-ic', 'aria-hidden': 'true' }, icon('message-circle', 15)),
    h('span', { class: 'jay-pj-conv-title' }, c.title),
    h('span', { class: 'jay-pj-conv-time' }, fmt.short(c.updatedAt))))));
  }
  // Two-line task row: title, then "▢ Sep 22 | Overdue" and the status.
  function nextRow(t, before) {
    const st = t.due ? fmt.dueState(t.due) : 'none';
    const status = has('tasks', 'statusPill') ? JAY.tasks.statusPill(t.status) : null;
    return h('li', { class: ['jay-pj-nrow', 'is-' + st] },
      has('tasks', 'checkToggle') ? JAY.tasks.checkToggle(t, JAY.tasks.toggleDone) : h('span'),
      h('span', { class: 'jay-pj-nrow-main' },
        h('button', { type: 'button', class: 'jay-pj-next-title', onclick: () => { if (before) before(); openTask(t.id); } }, t.title),
        h('span', { class: 'jay-pj-nrow-meta' }, t.due ? UI.dateCell(t.due, dueLabel(t.due)) : h('span', { class: 'jay-pj-pcard-none' }, 'No date'))),
      status);
  }
  function statBlock(label, value, sub) {
    return h('div', { class: 'jay-pj-stat' }, h('span', { class: 'jay-pj-stat-k' }, label), h('span', { class: 'jay-pj-stat-v' }, value), sub ? h('span', { class: 'jay-pj-stat-s' }, sub) : null);
  }
  // "Overdue since Sep 21" / "Next due Tomorrow" — never a past date read as "next".
  function milestoneSub(p) {
    const due = p.nextDue && p.nextDue.due;
    if (!validDate(due)) return null;
    return fmt.dueState(due) === 'overdue' ? 'Overdue since ' + fmt.dateShort(due) : 'Next due ' + (dueLabel(due) || fmt.dateShort(due));
  }

  function overview(p) {
    const tasks = list(p.tasks);
    const open = tasks.filter((t) => t.status !== 'done');
    const week = applyFilter(tasks, 'week').length;
    const overdue = applyFilter(tasks, 'overdue').length;
    const derived = tasks.length ? Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100) : 0;
    const pct = Number.isFinite(p.progress) ? p.progress : derived;
    const next = open.filter((t) => t.due).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 4);
    return h('div', { class: 'jay-pj-over' },
      UI.box({ class: 'jay-pj-summary' },
        h('div', { class: 'jay-pj-summary-top' },
          h('p', { class: 'jay-pj-desc' }, p.description || 'No description yet.'),
          h('div', { class: 'jay-pj-progress' },
            h('span', { class: 'jay-pj-stat-k' }, Number.isFinite(p.progress) ? 'Progress' : 'Tasks completed'),
            UI.meter(pct, { segments: 20, label: p.title + ' progress' }))),
        h('div', { class: 'jay-pj-stats' },
          statBlock('Open', String(open.length), fmt.plural(tasks.length - open.length, 'done', 'done')),
          statBlock('Due this week', String(week), overdue ? overdue + ' overdue' : 'On track'),
          statBlock('Milestone', p.milestone || '—', milestoneSub(p)),
          statBlock('Updated', fmt.short(p.updatedAt), p.area ? 'Area: ' + p.area : null))),
      UI.box({ class: ['jay-pj-card-panel', 'is-wide'] }, panelHead('Up next', h('button', { type: 'button', class: 'jay-link', onclick: () => { location.hash = '#/tasks?project=' + encodeURIComponent(p.id) + '&status=all'; } }, 'All tasks', icon('chevron-right', 14))),
        h('div', { class: 'jay-box-body' }, next.length ? h('ul', { class: 'jay-pj-next' }, next.map((t) => nextRow(t))) : h('div', { class: 'jay-empty-line' }, 'Nothing scheduled.'))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('Files', UI.badge(list(p.files).length || null)), h('div', { class: 'jay-box-body' }, fileRows(list(p.files)))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('Notes', UI.badge(list(p.notes).length || null)), h('div', { class: 'jay-box-body' }, noteCards(list(p.notes).slice(0, 2)))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('People', UI.badge(list(p.people).length || null)), h('div', { class: 'jay-box-body' }, peopleRows(list(p.people)))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('Conversations', UI.badge(list(p.conversations).length || null)), h('div', { class: 'jay-box-body' }, convRows(list(p.conversations)))));
  }

  /* ── Timeline tab: a two-week schedule built from the tasks ─────────── */
  // One row per dated task, grouped like the board. Each bar runs from the day
  // the task was created (or the window start) to its due day, in the column
  // hue — red and striped when overdue. A lime line marks today. The feed
  // stays in Activity; this view never repeats it.
  function timeline(p, ctx) {
    const tasks = scopedTasks(p, ctx.stream);
    const dated = tasks.filter((t) => validDate(t.due)).sort((a, b) => new Date(a.due) - new Date(b.due));
    const undated = tasks.length - dated.length;
    const today = startOfDay(new Date());
    const start = addDays(today, ctx.shift * 7 - TL_LEAD);
    const days = Array.from({ length: TL_DAYS }, (_, i) => addDays(start, i));
    const last = TL_DAYS - 1;
    const todayIdx = dayIndex(start, today);
    const nav = h('div', { class: 'jay-pj-tl-nav', role: 'group', 'aria-label': 'Move the timeline' },
      h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Previous week', 'data-tip': 'Previous week', 'data-pj-tool': 'tl-prev', onclick: () => ctx.onShift(ctx.shift - 1) }, icon('chevron-left', 16)),
      h('button', { type: 'button', class: ['jay-btn', 'is-inset', 'is-sm', ctx.shift === 0 ? 'is-current' : ''], 'aria-pressed': ctx.shift === 0 ? 'true' : 'false', 'data-pj-tool': 'tl-today', onclick: () => ctx.onShift(0) }, 'Today'),
      h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Next week', 'data-tip': 'Next week', 'data-pj-tool': 'tl-next', onclick: () => ctx.onShift(ctx.shift + 1) }, icon('chevron-right', 16)));
    const range = fmt.dateShort(days[0]) + ' – ' + fmt.dateShort(days[last]);
    const head = panelHead('Schedule', nav, range + (ctx.stream ? ' · ' + ctx.stream : ''));
    if (!dated.length) {
      return UI.box({ class: ['jay-pj-card-panel', 'jay-pj-tl'] }, head,
        h('div', { class: 'jay-box-body' }, UI.state('empty', { icon: 'calendar', compact: true, title: ctx.stream ? 'No dated tasks in ' + ctx.stream + ' yet.' : 'No dated tasks yet.', text: 'Tasks with a due date appear here as bars.' })));
    }
    const cells = [];
    let row = 2; // row 1 holds the day heads
    BOARD_COLUMNS.forEach((col) => {
      const items = dated.filter((t) => col.statuses.includes(t.status));
      if (!items.length) return;
      cells.push(h('div', { class: 'jay-pj-tl-group', style: { gridRow: String(row) } },
        h('span', { class: ['jay-kcol-mark', 'is-' + col.hue], 'aria-hidden': 'true' }),
        h('h3', { class: 'jay-pj-tl-gtitle' }, col.label),
        UI.badge(items.length)));
      row += 1;
      items.forEach((t) => {
        const r = String(row);
        const due = startOfDay(t.due);
        const created = validDate(t.createdAt) ? startOfDay(t.createdAt) : due;
        const s = dayIndex(start, created < due ? created : due);
        const e = dayIndex(start, due);
        const overdue = t.status !== 'done' && fmt.dueState(t.due) === 'overdue';
        const hue = overdue ? 'red' : col.hue;
        const dueText = fmt.dateShort(t.due);
        const owner = t.assignee ? personOf(t.assignee) : null;
        cells.push(h('button', {
          type: 'button', class: 'jay-pj-tl-task', style: { gridRow: r }, onclick: () => openTask(t.id), title: t.title,
          'aria-label': t.title + ', ' + (overdue ? 'overdue since ' : 'due ') + dueText + ', ' + col.label,
        }, owner ? UI.avatar(owner.name, { id: owner.id, size: 'sm', decorative: true }) : null, h('span', { class: 'jay-pj-tl-name' }, t.title)));
        if (e < 0 || s > last) {
          // Entirely outside the window: a small marker on the edge it lies beyond.
          const before = e < 0;
          cells.push(h('span', {
            class: ['jay-pj-tl-out', before ? 'is-before' : 'is-after', 'is-' + hue], 'aria-hidden': 'true',
            style: { gridRow: r, gridColumn: before ? '2 / span 4' : (last - 2) + ' / span 4' },
          }, before ? icon('chevron-left', 12) : null, h('span', null, dueText), before ? null : icon('chevron-right', 12)));
        } else {
          const a = Math.max(0, s);
          const b = Math.min(last, e);
          cells.push(h('span', {
            class: ['jay-pj-tl-bar', 'is-' + hue, overdue ? 'is-overdue' : '', a !== s ? 'is-clip-start' : '', b !== e ? 'is-clip-end' : '', b - a < 2 ? 'is-short' : ''],
            style: { gridRow: r, gridColumn: (a + 2) + ' / ' + (b + 3) }, 'aria-hidden': 'true',
            title: t.title + ': ' + (validDate(t.createdAt) ? fmt.dateShort(t.createdAt) + ' → ' : '') + dueText,
          }, overdue ? icon('alert-triangle', 12) : null, h('span', { class: 'jay-pj-tl-bar-t' }, dueText)));
        }
        row += 1;
      });
    });
    const bodyRows = row - 2;
    const grid = h('div', { class: 'jay-pj-tl-grid', style: { '--jay-tl-days': String(TL_DAYS) } },
      h('div', { class: 'jay-pj-tl-corner', 'aria-hidden': 'true' }, 'Task'),
      days.map((d, i) => h('div', { class: ['jay-pj-tl-day', i === todayIdx ? 'is-today' : ''], style: { gridColumn: String(i + 2) }, 'aria-hidden': 'true' },
        h('span', { class: 'jay-pj-tl-dname' }, d.toLocaleDateString(undefined, { weekday: 'narrow' })),
        h('span', { class: 'jay-pj-tl-dnum' }, String(d.getDate())))),
      days.map((d, i) => h('i', {
        class: ['jay-pj-tl-col', i === todayIdx ? 'is-today' : '', d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : ''], 'aria-hidden': 'true',
        style: { gridColumn: String(i + 2), gridRow: '2 / span ' + Math.max(1, bodyRows) },
      })),
      cells);
    return UI.box({ class: ['jay-pj-card-panel', 'jay-pj-tl'] }, head,
      h('div', { class: 'jay-pj-tl-scroll' }, grid),
      undated ? h('p', { class: 'jay-pj-tl-foot' }, fmt.plural(undated, 'task') + ' without a due date ' + (undated === 1 ? 'is' : 'are') + ' not on the timeline.') : null);
  }

  /* ── Header panel + tabs panel ─────────────────────────────────────── */
  function projectMenu(anchor, p) {
    UI.menu(anchor, [
      { label: 'New task', icon: 'plus', run: () => newTask({ projectId: p.id }) },
      { label: 'Ask Jay about this project', icon: 'chat', run: () => askJay(p) },
      { label: 'Open in Tasks', icon: 'tasks', run: () => { location.hash = '#/tasks?project=' + encodeURIComponent(p.id) + '&status=all'; } },
      { label: 'Workspace files', icon: 'files', run: () => { location.hash = '#/files'; } },
      '-',
      { label: 'New project', icon: 'projects', run: openCreate },
    ], { label: p.title + ' actions', align: 'right' });
  }

  function headPanel(p, ctx) {
    const fav = isFav(p, ctx.prefs);
    const muted = isMuted(p, ctx.prefs);
    const st = statusOf(p);
    return UI.box({ class: 'jay-pj-head' },
      ctx.back ? h('button', { type: 'button', class: 'jay-icon-btn jay-pj-back', 'aria-label': 'All projects', onclick: ctx.onBack }, icon('arrow-left', 18)) : null,
      h('div', { class: 'jay-pj-head-main' },
        h('div', { class: 'jay-pj-title-row' }, h('h2', { class: 'jay-pj-title' }, p.title), UI.dotPill(st.label, st.hue)),
        crumbs(p.streams, ctx.onStream, ctx.stream)),
      h('div', { class: 'jay-pj-head-tools' },
        h('button', {
          type: 'button', class: ['jay-icon-btn', 'jay-pj-tool', muted ? 'is-on' : ''], 'aria-pressed': muted ? 'true' : 'false',
          'aria-label': muted ? 'Unmute notifications for ' + p.title : 'Mute notifications for ' + p.title, 'data-tip': muted ? 'Unmute' : 'Mute',
          'data-pj-tool': 'head-mute', onclick: () => ctx.toggle('mute'),
        }, icon(muted ? 'bell-off' : 'bell', 18)),
        h('button', {
          type: 'button', class: ['jay-icon-btn', 'jay-pj-tool', 'jay-pj-star', fav ? 'is-on' : ''], 'aria-pressed': fav ? 'true' : 'false',
          'aria-label': fav ? 'Remove ' + p.title + ' from favorites' : 'Add ' + p.title + ' to favorites', 'data-tip': fav ? 'Unfavorite' : 'Favorite',
          'data-pj-tool': 'fav', onclick: () => ctx.toggle('fav'),
        }, icon('star', 18)),
        h('button', { type: 'button', class: 'jay-icon-btn jay-pj-tool', 'aria-label': 'More actions for ' + p.title, 'aria-haspopup': 'menu', 'data-pj-tool': 'more', onclick: (e) => projectMenu(e.currentTarget, p) }, icon('more-vertical', 18))));
  }

  function tabsPanel(p, ctx) {
    const items = TABS.map((t) => ({ id: t.id, label: t.label, badge: t.id === 'tasks' ? (openCount(p) || undefined) : undefined }));
    if (!ctx.withAside) items.unshift({ id: ACTIVITY, label: 'Activity', badge: feedStats(p, ctx.stream, ctx.prefs).unread || undefined });
    const tabs = UI.tabs(items, { variant: 'boxed', active: ctx.tab, label: p.title + ' sections', onSelect: ctx.onTab });
    tabs.querySelectorAll('.jay-tab').forEach((b) => {
      b.id = ctx.uid + '-tab-' + b.dataset.tab;
      b.setAttribute('aria-controls', ctx.uid + '-panel');
    });
    const people = list(p.people);
    return UI.box({ class: 'jay-pj-tabbar' }, tabs,
      h('div', { class: 'jay-pj-team' },
        people.length ? UI.avatarStack(people, { max: 3, size: 'md' }) : null,
        h('button', {
          type: 'button', class: 'jay-pj-invite', 'aria-label': 'Add people to ' + p.title, 'data-tip': 'Add people',
          onclick: () => UI.toast('Sharing projects arrives with jay-core.', { icon: 'people' }),
        }, icon('plus', 16))));
  }

  /* ── Tasks tab ─────────────────────────────────────────────────────── */
  function tasksTab(p, ctx) {
    const scoped = scopedTasks(p, ctx.stream);
    const tasks = applyFilter(scoped, ctx.filter);
    const filterMeta = FILTERS.find((f) => f.id === ctx.filter) || FILTERS[0];
    // New tasks from a stream view carry the stream.
    const prefill = (status) => Object.assign({ projectId: p.id }, status ? { status } : {}, ctx.stream ? { stream: ctx.stream } : {});
    const viewBtn = (id, label, ic) => h('button', {
      type: 'button', class: ['jay-pj-viewbtn', ctx.view === id ? 'is-active' : ''], 'aria-pressed': ctx.view === id ? 'true' : 'false',
      'data-pj-tool': 'view-' + id, onclick: () => ctx.onView(id),
    }, icon(ic, 16), h('span', null, label));
    const filterBtn = h('button', {
      type: 'button', class: ['jay-pj-viewbtn', 'jay-pj-filter', ctx.filter !== 'all' ? 'is-filtered' : ''], 'aria-haspopup': 'menu',
      'aria-label': 'Filter tasks' + (ctx.filter !== 'all' ? ', ' + filterMeta.label : ''), 'data-pj-tool': 'filter',
      onclick: (e) => UI.menu(e.currentTarget, FILTERS.map((f) => ({ label: f.label, icon: f.id === ctx.filter ? 'check' : 'circle', active: f.id === ctx.filter, run: () => ctx.onFilter(f.id) })), { label: 'Filter tasks', align: 'right' }),
    }, icon('sliders', 16), h('span', null, ctx.filter !== 'all' ? filterMeta.label : 'Filter'),
    ctx.filter !== 'all' ? UI.badge(tasks.length, { accent: true }) : null);
    const streamChip = ctx.stream ? h('button', {
      type: 'button', class: 'jay-pj-chip', 'aria-label': 'Clear stream filter: ' + ctx.stream, 'data-pj-tool': 'stream-chip', onclick: () => ctx.onStream(ctx.stream),
    }, h('span', { class: 'jay-pj-chip-k' }, 'Stream:'), h('span', null, ctx.stream), icon('x', 13)) : null;
    const toolbar = h('div', { class: 'jay-pj-toolbar' },
      h('div', { class: 'jay-pj-views', role: 'group', 'aria-label': 'Task layout' }, viewBtn('list', 'List View', 'list'), viewBtn('board', 'Board View', 'board')),
      streamChip,
      h('span', { class: 'jay-spacer' }),
      filterBtn);
    let body;
    if (!scoped.length) {
      body = UI.box({ class: 'jay-pj-empty' }, UI.state('empty', {
        icon: 'tasks', title: ctx.stream ? 'No tasks in ' + ctx.stream + ' yet.' : 'No tasks in this project yet.',
        action: { label: 'New task', icon: 'plus', run: () => newTask(prefill(null)) },
      }));
    } else if (ctx.view === 'board' && has('tasks', 'renderBoard')) {
      body = h('div', { class: 'jay-pj-board' }, JAY.tasks.renderBoard(tasks, {
        columns: BOARD_COLUMNS,
        onAdd: (col) => newTask(prefill(col.statuses[0])),
        addLabel: 'Add Task',
        showProject: false,
        label: p.title + ' board' + (ctx.stream ? ', ' + ctx.stream : ''),
      }));
    } else {
      body = taskList(tasks, p, prefill);
    }
    return [toolbar, body];
  }

  /* ── Activity (aside ≥ 1280px, a tab below) ────────────────────────── */
  function feedPanel(p, ctx, inTab) {
    const stats = feedStats(p, ctx.stream, ctx.prefs);
    const shown = ctx.feed === 'mentions' ? stats.mentions : stats.all;
    const muted = isMuted(p, ctx.prefs);
    const tabs = UI.tabs([
      { id: 'all', label: 'All', badge: stats.all.length || undefined },
      { id: 'mentions', label: 'Mentions', badge: stats.mentions.length || undefined },
    ], { variant: 'boxed', active: ctx.feed, label: 'Activity filter', onSelect: ctx.onFeed });
    tabs.querySelectorAll('.jay-tab').forEach((b) => { b.dataset.pjTool = 'feed-' + b.dataset.tab; });
    return UI.box({ class: ['jay-pj-feed', 'is-col', inTab ? 'is-tab' : ''], 'aria-label': p.title + ' activity' },
      h('div', { class: 'jay-pj-feed-head' },
        inTab ? null : h('h2', { class: 'jay-pj-feed-title' }, 'Activity'),
        stats.unread ? h('span', { class: 'jay-pj-feed-new' }, stats.unread + ' new') : (muted ? h('span', { class: 'jay-pj-feed-muted' }, icon('bell-off', 13), 'Muted') : null),
        h('span', { class: 'jay-spacer' }),
        h('button', {
          type: 'button', class: 'jay-icon-btn jay-pj-tool', 'aria-label': 'Mark all activity as read', 'data-tip': 'Mark all read', disabled: stats.unread ? null : true,
          'data-pj-tool': 'feed-seen', onclick: ctx.onSeen,
        }, icon('check', 17)),
        h('button', {
          type: 'button', class: ['jay-icon-btn', 'jay-pj-tool', muted ? 'is-on' : ''], 'aria-pressed': muted ? 'true' : 'false',
          'aria-label': muted ? 'Unmute notifications' : 'Mute notifications', 'data-tip': muted ? 'Unmute' : 'Mute',
          'data-pj-tool': 'feed-mute', onclick: () => ctx.toggle('mute'),
        }, icon(muted ? 'bell-off' : 'bell', 17))),
      h('div', { class: 'jay-pj-feed-tabs' }, tabs),
      ctx.stream ? h('div', { class: 'jay-pj-feed-filter' },
        h('span', null, 'Stream'),
        h('button', { type: 'button', class: 'jay-pj-chip', 'aria-label': 'Clear stream filter: ' + ctx.stream, 'data-pj-tool': 'feed-stream', onclick: () => ctx.onStream(ctx.stream) }, h('span', null, ctx.stream), icon('x', 13))) : null,
      h('div', { class: 'jay-pj-feed-list' }, shown.length
        ? shown.map((a) => feedCard(a, p, { since: muted ? undefined : stats.since, requests: ctx.requests, onAnswer: ctx.onAnswer }))
        : UI.state('empty', { icon: 'history', title: ctx.feed === 'mentions' ? 'No mentions yet.' : (ctx.stream ? 'No activity in ' + ctx.stream + ' yet.' : 'No activity yet.'), compact: true })));
  }

  /* ── Phones / tablets: project cards ───────────────────────────────── */
  // A card that opens a project remembers it, so the detail's back arrow can
  // return with Back (the list keeps its scroll) instead of stacking entries.
  let cardOpened = null;
  let backToList = null;
  function projectCard(p, pf) {
    const st = statusOf(p);
    const open = openCount(p);
    return h('article', { class: 'jay-box jay-pj-pcard' },
      h('div', { class: 'jay-pj-pcard-top' },
        h('span', { class: ['jay-side-dot', 'is-' + UI.toneHue(p)], 'aria-hidden': 'true' }),
        h('h3', { class: 'jay-pj-pcard-title' }, h('a', { class: 'jay-pj-pcard-link', href: '#/projects/' + encodeURIComponent(p.id), onclick: () => { cardOpened = p.id; } }, p.title)),
        isFav(p, pf) ? h('span', { class: 'jay-pj-pcard-fav', 'aria-label': 'Favorite', role: 'img' }, icon('star', 14)) : null,
        open ? UI.badge(open, { accent: true }) : null),
      crumbs(p.streams),
      h('div', { class: 'jay-pj-pcard-mid' },
        Number.isFinite(p.progress) ? UI.meter(p.progress, { segments: 16, label: p.title + ' progress' }) : h('span', { class: 'jay-pj-pcard-ongoing' }, fmt.plural(open, 'open task'))),
      h('div', { class: 'jay-pj-pcard-foot' },
        UI.dotPill(st.label, st.hue),
        h('span', { class: 'jay-spacer' }),
        p.nextDue ? UI.dateCell(p.nextDue.due, dueLabel(p.nextDue.due)) : h('span', { class: 'jay-pj-pcard-none' }, 'No due dates')));
  }
  function projectCards(projects) {
    const pf = prefs();
    const fav = projects.filter((p) => isFav(p, pf));
    const groups = [];
    if (fav.length) groups.push({ label: 'Favorites', items: fav });
    areasOf(projects).forEach((a) => { const items = projects.filter((p) => (p.area || 'Personal') === a && !isFav(p, pf)); if (items.length) groups.push({ label: a, items }); });
    return groups.map((g) => h('section', { class: 'jay-pj-cgroup', 'aria-label': g.label },
      h('h2', { class: 'jay-eyebrow jay-pj-cgroup-label' }, g.label, h('span', { class: 'jay-pj-cgroup-n' }, String(g.items.length))),
      h('div', { class: 'jay-pj-cgrid' }, g.items.map((p) => projectCard(p, pf)))));
  }

  function renderList(root) {
    backToList = null;
    const body = h('div', { class: 'jay-pj-cards-body' }, UI.state('loading', { rows: 5 }));
    const search = h('input', { class: 'jay-input is-search is-inset', type: 'search', placeholder: 'Search projects', 'aria-label': 'Search projects', autocomplete: 'off' });
    mount(root, h('div', { class: 'jay-pj-cards' },
      h('div', { class: 'jay-pj-cards-bar' },
        h('div', { class: 'jay-search jay-pj-cards-search' }, icon('search', 15), search),
        h('button', { type: 'button', class: 'jay-btn is-primary jay-pj-cards-new', onclick: openCreate, 'aria-label': 'New project' }, icon('plus', 16), h('span', null, 'New project'))),
      body));
    let projects = [];
    let seq = 0;
    function draw() {
      const q = search.value.trim().toLowerCase();
      const shown = q ? projects.filter((p) => p.title.toLowerCase().includes(q) || list(p.streams).some((s) => s.toLowerCase().includes(q)) || String(p.area || '').toLowerCase().includes(q)) : projects;
      if (!projects.length) mount(body, UI.box({ class: 'jay-pj-empty' }, UI.state('empty', { icon: 'projects', title: 'No projects yet.', action: { label: 'New project', icon: 'plus', run: openCreate } })));
      else if (!shown.length) mount(body, UI.box({ class: 'jay-pj-empty' }, UI.state('empty', { icon: 'search', title: 'No projects match.', compact: true })));
      else mount(body, projectCards(shown));
    }
    async function load() {
      const my = ++seq;
      try {
        const res = await JAY.data.getProjects();
        if (my !== seq) return;
        if (res && res.__state) { mount(body, stateBox(res.__state)); return; }
        projects = list(res);
        draw();
        portfolioHeader(projects);
      } catch (_) {
        if (my === seq) mount(body, UI.box({ class: 'jay-pj-empty' }, UI.state('error', { title: 'Couldn’t load projects.', action: { label: 'Retry', icon: 'refresh', run: load } })));
      }
    }
    search.addEventListener('input', draw);
    load();
    const off = JAY.on('data:projects', load);
    const off2 = JAY.on('data:tasks', load);
    return () => { off(); off2(); seq += 1; };
  }

  /* ── Detail layout (desktop tree + tablet/phone stacked) ────────────── */
  function renderDetail(root, id, params) {
    const wide = mqWide.matches;
    const withAside = mqAside.matches;
    const uid = JAY.nextId('pj');
    const tabOk = (t) => TABS.some((x) => x.id === t) || (!withAside && t === ACTIVITY);
    const pf0 = prefs();
    const ctx = {
      uid,
      back: !wide,
      withAside,
      tab: tabOk(params.tab) ? params.tab : pf0.tab,
      view: pf0.view || defaultView(),
      filter: pf0.filter,
      feed: 'all',
      stream: null,
      streamsOpen: true,
      query: '',
      shift: 0,
      requests: [],
    };
    if (cardOpened && cardOpened === id) backToList = id;
    else if (backToList !== id) backToList = null;
    cardOpened = null;
    let projects = [];
    let project = null;
    let seq = 0;
    let reqSeq = 0;
    let disposed = false;

    const side = UI.sideNav({
      label: 'Projects',
      search: { placeholder: 'Search projects', onInput: (v) => { ctx.query = v; drawTree(); } },
      sections: [],
      footer: { label: 'Add Project', icon: 'plus', run: openCreate },
    });
    side.classList.add('jay-pj-side');
    const main = h('div', { class: 'jay-stack jay-pj-main' }, UI.box({ class: 'jay-pj-head' }, UI.state('loading', { rows: 2 })));
    const aside = withAside ? h('div', { class: 'jay-pj-aside' }) : null;
    // ≥ 1024: the board fills the view and scrolls inside; below, the page scrolls.
    const layout = h('div', { class: ['jay-layout', 'has-side', withAside ? 'has-aside' : '', wide ? 'is-fill' : '', 'jay-projects', wide ? '' : 'is-narrow'] }, side, main, aside);
    mount(root, layout);

    // Redraws replace the controls; keep keyboard focus on the same one (by
    // its data-pj-tool key), or on `fallback` when it is gone.
    function keepFocus(fn, fallback) {
      const ae = document.activeElement;
      const holder = ae && layout.contains(ae) && ae.closest ? ae.closest('[data-pj-tool]') : null;
      const key = holder ? holder.getAttribute('data-pj-tool') : null;
      fn();
      if (!key) return;
      let next = layout.querySelector('[data-pj-tool="' + CSS.escape(key) + '"]');
      if ((!next || next.disabled) && fallback) next = layout.querySelector(fallback);
      if (next && !next.disabled) next.focus({ preventScroll: true });
    }

    function drawTree() {
      const old = side.querySelector('.jay-side-scroll');
      const top = old ? old.scrollTop : 0;
      const focused = document.activeElement && old && old.contains(document.activeElement) ? document.activeElement.dataset.side : null;
      const next = treeScroll({
        projects, activeId: project ? project.id : null, query: ctx.query, stream: ctx.stream, streamsOpen: ctx.streamsOpen, prefs: prefs(),
        onArea: (area) => {
          const c = new Set(prefs().collapsed);
          if (c.has(area)) c.delete(area); else c.add(area);
          savePrefs({ collapsed: Array.from(c) });
          drawTree();
        },
        onStream: setStream,
        onToggleStreams: () => { ctx.streamsOpen = !ctx.streamsOpen; drawTree(); },
      });
      if (old) old.replaceWith(next); else side.insertBefore(next, side.querySelector('.jay-side-foot'));
      next.scrollTop = top;
      if (focused) { const b = next.querySelector('[data-side="' + CSS.escape(focused) + '"]'); if (b) b.focus({ preventScroll: true }); }
    }

    // Only what the user changed is saved (the Activity tab never is).
    // The address bar carries the project and tab; the shell keeps its route
    // params in step so a re-render (resize, theme) shows the same tab.
    function syncUrl() {
      if (!project) return;
      const next = { _: encodeURIComponent(project.id), tab: ctx.tab === 'tasks' ? null : ctx.tab };
      if (has('shell', 'replaceParams')) { JAY.shell.replaceParams('projects', next); return; }
      try { history.replaceState(history.state, '', '#/projects/' + next._ + (next.tab ? '?tab=' + next.tab : '')); } catch (_) { /* ignore */ }
    }
    function setTab(t) {
      ctx.tab = t;
      if (TABS.some((x) => x.id === t)) savePrefs({ tab: t });
      syncUrl();
      drawMain();
    }
    function setStream(s) {
      ctx.stream = ctx.stream === s ? null : s;
      if (ctx.stream) ctx.streamsOpen = true;
      keepFocus(() => { drawTree(); drawMain(); drawAside(); }, '.jay-pj-tabbar .jay-tab.is-active');
    }
    function toggle(kind) {
      if (!project) return;
      const pfx = prefs();
      if (kind === 'fav') {
        const now = !isFav(project, pfx);
        savePrefs({ fav: Object.assign({}, pfx.fav, { [project.id]: now }) });
        UI.toast(now ? 'Added to favorites' : 'Removed from favorites', { icon: 'star' });
      } else {
        const now = !isMuted(project, pfx);
        savePrefs({ mute: Object.assign({}, pfx.mute, { [project.id]: now }) });
        UI.toast(now ? 'Muted ' + project.title + ': no unread marks here or on Home' : 'Notifications on for ' + project.title, { icon: now ? 'bell-off' : 'bell' });
      }
      keepFocus(() => { drawTree(); drawMain(); drawAside(); });
    }
    function back() {
      if (backToList && project && backToList === project.id) { backToList = null; history.back(); return; }
      if (has('shell', 'navigate')) JAY.shell.navigate('#/projects', { replace: true });
      else location.replace('#/projects');
    }
    // After Approve / Decline the buttons go away: keep focus on that card.
    let answered = null;
    // Prefs are read once per draw and shared by every part it renders.
    let drawPf = null;
    function drawing(fn) {
      const outer = drawPf;
      if (!outer) drawPf = prefs();
      try { fn(); } finally { drawPf = outer; }
    }
    const ctxApi = {
      get tab() { return ctx.tab; }, get view() { return ctx.view; }, get filter() { return ctx.filter; }, get feed() { return ctx.feed; },
      get stream() { return ctx.stream; }, get back() { return ctx.back; }, get withAside() { return ctx.withAside; },
      get shift() { return ctx.shift; }, get requests() { return ctx.requests; }, get prefs() { return drawPf || prefs(); }, uid,
      onTab: setTab, onStream: setStream, toggle, onBack: back,
      onView: (v) => { ctx.view = v; savePrefs({ view: v }); keepFocus(drawMain); },
      onFilter: (f) => { ctx.filter = f; savePrefs({ filter: f }); drawMain(); const b = layout.querySelector('.jay-pj-filter'); if (b) b.focus({ preventScroll: true }); },
      onFeed: (f) => { ctx.feed = f; keepFocus(drawFeed); },
      onShift: (n) => { ctx.shift = n; keepFocus(drawMain); },
      onSeen: () => {
        const seen = Object.assign({}, prefs().seen, { [project.id]: new Date().toISOString() });
        savePrefs({ seen });
        keepFocus(drawFeed, '.jay-pj-feed .jay-tab.is-active');
      },
      onAnswer: (a) => { answered = a.id || null; },
    };

    function content() {
      const p = project;
      if (ctx.tab === ACTIVITY) return feedPanel(p, ctxApi, true);
      if (ctx.tab === 'overview') return overview(p);
      if (ctx.tab === 'timeline') return timeline(p, ctxApi);
      if (ctx.tab === 'files') {
        return UI.box({ class: 'jay-pj-card-panel' }, panelHead('Files', h('button', { type: 'button', class: 'jay-btn is-outline is-sm', onclick: () => { location.hash = '#/files'; } }, icon('files', 14), 'Workspace')),
          h('div', { class: 'jay-box-body' }, fileRows(list(p.files))));
      }
      if (ctx.tab === 'notes') {
        return UI.box({ class: 'jay-pj-card-panel' }, panelHead('Notes', h('button', { type: 'button', class: 'jay-btn is-inset is-sm', onclick: () => askJay(p) }, icon('plus', 14), 'Ask Jay for a note')),
          h('div', { class: 'jay-box-body' }, noteCards(list(p.notes))));
      }
      return tasksTab(p, ctxApi);
    }

    function drawMain() { if (project) drawing(paintMain); }
    function paintMain() {
      const scroller = main.querySelector('.jay-pj-scroll');
      const top = scroller ? scroller.scrollTop : 0;
      const boardEl = main.querySelector('.jay-pj-board > .jay-board');
      const boardLeft = boardEl ? boardEl.scrollLeft : 0;
      const tlEl = main.querySelector('.jay-pj-tl-scroll');
      const tlLeft = tlEl ? tlEl.scrollLeft : 0;
      const tabFocus = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('jay-tab') && main.contains(document.activeElement) && !document.activeElement.closest('.jay-pj-feed') ? document.activeElement.dataset.tab : null;
      const panel = h('div', { class: ['jay-pj-scroll', 'is-' + ctx.tab], id: uid + '-panel', role: 'tabpanel', 'aria-labelledby': uid + '-tab-' + ctx.tab }, content());
      mount(main, headPanel(project, ctxApi), tabsPanel(project, ctxApi), panel);
      panel.scrollTop = top;
      const nb = main.querySelector('.jay-pj-board > .jay-board');
      if (nb) nb.scrollLeft = boardLeft;
      const nt = main.querySelector('.jay-pj-tl-scroll');
      if (nt) nt.scrollLeft = tlLeft;
      if (tabFocus) { const b = main.querySelector('.jay-pj-tabbar .jay-tab[data-tab="' + tabFocus + '"]'); if (b) b.focus({ preventScroll: true }); }
    }
    function drawAside() { if (project && aside) drawing(paintAside); }
    function paintAside() {
      const old = aside.querySelector('.jay-pj-feed-list');
      const top = old ? old.scrollTop : 0;
      mount(aside, feedPanel(project, ctxApi, false));
      const nl = aside.querySelector('.jay-pj-feed-list');
      if (nl) nl.scrollTop = top;
    }
    // The feed lives in the aside (≥ 1280) or in the Activity tab (below).
    function drawFeed() {
      if (ctx.withAside) drawAside();
      else if (ctx.tab === ACTIVITY) drawMain();
    }
    function focusAnswered() {
      const id = answered;
      answered = null;
      if (!id) return;
      const card = layout.querySelector('.jay-feed-item[data-act="' + CSS.escape(id) + '"]');
      const ae = document.activeElement;
      if (!card || (ae && ae !== document.body && layout.contains(ae))) return;
      const target = card.querySelector('button') || card;
      if (target === card) card.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    function showState(node) {
      layout.classList.add('is-state');
      mount(main, node);
      if (aside) mount(aside);
    }

    // Open Approve / Decline requests load beside the project and never hold
    // it up (a slow or simulated Attention source only hides the buttons).
    async function loadReq() {
      const my = ++reqSeq;
      let rs = [];
      try { rs = await loadRequests(); } catch (_) { rs = []; }
      if (disposed || my !== reqSeq) return;
      const before = ctx.requests.map((r) => r.id).join('|');
      ctx.requests = rs;
      if (project && before !== rs.map((r) => r.id).join('|')) { drawFeed(); focusAnswered(); }
    }

    async function load(quiet) {
      const my = ++seq;
      try {
        const [res] = await Promise.all([JAY.data.getProjects(), peopleCache.size ? null : loadPeople()]);
        if (disposed || my !== seq) return;
        if (res && res.__state) { showState(stateBox(res.__state)); return; }
        projects = list(res);
        portfolioHeader(projects);
        const pf = prefs();
        const fallback = projects.find((p) => isFav(p, pf)) || projects[0];
        const currentId = id || (fallback ? fallback.id : null);
        if (!currentId) {
          project = null;
          drawTree();
          showState(UI.box({ class: 'jay-pj-empty' }, UI.state('empty', { icon: 'projects', title: 'No projects yet.', text: 'Start one here or ask Jay to set it up for you.', action: { label: 'New project', icon: 'plus', run: openCreate } })));
          return;
        }
        const p = await JAY.data.getProject(currentId);
        if (disposed || my !== seq) return;
        if (!p || p.__state) {
          project = null;
          drawTree();
          showState(dataState(p, 'Project not found.', { label: 'All projects', run: () => { location.hash = '#/projects'; } }));
          return;
        }
        const first = !project;
        project = p;
        layout.classList.remove('is-state');
        if (ctx.stream && !list(p.streams).includes(ctx.stream)) ctx.stream = null;
        drawTree();
        drawMain();
        drawAside();
        // The project names the browser tab; the header stays "Projects".
        portfolioHeader(projects, { docTitle: p.title });
        // A project route shows its tab in the address bar (an unknown or
        // folded-away ?tab is replaced); the bare #/projects route stays bare.
        if (first && (id || params.tab) && (params.tab || '') !== (ctx.tab === 'tasks' ? '' : ctx.tab)) syncUrl();
      } catch (_) {
        if (disposed || my !== seq) return;
        if (!quiet || !project) showState(UI.box({ class: 'jay-pj-empty' }, UI.state('error', { title: 'Couldn’t load this project.', action: { label: 'Retry', icon: 'refresh', run: () => load() } })));
      }
    }
    load();
    loadReq();
    const offs = ['data:projects', 'data:tasks', 'data:people'].map((e) => JAY.on(e, () => load(true)));
    offs.push(JAY.on('data:attention', loadReq));
    return () => { disposed = true; offs.forEach((off) => off()); };
  }

  function render(root, params) {
    const p = params || {};
    let id = null;
    try { id = p._ ? decodeURIComponent(p._) : null; } catch (_) { id = p._ || null; }
    let dispose = (!mqWide.matches && !id) ? renderList(root) : renderDetail(root, id, p);
    function onMq() { JAY.emit('route:rerender'); }
    mqWide.addEventListener('change', onMq);
    mqAside.addEventListener('change', onMq);
    return () => {
      if (dispose) dispose();
      dispose = null;
      mqWide.removeEventListener('change', onMq);
      mqAside.removeEventListener('change', onMq);
    };
  }

  /* ── Preview drawer (from Home) ────────────────────────────────────── */
  async function openPreview(id) {
    const body = h('div', { class: 'jay-pj-preview' }, UI.state('loading', { rows: 6 }));
    const panel = UI.openPanel({
      eyebrow: 'Project', title: 'Project', body, size: 'wide',
      footer: [
        h('button', { type: 'button', class: 'jay-btn is-outline', onclick: () => { panel.close(); newTask({ projectId: id }); } }, icon('plus', 15), 'Task'),
        h('span', { class: 'jay-spacer' }),
        h('button', { type: 'button', class: 'jay-btn is-primary', onclick: () => { panel.close(); go(id); } }, 'Open project', icon('arrow-right', 15)),
      ],
    });
    try {
      if (!peopleCache.size) await loadPeople();
      const p = await JAY.data.getProject(id);
      if (!p || p.__state) { mount(body, p && p.__state ? UI.state(p.__state) : UI.state('empty', { title: 'Project not found.' })); return; }
      const title = panel.el.querySelector('.jay-panel-title');
      if (title) title.textContent = p.title;
      const st = statusOf(p);
      const tasks = list(p.tasks);
      const open = tasks.filter((t) => t.status !== 'done');
      const pct = Number.isFinite(p.progress) ? p.progress : (tasks.length ? Math.round(((tasks.length - open.length) / tasks.length) * 100) : 0);
      mount(body,
        h('div', { class: 'jay-pj-pv-tags' }, UI.dotPill(st.label, st.hue), UI.tag(p.area || 'Personal', { hue: UI.toneHue(p) }), isFav(p) ? h('span', { class: 'jay-pj-pv-fav' }, icon('star', 13), 'Favorite') : null),
        p.description ? h('p', { class: 'jay-pj-desc' }, p.description) : null,
        crumbs(p.streams),
        h('div', { class: 'jay-pj-pv-stats' },
          h('div', { class: 'jay-pj-pv-meter' }, h('span', { class: 'jay-pj-stat-k' }, Number.isFinite(p.progress) ? 'Progress' : 'Tasks completed'), UI.meter(pct, { segments: 18, label: p.title + ' progress' })),
          statBlock('Open', String(open.length), fmt.plural(tasks.length - open.length, 'done', 'done')),
          statBlock('Milestone', p.milestone || '—', null)),
        h('section', { class: 'jay-pj-pv-sec' },
          h('div', { class: 'jay-pj-pv-head' }, h('h3', { class: 'jay-pj-pv-title' }, 'Open tasks'), UI.badge(open.length || null, { accent: true })),
          open.length ? h('ul', { class: 'jay-pj-next' }, open.slice(0, 5).map((t) => nextRow(t, () => panel.close()))) : h('div', { class: 'jay-empty-line' }, 'No open tasks.')),
        h('section', { class: 'jay-pj-pv-sec' },
          h('div', { class: 'jay-pj-pv-head' }, h('h3', { class: 'jay-pj-pv-title' }, 'Recent activity')),
          list(p.activity).length ? h('div', { class: 'jay-pj-pv-feed' }, list(p.activity).slice(0, 3).map((a) => feedCard(a, p))) : h('div', { class: 'jay-empty-line' }, 'No activity yet.')),
        list(p.people).length ? h('section', { class: 'jay-pj-pv-sec' },
          h('div', { class: 'jay-pj-pv-head' }, h('h3', { class: 'jay-pj-pv-title' }, 'People'), UI.avatarStack(list(p.people), { max: 4, size: 'sm' })),
          peopleRows(list(p.people))) : null);
    } catch (_) {
      mount(body, UI.state('error', { title: 'Couldn’t load this project.' }));
    }
  }

  /* ── Create drawer ─────────────────────────────────────────────────── */
  function openCreate() {
    const idT = JAY.nextId('f'); const idD = JAY.nextId('f'); const idA = JAY.nextId('f');
    const title = h('input', { id: idT, class: 'jay-input is-title', type: 'text', placeholder: 'Project name', autocomplete: 'off' });
    const desc = h('textarea', { id: idD, class: 'jay-input', rows: '3', placeholder: 'What is this project about?' });
    let area = 'Personal';
    // One radio group: a single tab stop, arrow keys move and select.
    const areaSeg = UI.segmented(AREAS.map((a) => [a, a]), area, (v) => { area = v; }, 'Area', { full: true });
    areaSeg.setAttribute('aria-labelledby', idA);
    let saving = false;
    async function save() {
      const v = title.value.trim();
      if (!v) { title.focus(); title.setAttribute('aria-invalid', 'true'); return; }
      if (saving) return;
      saving = true;
      try {
        const p = await JAY.data.createProject({ title: v, area, description: desc.value.trim() });
        panel.close();
        UI.toast('Project created: ' + p.title, { icon: 'projects', action: { label: 'Open', run: () => go(p.id) } });
      } catch (_) {
        saving = false;
        UI.toast('Couldn’t create the project.', { tone: 'danger', icon: 'alert-circle' });
      }
    }
    title.addEventListener('input', () => title.removeAttribute('aria-invalid'));
    const panel = UI.openPanel({
      eyebrow: 'New project', title: 'Create a project', initialFocus: 'input.is-title',
      body: h('form', { class: 'jay-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        h('div', { class: 'jay-field' }, h('label', { class: 'jay-label', for: idT }, 'Name'), title),
        h('div', { class: 'jay-field' }, h('span', { class: 'jay-label', id: idA }, 'Area'), areaSeg),
        h('div', { class: 'jay-field' }, h('label', { class: 'jay-label', for: idD }, 'Description'), desc),
        h('div', { class: 'jay-tip' }, icon('chat', 16), h('div', null, 'Or tell Jay: “Start a project for the office move, with a task to get three quotes.”'))),
      footer: [h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => panel.close() }, 'Cancel'), h('span', { class: 'jay-spacer' }), h('button', { type: 'button', class: 'jay-btn is-primary', onclick: save }, icon('plus', 15), 'Create project')],
    });
  }

  // isMuted takes a project or an id (Home steps muted projects' items back).
  JAY.projects = {
    openPreview,
    openCreate,
    isMuted: (x) => !!prefs().mute[x && typeof x === 'object' ? x.id : x],
  };
  JAY.views = JAY.views || {};
  JAY.views.projects = { title: 'Projects', render };
})();
