/* JAY customization — data provider layer.
   Views call only JAY.data.* (always async). Each domain is served by a named
   adapter. Phase 1 ships:
     - "mock"   : full read/write implementation over the local demo dataset
     - "hermes" : opt-in, READ-ONLY bridge for sessions + health using existing
                  Hermes GET endpoints (no writes, no agent runs, no new routes)
   Future adapters (jay-core, calendar, email, messaging) register the same way
   with JAY.data.registerAdapter() and are selected per domain — views don't change. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.mock) return;

  const DEMO_KEY = 'demo-v2';
  const DOMAINS = ['today', 'attention', 'tasks', 'projects', 'sessions', 'chat', 'system', 'people', 'notes', 'files', 'integrations'];
  const LEVEL_RANK = { critical: 0, overdue: 1, respond: 2, waiting: 3, info: 4 };
  const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER = ['inbox', 'next', 'in_progress', 'waiting', 'done'];

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function sameDay(a, b) { return JAY.fmt.isoDate(a) === JAY.fmt.isoDate(b); }
  function changed(...domains) { domains.forEach((d) => JAY.emit('data:' + d)); }

  /* ── Mock adapter ───────────────────────────────────────────────────── */
  let db = null;
  function load() {
    if (db) return db;
    const saved = JAY.storage.get(DEMO_KEY, null);
    // Mock dates are relative to the day the demo was built; rebuild daily so
    // "Today" never shows yesterday's agenda.
    if (saved && saved.builtOn === JAY.fmt.isoDate(new Date()) && saved.data) db = saved.data;
    else db = JAY.mock.build(new Date());
    return db;
  }
  function persist() { JAY.storage.set(DEMO_KEY, { builtOn: JAY.fmt.isoDate(new Date()), data: db }); }
  function latency() { return sleep(70 + Math.round(Math.random() * 90)); }
  function projectById(id) { return load().projects.find((p) => p.id === id) || null; }
  function personById(id) { return load().people.find((p) => p.id === id) || null; }
  function taskById(id) { return load().tasks.find((t) => t.id === id) || null; }

  function decorateTask(t) {
    const p = projectById(t.projectId);
    const person = personById(t.assignee);
    return Object.assign({}, t, {
      project: p ? { id: p.id, title: p.title, tone: p.tone } : null,
      assigneeName: person ? person.name : '',
      watcherPeople: (t.watchers || [t.assignee]).map(personById).filter(Boolean).map((w) => ({ id: w.id, name: w.name })),
      dueState: t.status === 'done' ? 'done' : JAY.fmt.dueState(t.due),
    });
  }

  const STATUS_PROGRESS = { inbox: 0, next: 8, in_progress: 40, waiting: 60, done: 100 };
  function progressOf(t) {
    const list = t.checklist || [];
    if (t.status === 'done') return 100;
    if (list.length) return Math.round((list.filter((c) => c.done).length / list.length) * 100);
    return STATUS_PROGRESS[t.status] || 0;
  }

  function countTasks(tasks) {
    const now = new Date();
    const open = tasks.filter((t) => t.status !== 'done');
    return {
      today: open.filter((t) => t.due && sameDay(t.due, now)).length,
      overdue: open.filter((t) => t.due && JAY.fmt.dueState(t.due, now) === 'overdue').length,
      in_progress: open.filter((t) => t.status === 'in_progress').length,
      waiting: open.filter((t) => t.status === 'waiting').length,
      inbox: open.filter((t) => t.status === 'inbox').length,
      next: open.filter((t) => t.status === 'next').length,
      done: tasks.filter((t) => t.status === 'done').length,
      open: open.length,
      total: tasks.length,
    };
  }

  function filterTasks(tasks, f) {
    const now = new Date();
    const q = (f.q || '').trim().toLowerCase();
    let out = tasks.filter((t) => {
      if (f.status && f.status !== 'all' && f.status !== 'open' && t.status !== f.status) return false;
      if (f.status === 'open' && t.status === 'done') return false;
      if (f.projectId && f.projectId !== 'all' && t.projectId !== f.projectId) return false;
      if (f.owner && f.owner !== 'all' && t.assignee !== f.owner) return false;
      if (f.due && f.due !== 'any') {
        const st = JAY.fmt.dueState(t.due, now);
        if (f.due === 'overdue' && !(st === 'overdue' && t.status !== 'done')) return false;
        if (f.due === 'today' && !(t.due && sameDay(t.due, now))) return false;
        if (f.due === 'week' && !(st === 'today' || st === 'soon' || (st === 'overdue' && t.status !== 'done'))) return false;
        if (f.due === 'none' && t.due) return false;
      }
      if (q) {
        const p = projectById(t.projectId);
        const hay = [t.title, t.description, (t.tags || []).join(' '), p ? p.title : ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sort = f.sort || 'due';
    const dueVal = (t) => (t.due ? new Date(t.due).getTime() : Number.MAX_SAFE_INTEGER);
    out.sort((a, b) => {
      if (sort === 'priority') return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (dueVal(a) - dueVal(b));
      if (sort === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'status') return (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) || (dueVal(a) - dueVal(b));
      // due: open first, then by date
      const doneA = a.status === 'done' ? 1 : 0;
      const doneB = b.status === 'done' ? 1 : 0;
      return (doneA - doneB) || (dueVal(a) - dueVal(b)) || (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    });
    return out;
  }

  const mock = {
    name: 'mock',
    async getTodayItems() {
      await latency();
      const d = load();
      const now = new Date();
      const agenda = d.agenda.filter((a) => sameDay(a.at, now)).map((a) => Object.assign({ ref: { type: 'agenda', id: a.id } }, a));
      const tasks = d.tasks.filter((t) => t.due && sameDay(t.due, now) && t.status !== 'done').map((t) => {
        const p = projectById(t.projectId);
        return { id: 'today-' + t.id, kind: 'task', title: t.title, at: t.due, meta: 'Task' + (p ? ' · ' + p.title : ''), priority: t.priority, ref: { type: 'task', id: t.id } };
      });
      return agenda.concat(tasks).sort((a, b) => new Date(a.at) - new Date(b.at));
    },
    async getTodaySummary() {
      await latency();
      const d = load();
      const now = new Date();
      const c = countTasks(d.tasks);
      const upcoming = d.agenda.filter((a) => sameDay(a.at, now) && new Date(a.at) >= now);
      return {
        tasksDue: c.today,
        reminders: d.agenda.filter((a) => a.kind === 'reminder' && sameDay(a.at, now)).length,
        followups: d.agenda.filter((a) => a.kind === 'followup' && sameDay(a.at, now)).length,
        waiting: c.waiting,
        next: upcoming[0] || null,
      };
    },
    async getAttentionItems() {
      await latency();
      const now = Date.now();
      return load().attention
        .filter((a) => !a.resolved && !(a.snoozedUntil && new Date(a.snoozedUntil).getTime() > now))
        .sort((a, b) => (LEVEL_RANK[a.level] - LEVEL_RANK[b.level]) || (new Date(b.at) - new Date(a.at)))
        .map((a) => {
          const person = a.personId ? personById(a.personId) : null;
          return Object.assign({}, a, { personName: person ? person.name : null });
        });
    },
    async getProjects() {
      await latency();
      const d = load();
      return d.projects.map((p) => {
        const tasks = d.tasks.filter((t) => t.projectId === p.id);
        const open = tasks.filter((t) => t.status !== 'done');
        const next = open.filter((t) => t.due).sort((a, b) => new Date(a.due) - new Date(b.due))[0] || null;
        return Object.assign({}, p, { openTasks: open.length, doneTasks: tasks.length - open.length, totalTasks: tasks.length, nextDue: next ? { id: next.id, title: next.title, due: next.due } : null });
      });
    },
    async getProject(id) {
      const all = await mock.getProjects();
      const p = all.find((x) => x.id === id);
      if (!p) return null;
      const d = load();
      return Object.assign({}, p, {
        tasks: filterTasks(d.tasks.filter((t) => t.projectId === id), { sort: 'due' }).map(decorateTask),
        conversations: d.conversations.filter((c) => c.projectId === id).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, context: c.context })),
        notes: d.notes.filter((n) => n.projectId === id),
        files: d.files.filter((f) => f.projectId === id),
        activity: d.activity.filter((a) => a.projectId === id).sort((a, b) => new Date(b.at) - new Date(a.at)),
        people: (p.people || []).map(personById).filter(Boolean),
      });
    },
    async getTasks(filter) {
      await latency();
      return filterTasks(load().tasks, filter || {}).map(decorateTask);
    },
    async getTask(id) { const t = taskById(id); return t ? decorateTask(t) : null; },
    async getTaskCounts() { await latency(); return countTasks(load().tasks); },
    async getRecentSessions() {
      await latency();
      return load().conversations.filter((c) => c.id !== 'main' && c.messages.length)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map((c) => ({ id: c.id, title: c.title, context: c.context, updatedAt: c.updatedAt, source: 'mock' }));
    },
    async getConversation(id) {
      const c = load().conversations.find((x) => x.id === (id || 'main'));
      return c ? clone(c) : null;
    },
    async getSystemStatus() { await latency(); return clone(load().system); },
    async getAutomations() { await latency(); return clone(load().automations); },
    async getPeople() { await latency(); return clone(load().people); },
    async getIntegrations() { await latency(); return clone(load().integrations); },
    async getAgendaItem(id) { const a = load().agenda.find((x) => x.id === id); return a ? clone(a) : null; },
    async getPerson(id) { const p = personById(id); return p ? clone(p) : null; },

    async createTask(input) {
      const d = load();
      const now = new Date().toISOString();
      const t = {
        id: JAY.nextId('task'), title: String(input.title || '').trim() || 'Untitled task',
        projectId: input.projectId || 'personal', status: input.status || 'inbox', priority: input.priority || 'medium',
        due: input.due || null, assignee: input.assignee || 'pat', tags: input.tags || [], description: input.description || '',
        createdAt: now, updatedAt: now, source: input.source || 'manual',
        checklist: Array.isArray(input.checklist) ? input.checklist.map((c) => ({ text: String(c.text || ''), done: !!c.done })) : [],
        activity: Array.from({ length: 14 }, (_, i) => (i === 13 ? 1 : 0)),
        comments: 0, attachments: 0,
        lastEvent: { at: now, label: 'Created' },
        watchers: [input.assignee || 'pat'],
      };
      t.progress = progressOf(t);
      d.tasks.unshift(t);
      persist();
      changed('tasks', 'today', 'projects');
      return decorateTask(t);
    },
    async updateTask(id, patch) {
      const t = taskById(id);
      if (!t) throw new Error('Task not found');
      const nowIso = new Date().toISOString();
      const statusChanged = patch.status && patch.status !== t.status;
      Object.assign(t, patch, { updatedAt: nowIso });
      if (patch.checklist || statusChanged) t.progress = progressOf(t);
      t.lastEvent = { at: nowIso, label: statusChanged ? 'Status' : (patch.checklist ? 'Checklist' : 'Edited') };
      persist();
      changed('tasks', 'today', 'projects', 'attention');
      return decorateTask(t);
    },
    async completeTask(id, done) {
      const t = taskById(id);
      if (!t) throw new Error('Task not found');
      const markDone = done !== false;
      if (markDone) {
        if (t.status !== 'done') t.prevStatus = t.status;
        t.status = 'done';
      } else {
        t.status = t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'next';
        delete t.prevStatus;
      }
      t.updatedAt = new Date().toISOString();
      t.progress = progressOf(t);
      t.lastEvent = { at: t.updatedAt, label: 'Status' };
      load().attention.forEach((a) => { if (a.taskId === id) a.resolved = markDone; });
      persist();
      changed('tasks', 'today', 'projects', 'attention');
      return decorateTask(t);
    },
    async deleteTask(id) {
      const d = load();
      d.tasks = d.tasks.filter((t) => t.id !== id);
      persist();
      changed('tasks', 'today', 'projects');
    },
    async resolveAttention(id, action) {
      const a = load().attention.find((x) => x.id === id);
      if (!a) throw new Error('Attention item not found');
      if (action === 'done' && a.taskId) return mock.completeTask(a.taskId, true);
      if (action === 'snooze') a.snoozedUntil = new Date(Date.now() + 3 * 3600000).toISOString();
      else a.resolved = true;
      persist();
      changed('attention');
      return clone(a);
    },
    async restoreAttention(id) {
      const a = load().attention.find((x) => x.id === id);
      if (!a) return;
      a.resolved = false;
      delete a.snoozedUntil;
      if (a.taskId) { const t = taskById(a.taskId); if (t && t.status === 'done') { t.status = t.prevStatus || 'next'; } }
      persist();
      changed('attention', 'tasks', 'today', 'projects');
    },
    async addReminder(input) {
      const d = load();
      const item = { id: JAY.nextId('ag'), kind: 'reminder', title: input.title, at: input.at, meta: 'Reminder · added by Jay', detail: 'Created from your conversation with Jay (preview).' };
      d.agenda.push(item);
      persist();
      changed('today');
      return clone(item);
    },
    async updateProject(id, patch) {
      const p = projectById(id);
      if (!p) throw new Error('Project not found');
      const allowed = ['favorite', 'muted', 'status', 'title', 'description'];
      allowed.forEach((k) => { if (Object.prototype.hasOwnProperty.call(patch || {}, k)) p[k] = patch[k]; });
      p.updatedAt = new Date().toISOString();
      persist();
      changed('projects');
      return clone(p);
    },
    async createProject(input) {
      const d = load();
      const p = { id: JAY.nextId('proj'), title: input.title, area: input.area || 'Personal', status: 'active', tone: 1 + (d.projects.length % 5), icon: 'projects', progress: null, description: input.description || '', milestone: null, people: ['pat'], updatedAt: new Date().toISOString() };
      d.projects.push(p);
      persist();
      changed('projects');
      return clone(p);
    },
    async appendMessage(convId, message) {
      const d = load();
      let c = d.conversations.find((x) => x.id === convId);
      if (!c) { c = { id: convId, title: 'New conversation', context: 'Personal', messages: [] }; d.conversations.push(c); }
      const m = Object.assign({ at: new Date().toISOString() }, message);
      c.messages.push(m);
      c.updatedAt = m.at;
      if (c.title === 'New conversation' && m.role === 'user') c.title = m.text.length > 42 ? m.text.slice(0, 40).trim() + '…' : m.text;
      persist();
      changed('chat', 'sessions');
      return clone(m);
    },
    async newConversation() {
      const d = load();
      const c = { id: JAY.nextId('conv'), title: 'New conversation', context: 'Personal', messages: [], updatedAt: new Date().toISOString() };
      d.conversations.push(c);
      persist();
      return c.id;
    },
    reset() { db = null; JAY.storage.remove(DEMO_KEY); load(); DOMAINS.forEach((dm) => changed(dm)); },
  };

  /* ── Hermes adapter: opt-in, read-only (GET only) ─────────────────── */
  async function getJson(path) {
    // Relative URL keeps subpath mounts working (Hermes sets <base href>).
    const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + path);
    return res.json();
  }
  const hermes = {
    name: 'hermes',
    async getRecentSessions() {
      const data = await getJson('api/sessions');
      const list = Array.isArray(data.sessions) ? data.sessions : [];
      return list.filter((s) => !s.archived && s.message_count > 0)
        .sort((a, b) => (b.last_message_at || b.updated_at || 0) - (a.last_message_at || a.updated_at || 0))
        .slice(0, 6)
        .map((s) => ({
          id: s.session_id,
          title: s.title || 'Untitled session',
          context: s.source_label || (s.workspace ? String(s.workspace).split(/[\\/]/).filter(Boolean).pop() : 'Hermes'),
          updatedAt: new Date(((s.last_message_at || s.updated_at || 0) * 1000)).toISOString(),
          source: 'hermes',
        }));
    },
    async getSystemStatus() {
      const base = await mock.getSystemStatus();
      let health = null;
      try { health = await getJson('health'); } catch (_) { health = null; }
      base.items = base.items.map((it) => {
        if (it.key !== 'hermes') return it;
        return health && health.status === 'ok'
          ? Object.assign({}, it, { state: 'online', value: 'Online', detail: 'WebUI /health ok · ' + (health.active_streams || 0) + ' active streams' })
          : Object.assign({}, it, { state: 'offline', value: 'Unreachable', detail: 'WebUI /health did not answer' });
      });
      base.checkedAt = new Date().toISOString();
      base.source = 'hermes';
      return base;
    },
  };

  /* ── Registry, routing, simulated states ──────────────────────────── */
  const adapters = { mock, hermes };
  const selection = Object.assign({}, JAY.storage.get('adapters', {}));
  const DOMAIN_OF = {
    getTodayItems: 'today', getTodaySummary: 'today', getAgendaItem: 'today', addReminder: 'today',
    getAttentionItems: 'attention', resolveAttention: 'attention', restoreAttention: 'attention',
    getTasks: 'tasks', getTask: 'tasks', getTaskCounts: 'tasks', createTask: 'tasks', updateTask: 'tasks', completeTask: 'tasks', deleteTask: 'tasks',
    getProjects: 'projects', getProject: 'projects', createProject: 'projects', updateProject: 'projects',
    getRecentSessions: 'sessions',
    getConversation: 'chat', appendMessage: 'chat', newConversation: 'chat',
    getSystemStatus: 'system', getAutomations: 'system',
    getPeople: 'people', getPerson: 'people',
    getIntegrations: 'integrations',
  };
  let sim = Object.assign({}, JAY.storage.get('simulate', {}));
  const SINGLE_ITEM = new Set(['getTask', 'getProject', 'getAgendaItem', 'getPerson', 'getConversation']);

  function adapterFor(domain, method) {
    const chosen = adapters[selection[domain]];
    if (chosen && typeof chosen[method] === 'function') return chosen;
    return mock; // unimplemented domains fall back to mock, never to nothing
  }

  function call(method, args) {
    const domain = DOMAIN_OF[method];
    const s = sim[domain];
    if (s && method.startsWith('get')) {
      if (s === 'loading') return new Promise(() => {});
      if (s === 'error') return sleep(250).then(() => { throw new Error('Simulated failure for ' + domain); });
      if (s === 'empty' && SINGLE_ITEM.has(method)) return sleep(80).then(() => null);
      if (s === 'empty') return sleep(120).then(() => (method === 'getTaskCounts' ? { today: 0, overdue: 0, in_progress: 0, waiting: 0, inbox: 0, next: 0, done: 0, open: 0, total: 0 } : (method === 'getTodaySummary' ? { tasksDue: 0, reminders: 0, followups: 0, waiting: 0, next: null } : [])));
      if (s === 'disconnected' || s === 'not-connected') return sleep(120).then(() => ({ __state: s }));
    }
    const a = adapterFor(domain, method);
    return Promise.resolve().then(() => a[method].apply(a, args));
  }

  const api = {};
  Object.keys(DOMAIN_OF).forEach((method) => { api[method] = (...args) => call(method, args); });

  JAY.data = Object.assign(api, {
    DOMAINS,
    STATUS_ORDER,
    registerAdapter(name, impl) { if (name && impl) adapters[name] = impl; },
    useAdapter(domain, name) {
      if (name === 'mock') delete selection[domain]; else selection[domain] = name;
      JAY.storage.set('adapters', selection);
      changed(domain);
    },
    adapterName(domain) { return selection[domain] || 'mock'; },
    simulate(domain, stateName) {
      if (!stateName || stateName === 'normal') delete sim[domain]; else sim[domain] = stateName;
      JAY.storage.set('simulate', sim);
      changed(domain);
    },
    simulated() { return Object.assign({}, sim); },
    clearSimulations() { const ds = Object.keys(sim); sim = {}; JAY.storage.remove('simulate'); ds.forEach((d) => changed(d)); },
    resetDemo() { mock.reset(); },
    isMock(domain) { return (selection[domain] || 'mock') === 'mock'; },
  });
})();
