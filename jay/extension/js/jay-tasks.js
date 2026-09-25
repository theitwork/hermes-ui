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
  // One table for every screen lives in JAY.ui.toneHue; this is only a fallback.
  const TONE_HUE = { 1: 'lime', 2: 'blue', 3: 'orange', 4: 'yellow', 5: 'purple' };
  function toneHue(tone) { return typeof UI.toneHue === 'function' ? UI.toneHue(tone) : (TONE_HUE[Math.round(Number(tone))] || 'neutral'); }
  function toneClass(tone) { const n = Math.round(Number(tone)); return n >= 1 && n <= 5 ? 'is-tone-' + n : ''; }
  // Kanban drags carry the task id under a private type, so text, links or files
  // dropped from elsewhere never reach setStatus().
  const DRAG_TYPE = 'application/x-jay-task';
  const DEFAULT_DIR = (key) => (key === 'updated' ? 'desc' : 'asc');
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
    // The tone only ever selects a class (1–5); it is never written into a style.
    return h('span', { class: 'jay-proj-tag' }, h('span', { class: ['jay-tone-dot', toneClass(t.project.tone)], 'aria-hidden': 'true' }), t.project.title);
  }
  function checkToggle(t, onToggle) {
    const done = t.status === 'done';
    return h('button', {
      type: 'button', class: ['jay-check', done ? 'is-done' : ''], role: 'checkbox', 'aria-checked': done ? 'true' : 'false',
      'aria-label': (done ? 'Mark not done: ' : 'Mark done: ') + t.title,
      onclick: (e) => { e.stopPropagation(); (onToggle || toggleDone)(t); },
    }, icon('check', 12));
  }

  function titleCase(s) {
    if (typeof fmt.titleCase === 'function') return fmt.titleCase(s);
    const x = String(s || '');
    return x.charAt(0).toUpperCase() + x.slice(1);
  }
  function tagItems(t, opts) {
    const o = opts || {};
    const list = [];
    if (o.project !== false && t.project) list.push({ label: t.project.title, hue: toneHue(t.project.tone) });
    (t.tags || []).forEach((tg) => list.push({ label: titleCase(tg), hue: UI.tagHue(tg) }));
    return list;
  }
  // A long first label ("Business Operations") keeps the row to one tag + "+N".
  function tagMax(list) { return list.length > 1 && String(list[0].label).length > 12 ? 1 : 2; }
  // Table / phone-card tags. A hidden "+N" chip is always appended; the narrow
  // table reveals it when it drops every tag but the first, so extra tags never
  // disappear without a trace (it stays hidden everywhere else).
  function tagsCell(t) {
    const list = tagItems(t);
    const el = UI.tags(list, { max: tagMax(list) });
    if (list.length > 1) el.appendChild(h('span', { class: 'jay-tag is-more is-collapsed', title: list.slice(1).map((x) => x.label).join(', ') }, '+' + (list.length - 1)));
    return el;
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
      else UI.toast('Reopened: ' + t.title, { icon: 'refresh', action: { label: 'Undo', run: () => JAY.data.completeTask(t.id, true) } });
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
  // Delete with an honest undo. When the data layer returns a delete snapshot
  // (the task, its index and the attention items the delete resolved), Undo
  // hands it back to JAY.data.restoreTask so the task returns with the same id
  // and its attention items come back. Otherwise it is re-created as a copy.
  const RESTORE_FIELDS = ['checklist', 'progress', 'activity', 'comments', 'attachments', 'lastEvent', 'watchers'];
  async function restoreTasks(snapshots) {
    // Reverse order, so each saved index is valid again when its task returns.
    for (const snap of snapshots.slice().reverse()) {
      if (snap.provider && typeof JAY.data.restoreTask === 'function') { await JAY.data.restoreTask(snap.provider); continue; }
      const s = snap.copy;
      const nt = await JAY.data.createTask({ title: s.title, projectId: s.projectId, status: s.status, priority: s.priority, due: s.due, assignee: s.assignee, tags: s.tags, description: s.description, source: s.source });
      const extra = {};
      RESTORE_FIELDS.forEach((k) => { if (s[k] !== undefined) extra[k] = s[k]; });
      if (nt && nt.id && Object.keys(extra).length) await JAY.data.updateTask(nt.id, extra);
    }
  }
  async function deleteTasks(list) {
    const snaps = [];
    const undo = () => restoreTasks(snaps).catch(() => UI.toast('Couldn’t restore.', { tone: 'danger', icon: 'alert-circle' }));
    try {
      for (const t of list) {
        const copy = JSON.parse(JSON.stringify(t));
        const res = await JAY.data.deleteTask(t.id);
        snaps.push({ copy, provider: res && typeof res === 'object' && res.task ? res : null });
      }
      UI.toast(list.length === 1 ? 'Task deleted' : 'Deleted ' + fmt.plural(list.length, 'task'), { icon: 'trash', action: { label: 'Undo', run: undo } });
    } catch (_) {
      UI.toast('Couldn’t delete.', { tone: 'danger', icon: 'alert-circle', action: snaps.length ? { label: 'Undo', run: undo } : null });
    }
  }
  function taskMenu(anchor, t, opts) {
    const o = opts || {};
    const done = t.status === 'done';
    UI.menu(anchor, [
      // Completion comes first: the table has no separate done column.
      { label: done ? 'Reopen' : 'Mark done', icon: done ? 'refresh' : 'check', run: () => toggleDone(t) },
      { label: 'Open', icon: 'expand', run: () => openTask(t.id) },
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

  // The Tasks view registers this while it is on screen: when a drawer closes
  // and focus has nowhere useful to return to (the row it came from was
  // redrawn, or it was opened by clicking a plain cell), focus goes to that
  // task's row. Called as drawerFocusHook(taskId, closingPanelElement).
  let drawerFocusHook = null;

  async function openTaskForm(task, prefill, opts) {
    const o = opts || {};
    const isNew = !task;
    const t = Object.assign({ title: '', projectId: 'personal', status: 'inbox', priority: 'medium', due: null, assignee: 'pat', tags: [], description: '', checklist: [] }, prefill || {}, task || {});
    let projects = [];
    try { projects = await JAY.data.getProjects(); } catch (_) { projects = []; }
    if (!Array.isArray(projects)) projects = [];
    await loadPeople();

    const formId = JAY.nextId('tform');
    // The title wraps (a one-row textarea that grows), so a long title reads in
    // full where it doubles as the drawer's heading. It stays one line of text:
    // Enter submits and pasted line breaks become spaces.
    const title = h('textarea', { class: 'jay-input jay-tform-title', rows: '1', placeholder: 'Task title', required: true, autocomplete: 'off', 'aria-label': 'Task title' }, t.title);
    function fitTitle() {
      title.style.height = 'auto';
      if (title.scrollHeight) title.style.height = title.scrollHeight + 'px';
    }
    title.addEventListener('input', () => {
      if (/[\r\n]/.test(title.value)) title.value = title.value.replace(/\s*[\r\n]+\s*/g, ' ');
      if (title.value.trim()) title.removeAttribute('aria-invalid');
      fitTitle();
    });
    title.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit(); else save();
    });
    const status = select(STATUS_KEYS.map((k) => [k, STATUS[k].label]), t.status);
    const projectOpts = projects.map((p) => [p.id, p.title]);
    if (!projectOpts.some(([v]) => v === t.projectId)) projectOpts.unshift([t.projectId, t.project ? t.project.title : 'Personal']);
    const project = select(projectOpts, t.projectId);
    const due = h('input', { class: 'jay-input', type: 'date', value: t.due ? fmt.isoDate(t.due) : '' });
    const owners = Array.from(people.values()).map((p) => [p.id, p.id === 'pat' ? p.name + ' (you)' : p.name]);
    const assignee = select(owners, t.assignee);
    const tags = h('input', { class: 'jay-input', type: 'text', value: (t.tags || []).join(', '), placeholder: 'e.g. client, finance', autocomplete: 'off' });
    const desc = h('textarea', { class: 'jay-input', id: JAY.nextId('tf'), rows: '4', placeholder: 'Notes, context, links…' }, t.description || '');
    const initialPriority = PRIORITY[t.priority] ? t.priority : 'medium';
    let priority = initialPriority;
    const prioOptions = PRIORITY_KEYS.slice().reverse().map((k) => [k, PRIORITY[k].label]);
    // One radio group with a single tab stop and arrow keys (JAY.ui.segmented).
    const prioGroup = typeof UI.segmented === 'function'
      ? UI.segmented(prioOptions, priority, (v) => { priority = v; }, 'Priority', { full: true })
      : h('div', { class: 'jay-segmented is-full', role: 'radiogroup', 'aria-label': 'Priority' },
        prioOptions.map(([k, label]) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': k === priority ? 'true' : 'false', class: k === priority ? 'is-active' : '',
          onclick: (e) => {
            priority = k;
            prioGroup.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
          },
        }, label)));

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

    // novalidate: the title is checked by readForm() (aria-invalid + focus), so
    // Enter in any field submits through onsubmit instead of a native bubble.
    const form = h('form', { id: formId, class: 'jay-form jay-tform', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
      // The wrapper sets the edit-mode heading size; touch devices force inputs
      // to max(16px, 1em), so the size has to come from the parent.
      h('div', { class: 'jay-tform-head' }, title),
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

    // The form's current values, or null (title flagged) when the title is empty.
    function readForm() {
      const value = title.value.trim();
      if (!value) { title.focus(); title.setAttribute('aria-invalid', 'true'); return null; }
      return {
        title: value, status: status.value, projectId: project.value, priority,
        due: due.value ? new Date(due.value + 'T12:00:00').toISOString() : null, assignee: assignee.value,
        tags: tags.value.split(',').map((s) => s.trim()).filter(Boolean), description: desc.value.trim(),
      };
    }
    // Did anything besides status change? (Subtasks are already saved.)
    function edited(p) {
      return p.title !== t.title || p.projectId !== t.projectId || p.priority !== initialPriority
        || (p.due ? fmt.isoDate(p.due) : '') !== (t.due ? fmt.isoDate(t.due) : '')
        || p.assignee !== t.assignee || p.tags.join(',') !== (t.tags || []).join(',')
        || p.description !== String(t.description || '').trim();
    }

    // One in-flight save at a time: double clicks and Enter repeats don't duplicate.
    let busy = false;
    const primaryBtn = h('button', { type: 'submit', form: formId, class: 'jay-btn is-primary' }, isNew ? icon('plus', 15) : null, isNew ? 'Add Task' : 'Save');
    const completeBtn = !isNew ? h('button', { type: 'button', class: 'jay-btn is-outline', onclick: () => completeFromDrawer() },
      icon(t.status === 'done' ? 'refresh' : 'check', 15), t.status === 'done' ? 'Reopen' : 'Complete') : null;
    function setBusy(on) {
      busy = on;
      primaryBtn.disabled = on;
      if (completeBtn) completeBtn.disabled = on;
    }

    async function save() {
      if (busy) return;
      const payload = readForm();
      if (!payload) return;
      setBusy(true);
      try {
        if (isNew) {
          const nt = await JAY.data.createTask(payload);
          if (checklist.length && nt && nt.id) await JAY.data.updateTask(nt.id, { checklist, progress: clProgress() });
          UI.toast('Task added: ' + payload.title, { icon: 'check' });
        } else {
          await JAY.data.updateTask(t.id, payload);
          UI.toast('Saved', { icon: 'check' });
        }
        panel.close();
      } catch (_) {
        setBusy(false);
        UI.toast('Couldn’t save the task.', { tone: 'danger', icon: 'alert-circle' });
      }
    }
    // Complete / Reopen keeps unsaved edits: they are saved first, then the
    // status change goes through completeTask (prevStatus for undo, attention).
    async function completeFromDrawer() {
      if (busy) return;
      const payload = readForm();
      if (!payload) return;
      delete payload.status;
      setBusy(true);
      if (edited(payload)) {
        try { await JAY.data.updateTask(t.id, payload); } catch (_) {
          setBusy(false);
          UI.toast('Couldn’t save the task.', { tone: 'danger', icon: 'alert-circle' });
          return;
        }
      }
      await toggleDone(Object.assign({}, t, payload));
      panel.close();
    }

    const footer = [
      !isNew ? h('button', { type: 'button', class: 'jay-btn is-ghost is-danger', onclick: () => { panel.close(); deleteTasks([t]); } }, icon('trash', 15), 'Delete') : null,
      h('span', { class: 'jay-spacer' }),
      completeBtn,
      primaryBtn,
    ];
    const panel = UI.openPanel({
      eyebrow: isNew ? 'New task' : (t.project ? t.project.title : 'Task'),
      title: isNew ? 'Add a task' : t.title,
      body: form, footer,
      initialFocus: o.focus === 'subtask' ? '.jay-tcl-input' : (isNew ? '.jay-tform-title' : null),
      onClose: () => { if (!isNew && typeof drawerFocusHook === 'function') drawerFocusHook(t.id, panel ? panel.el : null); },
    });
    // Edit mode: the title field is the visible heading (the h2 stays for
    // aria-labelledby but is visually hidden), so the title isn't shown twice.
    panel.el.classList.add('jay-tdrawer');
    if (!isNew) panel.el.classList.add('is-edit');
    fitTitle();
    requestAnimationFrame(fitTitle);
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
  // The card itself is a plain (draggable, clickable) article; the title is the
  // real button, so the card's other buttons are never nested in a button.
  function boardCard(t, o, columns, col) {
    const done = t.status === 'done';
    const list = Array.isArray(t.checklist) ? t.checklist : [];
    const maxItems = o.compact ? 2 : 4;
    const statusLabel = STATUS[t.status] ? STATUS[t.status].label : String(t.status || '');
    const statusId = JAY.nextId('kst');
    const kebab = h('button', {
      type: 'button', class: 'jay-icon-btn is-sm jay-kcard-more', 'aria-label': 'Actions for ' + t.title, 'aria-haspopup': 'menu',
      onclick: (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t, { columns }); },
    }, icon('more-vertical', 16));
    const tagList = tagItems(t, { project: o.showProject !== false });
    // Untagged cards show a status pill only when it says something the column
    // doesn't: never the column's own first status, never Inbox/Next under "New".
    const colStatuses = col && Array.isArray(col.statuses) && col.statuses.length ? col.statuses : [t.status];
    const quietNew = colStatuses.includes('inbox') && (t.status === 'inbox' || t.status === 'next');
    const showStatus = !tagList.length && t.status !== colStatuses[0] && !quietNew;
    const card = h('article', {
      class: ['jay-kcard', done ? 'is-done' : ''], draggable: 'true', 'data-id': t.id,
      onclick: () => openTask(t.id),
      ondragstart: (e) => { e.dataTransfer.setData(DRAG_TYPE, t.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging'); },
      ondragend: () => card.classList.remove('is-dragging'),
    },
    h('div', { class: ['jay-kcard-top', !tagList.length && !showStatus ? 'is-bare' : ''] },
      tagList.length ? UI.tags(tagList, { solid: true, max: tagMax(tagList) }) : (showStatus ? h('span', { class: 'jay-kcard-status' }, statusPill(t.status)) : null),
      kebab),
    h('h3', { class: 'jay-kcard-title' }, h('button', {
      type: 'button', class: 'jay-kcard-open', 'aria-describedby': statusId,
      onclick: (e) => { e.stopPropagation(); openTask(t.id); },
    }, t.title)),
    h('span', { class: 'jay-sr-only', id: statusId }, statusLabel),
    !o.compact && t.description ? h('p', { class: 'jay-kcard-desc' }, t.description) : null,
    list.length ? h('ul', { class: 'jay-kcl', 'aria-label': 'Subtasks, ' + list.filter((c) => c.done).length + ' of ' + list.length + ' done' },
      list.slice(0, maxItems).map((c) => h('li', { class: c.done ? 'is-done' : '' }, h('i', { 'aria-hidden': 'true' }), h('span', null, c.text, c.done ? h('span', { class: 'jay-sr-only' }, ', done') : null))),
      list.length > maxItems ? h('li', { class: 'is-more' }, '+' + (list.length - maxItems) + ' more') : null) : null,
    !o.compact && !done && list.length ? h('button', {
      type: 'button', class: 'jay-btn is-inset is-sm jay-kcard-sub', 'aria-label': 'Add subtask to ' + t.title,
      onclick: (e) => { e.stopPropagation(); openTask(t.id, { focus: 'subtask' }); },
    }, icon('plus', 14), 'Add Subtask') : null,
    // Deepsleep footer: two faces + "+N", counts pushed right (no spacer, so it
    // fits a 200px column).
    h('div', { class: 'jay-kcard-foot' },
      UI.avatarStack(watchersOf(t), { max: 2, size: 'md' }),
      o.compact ? dueNode(t) : null,
      countsNode(t)));
    return card;
  }
  function isTaskDrag(e) {
    const types = e.dataTransfer && e.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, DRAG_TYPE) >= 0;
  }

  function renderBoard(tasks, opts) {
    const o = opts || {};
    const columns = Array.isArray(o.columns) && o.columns.length ? o.columns : DEFAULT_COLUMNS;
    const list = Array.isArray(tasks) ? tasks : [];
    if (!peopleLoad) loadPeople();
    // --jay-kcols gives the Tasks board one explicit track per column, so the
    // columns share the panel width evenly (see jay-tasks.css).
    const board = h('div', { class: ['jay-board', o.compact ? 'is-compact' : ''], role: 'list', 'aria-label': o.label || 'Board', style: { '--jay-kcols': String(columns.length) } });
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
      const colDef = Object.assign({}, col, { statuses });
      const section = h('section', { class: 'jay-kcol', role: 'listitem', 'aria-label': col.label + ', ' + fmt.plural(items.length, 'task'), 'data-col': col.id },
        h('header', { class: 'jay-kcol-head' },
          h('span', { class: ['jay-kcol-mark', 'is-' + (col.hue || 'neutral')], 'aria-hidden': 'true' }),
          h('h3', { class: 'jay-kcol-label' }, col.label),
          UI.badge(items.length),
          h('button', { type: 'button', class: 'jay-icon-btn is-sm jay-kcol-more', 'aria-label': col.label + ' column actions', 'aria-haspopup': 'menu', onclick: (e) => colMenu(e.currentTarget) }, icon('more-vertical', 16))),
        h('button', { type: 'button', class: 'jay-kcol-add', 'aria-label': 'Add task to ' + col.label, onclick: add }, icon('plus', 15), h('span', null, o.addLabel || 'Add Task')),
        h('div', { class: 'jay-kcol-body' }, items.length ? items.map((t) => boardCard(t, o, columns, colDef)) : h('div', { class: 'jay-kcol-empty' }, 'Drop tasks here')));
      // Only JAY task drags are accepted, and only for tasks on this board.
      section.addEventListener('dragover', (e) => {
        if (!isTaskDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        section.classList.add('is-over');
      });
      section.addEventListener('dragleave', (e) => { if (!section.contains(e.relatedTarget)) section.classList.remove('is-over'); });
      section.addEventListener('drop', async (e) => {
        section.classList.remove('is-over');
        if (!isTaskDrag(e)) return;
        e.preventDefault();
        const id = e.dataTransfer.getData(DRAG_TYPE);
        const t = list.find((x) => x.id === id);
        if (!t || statuses.includes(t.status)) return;
        try {
          await setStatus(t.id, statuses[0]);
          UI.toast('Moved to ' + col.label, { icon: STATUS[statuses[0]] ? STATUS[statuses[0]].icon : 'check' });
          if (typeof o.onMove === 'function') o.onMove(t.id, col);
        } catch (_) { UI.toast('Couldn’t move the task.', { tone: 'danger', icon: 'alert-circle' }); }
      });
      board.appendChild(section);
    });
    return board;
  }

  /* ── Tasks view ────────────────────────────────────────────────────── */
  function cssEsc(s) {
    return window.CSS && typeof window.CSS.escape === 'function' ? window.CSS.escape(String(s)) : String(s).replace(/[^\w-]/g, '\\$&');
  }
  // Controls whose focus survives a redraw (same control, same task — or the
  // task that took its place when it left the view).
  const FOCUS_KEYS = ['jay-tcb', 'jay-row-title', 'jay-row-more', 'jay-th-btn', 'jay-check', 'jay-mcard-main', 'jay-kcard-open', 'jay-kcard-more', 'jay-kcard-sub', 'jay-kcol-more', 'jay-kcol-add'];
  const ITEM_FOCUS = '.jay-row-title, .jay-mcard-main, .jay-kcard-open';

  function render(root, params) {
    const p = params || {};
    const ui = Object.assign({ view: 'list', sort: 'due' }, JAY.storage.get('tasks-ui', {}));
    if (p.view === 'list' || p.view === 'board') ui.view = p.view;
    if (ui.view !== 'board') ui.view = 'list';
    const validSort = (k) => SORT_OPTIONS.some(([x]) => x === k);
    const validDir = (d) => d === 'asc' || d === 'desc';
    const sort = validSort(p.sort) ? p.sort : (validSort(ui.sort) ? ui.sort : 'due');
    const f = {
      q: '',
      status: p.status || 'open',
      projectId: p.project || 'all',
      due: p.due || 'any',
      owner: p.owner || 'any',
      sort,
      // Sort direction: clicking the active column header flips it.
      dir: validDir(p.dir) ? p.dir : (validDir(ui.dir) && ui.sort === sort ? ui.dir : DEFAULT_DIR(sort)),
    };
    const selected = new Set();
    let tasks = [];
    let counts = null;
    let projects = [];
    let loaded = false;
    let disposed = false;
    let pendingFocus = null;
    function saveUi() { JAY.storage.set('tasks-ui', { view: ui.view, sort: f.sort, dir: f.dir }); }
    function setSort(key, dir) { f.sort = key; f.dir = validDir(dir) ? dir : DEFAULT_DIR(key); saveUi(); reload(); }
    function currentView() { return VIEWS.find((v) => v.status === f.status && v.due === f.due) || null; }
    function projectById(id) { return projects.find((x) => x.id === id) || null; }
    // The layout is part of the address, so Reload and Back show the one chosen.
    function writeViewUrl() {
      const shell = JAY.shell;
      const cur = Object.assign({}, shell && shell.state && shell.state.route === 'tasks' && shell.state.params ? shell.state.params : p, { view: ui.view });
      if (shell && typeof shell.replaceParams === 'function') { shell.replaceParams('tasks', cur); return; }
      try {
        const q = new URLSearchParams((location.hash.split('?')[1]) || '');
        q.set('view', ui.view);
        history.replaceState(history.state, '', '#/tasks?' + q.toString());
      } catch (_) { /* ignore */ }
    }

    /* Side tree: views + projects + "Add New Task". Rebuilt only when the
       project list changes; counts and active states are patched in place.
       Items are looked up by their data-side key in a Map, never by building a
       selector from an id. */
    let side = h('aside', { class: 'jay-box jay-side', 'aria-label': 'Task views' });
    let sideItems = new Map();
    let sideProjectsKey = null;
    let sideSearch = null;
    function buildSide() {
      const nav = UI.sideNav({
        label: 'Task views',
        navLabel: 'Views and projects',
        search: { placeholder: 'Search task', onInput: (v) => setQuery(v, 'side') },
        sections: [
          { id: 'views', title: 'Views', items: VIEWS.map((v) => ({ id: 'view:' + v.id, label: v.label, icon: v.icon, run: () => applyView(v.id) })) },
          { id: 'projects', title: 'Projects', items: projects.map((pr) => ({ id: 'project:' + pr.id, label: pr.title, dot: toneClass(pr.tone) ? 'tone-' + Math.round(Number(pr.tone)) : 'neutral', run: () => applyProject(f.projectId === pr.id ? 'all' : pr.id) })) },
        ],
        footer: { label: 'Add New Task', icon: 'plus', run: () => openCreate(f.projectId !== 'all' ? { projectId: f.projectId } : null) },
      });
      sideSearch = nav.querySelector('input');
      if (sideSearch) sideSearch.value = f.q;
      side.replaceWith(nav);
      side = nav;
      sideItems = new Map(Array.from(nav.querySelectorAll('.jay-side-item')).map((b) => [b.dataset.side || '', b]));
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
      sideItems.forEach((b, key) => {
        const on = key === 'view:' + (view ? view.id : '') || key === 'project:' + f.projectId;
        b.classList.toggle('is-active', on);
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      VIEWS.forEach((v) => {
        const n = counts ? Number(counts[v.count]) || 0 : null;
        setBadge(sideItems.get('view:' + v.id), n, v.tone && n ? { tone: v.tone } : null);
      });
      projects.forEach((pr) => setBadge(sideItems.get('project:' + pr.id), Number(pr.openTasks) || 0, { accent: true }));
    }

    /* Main panel: tabs · (phone filter + view chips) · toolbar (or bulk bar) · body · calc bar.
       The tabs carry no counts: the total already sits in the header pill, the
       side tree and the calc bar. */
    const tabs = UI.tabs([
      { id: 'list', label: 'List', icon: 'list' },
      { id: 'board', label: 'Board', icon: 'board' },
    ], { active: ui.view, label: 'Layout', onSelect: (id) => { ui.view = id; saveUi(); writeViewUrl(); draw(); } });
    const clearBtn = h('button', { type: 'button', class: 'jay-link jay-tclear', hidden: true, onclick: clearFilters }, icon('x', 13), 'Clear filters');
    const newBtnSm = h('button', { type: 'button', class: 'jay-btn is-primary is-sm jay-tnew-sm', onclick: () => openCreate(prefillFromFilters()) }, icon('plus', 15), h('span', null, 'New Task'));
    const exportNote = () => UI.toast('Export is not available in the preview', { icon: 'download' });
    const exportSm = h('button', { type: 'button', class: 'jay-btn is-outline is-sm is-icon jay-texport-sm', 'aria-label': 'Export', onclick: exportNote }, icon('download', 15));

    const pills = {
      sort: UI.fpill({ key: 'Sort by', value: 'Due date', onClick: (a) => UI.menu(a, SORT_OPTIONS.map(([k, l]) => ({ label: l, active: f.sort === k, icon: f.sort === k ? 'check' : null, run: () => setSort(k, f.sort === k ? f.dir : null) })), { label: 'Sort by' }) }),
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

    /* Phones: one "Filter · Sort" pill (opens a sheet) replaces the four pills,
       and search collapses to an icon that opens the search row in place. */
    const filterBadge = h('span', { class: 'jay-badge is-accent', hidden: true });
    const filterSr = h('span', { class: 'jay-sr-only' });
    const filterBtn = h('button', { type: 'button', class: 'jay-fpill jay-tfilter', 'aria-haspopup': 'dialog', onclick: () => openFilterSheet() },
      icon('sliders', 14), h('span', { class: 'jay-fpill-v' }, 'Filter · Sort'), filterBadge, filterSr);
    function syncFilterBtn() {
      const n = (f.projectId !== 'all' ? 1 : 0) + (f.due !== 'any' ? 1 : 0) + (f.owner !== 'any' ? 1 : 0);
      filterBadge.textContent = String(n);
      filterBadge.hidden = !n;
      filterSr.textContent = n ? ' filters on' : '';
      filterBtn.classList.toggle('is-active', n > 0);
    }
    function openFilterSheet() {
      const sortSel = select(SORT_OPTIONS, f.sort);
      const dirSel = select([['asc', 'Ascending'], ['desc', 'Descending']], f.dir);
      const projSel = select([['all', 'All projects']].concat(projects.map((pr) => [pr.id, pr.title])), f.projectId);
      const dueSel = select(DUE_OPTIONS, f.due);
      const ownerSel = select([['any', 'Anyone']].concat(Array.from(people.values()).map((pe) => [pe.id, pe.id === 'pat' ? pe.name + ' (you)' : pe.name])), f.owner);
      sortSel.addEventListener('change', () => { setSort(sortSel.value); dirSel.value = f.dir; });
      dirSel.addEventListener('change', () => setSort(f.sort, dirSel.value));
      projSel.addEventListener('change', () => applyProject(projSel.value));
      dueSel.addEventListener('change', () => { f.due = dueSel.value; reload(); });
      ownerSel.addEventListener('change', () => { f.owner = ownerSel.value; reload(); });
      const reset = () => {
        f.projectId = 'all'; f.due = 'any'; f.owner = 'any';
        projSel.value = 'all'; dueSel.value = 'any'; ownerSel.value = 'any';
        reload();
      };
      const sheet = UI.openPanel({
        eyebrow: 'Tasks',
        title: 'Filter & sort',
        body: h('div', { class: 'jay-form jay-tfilter-form' }, h('div', { class: 'jay-tprops' },
          prop('Sort by', 'sort', sortSel),
          prop('Order', 'chevron-up', dirSel),
          prop('Project', 'projects', projSel),
          prop('Due', 'calendar', dueSel),
          prop('Owner', 'user', ownerSel))),
        footer: [
          h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: reset }, icon('x', 15), 'Reset filters'),
          h('span', { class: 'jay-spacer' }),
          h('button', { type: 'button', class: 'jay-btn is-primary', onclick: () => sheet.close() }, 'Done'),
        ],
      });
      sheet.el.classList.add('jay-tfilter-sheet');
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

    const toolbar = h('div', { class: 'jay-ttoolbar', role: 'toolbar', 'aria-label': 'Filters', id: JAY.nextId('ttoolbar') },
      h('div', { class: 'jay-search jay-tsearch' }, icon('search', 15), search),
      h('div', { class: 'jay-tpills jay-hscroll' }, pills.sort, pills.project, pills.due, pills.owner),
      h('span', { class: 'jay-spacer' }),
      h('button', { type: 'button', class: 'jay-btn is-outline jay-texport', onclick: exportNote }, icon('download', 15), 'Export'),
      h('button', { type: 'button', class: 'jay-btn is-primary jay-tnew', onclick: () => openCreate(prefillFromFilters()) }, icon('plus', 16), 'New Task'));
    const bulkBar = h('div', { class: 'jay-bulkbar', hidden: true, role: 'region', 'aria-label': 'Bulk actions' });

    let searchOpen = false;
    const searchToggle = h('button', {
      type: 'button', class: 'jay-icon-btn jay-tsearch-toggle', 'aria-label': 'Search tasks', 'aria-expanded': 'false', 'aria-controls': toolbar.id,
      onclick: () => setSearchOpen(!searchOpen),
    }, icon('search', 18));
    function setSearchOpen(on) {
      searchOpen = on;
      main.classList.toggle('is-searching', on);
      searchToggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      searchToggle.classList.toggle('is-active', on);
      if (on) search.focus();
      else if (search.value || f.q) setQuery('', 'close'); // closing never leaves a hidden filter behind
    }
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchOpen && JAY.isMobile()) { e.preventDefault(); setSearchOpen(false); searchToggle.focus(); }
    });

    const chips = h('div', { class: 'jay-tchips jay-hscroll', role: 'group', 'aria-label': 'Task views' },
      VIEWS.map((v) => h('button', { type: 'button', class: 'jay-tchip', 'data-view': v.id, 'aria-pressed': 'false', onclick: () => applyView(v.id) },
        h('span', null, v.label), h('span', { class: 'jay-tchip-n', 'data-n': v.count }))));
    const chipsRow = h('div', { class: 'jay-tchips-row' }, filterBtn, chips);
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
    if (typeof tabs.bindPanel === 'function') tabs.bindPanel(body);
    const calc = h('div', { class: 'jay-calcbar', role: 'status', 'aria-live': 'polite' });
    const main = UI.box({ class: ['is-col', 'jay-tmain'], 'aria-label': 'Tasks' },
      h('div', { class: 'jay-ttabs' }, tabs, h('span', { class: 'jay-spacer' }), clearBtn, exportSm, searchToggle, newBtnSm),
      chipsRow,
      toolbar,
      bulkBar,
      body,
      calc);
    const layout = h('div', { class: 'jay-layout has-side is-fill jay-tasks' }, side, main);
    mount(root, layout);
    syncPills();
    syncChips();
    syncFilterBtn();

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

    /* Focus that survives redraws. A redraw replaces the rows, so a focused
       control would drop to <body>: it goes back to the same control of the
       same task, or of the task now in that place (completed rows leave the
       view), or to the column's Add button / the empty state's action. */
    function captureFocus() {
      const ae = document.activeElement;
      if (!ae || ae === document.body || ae === body || !body.contains(ae)) return null;
      const key = FOCUS_KEYS.find((k) => ae.classList.contains(k)) || null;
      const item = ae.closest('[data-id]');
      const col = ae.closest('.jay-kcol');
      const th = ae.closest('thead th');
      return {
        key,
        id: item ? item.dataset.id : null,
        idx: item && item.parentElement ? Array.prototype.indexOf.call(item.parentElement.children, item) : -1,
        col: col ? col.dataset.col : null,
        head: th ? th.classList[0] || null : null,
      };
    }
    function markFocus(id, key) {
      const item = id ? body.querySelector('[data-id="' + cssEsc(id) + '"]') : null;
      pendingFocus = { key, id, idx: item && item.parentElement ? Array.prototype.indexOf.call(item.parentElement.children, item) : 0, col: null, head: null, at: Date.now() };
    }
    function focusLost() { const ae = document.activeElement; return !ae || ae === document.body || ae === document.documentElement; }
    function restoreFocus(s) {
      if (typeof UI.hasOpenPanel === 'function' && UI.hasOpenPanel()) return;
      const visible = (el) => !!el && el.getClientRects().length > 0;
      const inItem = (item) => (item ? (s.key && item.querySelector('.' + s.key)) || item.querySelector(ITEM_FOCUS) : null);
      const colEl = s.col ? body.querySelector('.jay-kcol[data-col="' + cssEsc(s.col) + '"]') : null;
      let target = null;
      if (s.head) target = body.querySelector('thead th.' + cssEsc(s.head) + ' .' + (s.key || 'jay-th-btn'));
      else if (s.id) {
        const scope = colEl ? colEl.querySelector('.jay-kcol-body') : body.querySelector('tbody, .jay-mlist');
        const items = scope ? Array.from(scope.children).filter((x) => x.dataset && x.dataset.id) : [];
        const same = items.find((x) => x.dataset.id === s.id);
        target = inItem(same || items[Math.min(Math.max(s.idx, 0), items.length - 1)]);
        if (!target && colEl) target = colEl.querySelector('.jay-kcol-add');
      } else if (colEl && s.key) target = colEl.querySelector('.' + s.key);
      if (!target) target = body.querySelector('.jay-state button') || body.querySelector('.jay-kcol-add');
      if (!visible(target)) {
        target = [side.querySelector('.jay-side-item.is-active'), chips.querySelector('.jay-tchip.is-active'), tabs.querySelector('.jay-tab.is-active')].find(visible) || null;
      }
      if (target) target.focus({ preventScroll: false });
    }
    // An open drawer returns focus to this view's row for its task when the
    // element it came from is gone (see openTaskForm).
    // Only when focus is stranded: still on the closing panel (removed after
    // its animation), on <body>, or on a container (the view, the scroll area
    // the row was clicked in) rather than a control.
    const focusTask = (id, panelEl) => {
      if (disposed || !layout.isConnected) return;
      const ae = document.activeElement;
      const control = ae && ae !== document.body && ae.matches('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
      if (control && !(panelEl && panelEl.contains(ae))) return;
      const item = body.querySelector('[data-id="' + cssEsc(id) + '"]');
      const target = item ? item.querySelector(ITEM_FOCUS) : null;
      if (target) target.focus({ preventScroll: true });
    };
    drawerFocusHook = focusTask;

    /* Selection + bulk bar (swaps in for the toolbar so the layout never jumps) */
    function selectedTasks() { return tasks.filter((t) => selected.has(t.id)); }
    function markBulkFocus() {
      const first = tasks.find((t) => selected.has(t.id));
      markFocus(first ? first.id : null, 'jay-tcb');
    }
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
      const sel = selectedTasks();
      const open = sel.filter((t) => t.status !== 'done');
      // All selected tasks already done → the button reopens them instead.
      const reopen = sel.length > 0 && open.length === 0;
      mount(bulkBar,
        h('span', { class: 'jay-bulk-n' }, h('strong', null, String(n)), ' selected'),
        h('button', { type: 'button', class: 'jay-btn is-sm is-outline', onclick: async () => {
          const list = reopen ? sel : open;
          markBulkFocus();
          selected.clear();
          try {
            for (const t of list) await JAY.data.completeTask(t.id, !reopen);
            if (!list.length) UI.toast('Already done', { icon: 'check' });
            else if (reopen) UI.toast('Reopened ' + fmt.plural(list.length, 'task'), { icon: 'refresh', action: { label: 'Undo', run: async () => { for (const t of list) await JAY.data.completeTask(t.id, true); } } });
            else UI.toast('Completed ' + fmt.plural(list.length, 'task'), { icon: 'check', action: { label: 'Undo', run: async () => { for (const t of list) await JAY.data.completeTask(t.id, false); } } });
          } catch (_) { UI.toast('Couldn’t update the tasks.', { tone: 'danger', icon: 'alert-circle' }); }
          updateBulk();
        } }, icon(reopen ? 'refresh' : 'check', 14), reopen ? 'Reopen' : 'Mark done'),
        h('button', { type: 'button', class: 'jay-btn is-sm is-outline', 'aria-haspopup': 'menu', onclick: (e) => UI.menu(e.currentTarget, STATUS_KEYS.map((k) => ({
          label: STATUS[k].label, icon: STATUS[k].icon, run: async () => {
            const ids = Array.from(selected);
            markBulkFocus();
            selected.clear();
            try {
              for (const id of ids) await setStatus(id, k);
              UI.toast('Moved ' + fmt.plural(ids.length, 'task') + ' to ' + STATUS[k].label, { icon: STATUS[k].icon });
            } catch (_) { UI.toast('Couldn’t move the tasks.', { tone: 'danger', icon: 'alert-circle' }); }
            updateBulk();
          },
        })), { label: 'Move to' }) }, 'Move to', icon('chevron-down', 14)),
        h('button', { type: 'button', class: 'jay-btn is-sm is-ghost is-danger', onclick: () => { const list = selectedTasks(); markBulkFocus(); selected.clear(); updateBulk(); deleteTasks(list); } }, icon('trash', 14), 'Delete'),
        h('span', { class: 'jay-spacer' }),
        h('button', { type: 'button', class: 'jay-btn is-sm is-ghost', onclick: () => { markBulkFocus(); selected.clear(); draw(); } }, icon('x', 14), 'Clear selection'));
    }

    /* List: CRM-style table */
    function sortTh(label, key, cls) {
      const on = f.sort === key;
      return h('th', { scope: 'col', class: cls, 'aria-sort': on ? (f.dir === 'desc' ? 'descending' : 'ascending') : null },
        h('button', { type: 'button', class: ['jay-th-btn', on ? 'is-active' : ''], onclick: () => setSort(key, on ? (f.dir === 'asc' ? 'desc' : 'asc') : null) },
          label, icon(on ? (f.dir === 'desc' ? 'chevron-down' : 'chevron-up') : 'sort', 12)));
    }
    function tableView(list) {
      const headCheck = h('input', { type: 'checkbox', class: 'jay-cb jay-tcb', 'aria-label': 'Select all tasks in view',
        onchange: (e) => { list.forEach((t) => (e.target.checked ? selected.add(t.id) : selected.delete(t.id))); draw(); } });
      const rows = list.map((t) => {
        const done = t.status === 'done';
        // The whole row opens the task (a large touch target); its own
        // controls (select box, title, actions) handle their clicks first.
        const tr = h('tr', {
          class: ['jay-tr', done ? 'is-done' : '', selected.has(t.id) ? 'is-selected' : ''], 'data-id': t.id,
          onclick: (e) => { if (e.target.closest && e.target.closest('button, a, input, select, .c-sel')) return; openTask(t.id); },
        });
        const cb = h('input', { type: 'checkbox', class: 'jay-cb jay-tcb', 'aria-label': 'Select ' + t.title, checked: selected.has(t.id),
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => { if (e.target.checked) selected.add(t.id); else selected.delete(t.id); tr.classList.toggle('is-selected', e.target.checked); updateBulk(); } });
        const ownerName = t.assigneeName || personOf(t.assignee).name;
        const activity = Array.isArray(t.activity) && t.activity.length ? t.activity : new Array(14).fill(0);
        const updates = activity.reduce((s, n) => s + Math.max(0, Number(n) || 0), 0);
        mount(tr,
          h('td', { class: 'c-sel', onclick: (e) => { e.stopPropagation(); if (e.target !== cb) cb.click(); } }, cb),
          // The task title is the row header, so moving down any column
          // announces which task the cell belongs to.
          h('th', { scope: 'row', class: 'c-task' }, h('div', { class: 'jay-tcell-task' },
            h('button', { type: 'button', class: 'jay-row-title', title: t.title, onclick: (e) => { e.stopPropagation(); openTask(t.id); } }, t.title),
            countsNode(t))),
          h('td', { class: 'c-tags' }, tagsCell(t)),
          h('td', { class: 'c-owner' }, h('span', { class: 'jay-who', title: ownerName }, UI.avatar(ownerName, { id: t.assignee, size: 'sm', decorative: true }), h('span', null, ownerName.split(' ')[0]))),
          h('td', { class: 'c-status' }, statusPill(t.status)),
          h('td', { class: 'c-progress' }, UI.meter(progressOf(t), { label: t.title + ' progress' })),
          h('td', { class: 'c-activity' }, UI.spark(activity, { label: 'Activity, last ' + activity.length + ' days: ' + fmt.plural(updates, 'update') })),
          h('td', { class: 'c-last' }, lastEventNode(t)),
          h('td', { class: 'c-due' }, dueNode(t)),
          h('td', { class: 'c-more' }, h('button', {
            type: 'button', class: 'jay-icon-btn is-sm jay-row-more', 'aria-label': 'Actions for ' + t.title, 'aria-haspopup': 'menu',
            onclick: (e) => { e.stopPropagation(); taskMenu(e.currentTarget, t); },
          }, icon('more-vertical', 16))));
        return tr;
      });
      const table = h('table', { class: 'jay-ttable' },
        h('caption', { class: 'jay-sr-only' }, 'Tasks, ' + fmt.plural(list.length, 'row')),
        h('thead', null, h('tr', null,
          h('th', { class: 'c-sel', scope: 'col' }, headCheck),
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

    /* Phones: compact cards (the whole card opens the task; the check is on top) */
    function mobileList(list) {
      return h('ul', { class: 'jay-mlist', 'aria-label': 'Tasks' }, list.map((t) => {
        const owner = personOf(t.assignee);
        return h('li', { class: ['jay-mcard', t.status === 'done' ? 'is-done' : ''], 'data-id': t.id },
          checkToggle(t),
          h('button', { type: 'button', class: 'jay-mcard-main', onclick: () => openTask(t.id) },
            h('span', { class: 'jay-mcard-title' }, t.title),
            h('span', { class: 'jay-mcard-tags' }, tagsCell(t)),
            h('span', { class: 'jay-mcard-foot' }, UI.meter(progressOf(t), { label: t.title + ' progress' }), h('span', { class: 'jay-spacer' }), dueNode(t))),
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
      body.classList.remove('is-busy');
      const sx = resetScroll ? 0 : body.scrollLeft;
      const sy = resetScroll ? 0 : body.scrollTop;
      resetScroll = false;
      if (!loaded) return;
      const pend = pendingFocus && Date.now() - pendingFocus.at < 5000 ? pendingFocus : null;
      pendingFocus = null;
      const focusSnap = captureFocus() || pend;
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
      if (focusSnap && focusLost()) restoreFocus(focusSnap);
    }

    let seq = 0;
    let resetScroll = false;
    async function reload(quiet) {
      const my = ++seq;
      clearBtn.hidden = !filtersOn();
      if (!quiet) {
        resetScroll = true;
        if (loaded) body.classList.add('is-busy');
        else mount(body, UI.state('loading', { rows: 8 }));
      }
      try {
        // Inside the try: a bad value (e.g. from a future adapter) lands in the
        // error state, and the next data event can recover.
        syncPills();
        syncSide();
        syncChips();
        syncFilterBtn();
        const query = { q: f.q, status: f.status, projectId: f.projectId, due: f.due, sort: f.sort, dir: f.dir };
        if (f.owner !== 'any') query.owner = f.owner;
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
          mount(body, UI.state(list.__state));
          mount(calc);
          return;
        }
        projects = Array.isArray(ps) ? ps : [];
        counts = c && !c.__state ? c : null;
        tasks = Array.isArray(list) ? list : [];
        loaded = true;
        const visible = new Set(tasks.map((t) => t.id));
        Array.from(selected).forEach((id) => { if (!visible.has(id)) selected.delete(id); });
        const key = projects.map((x) => x.id + ':' + x.title + ':' + x.tone).join('|');
        if (key !== sideProjectsKey) buildSide(); else syncSide();
        syncPills();
        syncChips();
        syncFilterBtn();
        syncHeader();
        draw();
      } catch (err) {
        if (my !== seq || disposed) return;
        loaded = false;
        body.classList.remove('is-busy');
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
      if (drawerFocusHook === focusTask) drawerFocusHook = null;
    };
  }

  JAY.tasks = { openTask, openCreate, statusPill, priorityMark, dueNode, projectTag, checkToggle, toggleDone, renderBoard, STATUS, VIEWS };
  JAY.views = JAY.views || {};
  JAY.views.tasks = { title: 'Tasks', render };
})();
