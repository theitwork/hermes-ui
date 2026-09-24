/* JAY customization — Tasks.
   Dense, sortable task surface (table + board) for personal and business work.
   Mock-backed through JAY.data; the same calls will later hit jay-core. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;

  const STATUS = {
    inbox: { label: 'Inbox', icon: 'inbox' },
    next: { label: 'Next', icon: 'arrow-right' },
    in_progress: { label: 'In progress', icon: 'circle-dashed' },
    waiting: { label: 'Waiting', icon: 'hourglass' },
    done: { label: 'Done', icon: 'circle-check' },
  };
  const STATUS_KEYS = ['inbox', 'next', 'in_progress', 'waiting', 'done'];
  const PRIORITY = {
    urgent: { label: 'Urgent', level: 4 },
    high: { label: 'High', level: 3 },
    medium: { label: 'Medium', level: 2 },
    low: { label: 'Low', level: 1 },
  };
  const PRIORITY_KEYS = ['urgent', 'high', 'medium', 'low'];
  const DUE_OPTIONS = [['any', 'Any date'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Next 7 days'], ['none', 'No date']];
  const SORT_OPTIONS = [['due', 'Due date'], ['priority', 'Priority'], ['status', 'Status'], ['updated', 'Recently updated'], ['title', 'Title']];
  const ASSIGNEES = [['pat', 'Pat (you)'], ['jay', 'Jay'], ['rana', 'Rana Saad'], ['sarah', 'Sarah Mitchell'], ['karim', 'Karim Nassar'], ['tony', 'Tony Haddad']];

  function statusPill(s) {
    const m = STATUS[s] || STATUS.inbox;
    return h('span', { class: ['jay-status-pill', 'is-' + s] }, icon(m.icon, 13), m.label);
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
  function avatar(name, id) {
    return h('span', { class: ['jay-avatar', 'is-xs', id === 'jay' ? 'is-jay' : ''], title: name }, id === 'jay' ? 'J' : fmt.initials(name));
  }
  function checkToggle(t, onToggle) {
    const done = t.status === 'done';
    return h('button', {
      type: 'button', class: ['jay-check', done ? 'is-done' : ''], role: 'checkbox', 'aria-checked': done ? 'true' : 'false',
      'aria-label': (done ? 'Mark not done: ' : 'Mark done: ') + t.title,
      onclick: (e) => { e.stopPropagation(); onToggle(t); },
    }, done ? icon('check', 13) : null);
  }

  async function toggleDone(t) {
    const makeDone = t.status !== 'done';
    try {
      await JAY.data.completeTask(t.id, makeDone);
      if (makeDone) JAY.ui.toast('Completed: ' + t.title, { icon: 'check', action: { label: 'Undo', run: () => JAY.data.completeTask(t.id, false) } });
    } catch (_) { JAY.ui.toast('Couldn’t update the task.', { tone: 'danger', icon: 'alert-circle' }); }
  }

  /* ── Task drawer (create / edit) ────────────────────────────────────── */
  function field(label, control, hint) {
    const id = JAY.nextId('f');
    control.id = id;
    return h('div', { class: 'jay-field' }, h('label', { for: id, class: 'jay-label' }, label), control, hint ? h('div', { class: 'jay-hint' }, hint) : null);
  }
  function select(options, value) {
    return h('select', { class: 'jay-input' }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  }

  async function openTaskForm(task, prefill) {
    const isNew = !task;
    const t = Object.assign({ title: '', projectId: 'personal', status: 'inbox', priority: 'medium', due: null, assignee: 'pat', tags: [], description: '' }, prefill || {}, task || {});
    let projects = [];
    try { projects = await JAY.data.getProjects(); } catch (_) { projects = []; }

    const title = h('input', { class: 'jay-input is-title', type: 'text', value: t.title, placeholder: 'Task title', required: true, autocomplete: 'off' });
    const status = select(STATUS_KEYS.map((k) => [k, STATUS[k].label]), t.status);
    const project = select(projects.map((p) => [p.id, p.title]), t.projectId);
    const due = h('input', { class: 'jay-input', type: 'date', value: t.due ? fmt.isoDate(t.due) : '' });
    const assignee = select(ASSIGNEES, t.assignee);
    const tags = h('input', { class: 'jay-input', type: 'text', value: (t.tags || []).join(', '), placeholder: 'e.g. client, finance' });
    const desc = h('textarea', { class: 'jay-input', rows: '4', placeholder: 'Notes, context, links…' }, t.description || '');
    let priority = t.priority;
    const prioGroup = h('div', { class: 'jay-segmented is-full', role: 'radiogroup', 'aria-label': 'Priority' },
      PRIORITY_KEYS.slice().reverse().map((k) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': k === priority ? 'true' : 'false', class: k === priority ? 'is-active' : '',
        onclick: (e) => {
          priority = k;
          prioGroup.querySelectorAll('button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        },
      }, PRIORITY[k].label)));

    const form = h('form', { class: 'jay-form', onsubmit: (e) => { e.preventDefault(); save(); } },
      field('Title', title),
      h('div', { class: 'jay-field-row' }, field('Status', status), field('Project', project)),
      h('div', { class: 'jay-field-row' }, field('Due date', due), field('Assignee', assignee)),
      h('div', { class: 'jay-field' }, h('span', { class: 'jay-label' }, 'Priority'), prioGroup),
      field('Tags', tags),
      field('Description', desc),
      isNew
        ? h('div', { class: 'jay-tip' }, icon('chat', 16), h('div', null, h('strong', null, 'Faster: just tell Jay. '), '“Add a task to renew the domain by Friday.”'),
          h('button', { type: 'button', class: 'jay-link', onclick: () => { panel.close(); JAY.home.goTalk({ intent: 'task' }); } }, 'Tell Jay'))
        : h('dl', { class: 'jay-dl is-meta' },
          h('dt', null, 'Created'), h('dd', null, fmt.dateFull(t.createdAt)),
          h('dt', null, 'Updated'), h('dd', null, fmt.relative(t.updatedAt)),
          t.source === 'jay' ? [h('dt', null, 'Source'), h('dd', null, 'Created by Jay')] : null));

    async function save() {
      const value = title.value.trim();
      if (!value) { title.focus(); title.setAttribute('aria-invalid', 'true'); return; }
      const payload = {
        title: value, status: status.value, projectId: project.value, priority,
        due: due.value ? new Date(due.value + 'T12:00:00').toISOString() : null, assignee: assignee.value,
        tags: tags.value.split(',').map((s) => s.trim()).filter(Boolean), description: desc.value.trim(),
      };
      try {
        if (isNew) { await JAY.data.createTask(payload); JAY.ui.toast('Task added: ' + value, { icon: 'check' }); }
        else { await JAY.data.updateTask(t.id, payload); JAY.ui.toast('Saved', { icon: 'check' }); }
        panel.close();
      } catch (_) { JAY.ui.toast('Couldn’t save the task.', { tone: 'danger', icon: 'alert-circle' }); }
    }

    const footer = [
      !isNew ? h('button', { type: 'button', class: 'jay-btn is-ghost is-danger', onclick: async () => { await JAY.data.deleteTask(t.id); panel.close(); JAY.ui.toast('Task deleted', { icon: 'trash' }); } }, icon('trash', 15), 'Delete') : null,
      h('span', { class: 'jay-spacer' }),
      !isNew && t.status !== 'done' ? h('button', { type: 'button', class: 'jay-btn', onclick: async () => { await toggleDone(t); panel.close(); } }, icon('check', 15), 'Complete') : null,
      h('button', { type: 'button', class: 'jay-btn is-primary', onclick: save }, isNew ? 'Add task' : 'Save'),
    ];
    const panel = JAY.ui.openPanel({ eyebrow: isNew ? 'New task' : (t.project ? t.project.title : 'Task'), title: isNew ? 'Add a task' : t.title, body: form, footer, initialFocus: isNew ? 'input.is-title' : null });
    return panel;
  }

  async function openTask(id) {
    const t = await JAY.data.getTask(id);
    if (!t) { JAY.ui.toast('That task no longer exists.', { icon: 'alert-circle' }); return; }
    openTaskForm(t);
  }
  function openCreate(prefill) { return openTaskForm(null, prefill); }

  /* ── Tasks view ────────────────────────────────────────────────────── */
  function render(root, params) {
    const ui = Object.assign({ view: 'list', sort: 'due' }, JAY.storage.get('tasks-ui', {}));
    const f = {
      q: '',
      status: params.status || 'open',
      projectId: params.project || 'all',
      due: params.due || 'any',
      sort: params.sort || ui.sort,
    };
    if (params.view) ui.view = params.view;
    const selected = new Set();
    let tasks = [];

    const count = h('span', { class: 'jay-page-count' });
    const search = h('input', { class: 'jay-input is-search', type: 'search', placeholder: 'Search tasks', 'aria-label': 'Search tasks', autocomplete: 'off' });
    let qTimer = null;
    search.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { f.q = search.value; reload(); }, 140); });

    const statusChips = h('div', { class: 'jay-chips is-scroll', role: 'tablist', 'aria-label': 'Status' },
      [['open', 'Open'], ...STATUS_KEYS.map((k) => [k, STATUS[k].label]), ['all', 'All']].map(([k, l]) => h('button', {
        type: 'button', role: 'tab', class: 'jay-filter-chip', 'data-status': k, 'aria-selected': 'false',
        onclick: () => { f.status = k; syncChips(); reload(); },
      }, l, h('span', { class: 'jay-chip-n', 'data-n': k }))));
    function syncChips() {
      statusChips.querySelectorAll('.jay-filter-chip').forEach((b) => { const on = b.dataset.status === f.status; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    }

    const projectSel = h('select', { class: 'jay-input is-compact', 'aria-label': 'Project' }, h('option', { value: 'all' }, 'All projects'));
    const dueSel = h('select', { class: 'jay-input is-compact', 'aria-label': 'Due' }, DUE_OPTIONS.map(([v, l]) => h('option', { value: v, selected: v === f.due }, l)));
    const sortSel = h('select', { class: 'jay-input is-compact', 'aria-label': 'Sort by' }, SORT_OPTIONS.map(([v, l]) => h('option', { value: v, selected: v === f.sort }, 'Sort: ' + l)));
    projectSel.addEventListener('change', () => { f.projectId = projectSel.value; reload(); });
    dueSel.addEventListener('change', () => { f.due = dueSel.value; reload(); });
    sortSel.addEventListener('change', () => { f.sort = sortSel.value; ui.sort = f.sort; JAY.storage.set('tasks-ui', ui); reload(); });

    const viewSeg = h('div', { class: 'jay-segmented', role: 'radiogroup', 'aria-label': 'View' },
      [['list', 'List', 'list'], ['board', 'Board', 'board']].map(([v, l, ic]) => h('button', {
        type: 'button', role: 'radio', 'data-view': v, 'aria-checked': 'false',
        onclick: () => { ui.view = v; JAY.storage.set('tasks-ui', ui); syncView(); draw(); },
      }, icon(ic, 15), h('span', { class: 'jay-hide-narrow' }, l))));
    function syncView() { viewSeg.querySelectorAll('button').forEach((b) => { const on = b.dataset.view === ui.view; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); }

    const filtersBtn = h('button', { type: 'button', class: 'jay-btn is-ghost jay-show-mobile', onclick: openFilterSheet }, icon('filter', 15), 'Filters');
    const clearBtn = h('button', { type: 'button', class: 'jay-link', hidden: true, onclick: () => { f.q = ''; search.value = ''; f.status = 'open'; f.projectId = 'all'; f.due = 'any'; projectSel.value = 'all'; dueSel.value = 'any'; syncChips(); reload(); } }, 'Clear filters');

    const bulkBar = h('div', { class: 'jay-bulkbar', hidden: true, role: 'region', 'aria-label': 'Bulk actions' });
    const body = h('div', { class: 'jay-tasks-body' });

    const page = h('div', { class: 'jay-page jay-tasks' },
      h('header', { class: 'jay-page-head' },
        h('div', { class: 'jay-page-titles' }, h('h1', { class: 'jay-page-title' }, 'Tasks'), count),
        h('div', { class: 'jay-page-actions' }, viewSeg,
          h('button', { type: 'button', class: 'jay-btn is-primary', onclick: () => openCreate(f.projectId !== 'all' ? { projectId: f.projectId } : null) }, icon('plus', 16), h('span', null, 'New task')))),
      h('div', { class: 'jay-toolbar' },
        h('div', { class: 'jay-search' }, icon('search', 15), search),
        h('div', { class: 'jay-toolbar-filters jay-hide-mobile' }, projectSel, dueSel, sortSel),
        filtersBtn, clearBtn),
      statusChips,
      bulkBar,
      body);
    mount(root, page);
    syncChips();
    syncView();

    JAY.data.getProjects().then((ps) => {
      ps.forEach((p) => projectSel.appendChild(h('option', { value: p.id, selected: p.id === f.projectId }, p.title)));
    }).catch(() => {});

    function openFilterSheet() {
      const pSel = projectSel.cloneNode(true); pSel.value = f.projectId;
      const dSel = dueSel.cloneNode(true); dSel.value = f.due;
      const sSel = sortSel.cloneNode(true); sSel.value = f.sort;
      const panel = JAY.ui.openPanel({
        eyebrow: 'Tasks', title: 'Filter & sort',
        body: h('div', { class: 'jay-form' }, field('Project', pSel), field('Due', dSel), field('Sort', sSel)),
        footer: [h('span', { class: 'jay-spacer' }), h('button', { type: 'button', class: 'jay-btn is-primary', onclick: () => {
          f.projectId = pSel.value; f.due = dSel.value; f.sort = sSel.value;
          projectSel.value = f.projectId; dueSel.value = f.due; sortSel.value = f.sort;
          panel.close(); reload();
        } }, 'Apply')],
      });
    }

    function updateBulk() {
      bulkBar.hidden = selected.size === 0;
      if (!selected.size) return;
      mount(bulkBar,
        h('span', { class: 'jay-bulk-n' }, selected.size + ' selected'),
        h('button', { type: 'button', class: 'jay-btn is-sm', onclick: async () => { const ids = Array.from(selected); for (const id of ids) await JAY.data.completeTask(id, true); selected.clear(); JAY.ui.toast('Completed ' + fmt.plural(ids.length, 'task'), { icon: 'check' }); } }, icon('check', 14), 'Mark done'),
        h('button', { type: 'button', class: 'jay-btn is-sm', onclick: (e) => JAY.ui.menu(e.currentTarget, STATUS_KEYS.map((k) => ({ label: STATUS[k].label, icon: STATUS[k].icon, run: async () => { const ids = Array.from(selected); for (const id of ids) await JAY.data.updateTask(id, { status: k }); selected.clear(); JAY.ui.toast('Moved ' + fmt.plural(ids.length, 'task') + ' to ' + STATUS[k].label, { icon: STATUS[k].icon }); } })), { label: 'Move to' }) }, 'Move to', icon('chevron-down', 14)),
        h('button', { type: 'button', class: 'jay-link', onclick: () => { selected.clear(); draw(); } }, 'Clear'));
    }

    function tableView(list) {
      const allChecked = list.length > 0 && list.every((t) => selected.has(t.id));
      const headCheck = h('input', { type: 'checkbox', class: 'jay-cb', 'aria-label': 'Select all', checked: allChecked,
        onchange: (e) => { list.forEach((t) => (e.target.checked ? selected.add(t.id) : selected.delete(t.id))); draw(); } });
      const sortable = (label, key, cls) => h('th', { scope: 'col', class: cls, 'aria-sort': f.sort === key ? 'ascending' : 'none' },
        h('button', { type: 'button', class: ['jay-th-btn', f.sort === key ? 'is-active' : ''], onclick: () => { f.sort = key; sortSel.value = key; ui.sort = key; JAY.storage.set('tasks-ui', ui); reload(); } }, label, f.sort === key ? icon('chevron-down', 13) : null));
      const rows = list.map((t) => {
        const cb = h('input', { type: 'checkbox', class: 'jay-cb', 'aria-label': 'Select ' + t.title, checked: selected.has(t.id),
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => { if (e.target.checked) selected.add(t.id); else selected.delete(t.id); tr.classList.toggle('is-selected', e.target.checked); updateBulk(); } });
        const titleBtn = h('button', { type: 'button', class: 'jay-row-title', onclick: (e) => { e.stopPropagation(); openTask(t.id); } }, t.title);
        const tr = h('tr', { class: ['jay-tr', t.status === 'done' ? 'is-done' : '', selected.has(t.id) ? 'is-selected' : ''], onclick: () => openTask(t.id) },
          h('td', { class: 'is-select' }, cb),
          h('td', { class: 'is-check' }, checkToggle(t, toggleDone)),
          h('td', { class: 'is-title' }, h('div', { class: 'jay-title-cell' }, titleBtn,
            (t.tags || []).length ? h('span', { class: 'jay-tags' }, t.tags.slice(0, 2).map((tg) => h('span', { class: 'jay-tag' }, tg))) : null)),
          h('td', { class: 'is-project' }, projectTag(t)),
          h('td', { class: 'is-status' }, statusPill(t.status)),
          h('td', { class: 'is-priority' }, priorityMark(t.priority)),
          h('td', { class: 'is-due' }, dueNode(t)),
          h('td', { class: 'is-assignee' }, avatar(t.assigneeName, t.assignee)),
          h('td', { class: 'is-updated' }, h('span', { class: 'jay-muted' }, fmt.relative(t.updatedAt))));
        return tr;
      });
      return h('div', { class: 'jay-table-wrap' }, h('table', { class: 'jay-table' },
        h('thead', null, h('tr', null,
          h('th', { class: 'is-select', scope: 'col' }, headCheck),
          h('th', { class: 'is-check', scope: 'col' }, h('span', { class: 'jay-sr-only' }, 'Done')),
          sortable('Title', 'title', 'is-title'),
          h('th', { class: 'is-project', scope: 'col' }, 'Project'),
          sortable('Status', 'status', 'is-status'),
          sortable('Priority', 'priority', 'is-priority'),
          sortable('Due', 'due', 'is-due'),
          h('th', { class: 'is-assignee', scope: 'col' }, 'Owner'),
          sortable('Updated', 'updated', 'is-updated'))),
        h('tbody', null, rows)));
    }

    function cardNode(t) {
      const card = h('article', {
        class: ['jay-kcard', t.status === 'done' ? 'is-done' : ''], draggable: 'true', tabindex: '0', 'data-id': t.id,
        'aria-label': t.title + ', ' + STATUS[t.status].label, onclick: () => openTask(t.id),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(t.id); } },
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging'); },
        ondragend: () => card.classList.remove('is-dragging'),
      },
      h('div', { class: 'jay-kcard-top' }, checkToggle(t, toggleDone), h('span', { class: 'jay-kcard-title' }, t.title)),
      h('div', { class: 'jay-kcard-meta' }, projectTag(t)),
      h('div', { class: 'jay-kcard-foot' }, dueNode(t), priorityMark(t.priority), avatar(t.assigneeName, t.assignee)));
      return card;
    }

    function boardView(list) {
      const cols = STATUS_KEYS.filter((k) => f.status === 'all' || f.status === 'open' ? (f.status === 'all' || k !== 'done') : k === f.status);
      return h('div', { class: 'jay-board' }, cols.map((k) => {
        const items = list.filter((t) => t.status === k);
        const col = h('section', { class: 'jay-kcol', 'aria-label': STATUS[k].label },
          h('header', { class: 'jay-kcol-head' }, statusPill(k), h('span', { class: 'jay-count' }, String(items.length)),
            h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Add task to ' + STATUS[k].label, onclick: () => openCreate({ status: k }) }, icon('plus', 15))),
          h('div', { class: 'jay-kcol-body' }, items.length ? items.map(cardNode) : h('div', { class: 'jay-kcol-empty' }, 'No tasks')));
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('is-over'); });
        col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('is-over'); });
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('is-over');
          const id = e.dataTransfer.getData('text/plain');
          if (id) { await JAY.data.updateTask(id, { status: k }); JAY.ui.toast('Moved to ' + STATUS[k].label, { icon: STATUS[k].icon }); }
        });
        return col;
      }));
    }

    function draw() {
      const filtersOn = f.q || f.status !== 'open' || f.projectId !== 'all' || f.due !== 'any';
      clearBtn.hidden = !filtersOn;
      if (!tasks.length) {
        mount(body, JAY.ui.state('empty', filtersOn
          ? { icon: 'search', title: 'No tasks match these filters.', action: { label: 'Clear filters', run: () => clearBtn.click() } }
          : { icon: 'check', title: 'Nothing on your list.', text: 'Tell Jay what needs doing, or add a task.', action: { label: 'New task', icon: 'plus', run: () => openCreate() } }));
        updateBulk();
        return;
      }
      mount(body, ui.view === 'board' ? boardView(tasks) : (JAY.isMobile() ? mobileList(tasks) : tableView(tasks)));
      updateBulk();
    }

    function mobileList(list) {
      return h('ul', { class: 'jay-mlist' }, list.map((t) => h('li', { class: ['jay-mrow', t.status === 'done' ? 'is-done' : ''] },
        checkToggle(t, toggleDone),
        h('button', { type: 'button', class: 'jay-mrow-main', onclick: () => openTask(t.id) },
          h('span', { class: 'jay-mrow-title' }, t.title),
          h('span', { class: 'jay-mrow-meta' }, dueNode(t), t.project ? h('span', null, t.project.title) : null, t.status !== 'done' ? h('span', null, STATUS[t.status].label) : null)),
        priorityMark(t.priority))));
    }

    let seq = 0;
    async function reload(quiet) {
      const my = ++seq;
      if (!quiet) mount(body, JAY.ui.state('loading', { rows: 8 }));
      try {
        const [list, counts] = await Promise.all([JAY.data.getTasks(f), JAY.data.getTaskCounts()]);
        if (my !== seq) return;
        tasks = list;
        const visible = new Set(list.map((t) => t.id));
        Array.from(selected).forEach((id) => { if (!visible.has(id)) selected.delete(id); });
        count.textContent = counts.open + ' open · ' + counts.done + ' done';
        const n = { open: counts.open, inbox: counts.inbox, next: counts.next, in_progress: counts.in_progress, waiting: counts.waiting, done: counts.done, all: counts.total };
        statusChips.querySelectorAll('[data-n]').forEach((s) => { s.textContent = String(n[s.dataset.n] ?? ''); });
        draw();
      } catch (err) {
        if (my !== seq) return;
        mount(body, JAY.ui.state('error', { title: 'Couldn’t load tasks.', action: { label: 'Retry', icon: 'refresh', run: () => reload() } }));
      }
    }
    reload();
    const off = JAY.on('data:tasks', () => reload(true));
    const offMq = () => JAY.mqMobile.removeEventListener('change', onMq);
    function onMq() { draw(); }
    JAY.mqMobile.addEventListener('change', onMq);
    return () => { off(); offMq(); };
  }

  JAY.tasks = { openTask, openCreate, statusPill, priorityMark, dueNode, projectTag, checkToggle, toggleDone, STATUS };
  JAY.views = JAY.views || {};
  JAY.views.tasks = { title: 'Tasks', render };
})();
