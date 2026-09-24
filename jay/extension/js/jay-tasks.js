/* JAY customization — Tasks.
   CRM-style task table (tinted tags, owners, status dot-pills, segmented
   progress meters, activity sparklines, last-event cells, calculation footer)
   and a Deepsleep-style kanban board, beside a tree of views and projects.
   Mock-backed through JAY.data; the same calls will later hit jay-core.
   All markup is built with JAY.h()/textContent — never innerHTML with data. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;
  const UI = JAY.ui;

  /* ── Vocabulary ─────────────────────────────────────────────────────── */
  const STATUS = {
    inbox: { label: 'Inbox', icon: 'inbox', hue: 'neutral' },
    next: { label: 'Next', icon: 'arrow-right', hue: 'blue' },
    in_progress: { label: 'In progress', icon: 'circle-dashed', hue: 'lime' },
    waiting: { label: 'Waiting', icon: 'hourglass', hue: 'orange' },
    done: { label: 'Done', icon: 'circle-check', hue: 'green' },
  };
  const STATUS_KEYS = ['inbox', 'next', 'in_progress', 'waiting', 'done'];
  const STATUS_PROGRESS = { inbox: 0, next: 8, in_progress: 40, waiting: 60, done: 100 };
  const PRIORITY = {
    urgent: { label: 'Urgent', level: 4 },
    high: { label: 'High', level: 3 },
    medium: { label: 'Medium', level: 2 },
    low: { label: 'Low', level: 1 },
  };
  const PRIORITY_KEYS = ['urgent', 'high', 'medium', 'low'];
  const DUE_OPTIONS = [['any', 'Any'], ['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'], ['none', 'No date']];
  const SORT_OPTIONS = [['due', 'Due date'], ['priority', 'Priority'], ['status', 'Status'], ['updated', 'Last update'], ['title', 'Title']];
  // Fallback names until JAY.data.getPeople() answers (and if it never does).
  const ASSIGNEES = [['pat', 'Pat'], ['jay', 'Jay'], ['rana', 'Rana Saad'], ['sarah', 'Sarah Mitchell'], ['karim', 'Karim Nassar'], ['tony', 'Tony Haddad']];
  // Project tones → contrast-safe tag hues (tones are for dots and tiles).
  const TONE_HUE = { 1: 'lime', 2: 'blue', 3: 'orange', 4: 'yellow', 5: 'purple' };
  // Saved views in the side tree. A view is just a (status, due) pair, so the
  // active view is always derived from the filter state, never stored twice.
  const VIEWS = [
    { id: 'open', label: 'All open', icon: 'list', status: 'open', due: 'any', count: 'open' },
    { id: 'inbox', label: 'Inbox', icon: 'inbox', status: 'inbox', due: 'any', count: 'inbox' },
    { id: 'today', label: 'Today', icon: 'calendar', status: 'open', due: 'today', count: 'today' },
    { id: 'overdue', label: 'Overdue', icon: 'alert-triangle', status: 'open', due: 'overdue', count: 'overdue', tone: 'danger' },
    { id: 'in_progress', label: 'In progress', icon: 'circle-dashed', status: 'in_progress', due: 'any', count: 'in_progress' },
    { id: 'waiting', label: 'Waiting', icon: 'hourglass', status: 'waiting', due: 'any', count: 'waiting' },
    { id: 'done', label: 'Done', icon: 'circle-check', status: 'done', due: 'any', count: 'done' },
  ];
  const DEFAULT_COLUMNS = STATUS_KEYS.map((k) => ({ id: k, label: STATUS[k].label, hue: STATUS[k].hue, statuses: [k] }));

  /* ── People cache (names for owners and watcher stacks) ─────────────── */
  const people = new Map(ASSIGNEES.map(([id, name]) => [id, { id, name }]));
  let peopleLoad = null;
  function loadPeople() {
    if (!peopleLoad) {
      peopleLoad = Promise.resolve().then(() => JAY.data.getPeople()).then((list) => {
        if (Array.isArray(list)) list.forEach((p) => { if (p && p.id) people.set(p.id, { id: p.id, name: p.name || p.id }); });
        return people;
      }).catch(() => { peopleLoad = null; return people; });
    }
    return peopleLoad;
  }
  JAY.on('data:people', () => { peopleLoad = null; });
  function personOf(id) {
    if (people.has(id)) return people.get(id);
    const s = String(id || '?');
    return { id: s, name: s.charAt(0).toUpperCase() + s.slice(1) };
  }

  /* ── Small shared pieces (exported; other views use some of them) ──── */
  function statusPill(s) {
    const m = STATUS[s] || STATUS.inbox;
    const pill = UI.dotPill(m.label, m.hue);
    pill.classList.add('jay-status-pill', 'is-' + (STATUS[s] ? s : 'inbox'));
    return pill;
  }
  function priorityMark(p) {
    const m = PRIORITY[p] || PRIORITY.medium;
    const bars = h('span', { class: ['jay-prio', 'is-' + p], 'aria-hidden': 'true' });
    for (let i = 1; i <= 3; i += 1) bars.appendChild(h('i', { class: i <= Math.min(3, m.level) ? 'is-on' : '' }));
    return h('span', { class: 'jay-prio-wrap', title: m.label + ' priority' }, p === 'urgent' ? icon('flag', 13, 'jay-prio-flag') : bars, h('span', { class: 'jay-prio-label' }, m.label));
  }
  function dueNode(t) {
    if (!t.due) return h('span', { class: 'jay-due is-none' }, '—');
    const st = t.status === 'done' ? 'done' : fmt.dueState(t.due);
    return h('span', { class: ['jay-due', 'is-' + st], title: new Date(t.due).toLocaleString() }, st === 'overdue' ? icon('alert-triangle', 12) : null, fmt.due(t.due));
  }
  function projectTag(t) {
    if (!t.project) return h('span', { class: 'jay-muted' }, '—');
    return h('span', { class: 'jay-proj-tag' }, h('span', { class: 'jay-tone-dot', style: { background: 'var(--jay-tone-' + t.project.tone + ')' }, 'aria-hidden': 'true' }), t.project.title);
  }
  function checkToggle(t, onToggle) {
    const done = t.status === 'done';
    return h('button', {
      type: 'button', class: ['jay-check', done ? 'is-done' : ''], role: 'checkbox', 'aria-checked': done ? 'true' : 'false',
      'aria-label': (done ? 'Mark not done: ' : 'Mark done: ') + t.title,
      onclick: (e) => { e.stopPropagation(); (onToggle || toggleDone)(t); },
    }, icon('check', 12));
  }

  function titleCase(s) { const x = String(s || ''); return x.charAt(0).toUpperCase() + x.slice(1); }
  function tagItems(t, opts) {
    const o = opts || {};
    const list = [];
    if (o.project !== false && t.project) list.push({ label: t.project.title, hue: TONE_HUE[t.project.tone] || 'neutral' });
    (t.tags || []).forEach((tg) => list.push({ label: titleCase(tg), hue: UI.tagHue(tg) }));
    return list;
  }
  function tagsCell(t) {
    const list = tagItems(t);
    return UI.tags(list, { max: list.length > 2 ? 1 : 2 });
  }
  function progressOf(t) {
    if (t.status === 'done') return 100;
    if (Number.isFinite(t.progress)) return t.progress;
    return STATUS_PROGRESS[t.status] || 0;
  }
  function lastEventOf(t) {
    const ev = t.lastEvent && t.lastEvent.at ? t.lastEvent : null;
    if (ev && (!t.updatedAt || new Date(ev.at) >= new Date(t.updatedAt) - 60000)) return ev;
    return { at: t.updatedAt || t.createdAt || new Date().toISOString(), label: ev ? 'Edited' : 'Created' };
  }
  function watchersOf(t) {
    const ids = Array.isArray(t.watchers) && t.watchers.length ? t.watchers : [t.assignee || 'pat'];
    return Array.from(new Set(ids)).map(personOf);
  }
  function countsNode(t, cls) {
    const c = Number(t.comments) || 0;
    const a = Number(t.attachments) || 0;
    if (!c && !a) return null;
    return h('span', { class: ['jay-tcounts', cls || ''] },
      c ? h('span', { class: 'jay-tcount', title: fmt.plural(c, 'comment') }, icon('comment', 12), h('span', null, String(c)), h('span', { class: 'jay-sr-only' }, c === 1 ? ' comment' : ' comments')) : null,
      a ? h('span', { class: 'jay-tcount', title: fmt.plural(a, 'attachment') }, icon('paperclip', 12), h('span', null, String(a)), h('span', { class: 'jay-sr-only' }, a === 1 ? ' attachment' : ' attachments')) : null);
  }
  function lastEventNode(t) {
    const ev = lastEventOf(t);
    return h('span', { class: 'jay-lastev', title: new Date(ev.at).toLocaleString() },
      icon('calendar', 14),
      h('span', { class: 'jay-lastev-date' }, fmt.dateShort(ev.at)),
      h('span', { class: 'jay-lastev-sep', 'aria-hidden': 'true' }),
      h('span', { class: 'jay-lastev-label' }, ev.label));
  }

  /* ── Mutations ──────────────────────────────────────────────────────── */
  async function toggleDone(t) {
    const makeDone = t.status !== 'done';
    try {
      await JAY.data.completeTask(t.id, makeDone);
      if (makeDone) UI.toast('Completed: ' + t.title, { icon: 'check', action: { label: 'Undo', run: () => JAY.data.completeTask(t.id, false) } });
    } catch (_) { UI.toast('Couldn’t update the task.', { tone: 'danger', icon: 'alert-circle' }); }
  }
  // "Done" goes through completeTask so linked attention items resolve and the
  // previous status is kept for undo; every other move is a plain update.
  function setStatus(id, status) {
    return status === 'done' ? JAY.data.completeTask(id, true) : JAY.data.updateTask(id, { status });
  }
  async function moveTask(t, status) {
    if (!STATUS[status] || t.status === status) return;
    try {
      await setStatus(t.id, status);
      UI.toast('Moved to ' + STATUS[status].label, { icon: STATUS[status].icon });
    } catch (_) { UI.toast('Couldn’t move the task.', { tone: 'danger', icon: 'alert-circle' }); }
  }
  // Delete with an honest undo: the task comes back as a fresh copy.
  const RESTORE_FIELDS = ['checklist', 'progress', 'activity', 'comments', 'attachments', 'lastEvent', 'watchers'];
  async function restoreTasks(snapshots) {
    for (const s of snapshots) {
      const nt = await JAY.data.createTask({ title: s.title, projectId: s.projectId, status: s.status, priority: s.priority, due: s.due, assignee: s.assignee, tags: s.tags, description: s.description, source: s.source });
      const extra = {};
      RESTORE_FIELDS.forEach((k) => { if (s[k] !== undefined) extra[k] = s[k]; });
      if (Object.keys(extra).length) await JAY.data.updateTask(nt.id, extra);
    }
  }
  async function deleteTasks(list) {
    const snaps = list.map((t) => JSON.parse(JSON.stringify(t)));
    try {
      for (const t of list) await JAY.data.deleteTask(t.id);
      UI.toast(list.length === 1 ? 'Task deleted' : 'Deleted ' + fmt.plural(list.length, 'task'), {
        icon: 'trash',
        action: { label: 'Undo', run: () => restoreTasks(snaps).catch(() => UI.toast('Couldn’t restore.', { tone: 'danger', icon: 'alert-circle' })) },
      });
    } catch (_) { UI.toast('Couldn’t delete.', { tone: 'danger', icon: 'alert-circle' }); }
  }
  function taskMenu(anchor, t, opts) {
    const o = opts || {};
    const done = t.status === 'done';
    UI.menu(anchor, [
      { label: 'Open', icon: 'expand', run: () => openTask(t.id) },
      { label: done ? 'Reopen' : 'Mark done', icon: done ? 'refresh' : 'check', run: () => toggleDone(t) },
      '-',
      ...(o.columns || DEFAULT_COLUMNS).filter((c) => !c.statuses.includes(t.status)).map((c) => ({
        label: 'Move to ' + c.label, icon: STATUS[c.statuses[0]] ? STATUS[c.statuses[0]].icon : 'arrow-right', run: () => moveTask(t, c.statuses[0]),
      })),
      '-',
      { label: 'Delete', icon: 'trash', tone: 'danger', run: () => deleteTasks([t]) },
    ], { label: 'Task actions: ' + t.title, align: 'right' });
  }

  /* ── Task drawer (create / edit) ────────────────────────────────────── */
  function prop(label, iconName, control) {
    const id = JAY.nextId('tf');
    control.id = id;
    return h('div', { class: 'jay-tprop' },
      h('label', { for: id, class: 'jay-tprop-k' }, icon(iconName, 15), h('span', null, label)),
      h('div', { class: 'jay-tprop-v' }, control));
  }
  function select(options, value) {
    return h('select', { class: 'jay-input' }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  }

  async function openTaskForm(task, prefill, opts) {
    const o = opts || {};
    const isNew = !task;
    const t = Object.assign({ title: '', projectId: 'personal', status: 'inbox', priority: 'medium', due: null, assignee: 'pat', tags: [], description: '', checklist: [] }, prefill || {}, task || {});
    let projects = [];
    try { projects = await JAY.data.getProjects(); } catch (_) { projects = []; }
    if (!Array.isArray(projects)) projects = [];
    await loadPeople();

    const title = h('input', { class: 'jay-input jay-tform-title', type: 'text', value: t.title, placeholder: 'Task title', required: true, autocomplete: 'off', 'aria-label': 'Task title' });
    const status = select(STATUS_KEYS.map((k) => [k, STATUS[k].label]), t.status);
    const projectOpts = projects.map((p) => [p.id, p.title]);
    if (!projectOpts.some(([v]) => v === t.projectId)) projectOpts.unshift([t.projectId, t.project ? t.project.title : 'Personal']);
    const project = select(projectOpts, t.projectId);
    const due = h('input', { class: 'jay-input', type: 'date', value: t.due ? fmt.isoDate(t.due) : '' });
    const owners = Array.from(people.values()).map((p) => [p.id, p.id === 'pat' ? p.name + ' (you)' : p.name]);
    const assignee = select(owners, t.assignee);
    const tags = h('input', { class: 'jay-input', type: 'text', value: (t.tags || []).join(', '), placeholder: 'e.g. client, finance', autocomplete: 'off' });
    const desc = h('textarea', { class: 'jay-input', id: JAY.nextId('tf'), rows: '4', placeholder: 'Notes, context, links…' }, t.description || '');
    let priority = PRIORITY[t.priority] ? t.priority : 'medium';
    const prioGroup = h('div', { class: 'jay-segmented is-full', role: 'radiogroup', 'aria-label': 'Priority' },
      PRIORITY_KEYS.slice().reverse().map((k) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': k === priority ? 'true' : 'false', class: k === priority ? 'is-active' : '',
        onclick: (e) => {
          priority = k;
          prioGroup.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        },
      }, PRIORITY[k].label)));

    // Subtasks: saved instantly on an existing task, collected for a new one.
    const checklist = (t.checklist || []).map((c) => ({ text: String(c.text || ''), done: !!c.done }));
    const clList = h('ul', { class: 'jay-tcl', 'aria-label': 'Subtasks' });
    const clCount = h('span', { class: 'jay-tform-sec-n' });
    const clMeter = h('span', { class: 'jay-tform-sec-meter' });
    const clInput = h('input', { class: 'jay-input jay-tcl-input', type: 'text', placeholder: 'Add a subtask', autocomplete: 'off', 'aria-label': 'New subtask' });
    function clProgress() { return checklist.length ? Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100) : null; }
    async function persistChecklist() {
      if (isNew) return;
      const p = clProgress();
      const patch = { checklist: checklist.map((c) => ({ text: c.text, done: c.done })) };
      if (p !== null) patch.progress = p;
      try { await JAY.data.updateTask(t.id, patch); } catch (_) { UI.toast('Couldn’t save the subtask.', { tone: 'danger', icon: 'alert-circle' }); }
    }
    function drawChecklist() {
      const done = checklist.filter((c) => c.done).length;
      clCount.textContent = checklist.length ? done + '/' + checklist.length : '';
      mount(clMeter, checklist.length ? UI.meter(clProgress(), { segments: 10, label: 'Subtasks done' }) : null);
      mount(clList, checklist.map((c, i) => h('li', { class: ['jay-tcl-item', c.done ? 'is-done' : ''] },
        h('button', {
          type: 'button', class: 'jay-tcl-box', role: 'checkbox', 'aria-checked': c.done ? 'true' : 'false', 'aria-label': c.text,
          onclick: () => { c.done = !c.done; drawChecklist(); persistChecklist(); },
        }, icon('check', 11)),
        h('span', { class: 'jay-tcl-text' }, c.text),
        h('button', { type: 'button', class: 'jay-icon-btn is-sm jay-tcl-del', 'aria-label': 'Remove subtask: ' + c.text, onclick: () => { checklist.splice(i, 1); drawChecklist(); persistChecklist(); } }, icon('x', 14)))));
    }
    function addSubtask() {
      const v = clInput.value.trim();
      if (!v) { clInput.focus(); return; }
      checklist.push({ text: v, done: false });
      clInput.value = '';
      drawChecklist();
      persistChecklist();
      clInput.focus();
    }
    clInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } });
    drawChecklist();

    const form = h('form', { class: 'jay-form jay-tform', onsubmit: (e) => { e.preventDefault(); save(); } },
      title,
      h('div', { class: 'jay-tprops' },
        prop('Status', 'circle-dashed', status),
        prop('Project', 'projects', project),
        prop('Due date', 'calendar', due),
        prop('Owner', 'user', assignee),
        h('div', { class: 'jay-tprop' }, h('span', { class: 'jay-tprop-k' }, icon('flag', 15), h('span', null, 'Priority')), h('div', { class: 'jay-tprop-v' }, prioGroup)),
        prop('Tags', 'tag', tags)),
      h('section', { class: 'jay-tform-sec', 'aria-label': 'Subtasks' },
        h('div', { class: 'jay-tform-sec-head' }, h('span', { class: 'jay-tform-sec-title' }, 'Subtasks'), clCount, clMeter),
        clList,
        h('div', { class: 'jay-tcl-add' }, clInput,
          h('button', { type: 'button', class: 'jay-btn is-inset is-sm', onclick: addSubtask }, icon('plus', 14), 'Add Subtask'))),
      h('section', { class: 'jay-tform-sec' },
        h('label', { class: 'jay-tform-sec-head', for: desc.id }, h('span', { class: 'jay-tform-sec-title' }, 'Description')),
        desc),
      isNew
        ? h('div', { class: 'jay-tip' }, icon('chat', 16), h('div', null, h('strong', null, 'Faster: just tell Jay. '), '“Add a task to renew the domain by Friday.”'),
          h('button', { type: 'button', class: 'jay-link', onclick: () => { panel.close(); if (JAY.home && JAY.home.goTalk) JAY.home.goTalk({ intent: 'task' }); } }, 'Tell Jay'))
        : h('div', { class: 'jay-tform-meta' },
          h('div', { class: 'jay-tform-people' }, UI.avatarStack(watchersOf(t), { max: 4, size: 'md' }),
            h('span', { class: 'jay-tform-people-text' }, fmt.plural(watchersOf(t).length, 'watcher')), countsNode(t, 'is-lg')),
          h('dl', { class: 'jay-dl is-meta' },
            h('dt', null, 'Created'), h('dd', null, t.createdAt ? fmt.dateFull(t.createdAt) : '—'),
            h('dt', null, 'Last update'), h('dd', null, lastEventNode(t)),
            t.source === 'jay' ? [h('dt', null, 'Source'), h('dd', null, 'Created by Jay')] : null)));

    async function save() {
      const value = title.value.trim();
      if (!value) { title.focus(); title.setAttribute('aria-invalid', 'true'); return; }
      const payload = {
        title: value, status: status.value, projectId: project.value, priority,
        due: due.value ? new Date(due.value + 'T12:00:00').toISOString() : null, assignee: assignee.value,
        tags: tags.value.split(',').map((s) => s.trim()).filter(Boolean), description: desc.value.trim(),
      };
      try {
        if (isNew) {
          const nt = await JAY.data.createTask(payload);
          if (checklist.length && nt && nt.id) await JAY.data.updateTask(nt.id, { checklist, progress: clProgress() });
          UI.toast('Task added: ' + value, { icon: 'check' });
        } else {
          await JAY.data.updateTask(t.id, payload);
          UI.toast('Saved', { icon: 'check' });
        }
        panel.close();
      } catch (_) { UI.toast('Couldn’t save the task.', { tone: 'danger', icon: 'alert-circle' }); }
    }

    const footer = [
      !isNew ? h('button', { type: 'button', class: 'jay-btn is-ghost is-danger', onclick: () => { panel.close(); deleteTasks([t]); } }, icon('trash', 15), 'Delete') : null,
      h('span', { class: 'jay-spacer' }),
      !isNew ? h('button', { type: 'button', class: 'jay-btn is-outline', onclick: async () => { await toggleDone(t); panel.close(); } }, icon(t.status === 'done' ? 'refresh' : 'check', 15), t.status === 'done' ? 'Reopen' : 'Complete') : null,
      h('button', { type: 'button', class: 'jay-btn is-primary', onclick: save }, isNew ? icon('plus', 15) : null, isNew ? 'Add Task' : 'Save'),
    ];
    const panel = UI.openPanel({
      eyebrow: isNew ? 'New task' : (t.project ? t.project.title : 'Task'),
      title: isNew ? 'Add a task' : t.title,
      body: form, footer,
      initialFocus: o.focus === 'subtask' ? '.jay-tcl-input' : (isNew ? '.jay-tform-title' : null),
    });
    panel.el.classList.add('jay-tdrawer');
    return panel;
  }

  async function openTask(id, opts) {
    let t = null;
    try { t = await JAY.data.getTask(id); } catch (_) { t = null; }
    if (!t || t.__state) { UI.toast('That task no longer exists.', { icon: 'alert-circle' }); return null; }
    return openTaskForm(t, null, opts);
  }
  function openCreate(prefill) { return openTaskForm(null, prefill); }

  /* ── Board (Deepsleep kanban) — shared with Projects ────────────────── */
  function boardCard(t, o, columns) {
    const done = t.status === 'done';
    const list = Array.isArray(t.checklist) ? t.checklist : [];
    const maxItems = o.compact ? 2 : 4;
    const kebab = h('button', {
      type: 'button', class: 'jay-icon-btn is-sm jay-kcard-more', 'aria-label': 'Actions for ' + t.title, 'aria-haspopup': 'menu',
      onclick: (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t, { columns }); },
    }, icon('more-vertical', 16));
    const tagList = tagItems(t, { project: o.showProject !== false });
    const card = h('article', {
      class: ['jay-kcard', done ? 'is-done' : ''], draggable: 'true', tabindex: '0', 'data-id': t.id,
      'aria-label': t.title + ', ' + (STATUS[t.status] ? STATUS[t.status].label : t.status),
      onclick: () => openTask(t.id),
      onkeydown: (e) => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTask(t.id); } },
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging'); },
      ondragend: () => card.classList.remove('is-dragging'),
    },
    h('div', { class: 'jay-kcard-top' }, tagList.length ? UI.tags(tagList, { solid: true, max: 3 }) : h('span', { class: 'jay-kcard-status' }, statusPill(t.status)), kebab),
    h('h3', { class: 'jay-kcard-title' }, t.title),
    !o.compact && t.description ? h('p', { class: 'jay-kcard-desc' }, t.description) : null,
    list.length ? h('ul', { class: 'jay-kcl', 'aria-label': 'Subtasks, ' + list.filter((c) => c.done).length + ' of ' + list.length + ' done' },
      list.slice(0, maxItems).map((c) => h('li', { class: c.done ? 'is-done' : '' }, h('i', { 'aria-hidden': 'true' }), h('span', null, c.text))),
      list.length > maxItems ? h('li', { class: 'is-more' }, '+' + (list.length - maxItems) + ' more') : null) : null,
    !o.compact && !done && list.length ? h('button', {
      type: 'button', class: 'jay-btn is-inset is-sm jay-kcard-sub',
      onclick: (e) => { e.stopPropagation(); openTask(t.id, { focus: 'subtask' }); },
    }, icon('plus', 14), 'Add Subtask') : null,
    h('div', { class: 'jay-kcard-foot' },
      UI.avatarStack(watchersOf(t), { max: 3, size: 'md' }),
      h('span', { class: 'jay-spacer' }),
      o.compact ? dueNode(t) : null,
      countsNode(t)));
    return card;
  }

  function renderBoard(tasks, opts) {
    const o = opts || {};
    const columns = Array.isArray(o.columns) && o.columns.length ? o.columns : DEFAULT_COLUMNS;
    const list = Array.isArray(tasks) ? tasks : [];
    if (!peopleLoad) loadPeople();
    const board = h('div', { class: ['jay-board', o.compact ? 'is-compact' : ''], role: 'list', 'aria-label': o.label || 'Board' });
    columns.forEach((col) => {
      const statuses = Array.isArray(col.statuses) && col.statuses.length ? col.statuses : [col.id];
      const items = list.filter((t) => statuses.includes(t.status));
      const add = () => (typeof o.onAdd === 'function' ? o.onAdd(col) : openCreate({ status: statuses[0] }));
      const colMenu = (anchor) => UI.menu(anchor, [
        { label: 'Add task', icon: 'plus', run: add },
        !statuses.includes('done') && items.length ? {
          label: 'Mark all as done', icon: 'check', run: async () => {
            const ids = items.map((t) => t.id);
            try {
              for (const id of ids) await JAY.data.completeTask(id, true);
              UI.toast('Completed ' + fmt.plural(ids.length, 'task'), { icon: 'check', action: { label: 'Undo', run: async () => { for (const id of ids) await JAY.data.completeTask(id, false); } } });
            } catch (_) { UI.toast('Couldn’t update the tasks.', { tone: 'danger', icon: 'alert-circle' }); }
          },
        } : null,
      ], { label: col.label + ' column', align: 'right' });
      const section = h('section', { class: 'jay-kcol', role: 'listitem', 'aria-label': col.label + ', ' + fmt.plural(items.length, 'task'), 'data-col': col.id },
        h('header', { class: 'jay-kcol-head' },
          h('span', { class: ['jay-kcol-mark', 'is-' + (col.hue || 'neutral')], 'aria-hidden': 'true' }),
          h('h3', { class: 'jay-kcol-label' }, col.label),
          UI.badge(items.length),
          h('button', { type: 'button', class: 'jay-icon-btn is-sm jay-kcol-more', 'aria-label': col.label + ' column actions', 'aria-haspopup': 'menu', onclick: (e) => colMenu(e.currentTarget) }, icon('more-vertical', 16))),
        h('button', { type: 'button', class: 'jay-kcol-add', 'aria-label': 'Add task to ' + col.label, onclick: add }, icon('plus', 15), h('span', null, o.addLabel || 'Add Task')),
        h('div', { class: 'jay-kcol-body' }, items.length ? items.map((t) => boardCard(t, o, columns)) : h('div', { class: 'jay-kcol-empty' }, 'Drop tasks here')));
      section.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; section.classList.add('is-over'); });
      section.addEventListener('dragleave', (e) => { if (!section.contains(e.relatedTarget)) section.classList.remove('is-over'); });
      section.addEventListener('drop', async (e) => {
        e.preventDefault();
        section.classList.remove('is-over');
        const id = e.dataTransfer.getData('text/plain');
        const t = list.find((x) => x.id === id);
        if (!id || (t && statuses.includes(t.status))) return;
        try {
          await setStatus(id, statuses[0]);
          UI.toast('Moved to ' + col.label, { icon: STATUS[statuses[0]] ? STATUS[statuses[0]].icon : 'check' });
          if (typeof o.onMove === 'function') o.onMove(id, col);
        } catch (_) { UI.toast('Couldn’t move the task.', { tone: 'danger', icon: 'alert-circle' }); }
      });
      board.appendChild(section);
    });
    return board;
  }

  /* ── Tasks view ────────────────────────────────────────────────────── */
  function render(root, params) {
    const p = params || {};
    const ui = Object.assign({ view: 'list', sort: 'due' }, JAY.storage.get('tasks-ui', {}));
    if (p.view === 'list' || p.view === 'board') ui.view = p.view;
    if (ui.view !== 'board') ui.view = 'list';
    const f = {
      q: '',
      status: p.status || 'open',
      projectId: p.project || 'all',
      due: p.due || 'any',
      owner: p.owner || 'any',
      sort: SORT_OPTIONS.some(([k]) => k === p.sort) ? p.sort : (SORT_OPTIONS.some(([k]) => k === ui.sort) ? ui.sort : 'due'),
    };
    const selected = new Set();
    let tasks = [];
    let counts = null;
    let projects = [];
    let loaded = false;
    let disposed = false;
    function saveUi() { JAY.storage.set('tasks-ui', { view: ui.view, sort: f.sort }); }
    function currentView() { return VIEWS.find((v) => v.status === f.status && v.due === f.due) || null; }
    function projectById(id) { return projects.find((x) => x.id === id) || null; }

    /* Side tree: views + projects + "Add New Task". Rebuilt only when the
       project list changes; counts and active states are patched in place. */
    let side = h('aside', { class: 'jay-box jay-side', 'aria-label': 'Task views' });
    let sideProjectsKey = null;
    let sideSearch = null;
    function buildSide() {
      const nav = UI.sideNav({
        label: 'Task views',
        search: { placeholder: 'Search task', onInput: (v) => setQuery(v, 'side') },
        sections: [
          { id: 'views', title: 'Views', items: VIEWS.map((v) => ({ id: 'view:' + v.id, label: v.label, icon: v.icon, run: () => applyView(v.id) })) },
          { id: 'projects', title: 'Projects', items: projects.map((pr) => ({ id: 'project:' + pr.id, label: pr.title, dot: 'tone-' + pr.tone, run: () => applyProject(f.projectId === pr.id ? 'all' : pr.id) })) },
        ],
        footer: { label: 'Add New Task', icon: 'plus', run: () => openCreate(f.projectId !== 'all' ? { projectId: f.projectId } : null) },
      });
      sideSearch = nav.querySelector('input');
      if (sideSearch) sideSearch.value = f.q;
      side.replaceWith(nav);
      side = nav;
      sideProjectsKey = projects.map((x) => x.id + ':' + x.title + ':' + x.tone).join('|');
      syncSide();
    }
    function setBadge(btn, n, opts) {
      if (!btn) return;
      const old = btn.querySelector('.jay-badge');
      const next = n === null || n === undefined ? null : UI.badge(n, opts);
      if (old && next) old.replaceWith(next);
      else if (old) old.remove();
      else if (next) btn.appendChild(next);
    }
    function syncSide() {
      const view = currentView();
      side.querySelectorAll('.jay-side-item').forEach((b) => {
        const key = b.dataset.side || '';
        const on = key === 'view:' + (view ? view.id : '') || key === 'project:' + f.projectId;
        b.classList.toggle('is-active', on);
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      VIEWS.forEach((v) => {
        const n = counts ? Number(counts[v.count]) || 0 : null;
        setBadge(side.querySelector('[data-side="view:' + v.id + '"]'), n, v.tone && n ? { tone: v.tone } : null);
      });
      projects.forEach((pr) => setBadge(side.querySelector('[data-side="project:' + pr.id + '"]'), Number(pr.openTasks) || 0, { accent: true }));
    }

    /* Main panel: tabs · toolbar (or bulk bar) · phone view chips · body · calc bar */
    const tabs = UI.tabs([
      { id: 'list', label: 'List', icon: 'list', badge: 0, badgeAccent: false },
      { id: 'board', label: 'Board', icon: 'board', badge: 0, badgeAccent: false },
    ], { active: ui.view, label: 'Layout', onSelect: (id) => { ui.view = id; saveUi(); syncTabs(); draw(); } });
    function syncTabs() {
      tabs.querySelectorAll('.jay-tab').forEach((b) => {
        const badge = b.querySelector('.jay-badge');
        if (!badge) return;
        badge.textContent = String(tasks.length);
        badge.hidden = !loaded;
        badge.classList.toggle('is-accent', b.dataset.tab === ui.view);
      });
    }
    const clearBtn = h('button', { type: 'button', class: 'jay-link jay-tclear', hidden: true, onclick: clearFilters }, icon('x', 13), 'Clear filters');
    const newBtnSm = h('button', { type: 'button', class: 'jay-btn is-primary is-sm jay-tnew-sm', onclick: () => openCreate(prefillFromFilters()) }, icon('plus', 15), h('span', null, 'New Task'));
    const exportNote = () => UI.toast('Export is not available in the preview', { icon: 'download' });
    const exportSm = h('button', { type: 'button', class: 'jay-btn is-outline is-sm is-icon jay-texport-sm', 'aria-label': 'Export', onclick: exportNote }, icon('download', 15));

    const pills = {
      sort: UI.fpill({ key: 'Sort by', value: 'Due date', onClick: (a) => UI.menu(a, SORT_OPTIONS.map(([k, l]) => ({ label: l, active: f.sort === k, icon: f.sort === k ? 'check' : null, run: () => { f.sort = k; saveUi(); reload(); } })), { label: 'Sort by' }) }),
      project: UI.fpill({ key: 'Project', value: 'All', onClick: (a) => UI.menu(a, [{ label: 'All projects', active: f.projectId === 'all', icon: f.projectId === 'all' ? 'check' : null, run: () => applyProject('all') }, '-']
        .concat(projects.map((pr) => ({ label: pr.title, active: f.projectId === pr.id, icon: f.projectId === pr.id ? 'check' : null, hint: String(pr.openTasks || 0), run: () => applyProject(pr.id) }))), { label: 'Project' }) }),
      due: UI.fpill({ key: 'Due', value: 'Any', onClick: (a) => UI.menu(a, DUE_OPTIONS.map(([k, l]) => ({ label: l, active: f.due === k, icon: f.due === k ? 'check' : null, run: () => { f.due = k; reload(); } })), { label: 'Due' }) }),
      owner: UI.fpill({ key: 'Owner', value: 'Anyone', onClick: (a) => UI.menu(a, [{ label: 'Anyone', active: f.owner === 'any', icon: f.owner === 'any' ? 'check' : null, run: () => { f.owner = 'any'; reload(); } }, '-']
        .concat(Array.from(people.values()).map((pe) => ({ label: pe.id === 'pat' ? pe.name + ' (you)' : pe.name, active: f.owner === pe.id, icon: f.owner === pe.id ? 'check' : null, run: () => { f.owner = pe.id; reload(); } }))), { label: 'Owner' }) }),
    };
    function syncPills() {
      const s = SORT_OPTIONS.find(([k]) => k === f.sort);
      pills.sort.setValue(s ? s[1] : 'Due date', false);
      const pr = projectById(f.projectId);
      pills.project.setValue(f.projectId === 'all' ? 'All' : (pr ? pr.title : f.projectId), f.projectId !== 'all');
      const d = DUE_OPTIONS.find(([k]) => k === f.due);
      pills.due.setValue(d ? d[1] : 'Any', f.due !== 'any');
      pills.owner.setValue(f.owner === 'any' ? 'Anyone' : personOf(f.owner).name, f.owner !== 'any');
    }

    const search = h('input', { class: 'jay-input is-search', type: 'search', placeholder: 'Search tasks', 'aria-label': 'Search tasks', autocomplete: 'off' });
    let qTimer = null;
    function setQuery(v, from) {
      if (from !== 'side' && sideSearch) sideSearch.value = v;
      if (from !== 'toolbar') search.value = v;
      clearTimeout(qTimer);
      qTimer = setTimeout(() => { f.q = v; reload(); }, 140);
    }
    search.addEventListener('input', () => setQuery(search.value, 'toolbar'));

    const toolbar = h('div', { class: 'jay-ttoolbar', role: 'toolbar', 'aria-label': 'Filters' },
      h('div', { class: 'jay-search jay-tsearch' }, icon('search', 15), search),
      h('div', { class: 'jay-tpills jay-hscroll' }, pills.sort, pills.project, pills.due, pills.owner),
      h('span', { class: 'jay-spacer' }),
      h('button', { type: 'button', class: 'jay-btn is-outline jay-texport', onclick: exportNote }, icon('download', 15), 'Export'),
      h('button', { type: 'button', class: 'jay-btn is-primary jay-tnew', onclick: () => openCreate(prefillFromFilters()) }, icon('plus', 16), 'New Task'));
    const bulkBar = h('div', { class: 'jay-bulkbar', hidden: true, role: 'region', 'aria-label': 'Bulk actions' });

    const chips = h('div', { class: 'jay-tchips jay-hscroll', role: 'group', 'aria-label': 'Task views' },
      VIEWS.map((v) => h('button', { type: 'button', class: 'jay-tchip', 'data-view': v.id, 'aria-pressed': 'false', onclick: () => applyView(v.id) },
        h('span', null, v.label), h('span', { class: 'jay-tchip-n', 'data-n': v.count }))));
    function syncChips() {
      const view = currentView();
      chips.querySelectorAll('.jay-tchip').forEach((b) => {
        const on = !!view && b.dataset.view === view.id;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        const n = b.querySelector('.jay-tchip-n');
        const val = counts ? Number(counts[n.dataset.n]) || 0 : '';
        n.textContent = String(val);
        b.classList.toggle('is-alert', b.dataset.view === 'overdue' && !!val);
      });
    }

    const body = h('div', { class: 'jay-tbody' });
    const calc = h('div', { class: 'jay-calcbar', role: 'status', 'aria-live': 'polite' });
    const main = UI.box({ class: ['is-col', 'jay-tmain'], 'aria-label': 'Tasks' },
      h('div', { class: 'jay-ttabs' }, tabs, h('span', { class: 'jay-spacer' }), clearBtn, exportSm, newBtnSm),
      chips,
      toolbar,
      bulkBar,
      body,
      calc);
    const layout = h('div', { class: 'jay-layout has-side is-fill jay-tasks' }, side, main);
    mount(root, layout);
    syncPills();
    syncChips();

    function prefillFromFilters() {
      const pre = {};
      if (f.projectId !== 'all') pre.projectId = f.projectId;
      if (STATUS[f.status]) pre.status = f.status;
      if (f.owner !== 'any') pre.assignee = f.owner;
      return Object.keys(pre).length ? pre : null;
    }
    function applyView(id) {
      const v = VIEWS.find((x) => x.id === id);
      if (!v) return;
      f.status = v.status;
      f.due = v.due;
      reload();
    }
    function applyProject(id) { f.projectId = id; reload(); }
    function filtersOn() { return !!f.q || f.status !== 'open' || f.projectId !== 'all' || f.due !== 'any' || f.owner !== 'any'; }
    function clearFilters() {
      f.q = ''; search.value = ''; if (sideSearch) sideSearch.value = '';
      f.status = 'open'; f.projectId = 'all'; f.due = 'any'; f.owner = 'any';
      reload();
    }

    function syncHeader() {
      if (!counts || !JAY.shell || typeof JAY.shell.setHeader !== 'function') return;
      const view = currentView();
      const pr = projectById(f.projectId);
      const crumbs = [(view ? view.label : 'Filtered') + (pr ? ' · ' + pr.title : '')];
      crumbs.push(fmt.plural(Number(counts.today) || 0, 'task') + ' due today');
      if (counts.overdue) crumbs.push({ label: counts.overdue + ' overdue', tone: 'danger', run: () => applyView('overdue') });
      JAY.shell.setHeader({ route: 'tasks', title: 'Tasks', pill: { label: (Number(counts.open) || 0) + ' open', hue: 'green' }, crumbs });
    }

    /* Selection + bulk bar (swaps in for the toolbar so the layout never jumps) */
    function selectedTasks() { return tasks.filter((t) => selected.has(t.id)); }
    function updateBulk() {
      const n = selected.size;
      bulkBar.hidden = n === 0;
      toolbar.hidden = n > 0;
      const head = body.querySelector('.jay-ttable thead .jay-tcb');
      if (head) {
        head.checked = n > 0 && tasks.length > 0 && tasks.every((t) => selected.has(t.id));
        head.indeterminate = n > 0 && !head.checked;
      }
      if (!n) { mount(bulkBar); return; }
      mount(bulkBar,
        h('span', { class: 'jay-bulk-n' }, h('strong', null, String(n)), ' selected'),
        h('button', { type: 'button', class: 'jay-btn is-sm is-outline', onclick: async () => {
          const list = selectedTasks().filter((t) => t.status !== 'done');
          selected.clear();
          try {
            for (const t of list) await JAY.data.completeTask(t.id, true);
            UI.toast('Completed ' + fmt.plural(list.length, 'task'), { icon: 'check', action: { label: 'Undo', run: async () => { for (const t of list) await JAY.data.completeTask(t.id, false); } } });
          } catch (_) { UI.toast('Couldn’t update the tasks.', { tone: 'danger', icon: 'alert-circle' }); }
          updateBulk();
        } }, icon('check', 14), 'Mark done'),
        h('button', { type: 'button', class: 'jay-btn is-sm is-outline', 'aria-haspopup': 'menu', onclick: (e) => UI.menu(e.currentTarget, STATUS_KEYS.map((k) => ({
          label: STATUS[k].label, icon: STATUS[k].icon, run: async () => {
            const ids = Array.from(selected);
            selected.clear();
            try {
              for (const id of ids) await setStatus(id, k);
              UI.toast('Moved ' + fmt.plural(ids.length, 'task') + ' to ' + STATUS[k].label, { icon: STATUS[k].icon });
            } catch (_) { UI.toast('Couldn’t move the tasks.', { tone: 'danger', icon: 'alert-circle' }); }
            updateBulk();
          },
        })), { label: 'Move to' }) }, 'Move to', icon('chevron-down', 14)),
        h('button', { type: 'button', class: 'jay-btn is-sm is-ghost is-danger', onclick: () => { const list = selectedTasks(); selected.clear(); updateBulk(); deleteTasks(list); } }, icon('trash', 14), 'Delete'),
        h('span', { class: 'jay-spacer' }),
        h('button', { type: 'button', class: 'jay-btn is-sm is-ghost', onclick: () => { selected.clear(); draw(); } }, icon('x', 14), 'Clear selection'));
    }

    /* List: CRM-style table */
    function sortTh(label, key, cls) {
      const on = f.sort === key;
      return h('th', { scope: 'col', class: cls, 'aria-sort': on ? (key === 'updated' ? 'descending' : 'ascending') : null },
        h('button', { type: 'button', class: ['jay-th-btn', on ? 'is-active' : ''], onclick: () => { f.sort = key; saveUi(); reload(); } },
          label, icon(on ? 'chevron-down' : 'sort', 12)));
    }
    function tableView(list) {
      const headCheck = h('input', { type: 'checkbox', class: 'jay-cb jay-tcb', 'aria-label': 'Select all tasks in view',
        onchange: (e) => { list.forEach((t) => (e.target.checked ? selected.add(t.id) : selected.delete(t.id))); draw(); } });
      const rows = list.map((t) => {
        const done = t.status === 'done';
        const tr = h('tr', { class: ['jay-tr', done ? 'is-done' : '', selected.has(t.id) ? 'is-selected' : ''], 'data-id': t.id, onclick: () => openTask(t.id) });
        const cb = h('input', { type: 'checkbox', class: 'jay-cb jay-tcb', 'aria-label': 'Select ' + t.title, checked: selected.has(t.id),
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => { if (e.target.checked) selected.add(t.id); else selected.delete(t.id); tr.classList.toggle('is-selected', e.target.checked); updateBulk(); } });
        const ownerName = t.assigneeName || personOf(t.assignee).name;
        mount(tr,
          h('td', { class: 'c-sel', onclick: (e) => { e.stopPropagation(); if (e.target !== cb) cb.click(); } }, cb),
          h('td', { class: 'c-done' }, checkToggle(t)),
          h('td', { class: 'c-task' }, h('div', { class: 'jay-tcell-task' },
            h('button', { type: 'button', class: 'jay-row-title', title: t.title, onclick: (e) => { e.stopPropagation(); openTask(t.id); } }, t.title),
            countsNode(t))),
          h('td', { class: 'c-tags' }, tagsCell(t)),
          h('td', { class: 'c-owner' }, h('span', { class: 'jay-who', title: ownerName }, UI.avatar(ownerName, { id: t.assignee, size: 'sm', decorative: true }), h('span', null, ownerName.split(' ')[0]))),
          h('td', { class: 'c-status' }, statusPill(t.status)),
          h('td', { class: 'c-progress' }, UI.meter(progressOf(t), { label: 'Progress' })),
          h('td', { class: 'c-activity' }, UI.spark(Array.isArray(t.activity) && t.activity.length ? t.activity : new Array(14).fill(0), { label: 'Activity, last 14 days' })),
          h('td', { class: 'c-last' }, lastEventNode(t)),
          h('td', { class: 'c-due' }, dueNode(t)),
          h('td', { class: 'c-more' }, h('button', {
            type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Actions for ' + t.title, 'aria-haspopup': 'menu',
            onclick: (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t); },
          }, icon('more-vertical', 16))));
        return tr;
      });
      const table = h('table', { class: 'jay-ttable' },
        h('caption', { class: 'jay-sr-only' }, 'Tasks, ' + fmt.plural(list.length, 'row')),
        h('thead', null, h('tr', null,
          h('th', { class: 'c-sel', scope: 'col' }, headCheck),
          h('th', { class: 'c-done', scope: 'col' }, h('span', { class: 'jay-sr-only' }, 'Done')),
          sortTh('Task', 'title', 'c-task'),
          h('th', { class: 'c-tags', scope: 'col' }, 'Project & tags'),
          h('th', { class: 'c-owner', scope: 'col' }, 'Owner'),
          sortTh('Status', 'status', 'c-status'),
          h('th', { class: 'c-progress', scope: 'col' }, 'Progress'),
          h('th', { class: 'c-activity', scope: 'col' }, 'Activity'),
          sortTh('Last update', 'updated', 'c-last'),
          sortTh('Due', 'due', 'c-due'),
          h('th', { class: 'c-more', scope: 'col' }, h('span', { class: 'jay-sr-only' }, 'Actions')))),
        h('tbody', null, rows));
      return table;
    }

    /* Phones: compact cards */
    function mobileList(list) {
      return h('ul', { class: 'jay-mlist', 'aria-label': 'Tasks' }, list.map((t) => {
        const owner = personOf(t.assignee);
        return h('li', { class: ['jay-mcard', t.status === 'done' ? 'is-done' : ''] },
          checkToggle(t),
          h('button', { type: 'button', class: 'jay-mcard-main', onclick: () => openTask(t.id) },
            h('span', { class: 'jay-mcard-title' }, t.title),
            h('span', { class: 'jay-mcard-tags' }, tagsCell(t)),
            h('span', { class: 'jay-mcard-foot' }, UI.meter(progressOf(t), { label: 'Progress' }), h('span', { class: 'jay-spacer' }), dueNode(t))),
          UI.avatar(t.assigneeName || owner.name, { id: t.assignee, size: 'md' }));
      }));
    }

    function boardColumns() {
      if (f.status === 'all') return DEFAULT_COLUMNS;
      if (f.status === 'open') return DEFAULT_COLUMNS.filter((c) => c.id !== 'done');
      return DEFAULT_COLUMNS.filter((c) => c.id === f.status);
    }

    function drawCalc() {
      const now = new Date();
      const inWeek = tasks.filter((t) => t.status !== 'done' && t.due && (() => { const st = fmt.dueState(t.due, now); return st === 'today' || st === 'soon'; })()).length;
      const avg = tasks.length ? Math.round(tasks.reduce((s, t) => s + progressOf(t), 0) / tasks.length) : 0;
      mount(calc,
        h('div', { class: 'jay-calc-cell' }, h('strong', null, String(tasks.length)), h('span', null, tasks.length === 1 ? 'task in view' : 'tasks in view')),
        h('div', { class: 'jay-calc-cell' }, icon('calendar', 13), h('span', null, 'Due this week'), h('strong', null, String(inWeek))),
        h('div', { class: 'jay-calc-cell' }, icon('percent', 13), h('span', null, 'Avg progress'), h('strong', null, avg + '%')),
        h('button', { type: 'button', class: 'jay-calc-cell is-add', onclick: () => UI.toast('Custom calculations are not available in the preview', { icon: 'sum' }) }, icon('plus', 13), h('span', null, 'Add calculation')));
    }

    function draw() {
      if (disposed) return;
      clearBtn.hidden = !filtersOn();
      layout.classList.toggle('is-board', ui.view === 'board');
      syncTabs();
      body.classList.remove('is-busy');
      const sx = resetScroll ? 0 : body.scrollLeft;
      const sy = resetScroll ? 0 : body.scrollTop;
      resetScroll = false;
      if (!loaded) return;
      if (!tasks.length) {
        mount(body, UI.state('empty', filtersOn()
          ? { icon: 'search', title: 'No tasks match these filters.', action: { label: 'Clear filters', run: clearFilters } }
          : { icon: 'check', title: 'Nothing on your list.', text: 'Tell Jay what needs doing, or add a task.', action: { label: 'New Task', icon: 'plus', run: () => openCreate() } }));
      } else if (ui.view === 'board') {
        mount(body, renderBoard(tasks, { columns: boardColumns(), onAdd: (col) => openCreate(Object.assign({}, prefillFromFilters() || {}, { status: col.statuses[0] })), label: 'Task board' }));
      } else {
        mount(body, JAY.isMobile() ? mobileList(tasks) : tableView(tasks));
      }
      body.scrollLeft = sx;
      body.scrollTop = sy;
      drawCalc();
      updateBulk();
    }

    let seq = 0;
    let resetScroll = false;
    async function reload(quiet) {
      const my = ++seq;
      syncPills();
      syncSide();
      syncChips();
      clearBtn.hidden = !filtersOn();
      if (!quiet) {
        resetScroll = true;
        if (loaded) body.classList.add('is-busy');
        else mount(body, UI.state('loading', { rows: 8 }));
      }
      try {
        const query = { q: f.q, status: f.status, projectId: f.projectId, due: f.due, sort: f.sort };
        const [list, c, ps] = await Promise.all([
          JAY.data.getTasks(query),
          JAY.data.getTaskCounts().catch(() => null),
          JAY.data.getProjects().catch(() => projects),
          loadPeople(),
        ]);
        if (my !== seq || disposed) return;
        if (list && list.__state) {
          loaded = false;
          body.classList.remove('is-busy');
          syncTabs();
          mount(body, UI.state(list.__state));
          mount(calc);
          return;
        }
        projects = Array.isArray(ps) ? ps : [];
        counts = c && !c.__state ? c : null;
        tasks = (Array.isArray(list) ? list : []).filter((t) => f.owner === 'any' || t.assignee === f.owner);
        loaded = true;
        const visible = new Set(tasks.map((t) => t.id));
        Array.from(selected).forEach((id) => { if (!visible.has(id)) selected.delete(id); });
        const key = projects.map((x) => x.id + ':' + x.title + ':' + x.tone).join('|');
        if (key !== sideProjectsKey) buildSide(); else syncSide();
        syncPills();
        syncChips();
        syncHeader();
        draw();
      } catch (err) {
        if (my !== seq || disposed) return;
        loaded = false;
        body.classList.remove('is-busy');
        syncTabs();
        mount(body, UI.state('error', { title: 'Couldn’t load tasks.', action: { label: 'Retry', icon: 'refresh', run: () => reload() } }));
        mount(calc);
      }
    }

    // Coalesce the several data events one mutation emits (tasks + projects).
    let pending = null;
    function scheduleReload() {
      if (pending) return;
      pending = setTimeout(() => { pending = null; reload(true); }, 0);
    }
    buildSide();
    reload();
    const offs = [JAY.on('data:tasks', scheduleReload), JAY.on('data:projects', scheduleReload), JAY.on('data:people', scheduleReload)];
    function onMq() { draw(); }
    JAY.mqMobile.addEventListener('change', onMq);
    return () => {
      disposed = true;
      clearTimeout(qTimer);
      clearTimeout(pending);
      offs.forEach((off) => off());
      JAY.mqMobile.removeEventListener('change', onMq);
    };
  }

  JAY.tasks = { openTask, openCreate, statusPill, priorityMark, dueNode, projectTag, checkToggle, toggleDone, renderBoard, STATUS, VIEWS };
  JAY.views = JAY.views || {};
  JAY.views.tasks = { title: 'Tasks', render };
})();
