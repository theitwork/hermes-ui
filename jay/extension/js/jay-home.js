/* JAY customization — Home command center.
   Desktop: LEFT = what is happening (Today) · CENTER = Talk to Jay ·
   RIGHT = what needs me (Attention), with a quiet shelf underneath.
   Phones (<768px): recomposed into one vertical flow — Ask Jay, Attention,
   Today, Projects, Continue — never a squeezed desktop grid.
   Every block is an independent JAY.widget so one failure never blanks Home. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;

  const KIND = {
    event: { icon: 'calendar', label: 'Event' },
    task: { icon: 'tasks', label: 'Task' },
    reminder: { icon: 'bell', label: 'Reminder' },
    automation: { icon: 'automations', label: 'Automation' },
    followup: { icon: 'phone', label: 'Follow-up' },
  };
  const LEVEL_LABEL = { critical: 'Critical', overdue: 'Overdue', respond: 'Needs reply', waiting: 'Waiting', info: 'FYI' };
  const SOURCE_ICON = { automation: 'automations', task: 'tasks', email: 'mail', calendar: 'calendar', followup: 'user-check' };
  const ACTIONS = {
    done: { label: 'Done', icon: 'check' },
    snooze: { label: 'Snooze', icon: 'snooze' },
    dismiss: { label: 'Dismiss', icon: 'x' },
    view: { label: 'View', icon: 'eye' },
    open: { label: 'Open', icon: 'arrow-up-right' },
    inspect: { label: 'Inspect', icon: 'arrow-up-right' },
    reply: { label: 'Reply', icon: 'reply' },
  };

  /* ── shared helpers ─────────────────────────────────────────────────── */
  function sectionHead(title, opts) {
    const o = opts || {};
    return h('div', { class: 'jay-block-head' },
      h('div', { class: 'jay-block-titles' },
        h('h2', { class: 'jay-eyebrow', id: o.id || null }, title),
        o.count !== undefined && o.count !== null ? h('span', { class: 'jay-count', 'aria-label': o.count + ' items' }, String(o.count)) : null,
        o.sub ? h('span', { class: 'jay-block-sub' }, o.sub) : null),
      o.action ? h('button', { type: 'button', class: 'jay-link', onclick: o.action.run }, o.action.label, o.action.icon ? icon(o.action.icon, 14) : null) : null);
  }

  function goTalk(intentOrDraft) {
    if (intentOrDraft && intentOrDraft.draft !== undefined) JAY.chat.shared.draft = intentOrDraft.draft;
    if (JAY.isMobile() || !document.querySelector('.jay-talk.is-dock')) {
      location.hash = '#/talk';
      if (intentOrDraft && intentOrDraft.intent) setTimeout(() => JAY.chat.prime(intentOrDraft.intent), 60);
      return;
    }
    if (intentOrDraft && intentOrDraft.draft !== undefined) {
      const ta = document.querySelector('.jay-talk.is-dock .jay-composer-input');
      if (ta) { ta.value = intentOrDraft.draft; ta.dispatchEvent(new Event('input')); ta.focus(); }
    }
    if (intentOrDraft && intentOrDraft.intent) JAY.chat.prime(intentOrDraft.intent);
  }

  /* ── Today ──────────────────────────────────────────────────────────── */
  function todayItemNode(it, now) {
    const k = KIND[it.kind] || KIND.task;
    const past = new Date(it.end || it.at) < now;
    return h('li', null, h('button', {
      type: 'button', class: ['jay-tl-item', 'is-' + it.kind, past ? 'is-past' : ''],
      onclick: () => openTodayItem(it),
      'aria-label': fmt.time(it.at) + ', ' + it.title + ', ' + k.label + (past ? ', earlier today' : ''),
    },
    h('span', { class: 'jay-tl-time' }, fmt.time(it.at)),
    h('span', { class: 'jay-tl-dot', title: k.label }, icon(k.icon, 13)),
    h('span', { class: 'jay-tl-main' },
      h('span', { class: 'jay-tl-title' }, it.title),
      h('span', { class: 'jay-tl-meta' }, it.meta || k.label))));
  }

  function renderToday(items, opts) {
    const o = opts || {};
    const now = new Date();
    const list = h('ol', { class: 'jay-timeline', 'aria-label': 'Today, in time order' });
    let nowPlaced = false;
    const past = [];
    const upcoming = [];
    items.forEach((it) => ((new Date(it.end || it.at) < now) ? past : upcoming).push(it));
    const nowNode = () => h('li', { class: 'jay-tl-now', 'aria-label': 'Now, ' + fmt.time(now) }, h('span', { class: 'jay-tl-time' }, fmt.time(now)), h('span', { class: 'jay-tl-now-line', 'aria-hidden': 'true' }));
    if (o.collapsePast && past.length) {
      const toggle = h('li', null, h('button', {
        type: 'button', class: 'jay-tl-earlier', 'aria-expanded': 'false',
        onclick: (e) => {
          const btn = e.currentTarget;
          const open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', open ? 'false' : 'true');
          list.querySelectorAll('.jay-tl-hidden').forEach((n) => { n.hidden = open; });
          btn.lastChild.textContent = open ? 'Show ' + fmt.plural(past.length, 'earlier item') : 'Hide earlier';
        },
      }, icon('history', 14), h('span', null, 'Show ' + fmt.plural(past.length, 'earlier item'))));
      list.appendChild(toggle);
      past.forEach((it) => { const n = todayItemNode(it, now); n.classList.add('jay-tl-hidden'); n.hidden = true; list.appendChild(n); });
    } else {
      past.forEach((it) => list.appendChild(todayItemNode(it, now)));
    }
    upcoming.forEach((it) => {
      if (!nowPlaced) { list.appendChild(nowNode()); nowPlaced = true; }
      list.appendChild(todayItemNode(it, now));
    });
    if (!nowPlaced) list.appendChild(nowNode());
    if (!upcoming.length) list.appendChild(h('li', { class: 'jay-tl-done' }, 'Nothing else scheduled today.'));
    return list;
  }

  function renderTodaySummary(s) {
    const items = [
      { n: s.tasksDue, label: s.tasksDue === 1 ? 'task due' : 'tasks due', route: '#/tasks?due=today' },
      { n: s.reminders, label: s.reminders === 1 ? 'reminder' : 'reminders' },
      { n: s.waiting, label: 'waiting', route: '#/tasks?status=waiting' },
    ];
    return h('div', { class: 'jay-today-summary' }, items.map((it) =>
      h(it.route ? 'button' : 'span', it.route ? { type: 'button', class: 'jay-sum', onclick: () => { location.hash = it.route; } } : { class: 'jay-sum' },
        h('strong', null, String(it.n)), ' ', it.label)));
  }

  async function openTodayItem(it) {
    if (it.ref && it.ref.type === 'task') { JAY.tasks.openTask(it.ref.id); return; }
    const k = KIND[it.kind] || KIND.event;
    const rows = [
      ['When', fmt.time(it.at) + (it.end ? ' – ' + fmt.time(it.end) : '') + ' · ' + fmt.dayLong(it.at)],
      it.location ? ['Where', it.location] : null,
      ['Type', it.meta || k.label],
    ].filter(Boolean);
    let person = null;
    if (it.personId) { try { person = await JAY.data.getPerson(it.personId); } catch (_) { person = null; } }
    const body = h('div', { class: 'jay-detail' },
      h('div', { class: 'jay-detail-hero' }, h('span', { class: ['jay-kind-badge', 'is-' + it.kind] }, icon(k.icon, 16), k.label)),
      h('dl', { class: 'jay-dl' }, rows.map(([dt, dd]) => [h('dt', null, dt), h('dd', null, dd)])),
      it.detail ? h('p', { class: 'jay-detail-text' }, it.detail) : null,
      person ? h('div', { class: 'jay-person-row' }, h('span', { class: 'jay-avatar' }, fmt.initials(person.name)), h('div', null, h('div', { class: 'jay-person-name' }, person.name), h('div', { class: 'jay-muted' }, person.role))) : null,
      it.kind === 'event' ? h('p', { class: 'jay-note' }, icon('lock', 14), 'Sample event. Calendar isn’t connected in this preview.') : null,
      it.kind === 'automation' ? h('p', { class: 'jay-note' }, icon('automations', 14), 'Sample automation. Real schedules live in Automations (Hermes scheduled jobs).') : null);
    const footer = [
      h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => { panel.close(); goTalk({ draft: 'About “' + it.title + '” at ' + fmt.time(it.at) + ': ' }); } }, icon('chat', 16), 'Ask Jay'),
      it.kind === 'automation' ? h('button', { type: 'button', class: 'jay-btn', onclick: () => { panel.close(); location.hash = '#/automations'; } }, 'Open Automations') : null,
      it.kind === 'reminder' ? h('button', { type: 'button', class: 'jay-btn', onclick: () => { panel.close(); JAY.ui.toast('Snoozed 30 minutes (preview).', { icon: 'snooze' }); } }, icon('snooze', 16), 'Snooze') : null,
    ];
    const panel = JAY.ui.openPanel({ eyebrow: k.label, title: it.title, body, footer });
  }

  /* ── Attention ──────────────────────────────────────────────────────── */
  async function runAttention(item, action, anchor) {
    if (action === 'view' || action === 'open' || action === 'inspect') { openAttention(item); return; }
    if (action === 'reply') {
      goTalk({ draft: 'Draft a reply to ' + (item.personName || 'this') + ' about “' + item.title + '”: ' });
      return;
    }
    if (action === 'snooze') {
      JAY.ui.menu(anchor, [
        { label: 'In 3 hours', icon: 'clock', run: () => doResolve(item, 'snooze', 'Snoozed for 3 hours') },
        { label: 'This evening', icon: 'moon', run: () => doResolve(item, 'snooze', 'Snoozed until this evening') },
        { label: 'Tomorrow morning', icon: 'sun', run: () => doResolve(item, 'snooze', 'Snoozed until tomorrow') },
      ], { label: 'Snooze until' });
      return;
    }
    doResolve(item, action, action === 'done' ? 'Marked done' : 'Dismissed');
  }
  async function doResolve(item, action, message) {
    try {
      await JAY.data.resolveAttention(item.id, action);
      JAY.ui.toast(message + ': ' + item.title, { icon: action === 'done' ? 'check' : 'snooze', action: { label: 'Undo', run: () => JAY.data.restoreAttention(item.id) } });
    } catch (err) {
      JAY.ui.toast('Couldn’t update that item.', { tone: 'danger', icon: 'alert-circle' });
    }
  }

  function attentionNode(item) {
    const title = h('button', { type: 'button', class: 'jay-att-title', onclick: () => openAttention(item) }, item.title);
    return h('li', { class: ['jay-att', 'is-' + item.level] },
      h('div', { class: 'jay-att-top' },
        h('span', { class: 'jay-att-label' }, h('span', { class: 'jay-att-dot', 'aria-hidden': 'true' }), item.label, h('span', { class: 'jay-sr-only' }, ' — ' + LEVEL_LABEL[item.level])),
        h('span', { class: 'jay-att-time', title: new Date(item.at).toLocaleString() }, fmt.ago(item.at))),
      title,
      h('div', { class: 'jay-att-meta' }, item.personName && !String(item.meta).includes(item.personName) ? item.personName + ' · ' + item.meta : item.meta),
      h('div', { class: 'jay-att-actions' }, (item.actions || []).map((a, i) => h('button', {
        type: 'button', class: ['jay-btn', 'is-sm', i === 0 ? 'is-soft' : 'is-ghost'],
        onclick: (e) => runAttention(item, a, e.currentTarget),
        'aria-label': ACTIONS[a].label + ': ' + item.title,
      }, i === 0 ? icon(ACTIONS[a].icon, 14) : null, ACTIONS[a].label))));
  }

  function renderAttention(items, opts) {
    const o = opts || {};
    const shown = o.limit ? items.slice(0, o.limit) : items;
    const list = h('ul', { class: 'jay-att-list' }, shown.map(attentionNode));
    if (o.limit && items.length > o.limit) {
      return h('div', null, list, h('button', { type: 'button', class: 'jay-more-row', onclick: () => openAllAttention(items) }, 'See all ' + items.length, icon('chevron-right', 15)));
    }
    return list;
  }

  function openAllAttention() {
    const box = h('div', { class: 'jay-att-sheet' });
    JAY.widget(box, {
      name: 'attention-all', domains: ['attention'], load: () => JAY.data.getAttentionItems(),
      render: (items) => renderAttention(items), empty: { icon: 'check', title: 'You’re caught up.', text: 'Nothing needs you right now.' },
    });
    JAY.ui.openPanel({ eyebrow: 'Attention', title: 'Things that may need you', body: box });
  }

  async function openAttention(item) {
    let task = null;
    if (item.taskId) { try { task = await JAY.data.getTask(item.taskId); } catch (_) { task = null; } }
    const body = h('div', { class: 'jay-detail' },
      h('div', { class: 'jay-detail-hero' },
        h('span', { class: ['jay-level-badge', 'is-' + item.level] }, icon(SOURCE_ICON[item.source] || 'alert-circle', 15), item.label + ' · ' + LEVEL_LABEL[item.level])),
      h('dl', { class: 'jay-dl' },
        h('dt', null, 'When'), h('dd', null, fmt.relative(item.at) + ' · ' + fmt.time(item.at)),
        h('dt', null, 'Context'), h('dd', null, item.meta),
        item.personName ? [h('dt', null, 'From'), h('dd', null, item.personName)] : null),
      item.detail ? h('blockquote', { class: 'jay-quote' }, item.detail) : null,
      task ? h('button', { type: 'button', class: 'jay-linked', onclick: () => { panel.close(); JAY.tasks.openTask(task.id); } },
        icon('tasks', 16), h('span', null, h('span', { class: 'jay-linked-title' }, task.title), h('span', { class: 'jay-muted' }, (task.project ? task.project.title + ' · ' : '') + 'Due ' + fmt.due(task.due).toLowerCase())), icon('chevron-right', 16)) : null,
      item.source === 'email' ? h('p', { class: 'jay-note' }, icon('lock', 14), 'Sample message. Email isn’t connected in this preview.') : null);
    const acts = (item.actions || []).filter((a) => !['view', 'open', 'inspect'].includes(a));
    const footer = [
      h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => { panel.close(); goTalk({ draft: 'Help me with: ' + item.title + ' — ' }); } }, icon('chat', 16), 'Ask Jay'),
      acts.map((a) => h('button', { type: 'button', class: ['jay-btn', a === 'done' || a === 'reply' ? 'is-primary' : ''], onclick: (e) => { if (a !== 'snooze') panel.close(); runAttention(item, a, e.currentTarget); } }, icon(ACTIONS[a].icon, 16), ACTIONS[a].label)),
    ];
    const panel = JAY.ui.openPanel({ eyebrow: 'Attention', title: item.title, body, footer });
  }

  /* ── Shelf widgets ──────────────────────────────────────────────────── */
  function renderProjects(projects, opts) {
    const o = opts || {};
    const list = h('ul', { class: 'jay-rows' }, projects.slice(0, o.limit || 4).map((p) => h('li', null,
      h('button', { type: 'button', class: 'jay-proj-row', onclick: () => JAY.projects.openPreview(p.id) },
        h('span', { class: 'jay-tone-dot', style: { background: 'var(--jay-tone-' + p.tone + ')' }, 'aria-hidden': 'true' }),
        h('span', { class: 'jay-proj-main' },
          h('span', { class: 'jay-proj-title' }, p.title),
          p.progress !== null && p.progress !== undefined
            ? h('span', { class: 'jay-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.progress), 'aria-label': p.title + ' progress' }, h('span', { style: { width: p.progress + '%' } }))
            : null),
        h('span', { class: 'jay-proj-value' }, p.progress !== null && p.progress !== undefined ? p.progress + '%' : fmt.plural(p.openTasks, 'task'))))));
    return list;
  }

  function renderTaskCounts(c) {
    const rows = [
      { label: 'Today', n: c.today, route: '#/tasks?due=today', icon: 'calendar' },
      { label: 'Overdue', n: c.overdue, route: '#/tasks?due=overdue', icon: 'alert-triangle', tone: c.overdue ? 'warning' : '' },
      { label: 'In progress', n: c.in_progress, route: '#/tasks?status=in_progress', icon: 'circle-dashed' },
      { label: 'Waiting', n: c.waiting, route: '#/tasks?status=waiting', icon: 'hourglass' },
    ];
    return h('ul', { class: 'jay-rows' }, rows.map((r) => h('li', null,
      h('button', { type: 'button', class: ['jay-count-row', r.tone ? 'is-' + r.tone : ''], onclick: () => { location.hash = r.route; } },
        icon(r.icon, 15), h('span', { class: 'jay-count-label' }, r.label), h('span', { class: 'jay-count-n' }, String(r.n))))));
  }

  function openSession(s) {
    if (s.source === 'hermes') {
      location.hash = '#/chat';
      setTimeout(() => { if (typeof window.loadSession === 'function') window.loadSession(s.id); }, 80);
      return;
    }
    JAY.chat.open(s.id);
    if (JAY.isMobile() || !document.querySelector('.jay-talk.is-dock')) location.hash = '#/talk';
    else JAY.ui.toast('Opened “' + s.title + '”', { icon: 'chat' });
  }

  function renderSessions(sessions, opts) {
    const o = opts || {};
    return h('ul', { class: 'jay-rows' }, sessions.slice(0, o.limit || 3).map((s) => h('li', null,
      h('button', { type: 'button', class: 'jay-cont-row', onclick: () => openSession(s) },
        h('span', { class: 'jay-cont-icon' }, icon(s.source === 'hermes' ? 'chat' : 'message-circle', 15)),
        h('span', { class: 'jay-cont-main' }, h('span', { class: 'jay-cont-title' }, s.title), h('span', { class: 'jay-cont-meta' }, s.context)),
        h('span', { class: 'jay-cont-time' }, fmt.relative(s.updatedAt))))));
  }

  const STATE_WORD = { online: 'online', warning: 'attention', offline: 'offline' };
  function renderStatus(st, opts) {
    const o = opts || {};
    return h('button', { type: 'button', class: 'jay-status-block', onclick: () => { location.hash = '#/system'; }, 'aria-label': 'JAY status. Open System' },
      h('ul', { class: 'jay-status-list' }, st.items.map((it) => h('li', { class: 'jay-status-row' },
        h('span', { class: 'jay-status-label' }, it.label),
        h('span', { class: ['jay-status-val', 'is-' + it.state] }, h('span', { class: 'jay-status-dot', 'aria-hidden': 'true' }), it.value, h('span', { class: 'jay-sr-only' }, ' (' + STATE_WORD[it.state] + ')'))))),
      o.hideCheck ? null : h('div', { class: 'jay-status-foot' }, h('span', null, 'Last check'), h('span', null, fmt.relative(st.checkedAt) === 'Just now' ? 'Now' : fmt.relative(st.checkedAt))));
  }

  /* ── Desktop composition ───────────────────────────────────────────── */
  function renderDesktop(root) {
    const widgets = [];
    const todayBox = h('div', { class: 'jay-today-body' });
    const todaySum = h('div', { class: 'jay-today-foot' });
    const attBox = h('div', { class: 'jay-att-body' });
    const attCount = h('span', { class: 'jay-count', hidden: true });
    const chat = JAY.chat.create({ mode: 'dock' });

    const today = h('section', { class: 'jay-col jay-today', 'aria-labelledby': 'jayTodayH' },
      h('div', { class: 'jay-col-head' },
        h('div', null, h('h2', { class: 'jay-eyebrow', id: 'jayTodayH' }, 'Today'), h('div', { class: 'jay-col-title' }, fmt.dayLong(new Date()))),
        h('button', { type: 'button', class: 'jay-icon-btn', 'aria-label': 'Add a reminder with Jay', 'data-tip': 'Add reminder', onclick: () => JAY.chat.prime('reminder') }, icon('plus', 17))),
      todayBox, todaySum);

    const attention = h('section', { class: 'jay-col jay-attention', 'aria-labelledby': 'jayAttH' },
      h('div', { class: 'jay-col-head' },
        h('div', null,
          h('div', { class: 'jay-col-eyebrow-row' }, h('h2', { class: 'jay-eyebrow', id: 'jayAttH' }, 'Attention'), attCount),
          h('div', { class: 'jay-col-sub' }, 'Things that may need you'))),
      attBox);

    const projBox = h('div');
    const taskBox = h('div');
    const contBox = h('div');
    const statBox = h('div');
    const shelf = h('section', { class: 'jay-shelf', 'aria-label': 'Overview' },
      h('div', { class: 'jay-shelf-block is-projects' },
        sectionHead('Projects', { action: { label: 'View all', icon: 'chevron-right', run: () => { location.hash = '#/projects'; } } }),
        projBox,
        h('button', { type: 'button', class: 'jay-add-row', onclick: () => JAY.projects.openCreate() }, icon('plus', 15), 'New project')),
      h('div', { class: 'jay-shelf-block is-tasks' },
        sectionHead('Tasks', { action: { label: 'Open', icon: 'chevron-right', run: () => { location.hash = '#/tasks'; } } }),
        taskBox,
        h('button', { type: 'button', class: 'jay-add-row', onclick: () => JAY.tasks.openCreate() }, icon('plus', 15), 'Add task')),
      h('div', { class: 'jay-shelf-block is-continue' }, sectionHead('Continue'), contBox),
      h('div', { class: 'jay-shelf-block is-status' }, sectionHead('Jay status'), statBox));

    mount(root, h('div', { class: 'jay-home' }, today, h('div', { class: 'jay-center' }, chat.el), attention, shelf));

    widgets.push(JAY.widget(todayBox, {
      name: 'today', domains: ['today'], load: () => JAY.data.getTodayItems(), render: (items) => {
        const list = renderToday(items);
        requestAnimationFrame(() => { const nowEl = list.querySelector('.jay-tl-now'); if (nowEl && todayBox.scrollHeight > todayBox.clientHeight) todayBox.scrollTop = Math.max(0, nowEl.offsetTop - 120); });
        return list;
      },
      empty: { icon: 'calendar', title: 'A clear day.', text: 'Nothing scheduled.', action: { label: 'Add a reminder', run: () => JAY.chat.prime('reminder') } },
      states: { disconnected: { title: 'Calendar disconnected', text: 'Tasks and reminders still show here.' }, 'not-connected': { title: 'Connect Calendar', text: 'Events will appear here once a calendar is connected.' } },
      skeletonRows: 6,
    }));
    widgets.push(JAY.widget(todaySum, { name: 'today-summary', domains: ['today', 'tasks'], load: () => JAY.data.getTodaySummary(), render: renderTodaySummary, isEmpty: () => false, quietStates: true, skeletonRows: 1 }));
    widgets.push(JAY.widget(attBox, {
      name: 'attention', domains: ['attention'], load: () => JAY.data.getAttentionItems().then((items) => {
        attCount.hidden = !items.length; attCount.textContent = String(items.length); attCount.setAttribute('aria-label', items.length + ' items');
        return items;
      }), render: (items) => renderAttention(items),
      empty: { icon: 'check', title: 'You’re caught up.', text: 'Nothing needs you right now.' }, skeletonRows: 6,
    }));
    widgets.push(JAY.widget(projBox, { name: 'projects', domains: ['projects'], load: () => JAY.data.getProjects(), render: (p) => renderProjects(p), empty: { icon: 'projects', title: 'No projects yet.', compact: true }, skeletonRows: 4 }));
    widgets.push(JAY.widget(taskBox, { name: 'tasks', domains: ['tasks'], load: () => JAY.data.getTaskCounts(), render: renderTaskCounts, isEmpty: () => false, skeletonRows: 4 }));
    widgets.push(JAY.widget(contBox, { name: 'continue', domains: ['sessions'], load: () => JAY.data.getRecentSessions(), render: (s) => renderSessions(s), empty: { icon: 'history', title: 'No recent work yet.', compact: true }, skeletonRows: 3 }));
    widgets.push(JAY.widget(statBox, {
      name: 'status', domains: ['system'], load: () => JAY.data.getSystemStatus(), render: (s) => renderStatus(s), isEmpty: () => false, skeletonRows: 5,
      states: { disconnected: { title: 'Status unavailable', text: 'JAY can’t reach the status service.', compact: true } },
    }));

    const offPrime = JAY.on('chat:prime', () => chat.focus());
    return () => { widgets.forEach((w) => w.dispose()); chat.destroy(); offPrime(); };
  }

  /* ── Mobile composition ────────────────────────────────────────────── */
  function renderMobile(root) {
    const widgets = [];
    const summaryLine = h('div', { class: 'jay-m-summary' });
    const attBox = h('div');
    const attCount = h('span', { class: 'jay-count', hidden: true });
    const todayBox = h('div');
    const projBox = h('div');
    const contBox = h('div');
    const statusBox = h('div');

    const ask = h('div', { class: 'jay-m-ask' },
      h('button', { type: 'button', class: 'jay-m-askbox', onclick: () => { location.hash = '#/talk'; } },
        h('span', { class: 'jay-mark is-sm', 'aria-hidden': 'true' }, 'J'),
        h('span', { class: 'jay-m-askph' }, 'Ask Jay…')),
      h('button', { type: 'button', class: 'jay-m-mic', 'aria-label': 'Talk to Jay by voice', onclick: () => { location.hash = '#/talk'; setTimeout(() => { const b = document.querySelector('.jay-talk [aria-label="Dictate"]'); if (b) b.click(); }, 120); } }, icon('mic', 20)),
      h('div', { class: 'jay-m-quick' }, [
        ['task', 'Task', 'plus'], ['reminder', 'Reminder', 'plus'], ['idea', 'Idea', 'lightbulb'], ['research', 'Research', 'search'],
      ].map(([intent, label, ic]) => h('button', { type: 'button', class: 'jay-quick-chip', onclick: () => goTalk({ intent }) }, icon(ic, 14), label))));

    mount(root, h('div', { class: 'jay-home is-mobile' },
      h('header', { class: 'jay-m-hello' },
        h('div', { class: 'jay-m-greet' }, fmt.greeting() + ', Pat'),
        h('div', { class: 'jay-m-date' }, fmt.dayLong(new Date())),
        summaryLine),
      ask,
      h('section', { class: 'jay-m-section', 'aria-labelledby': 'jayMAtt' },
        h('div', { class: 'jay-block-head' }, h('div', { class: 'jay-block-titles' }, h('h2', { class: 'jay-eyebrow', id: 'jayMAtt' }, 'Attention'), attCount)),
        attBox),
      h('section', { class: 'jay-m-section', 'aria-labelledby': 'jayMToday' },
        h('div', { class: 'jay-block-head' }, h('div', { class: 'jay-block-titles' }, h('h2', { class: 'jay-eyebrow', id: 'jayMToday' }, 'Today'))),
        todayBox),
      h('section', { class: 'jay-m-section', 'aria-labelledby': 'jayMProj' },
        sectionHead('Projects', { id: 'jayMProj', action: { label: 'View all', icon: 'chevron-right', run: () => { location.hash = '#/projects'; } } }),
        projBox),
      h('section', { class: 'jay-m-section', 'aria-labelledby': 'jayMCont' },
        sectionHead('Continue', { id: 'jayMCont' }),
        contBox),
      h('section', { class: 'jay-m-section is-last', 'aria-labelledby': 'jayMStat' },
        sectionHead('Jay status', { id: 'jayMStat', action: { label: 'System', icon: 'chevron-right', run: () => { location.hash = '#/system'; } } }),
        statusBox)));

    widgets.push(JAY.widget(summaryLine, {
      name: 'm-summary', domains: ['tasks', 'today'], isEmpty: () => false, quietStates: true, skeletonRows: 1,
      load: () => Promise.all([JAY.data.getTaskCounts(), JAY.data.getTodaySummary()])
        .then(([c, s]) => ((c && c.__state) || (s && s.__state) ? { __state: (c && c.__state) || s.__state } : [c, s])),
      render: ([c, s]) => h('span', null,
        fmt.plural(c.today, 'task') + ' today',
        c.overdue ? h('span', { class: 'jay-warn-text' }, ' · ' + c.overdue + ' overdue') : null,
        s.next ? ' · next ' + fmt.time(s.next.at) + ' ' + s.next.title : null),
    }));
    widgets.push(JAY.widget(attBox, {
      name: 'm-attention', domains: ['attention'], skeletonRows: 4,
      load: () => JAY.data.getAttentionItems().then((items) => { attCount.hidden = !items.length; attCount.textContent = String(items.length); return items; }),
      render: (items) => renderAttention(items, { limit: 3 }),
      empty: { icon: 'check', title: 'You’re caught up.', text: 'Nothing needs you right now.', compact: true },
    }));
    widgets.push(JAY.widget(todayBox, { name: 'm-today', domains: ['today'], load: () => JAY.data.getTodayItems(), render: (items) => renderToday(items, { collapsePast: true }), empty: { icon: 'calendar', title: 'A clear day.', compact: true }, skeletonRows: 4 }));
    widgets.push(JAY.widget(projBox, { name: 'm-projects', domains: ['projects'], load: () => JAY.data.getProjects(), render: (p) => renderProjects(p, { limit: 3 }), empty: { icon: 'projects', title: 'No projects yet.', compact: true } }));
    widgets.push(JAY.widget(contBox, { name: 'm-continue', domains: ['sessions'], load: () => JAY.data.getRecentSessions(), render: (s) => renderSessions(s, { limit: 3 }), empty: { icon: 'history', title: 'No recent work yet.', compact: true } }));
    widgets.push(JAY.widget(statusBox, { name: 'm-status', domains: ['system'], load: () => JAY.data.getSystemStatus(), render: (s) => renderStatus(s, { hideCheck: true }), isEmpty: () => false }));
    return () => widgets.forEach((w) => w.dispose());
  }

  JAY.home = { renderAttention, renderToday, openAttention, openTodayItem, goTalk };
  JAY.views = JAY.views || {};
  JAY.views.home = {
    title: 'Home',
    render(root) { return JAY.isMobile() ? renderMobile(root) : renderDesktop(root); },
    responsive: true,
  };
})();
