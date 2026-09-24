/* JAY customization — Projects.
   Deepsleep-style project board: a tree of projects (favorites, areas with
   streams, finished, archive) | header panel + tabs panel + content (kanban
   board / list, overview, timeline, files, notes) | activity feed aside.
   Phones get a list of project cards and a stacked detail.
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
  // Project tones are for dots and tiles; these hues are contrast-safe for text.
  const TONE_HUE = { 1: 'lime', 2: 'blue', 3: 'orange', 4: 'yellow', 5: 'purple' };
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'files', label: 'Files' },
    { id: 'notes', label: 'Notes' },
  ];
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
  const FILE_LABEL = { docx: 'DOC', xlsx: 'XLS', jpeg: 'JPG', markdown: 'MD' };
  const DAY = 86400000;
  const ME = 'pat';
  const mqWide = window.matchMedia('(min-width: 1024px)');

  /* ── Browser-local UI prefs (view choices, favorites/mute overrides and
        "seen" markers until jay-core stores them; never data or secrets). ── */
  const PREFS_KEY = 'projects-ui';
  function prefs() {
    const p = JAY.storage.get(PREFS_KEY, {});
    return Object.assign({ tab: 'tasks', view: 'board', filter: 'all', collapsed: [], sections: {}, fav: {}, mute: {}, seen: {} }, p && typeof p === 'object' ? p : {});
  }
  function savePrefs(patch) { JAY.storage.set(PREFS_KEY, Object.assign(prefs(), patch)); }
  function isFav(p) { const f = prefs().fav; return Object.prototype.hasOwnProperty.call(f, p.id) ? !!f[p.id] : !!p.favorite; }
  function isMuted(p) { return !!prefs().mute[p.id]; }

  /* ── Small helpers ──────────────────────────────────────────────────── */
  function list(v) { return Array.isArray(v) ? v : []; }
  // UI.state() merges options over its defaults, so never pass undefined keys.
  function stateBox(kind, opts) { return UI.box({ class: 'jay-pj-empty' }, UI.state(kind, opts || {})); }
  function dataState(res, notFound, action) {
    if (res && res.__state) return stateBox(res.__state, action ? { action } : null);
    return stateBox('empty', Object.assign({ title: notFound }, action ? { action } : {}));
  }
  function statusOf(p) { return STATUS[p.status] || { label: String(p.status || 'Active'), hue: 'neutral' }; }
  function toneHue(p) { return TONE_HUE[p && p.tone] || 'neutral'; }
  function openCount(p) { return Number.isFinite(p.openTasks) ? p.openTasks : list(p.tasks).filter((t) => t.status !== 'done').length; }
  function go(id) { location.hash = '#/projects/' + encodeURIComponent(id); }
  function titleCase(s) { const x = String(s || ''); return x.charAt(0).toUpperCase() + x.slice(1); }
  function has(mod, fn) { return !!(JAY[mod] && typeof JAY[mod][fn] === 'function'); }
  function openTask(id) { if (has('tasks', 'openTask')) JAY.tasks.openTask(id); }
  function newTask(prefill) { if (has('tasks', 'openCreate')) JAY.tasks.openCreate(prefill); }
  function askJay(p) {
    if (JAY.chat && JAY.chat.shared) JAY.chat.shared.draft = 'About ' + p.title + ': ';
    location.hash = '#/talk';
  }

  // "2h ago" / "Yesterday" / "3 days ago" — short enough for the feed's time slot.
  function shortTime(d) {
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = Date.now() - t;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / DAY);
    if (days <= 0) return Math.round(diff / 3600000) + 'h ago';
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    return fmt.dateShort(t);
  }
  function dayGroup(d) {
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / DAY);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return 'This week';
    return 'Earlier';
  }

  function fileExt(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : 'file';
  }
  function fileBadge(f) {
    const ext = fileExt(f.name);
    const label = FILE_LABEL[ext] || ext.slice(0, 3).toUpperCase();
    return h('span', { class: ['jay-file-badge', 'is-' + ext, 'is-' + (f.kind || 'file')], 'aria-hidden': 'true' }, label);
  }

  // Relative due label that never repeats the date ("Today", "Overdue", "Sat").
  function dueLabel(d) {
    const st = fmt.dueState(d);
    if (st === 'overdue') return 'Overdue';
    if (st === 'today') return 'Today';
    const rel = fmt.due(d);
    return rel === fmt.dateShort(d) ? null : rel;
  }
  // Calendar cell: "▢ Oct 2 | Homepage copy review" (CRM "Last Interaction").
  function dateCell(d, label) {
    return h('span', { class: 'jay-pj-date' }, icon('calendar', 13), h('span', { class: 'jay-pj-date-d' }, fmt.dateShort(d)),
      label ? h('span', { class: 'jay-sep', 'aria-hidden': 'true' }, '|') : null, label ? h('span', { class: 'jay-pj-date-l' }, label) : null);
  }

  function crumbs(items, onPick, active) {
    const arr = list(items);
    if (!arr.length) return null;
    // Each separator travels with its crumb so wrapped lines never start with "|".
    return h('div', { class: 'jay-pj-crumbs' }, arr.map((s, i) => h('span', { class: 'jay-pj-crumb-i' },
      i ? h('span', { class: 'jay-sep', 'aria-hidden': 'true' }, '|') : null,
      onPick ? h('button', { type: 'button', class: ['jay-pj-crumb', active === s ? 'is-active' : ''], 'aria-pressed': active === s ? 'true' : 'false', 'aria-label': 'Stream: ' + s, onclick: () => onPick(s) }, s)
        : h('span', { class: 'jay-pj-crumb' }, s))));
  }

  /* ── People (names for activity actors) ─────────────────────────────── */
  const peopleCache = new Map();
  function personOf(id, fallback) {
    if (peopleCache.has(id)) return peopleCache.get(id);
    const f = list(fallback).find((p) => p && p.id === id);
    if (f) return f;
    return { id, name: titleCase(id || 'Someone') };
  }
  async function loadPeople() {
    try {
      const ps = await JAY.data.getPeople();
      list(ps).forEach((p) => { if (p && p.id) peopleCache.set(p.id, p); });
    } catch (_) { /* names fall back to ids */ }
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
  function unreadSince(p) {
    const seen = prefs().seen[p.id];
    return seen ? new Date(seen).getTime() : Date.now() - DAY;
  }
  function feedCard(a, p, opts) {
    const o = opts || {};
    const who = a.actor ? personOf(a.actor, p.people) : null;
    const task = taskFor(p, a.target);
    return UI.feedItem({
      who: who ? { id: who.id, name: who.name } : null,
      icon: 'history', hue: 'neutral',
      verb: a.verb || a.text || '',
      target: a.verb ? a.target : null,
      onTarget: task ? () => openTask(task.id) : null,
      context: a.verb ? list(a.context).concat(o.showProject ? [p.title] : []) : [],
      time: shortTime(a.at),
      attachment: a.attachment || null,
      quote: a.quote || null,
      unread: o.unread !== false && new Date(a.at).getTime() > (o.since || unreadSince(p)),
    });
  }
  function isMention(a) { return !!a.actor && a.actor !== ME; }

  /* ── Side tree ──────────────────────────────────────────────────────── */
  // cfg: { projects, activeId, query, onArea, onStream, stream }
  function treeSections(cfg) {
    const pf = prefs();
    const collapsed = new Set(list(pf.collapsed));
    const q = String(cfg.query || '').trim().toLowerCase();
    const projects = list(cfg.projects);
    const item = (p, extra) => Object.assign({
      id: 'project:' + p.id, label: p.title, dot: toneHue(p), hollow: p.id !== cfg.activeId,
      count: openCount(p) || null, countAccent: true, active: p.id === cfg.activeId, run: () => go(p.id),
    }, extra || {});
    if (q) {
      const hits = [];
      projects.forEach((p) => {
        const streams = list(p.streams).filter((s) => s.toLowerCase().includes(q));
        if (p.title.toLowerCase().includes(q) || String(p.area || '').toLowerCase().includes(q) || streams.length) {
          hits.push(item(p));
          streams.forEach((s) => hits.push({ id: 'stream:' + p.id + ':' + s, label: s, depth: 1, dot: 'lime', hollow: true, run: () => { if (p.id === cfg.activeId) cfg.onStream(s); else go(p.id); } }));
        }
      });
      return [{ id: 'results', title: 'Results', collapsible: false, items: hits, empty: 'No projects match “' + cfg.query.trim() + '”.' }];
    }
    const live = projects.filter((p) => p.status !== 'done' && p.status !== 'archived');
    const areas = AREAS.concat(Array.from(new Set(live.map((p) => p.area || 'Personal'))).filter((a) => !AREAS.includes(a)));
    const areaItems = [];
    areas.forEach((area) => {
      const inArea = live.filter((p) => (p.area || 'Personal') === area);
      if (!inArea.length) return;
      const open = !collapsed.has(area);
      areaItems.push({ id: 'area:' + area, label: area, icon: open ? 'chevron-down' : 'chevron-right', run: () => cfg.onArea(area) });
      if (!open) return;
      inArea.forEach((p) => {
        areaItems.push(item(p, { depth: 1 }));
        if (p.id === cfg.activeId) {
          list(p.streams).forEach((s) => areaItems.push({
            id: 'stream:' + p.id + ':' + s, label: s, depth: 2, dot: 'lime', hollow: cfg.stream !== s, active: cfg.stream === s, run: () => cfg.onStream(s),
          }));
        }
      });
    });
    const secOpen = (id, dflt) => (Object.prototype.hasOwnProperty.call(pf.sections, id) ? !!pf.sections[id] : dflt);
    return [
      { id: 'favorites', title: 'Favorites', open: secOpen('favorites', true), items: projects.filter(isFav).map((p) => ({ id: 'fav:' + p.id, label: p.title, dot: 'lime', run: () => go(p.id) })), empty: 'Star a project to pin it here.' },
      { id: 'areas', title: 'Areas', open: secOpen('areas', true), items: areaItems, empty: 'No active projects.' },
      { id: 'finished', title: 'Finished', open: secOpen('finished', false), items: projects.filter((p) => p.status === 'done').map((p) => item(p, { dot: 'neutral' })), empty: 'Nothing finished yet.' },
      { id: 'archive', title: 'Archive', open: secOpen('archive', false), items: projects.filter((p) => p.status === 'archived').map((p) => item(p, { dot: 'neutral' })), empty: 'Nothing archived.' },
    ];
  }
  // Build the tree's scroll area with the shared sideNav helper, then add the
  // bits the helper leaves to screens: empty rows, area expand state, and
  // persisting which sections are open.
  function treeScroll(cfg) {
    const sections = treeSections(cfg);
    const nav = UI.sideNav({ label: 'Projects', sections });
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
      b.setAttribute('aria-expanded', b.querySelector('.jay-side-icon') && !prefs().collapsed.includes(b.dataset.side.slice(5)) ? 'true' : 'false');
    });
    return scroll;
  }

  /* ── Task list (compact rows, grouped like the board) ──────────────── */
  function taskRow(t) {
    const done = t.status === 'done';
    const tags = list(t.tags).map((tg) => ({ label: titleCase(tg), hue: UI.tagHue(tg) }));
    const owner = t.assignee ? personOf(t.assignee) : null;
    const progress = done ? 100 : (Number.isFinite(t.progress) ? t.progress : 0);
    return h('li', { class: ['jay-pj-trow', done ? 'is-done' : ''] },
      has('tasks', 'checkToggle') ? JAY.tasks.checkToggle(t, JAY.tasks.toggleDone) : null,
      h('button', { type: 'button', class: 'jay-pj-trow-title', onclick: () => openTask(t.id), title: t.title }, t.title),
      h('span', { class: 'jay-pj-trow-tags' }, tags.length ? UI.tags(tags, { max: 1 }) : null),
      h('span', { class: 'jay-pj-trow-owner jay-who' }, owner ? UI.avatar(owner.name, { id: owner.id, size: 'sm', decorative: true }) : null, owner ? h('span', null, owner.name.split(' ')[0]) : null),
      h('span', { class: 'jay-pj-trow-meter' }, UI.meter(progress, { segments: 10, label: t.title + ' progress' })),
      h('span', { class: 'jay-pj-trow-due' }, has('tasks', 'dueNode') ? JAY.tasks.dueNode(t) : (t.due ? fmt.due(t.due) : '—')));
  }
  function taskList(tasks, p) {
    const groups = BOARD_COLUMNS.map((c) => ({ col: c, items: tasks.filter((t) => c.statuses.includes(t.status)) }));
    return h('div', { class: 'jay-box jay-pj-list' }, groups.map(({ col, items }) => h('section', { class: 'jay-pj-lgroup', 'aria-label': col.label + ', ' + fmt.plural(items.length, 'task') },
      h('header', { class: 'jay-pj-lgroup-head' },
        h('span', { class: ['jay-kcol-mark', 'is-' + col.hue], 'aria-hidden': 'true' }),
        h('h3', { class: 'jay-pj-lgroup-title' }, col.label),
        UI.badge(items.length),
        h('span', { class: 'jay-spacer' }),
        h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Add task to ' + col.label, onclick: () => newTask({ projectId: p.id, status: col.statuses[0] }) }, icon('plus', 16))),
      items.length ? h('ul', { class: 'jay-pj-trows' }, items.map(taskRow)) : h('div', { class: 'jay-pj-lgroup-empty' }, 'No tasks here.'))));
  }
  function applyFilter(tasks, filter) {
    const now = new Date();
    return tasks.filter((t) => {
      if (filter === 'open') return t.status !== 'done';
      if (filter === 'mine') return t.assignee === ME;
      if (filter === 'week') { const s = t.due ? fmt.dueState(t.due, now) : 'none'; return t.status !== 'done' && (s === 'today' || s === 'soon' || s === 'overdue'); }
      if (filter === 'overdue') return t.status !== 'done' && t.due && fmt.dueState(t.due, now) === 'overdue';
      return true;
    });
  }

  /* ── Tab contents ──────────────────────────────────────────────────── */
  function panelHead(title, extra) {
    return h('div', { class: 'jay-box-head jay-pj-phead' }, h('div', { class: 'jay-box-titles' }, h('h3', { class: 'jay-box-title' }, title)), extra ? h('div', { class: 'jay-box-actions' }, extra) : null);
  }
  function fileRows(files) {
    if (!files.length) return h('div', { class: 'jay-empty-line' }, 'No files yet.');
    return h('ul', { class: 'jay-pj-files' }, files.map((f) => h('li', { class: 'jay-pj-file' },
      fileBadge(f),
      h('span', { class: 'jay-pj-file-main' }, h('span', { class: 'jay-pj-file-name' }, f.name), h('span', { class: 'jay-pj-file-meta' }, [f.size, titleCase(f.kind || fileExt(f.name))].filter(Boolean).join(' · '))),
      dateCell(f.updatedAt, shortTime(f.updatedAt)))));
  }
  function noteCards(notes, p) {
    if (!notes.length) return h('div', { class: 'jay-empty-line' }, 'No notes yet.');
    return h('div', { class: 'jay-pj-notes' }, notes.map((n) => h('article', { class: 'jay-pj-note' },
      h('div', { class: 'jay-pj-note-top' }, UI.tag(p.title, { hue: toneHue(p), solid: true }), h('span', { class: 'jay-pj-note-time' }, shortTime(n.updatedAt))),
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
      onclick: () => { if (JAY.chat && typeof JAY.chat.open === 'function') JAY.chat.open(c.id); location.hash = '#/talk'; },
    }, h('span', { class: 'jay-pj-conv-ic', 'aria-hidden': 'true' }, icon('message-circle', 15)),
    h('span', { class: 'jay-pj-conv-title' }, c.title),
    h('span', { class: 'jay-pj-conv-time' }, shortTime(c.updatedAt))))));
  }
  // Two-line task row: title, then "▢ Sep 22 | Overdue" and the status.
  function nextRow(t, before) {
    const st = t.due ? fmt.dueState(t.due) : 'none';
    const status = has('tasks', 'statusPill') ? JAY.tasks.statusPill(t.status) : null;
    return h('li', { class: ['jay-pj-nrow', 'is-' + st] },
      has('tasks', 'checkToggle') ? JAY.tasks.checkToggle(t, JAY.tasks.toggleDone) : null,
      h('span', { class: 'jay-pj-nrow-main' },
        h('button', { type: 'button', class: 'jay-pj-next-title', onclick: () => { if (before) before(); openTask(t.id); } }, t.title),
        h('span', { class: 'jay-pj-nrow-meta' }, t.due ? dateCell(t.due, dueLabel(t.due)) : h('span', { class: 'jay-pj-pcard-none' }, 'No date'))),
      status);
  }
  function statBlock(label, value, sub) {
    return h('div', { class: 'jay-pj-stat' }, h('span', { class: 'jay-pj-stat-k' }, label), h('span', { class: 'jay-pj-stat-v' }, value), sub ? h('span', { class: 'jay-pj-stat-s' }, sub) : null);
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
          h('div', { class: 'jay-pj-summary-main' },
            h('div', { class: 'jay-pj-summary-tags' }, UI.dotPill(statusOf(p).label, statusOf(p).hue), UI.tag(p.area || 'Personal', { hue: toneHue(p) })),
            h('p', { class: 'jay-pj-desc' }, p.description || 'No description yet.')),
          h('div', { class: 'jay-pj-progress' },
            h('span', { class: 'jay-pj-stat-k' }, Number.isFinite(p.progress) ? 'Progress' : 'Tasks completed'),
            UI.meter(pct, { segments: 20, label: p.title + ' progress' }))),
        h('div', { class: 'jay-pj-stats' },
          statBlock('Open', String(open.length), fmt.plural(tasks.length - open.length, 'done', 'done')),
          statBlock('Due this week', String(week), overdue ? overdue + ' overdue' : 'On track'),
          statBlock('Milestone', p.milestone || '—', p.nextDue ? 'Next: ' + fmt.due(p.nextDue.due) : null),
          statBlock('Updated', shortTime(p.updatedAt), p.area))),
      UI.box({ class: ['jay-pj-card-panel', 'is-wide'] }, panelHead('Up next', h('button', { type: 'button', class: 'jay-link', onclick: () => { location.hash = '#/tasks?project=' + encodeURIComponent(p.id) + '&status=all'; } }, 'All tasks', icon('chevron-right', 14))),
        h('div', { class: 'jay-box-body' }, next.length ? h('ul', { class: 'jay-pj-next' }, next.map((t) => nextRow(t))) : h('div', { class: 'jay-empty-line' }, 'Nothing scheduled.'))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('Files', UI.badge(list(p.files).length)), h('div', { class: 'jay-box-body' }, fileRows(list(p.files)))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('Notes', UI.badge(list(p.notes).length)), h('div', { class: 'jay-box-body' }, noteCards(list(p.notes).slice(0, 2), p))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('People', UI.badge(list(p.people).length)), h('div', { class: 'jay-box-body' }, peopleRows(list(p.people)))),
      UI.box({ class: 'jay-pj-card-panel' }, panelHead('Conversations', UI.badge(list(p.conversations).length)), h('div', { class: 'jay-box-body' }, convRows(list(p.conversations)))));
  }

  function timeline(p, stream) {
    const items = list(p.activity).filter((a) => !stream || list(a.context).includes(stream));
    if (!items.length) return UI.box({ class: 'jay-pj-tl' }, UI.state('empty', { icon: 'history', title: stream ? 'No activity in ' + stream + ' yet.' : 'No activity yet.', compact: true }));
    const groups = [];
    items.forEach((a) => {
      const g = dayGroup(a.at);
      let last = groups[groups.length - 1];
      if (!last || last.label !== g) { last = { label: g, items: [] }; groups.push(last); }
      last.items.push(a);
    });
    return UI.box({ class: 'jay-pj-tl' }, groups.map((g) => h('section', { class: 'jay-pj-tl-group' },
      h('h3', { class: 'jay-eyebrow jay-pj-tl-label' }, g.label),
      h('div', { class: 'jay-pj-tl-items' }, g.items.map((a) => feedCard(a, p, { unread: false }))))));
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
    const fav = isFav(p);
    const muted = isMuted(p);
    return UI.box({ class: 'jay-pj-head' },
      ctx.back ? h('button', { type: 'button', class: 'jay-icon-btn jay-pj-back', 'aria-label': 'All projects', onclick: () => { location.hash = '#/projects'; } }, icon('arrow-left', 18)) : null,
      h('div', { class: 'jay-pj-head-main' },
        h('h2', { class: 'jay-pj-title' }, p.title),
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
        h('button', { type: 'button', class: 'jay-icon-btn jay-pj-tool', 'aria-label': 'More actions for ' + p.title, 'aria-haspopup': 'menu', onclick: (e) => projectMenu(e.currentTarget, p) }, icon('more-vertical', 18))));
  }

  function tabsPanel(p, ctx) {
    const tabs = UI.tabs(TABS.map((t) => ({ id: t.id, label: t.label, badge: t.id === 'tasks' ? openCount(p) : undefined })), {
      variant: 'boxed', active: ctx.tab, label: p.title + ' sections', onSelect: ctx.onTab,
    });
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
    const all = list(p.tasks);
    const tasks = applyFilter(all, ctx.filter);
    const filterMeta = FILTERS.find((f) => f.id === ctx.filter) || FILTERS[0];
    const viewBtn = (id, label, ic) => h('button', {
      type: 'button', class: ['jay-pj-viewbtn', ctx.view === id ? 'is-active' : ''], 'aria-pressed': ctx.view === id ? 'true' : 'false',
      onclick: () => ctx.onView(id),
    }, icon(ic, 16), h('span', null, label));
    const filterBtn = h('button', {
      type: 'button', class: ['jay-pj-viewbtn', 'jay-pj-filter', ctx.filter !== 'all' ? 'is-filtered' : ''], 'aria-haspopup': 'menu',
      'aria-label': 'Filter tasks' + (ctx.filter !== 'all' ? ', ' + filterMeta.label : ''),
      onclick: (e) => UI.menu(e.currentTarget, FILTERS.map((f) => ({ label: f.label, icon: f.id === ctx.filter ? 'check' : 'circle', active: f.id === ctx.filter, run: () => ctx.onFilter(f.id) })), { label: 'Filter tasks', align: 'right' }),
    }, icon('sliders', 16), h('span', null, ctx.filter !== 'all' ? filterMeta.label : 'Filter'),
    ctx.filter !== 'all' ? UI.badge(tasks.length, { accent: true }) : null);
    const toolbar = h('div', { class: 'jay-pj-toolbar' },
      h('div', { class: 'jay-pj-views', role: 'group', 'aria-label': 'Task layout' }, viewBtn('list', 'List View', 'list'), viewBtn('board', 'Board View', 'board')),
      h('span', { class: 'jay-spacer' }),
      filterBtn);
    let body;
    if (!all.length) {
      body = UI.box({ class: 'jay-pj-empty' }, UI.state('empty', { icon: 'tasks', title: 'No tasks in this project yet.', action: { label: 'New task', icon: 'plus', run: () => newTask({ projectId: p.id }) } }));
    } else if (ctx.view === 'board' && has('tasks', 'renderBoard')) {
      body = h('div', { class: 'jay-pj-board' }, JAY.tasks.renderBoard(tasks, {
        columns: BOARD_COLUMNS,
        onAdd: (col) => newTask({ projectId: p.id, status: col.statuses[0] }),
        addLabel: 'Add Task',
        showProject: false,
        label: p.title + ' board',
      }));
    } else {
      body = taskList(tasks, p);
    }
    return [toolbar, body];
  }

  /* ── Activity aside ────────────────────────────────────────────────── */
  function feedPanel(p, ctx) {
    const all = list(p.activity).filter((a) => !ctx.stream || list(a.context).includes(ctx.stream));
    const mentions = all.filter(isMention);
    const shown = ctx.feed === 'mentions' ? mentions : all;
    const since = unreadSince(p);
    const unread = all.filter((a) => new Date(a.at).getTime() > since).length;
    const tabs = UI.tabs([
      { id: 'all', label: 'All', badge: all.length },
      { id: 'mentions', label: 'Mentions', badge: mentions.length },
    ], { variant: 'boxed', active: ctx.feed, label: 'Activity filter', onSelect: ctx.onFeed });
    return UI.box({ class: ['jay-pj-feed', 'is-col'], 'aria-label': p.title + ' activity' },
      h('div', { class: 'jay-pj-feed-head' },
        h('h2', { class: 'jay-pj-feed-title' }, 'Activity'),
        unread ? h('span', { class: 'jay-pj-feed-new' }, unread + ' new') : null,
        h('span', { class: 'jay-spacer' }),
        h('button', {
          type: 'button', class: 'jay-icon-btn jay-pj-tool', 'aria-label': 'Mark all activity as read', 'data-tip': 'Mark all read', disabled: unread ? null : true,
          onclick: ctx.onSeen,
        }, icon('check', 17)),
        h('button', {
          type: 'button', class: ['jay-icon-btn', 'jay-pj-tool', isMuted(p) ? 'is-on' : ''], 'aria-pressed': isMuted(p) ? 'true' : 'false',
          'aria-label': isMuted(p) ? 'Unmute notifications' : 'Mute notifications', 'data-tip': isMuted(p) ? 'Unmute' : 'Mute',
          'data-pj-tool': 'feed-mute', onclick: () => ctx.toggle('mute'),
        }, icon(isMuted(p) ? 'bell-off' : 'bell', 17))),
      h('div', { class: 'jay-pj-feed-tabs' }, tabs),
      ctx.stream ? h('div', { class: 'jay-pj-feed-filter' },
        h('span', null, 'Stream'),
        h('button', { type: 'button', class: 'jay-pj-chip', 'aria-label': 'Clear stream filter ' + ctx.stream, onclick: () => ctx.onStream(ctx.stream) }, ctx.stream, icon('x', 13))) : null,
      h('div', { class: 'jay-pj-feed-list' }, shown.length
        ? shown.map((a) => feedCard(a, p, { since }))
        : UI.state('empty', { icon: 'history', title: ctx.feed === 'mentions' ? 'No mentions yet.' : 'No activity yet.', compact: true })));
  }

  /* ── Phones / tablets: project cards ───────────────────────────────── */
  function projectCard(p) {
    const st = statusOf(p);
    const open = openCount(p);
    return h('article', { class: 'jay-box jay-pj-pcard' },
      h('div', { class: 'jay-pj-pcard-top' },
        h('span', { class: ['jay-side-dot', 'is-' + toneHue(p)], 'aria-hidden': 'true' }),
        h('h3', { class: 'jay-pj-pcard-title' }, h('a', { class: 'jay-pj-pcard-link', href: '#/projects/' + encodeURIComponent(p.id) }, p.title)),
        isFav(p) ? h('span', { class: 'jay-pj-pcard-fav', 'aria-label': 'Favorite', role: 'img' }, icon('star', 14)) : null,
        open ? UI.badge(open, { accent: true }) : null),
      crumbs(p.streams),
      h('div', { class: 'jay-pj-pcard-mid' },
        Number.isFinite(p.progress) ? UI.meter(p.progress, { segments: 16, label: p.title + ' progress' }) : h('span', { class: 'jay-pj-pcard-ongoing' }, fmt.plural(open, 'open task'))),
      h('div', { class: 'jay-pj-pcard-foot' },
        UI.dotPill(st.label, st.hue),
        h('span', { class: 'jay-spacer' }),
        p.nextDue ? dateCell(p.nextDue.due, dueLabel(p.nextDue.due)) : h('span', { class: 'jay-pj-pcard-none' }, 'No due dates')));
  }
  function projectCards(projects) {
    const fav = projects.filter(isFav);
    const areas = AREAS.concat(Array.from(new Set(projects.map((p) => p.area || 'Personal'))).filter((a) => !AREAS.includes(a)));
    const groups = [];
    if (fav.length) groups.push({ label: 'Favorites', items: fav });
    areas.forEach((a) => { const items = projects.filter((p) => (p.area || 'Personal') === a && !isFav(p)); if (items.length) groups.push({ label: a, items }); });
    return groups.map((g) => h('section', { class: 'jay-pj-cgroup', 'aria-label': g.label },
      h('h2', { class: 'jay-eyebrow jay-pj-cgroup-label' }, g.label, h('span', { class: 'jay-pj-cgroup-n' }, String(g.items.length))),
      h('div', { class: 'jay-pj-cgrid' }, g.items.map(projectCard))));
  }

  function renderList(root) {
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
        const live = projects.filter((p) => p.status !== 'done' && p.status !== 'archived');
        if (JAY.shell && typeof JAY.shell.setHeader === 'function') {
          JAY.shell.setHeader({
            route: 'projects', title: 'Projects', pill: { label: live.length + ' active', hue: 'green' },
            crumbs: AREAS.map((a) => { const n = live.filter((p) => p.area === a).length; return n ? a + ' ' + n : null; }).filter(Boolean),
          });
        }
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
    const pf = prefs();
    const uid = JAY.nextId('pj');
    const ctx = {
      uid,
      back: !wide,
      tab: TABS.some((t) => t.id === params.tab) ? params.tab : (TABS.some((t) => t.id === pf.tab) ? pf.tab : 'tasks'),
      view: pf.view === 'list' ? 'list' : 'board',
      filter: FILTERS.some((f) => f.id === pf.filter) ? pf.filter : 'all',
      feed: 'all',
      stream: null,
      query: '',
    };
    let projects = [];
    let project = null;
    let seq = 0;
    let disposed = false;

    const side = UI.sideNav({
      label: 'Projects',
      search: { placeholder: 'Search projects', onInput: (v) => { ctx.query = v; drawTree(); } },
      sections: [],
      footer: { label: 'Add Project', icon: 'plus', run: openCreate },
    });
    side.classList.add('jay-pj-side');
    const main = h('div', { class: 'jay-stack jay-pj-main' }, UI.box({ class: 'jay-pj-head' }, UI.state('loading', { rows: 2 })));
    const aside = h('div', { class: 'jay-pj-aside' });
    const layout = h('div', { class: ['jay-layout', 'has-side', 'has-aside', 'is-fill', 'jay-projects', wide ? '' : 'is-narrow'] }, side, main, aside);
    mount(root, layout);

    function drawTree() {
      const old = side.querySelector('.jay-side-scroll');
      const top = old ? old.scrollTop : 0;
      const focused = document.activeElement && old && old.contains(document.activeElement) ? document.activeElement.dataset.side : null;
      const next = treeScroll({
        projects, activeId: project ? project.id : null, query: ctx.query, stream: ctx.stream,
        onArea: (area) => {
          const c = new Set(prefs().collapsed);
          if (c.has(area)) c.delete(area); else c.add(area);
          savePrefs({ collapsed: Array.from(c) });
          drawTree();
        },
        onStream: setStream,
      });
      if (old) old.replaceWith(next); else side.insertBefore(next, side.querySelector('.jay-side-foot'));
      next.scrollTop = top;
      if (focused) { const b = next.querySelector('[data-side="' + CSS.escape(focused) + '"]'); if (b) b.focus({ preventScroll: true }); }
    }

    function persistView() { savePrefs({ tab: ctx.tab, view: ctx.view, filter: ctx.filter }); }
    function setTab(t) {
      ctx.tab = t;
      persistView();
      try { history.replaceState(history.state, '', '#/projects/' + encodeURIComponent(project.id) + (t === 'tasks' ? '' : '?tab=' + t)); } catch (_) { /* ignore */ }
      drawMain();
    }
    function setStream(s) {
      ctx.stream = ctx.stream === s ? null : s;
      drawTree();
      drawMain();
      drawAside();
      setHeader();
    }
    function toggle(kind) {
      if (!project) return;
      const pfx = prefs();
      const active = document.activeElement;
      const refocus = active && active.dataset ? active.dataset.pjTool : null;
      if (kind === 'fav') {
        const now = !isFav(project);
        savePrefs({ fav: Object.assign({}, pfx.fav, { [project.id]: now }) });
        UI.toast(now ? 'Added to favorites' : 'Removed from favorites', { icon: 'star' });
      } else {
        const now = !isMuted(project);
        savePrefs({ mute: Object.assign({}, pfx.mute, { [project.id]: now }) });
        UI.toast(now ? 'Notifications muted for ' + project.title : 'Notifications on for ' + project.title, { icon: now ? 'bell-off' : 'bell' });
      }
      drawTree();
      drawMain();
      drawAside();
      // Keep keyboard focus on the control that was toggled after the redraw.
      if (refocus) { const b = layout.querySelector('[data-pj-tool="' + refocus + '"]'); if (b) b.focus({ preventScroll: true }); }
    }
    const ctxApi = {
      get tab() { return ctx.tab; }, get view() { return ctx.view; }, get filter() { return ctx.filter; }, get feed() { return ctx.feed; },
      get stream() { return ctx.stream; }, get back() { return ctx.back; }, uid,
      onTab: setTab, onStream: setStream, toggle,
      onView: (v) => { ctx.view = v; persistView(); drawMain(); const b = layout.querySelector('.jay-pj-viewbtn.is-active'); if (b) b.focus({ preventScroll: true }); },
      onFilter: (f) => { ctx.filter = f; persistView(); drawMain(); const b = layout.querySelector('.jay-pj-filter'); if (b) b.focus({ preventScroll: true }); },
      onFeed: (f) => { ctx.feed = f; drawAside(); const b = aside.querySelector('.jay-tab[data-tab="' + f + '"]'); if (b) b.focus({ preventScroll: true }); },
      onSeen: () => {
        const seen = Object.assign({}, prefs().seen, { [project.id]: new Date().toISOString() });
        savePrefs({ seen });
        drawAside();
      },
    };

    function content() {
      const p = project;
      if (ctx.tab === 'overview') return overview(p);
      if (ctx.tab === 'timeline') return timeline(p, ctx.stream);
      if (ctx.tab === 'files') {
        return UI.box({ class: 'jay-pj-card-panel' }, panelHead('Files', h('button', { type: 'button', class: 'jay-btn is-outline is-sm', onclick: () => { location.hash = '#/files'; } }, icon('files', 14), 'Workspace')),
          h('div', { class: 'jay-box-body' }, fileRows(list(p.files))));
      }
      if (ctx.tab === 'notes') {
        return UI.box({ class: 'jay-pj-card-panel' }, panelHead('Notes', h('button', { type: 'button', class: 'jay-btn is-inset is-sm', onclick: () => askJay(p) }, icon('plus', 14), 'Ask Jay for a note')),
          h('div', { class: 'jay-box-body' }, noteCards(list(p.notes), p)));
      }
      return tasksTab(p, ctxApi);
    }

    function drawMain() {
      if (!project) return;
      const scroller = main.querySelector('.jay-pj-scroll');
      const top = scroller ? scroller.scrollTop : 0;
      const boardEl = main.querySelector('.jay-pj-board > .jay-board');
      const boardLeft = boardEl ? boardEl.scrollLeft : 0;
      const tabFocus = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('jay-tab') && main.contains(document.activeElement) ? document.activeElement.dataset.tab : null;
      const panel = h('div', { class: ['jay-pj-scroll', 'is-' + ctx.tab], id: uid + '-panel', role: 'tabpanel', 'aria-labelledby': uid + '-tab-' + ctx.tab }, content());
      mount(main, headPanel(project, ctxApi), tabsPanel(project, ctxApi), panel);
      panel.scrollTop = top;
      const nb = main.querySelector('.jay-pj-board > .jay-board');
      if (nb) nb.scrollLeft = boardLeft;
      if (tabFocus) { const b = main.querySelector('.jay-tab[data-tab="' + tabFocus + '"]'); if (b) b.focus({ preventScroll: true }); }
    }
    function drawAside() {
      if (!project) return;
      const old = aside.querySelector('.jay-pj-feed-list');
      const top = old ? old.scrollTop : 0;
      mount(aside, feedPanel(project, ctxApi));
      const nl = aside.querySelector('.jay-pj-feed-list');
      if (nl) nl.scrollTop = top;
    }
    function setHeader() {
      if (!project || !JAY.shell || typeof JAY.shell.setHeader !== 'function') return;
      const st = statusOf(project);
      JAY.shell.setHeader({
        route: 'projects', title: project.title, pill: { label: st.label, hue: st.hue },
        crumbs: list(project.streams).map((s) => ({ label: s, run: () => setStream(s), tone: ctx.stream === s ? 'accent' : undefined })),
      });
    }
    function showState(node) {
      layout.classList.add('is-state');
      mount(main, node);
      mount(aside);
    }

    async function load(quiet) {
      const my = ++seq;
      try {
        const [res] = await Promise.all([JAY.data.getProjects(), peopleCache.size ? null : loadPeople()]);
        if (disposed || my !== seq) return;
        if (res && res.__state) { showState(stateBox(res.__state)); return; }
        projects = list(res);
        const fallback = projects.find(isFav) || projects[0];
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
        project = p;
        layout.classList.remove('is-state');
        if (ctx.stream && !list(p.streams).includes(ctx.stream)) ctx.stream = null;
        drawTree();
        drawMain();
        drawAside();
        setHeader();
      } catch (_) {
        if (disposed || my !== seq) return;
        if (!quiet || !project) showState(UI.box({ class: 'jay-pj-empty' }, UI.state('error', { title: 'Couldn’t load this project.', action: { label: 'Retry', icon: 'refresh', run: () => load() } })));
      }
    }
    load();
    const offs = ['data:projects', 'data:tasks', 'data:people'].map((e) => JAY.on(e, () => load(true)));
    return () => { disposed = true; offs.forEach((off) => off()); };
  }

  function render(root, params) {
    const p = params || {};
    const id = p._ ? decodeURIComponent(p._) : null;
    let dispose = (!mqWide.matches && !id) ? renderList(root) : renderDetail(root, id, p);
    function onMq() { JAY.emit('route:rerender'); }
    mqWide.addEventListener('change', onMq);
    return () => { if (dispose) dispose(); dispose = null; mqWide.removeEventListener('change', onMq); };
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
        h('div', { class: 'jay-pj-pv-tags' }, UI.dotPill(st.label, st.hue), UI.tag(p.area || 'Personal', { hue: toneHue(p) }), isFav(p) ? h('span', { class: 'jay-pj-pv-fav' }, icon('star', 13), 'Favorite') : null),
        p.description ? h('p', { class: 'jay-pj-desc' }, p.description) : null,
        crumbs(p.streams),
        h('div', { class: 'jay-pj-pv-stats' },
          h('div', { class: 'jay-pj-pv-meter' }, h('span', { class: 'jay-pj-stat-k' }, Number.isFinite(p.progress) ? 'Progress' : 'Tasks completed'), UI.meter(pct, { segments: 18, label: p.title + ' progress' })),
          statBlock('Open', String(open.length), fmt.plural(tasks.length - open.length, 'done', 'done')),
          statBlock('Milestone', p.milestone || '—', null)),
        h('section', { class: 'jay-pj-pv-sec' },
          h('div', { class: 'jay-pj-pv-head' }, h('h3', { class: 'jay-pj-pv-title' }, 'Open tasks'), UI.badge(open.length, { accent: !!open.length })),
          open.length ? h('ul', { class: 'jay-pj-next' }, open.slice(0, 5).map((t) => nextRow(t, () => panel.close()))) : h('div', { class: 'jay-empty-line' }, 'No open tasks.')),
        h('section', { class: 'jay-pj-pv-sec' },
          h('div', { class: 'jay-pj-pv-head' }, h('h3', { class: 'jay-pj-pv-title' }, 'Recent activity')),
          list(p.activity).length ? h('div', { class: 'jay-pj-pv-feed' }, list(p.activity).slice(0, 3).map((a) => feedCard(a, p, { unread: false }))) : h('div', { class: 'jay-empty-line' }, 'No activity yet.')),
        list(p.people).length ? h('section', { class: 'jay-pj-pv-sec' },
          h('div', { class: 'jay-pj-pv-head' }, h('h3', { class: 'jay-pj-pv-title' }, 'People'), UI.avatarStack(list(p.people), { max: 4, size: 'sm' })),
          peopleRows(list(p.people))) : null);
    } catch (_) {
      mount(body, UI.state('error', { title: 'Couldn’t load this project.' }));
    }
  }

  /* ── Create drawer ─────────────────────────────────────────────────── */
  function openCreate() {
    const idT = JAY.nextId('f'); const idD = JAY.nextId('f');
    const title = h('input', { id: idT, class: 'jay-input is-title', type: 'text', placeholder: 'Project name', autocomplete: 'off' });
    const desc = h('textarea', { id: idD, class: 'jay-input', rows: '3', placeholder: 'What is this project about?' });
    let area = 'Personal';
    const areaSeg = h('div', { class: 'jay-segmented is-full', role: 'radiogroup', 'aria-label': 'Area' }, AREAS.map((a) => h('button', {
      type: 'button', role: 'radio', class: a === area ? 'is-active' : '', 'aria-checked': a === area ? 'true' : 'false',
      onclick: (e) => {
        area = a;
        areaSeg.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      },
    }, a)));
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
        h('div', { class: 'jay-field' }, h('span', { class: 'jay-label' }, 'Area'), areaSeg),
        h('div', { class: 'jay-field' }, h('label', { class: 'jay-label', for: idD }, 'Description'), desc),
        h('div', { class: 'jay-tip' }, icon('chat', 16), h('div', null, 'Or tell Jay: “Start a project for the office move, with a task to get three quotes.”'))),
      footer: [h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => panel.close() }, 'Cancel'), h('span', { class: 'jay-spacer' }), h('button', { type: 'button', class: 'jay-btn is-primary', onclick: save }, icon('plus', 15), 'Create project')],
    });
  }

  JAY.projects = { openPreview, openCreate };
  JAY.views = JAY.views || {};
  JAY.views.projects = { title: 'Projects', render };
})();
