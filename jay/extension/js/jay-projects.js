/* JAY customization — Projects.
   List + detail surface and the project preview drawer used from Home.
   Tasks, conversations, notes, files, people and activity are all read via
   JAY.data.getProject(), so a future jay-core adapter can supply them. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;

  const STATUS_LABEL = { active: 'Active', ongoing: 'Ongoing', paused: 'Paused', done: 'Completed' };
  const FILE_ICON = { doc: 'file-text', sheet: 'file', image: 'image' };
  const mqWide = window.matchMedia('(min-width: 1024px)');

  function tile(p, size) {
    return h('span', { class: ['jay-proj-tile', size ? 'is-' + size : ''], style: { '--tone': 'var(--jay-tone-' + p.tone + ')' }, 'aria-hidden': 'true' }, icon(p.icon || 'projects', size === 'lg' ? 20 : 16));
  }
  function progressLine(p) {
    if (p.progress === null || p.progress === undefined) return null;
    return h('div', { class: 'jay-proj-progress' },
      h('span', { class: 'jay-progress is-lg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.progress), 'aria-label': p.title + ' progress' }, h('span', { style: { width: p.progress + '%', background: 'var(--jay-tone-' + p.tone + ')' } })),
      h('span', { class: 'jay-proj-pct' }, p.progress + '%'));
  }
  function block(title, content, action) {
    return h('section', { class: 'jay-pblock' },
      h('div', { class: 'jay-block-head' }, h('h3', { class: 'jay-eyebrow' }, title),
        action ? h('button', { type: 'button', class: 'jay-link', onclick: action.run }, action.label, icon('chevron-right', 14)) : null),
      content);
  }
  function emptyLine(text) { return h('div', { class: 'jay-empty-line' }, text); }

  function taskRows(tasks, limit) {
    const open = tasks.filter((t) => t.status !== 'done');
    if (!open.length) return emptyLine('No open tasks.');
    return h('ul', { class: 'jay-ptasks' }, open.slice(0, limit || 6).map((t) => h('li', { class: 'jay-ptask' },
      JAY.tasks.checkToggle(t, JAY.tasks.toggleDone),
      h('button', { type: 'button', class: 'jay-ptask-title', onclick: () => JAY.tasks.openTask(t.id) }, t.title),
      JAY.tasks.dueNode(t))));
  }
  function activityRows(items, limit) {
    if (!items.length) return emptyLine('No activity yet.');
    return h('ol', { class: 'jay-activity' }, items.slice(0, limit || 5).map((a) => h('li', null,
      h('span', { class: 'jay-activity-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'jay-activity-text' }, a.text),
      h('span', { class: 'jay-activity-time' }, fmt.relative(a.at)))));
  }
  function convRows(items) {
    if (!items.length) return emptyLine('No conversations linked yet.');
    return h('ul', { class: 'jay-rows' }, items.map((c) => h('li', null, h('button', {
      type: 'button', class: 'jay-cont-row', onclick: () => { JAY.chat.open(c.id); location.hash = '#/talk'; },
    }, h('span', { class: 'jay-cont-icon' }, icon('message-circle', 15)), h('span', { class: 'jay-cont-main' }, h('span', { class: 'jay-cont-title' }, c.title)), h('span', { class: 'jay-cont-time' }, fmt.relative(c.updatedAt))))));
  }
  function noteCards(items) {
    if (!items.length) return emptyLine('No notes yet.');
    return h('div', { class: 'jay-notes' }, items.map((n) => h('article', { class: 'jay-note-card' },
      h('div', { class: 'jay-note-title' }, n.title), h('p', { class: 'jay-note-excerpt' }, n.excerpt), h('div', { class: 'jay-muted jay-note-time' }, fmt.relative(n.updatedAt)))));
  }
  function fileRows(items) {
    if (!items.length) return emptyLine('No files yet.');
    return h('ul', { class: 'jay-files' }, items.map((f) => h('li', { class: 'jay-file' },
      h('span', { class: 'jay-file-icon' }, icon(FILE_ICON[f.kind] || 'file', 15)),
      h('span', { class: 'jay-file-name' }, f.name),
      h('span', { class: 'jay-muted' }, f.size + ' · ' + fmt.relative(f.updatedAt)))));
  }
  function peopleRow(people) {
    if (!people.length) return emptyLine('Just you.');
    return h('ul', { class: 'jay-people' }, people.map((p) => h('li', { class: 'jay-person' },
      h('span', { class: ['jay-avatar', p.id === 'jay' ? 'is-jay' : ''] }, p.id === 'jay' ? 'J' : fmt.initials(p.name)),
      h('span', null, h('span', { class: 'jay-person-name' }, p.name), h('span', { class: 'jay-muted jay-person-role' }, p.role)))));
  }

  function askJay(p) {
    JAY.chat.shared.draft = 'About ' + p.title + ': ';
    location.hash = '#/talk';
  }

  function detail(p, opts) {
    const o = opts || {};
    const open = p.tasks.filter((t) => t.status !== 'done').length;
    return h('div', { class: 'jay-pdetail' },
      o.back ? h('button', { type: 'button', class: 'jay-back', onclick: () => { location.hash = '#/projects'; } }, icon('arrow-left', 16), 'Projects') : null,
      h('header', { class: 'jay-pdetail-head' },
        tile(p, 'lg'),
        h('div', { class: 'jay-pdetail-titles' },
          h('div', { class: 'jay-pdetail-eyebrow' }, p.area, h('span', { class: 'jay-dot-sep', 'aria-hidden': 'true' }, '•'), STATUS_LABEL[p.status] || p.status),
          h('h1', { class: 'jay-pdetail-title' }, p.title),
          h('p', { class: 'jay-pdetail-desc' }, p.description)),
        h('div', { class: 'jay-pdetail-actions' },
          h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => askJay(p) }, icon('chat', 15), 'Ask Jay'),
          h('button', { type: 'button', class: 'jay-btn is-primary', onclick: () => JAY.tasks.openCreate({ projectId: p.id }) }, icon('plus', 15), 'Task'))),
      h('div', { class: 'jay-pdetail-stats' },
        progressLine(p),
        h('div', { class: 'jay-pstat' }, h('strong', null, String(open)), ' open'),
        h('div', { class: 'jay-pstat' }, h('strong', null, String(p.doneTasks)), ' done'),
        p.milestone ? h('div', { class: 'jay-pstat' }, icon('flag', 13), ' ', p.milestone) : null,
        h('div', { class: 'jay-pstat jay-muted' }, 'Updated ' + fmt.relative(p.updatedAt).toLowerCase())),
      h('div', { class: 'jay-pgrid' },
        block('Tasks', taskRows(p.tasks, 7), { label: 'All tasks', run: () => { location.hash = '#/tasks?project=' + encodeURIComponent(p.id) + '&status=all'; } }),
        block('Recent activity', activityRows(p.activity)),
        block('Conversations', convRows(p.conversations)),
        block('Notes', noteCards(p.notes)),
        block('Files', fileRows(p.files), { label: 'Workspace', run: () => { location.hash = '#/files'; } }),
        block('People', peopleRow(p.people))));
  }

  async function openPreview(id) {
    const body = h('div', { class: 'jay-ppreview' }, JAY.ui.state('loading', { rows: 6 }));
    const panel = JAY.ui.openPanel({
      eyebrow: 'Project', title: 'Project', body, size: 'wide',
      footer: [h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => { panel.close(); JAY.tasks.openCreate({ projectId: id }); } }, icon('plus', 15), 'Task'),
        h('span', { class: 'jay-spacer' }),
        h('button', { type: 'button', class: 'jay-btn is-primary', onclick: () => { panel.close(); location.hash = '#/projects/' + encodeURIComponent(id); } }, 'Open project', icon('arrow-right', 15))],
    });
    try {
      const p = await JAY.data.getProject(id);
      if (!p) { mount(body, JAY.ui.state('empty', { title: 'Project not found.' })); return; }
      panel.el.querySelector('.jay-panel-title').textContent = p.title;
      mount(body,
        h('div', { class: 'jay-ppreview-head' }, tile(p, 'lg'), h('div', null, h('div', { class: 'jay-muted' }, p.area + ' · ' + (STATUS_LABEL[p.status] || p.status)), h('p', { class: 'jay-pdetail-desc' }, p.description))),
        h('div', { class: 'jay-pdetail-stats is-compact' }, progressLine(p), h('div', { class: 'jay-pstat' }, h('strong', null, String(p.openTasks)), ' open'), p.nextDue ? h('div', { class: 'jay-pstat jay-muted' }, 'Next: ' + p.nextDue.title + ' · ' + fmt.due(p.nextDue.due).toLowerCase()) : null),
        block('Open tasks', taskRows(p.tasks, 5)),
        block('Recent activity', activityRows(p.activity, 3)),
        p.conversations.length ? block('Conversations', convRows(p.conversations)) : null);
    } catch (_) {
      mount(body, JAY.ui.state('error', { title: 'Couldn’t load this project.' }));
    }
  }

  function openCreate() {
    const title = h('input', { class: 'jay-input is-title', type: 'text', placeholder: 'Project name', autocomplete: 'off' });
    const area = h('select', { class: 'jay-input' }, ['Personal', 'Work', 'Business'].map((a) => h('option', { value: a }, a)));
    const desc = h('textarea', { class: 'jay-input', rows: '3', placeholder: 'What is this project about?' });
    const idT = JAY.nextId('f'); const idA = JAY.nextId('f'); const idD = JAY.nextId('f');
    title.id = idT; area.id = idA; desc.id = idD;
    async function save() {
      const v = title.value.trim();
      if (!v) { title.focus(); title.setAttribute('aria-invalid', 'true'); return; }
      const p = await JAY.data.createProject({ title: v, area: area.value, description: desc.value.trim() });
      panel.close();
      JAY.ui.toast('Project created: ' + p.title, { icon: 'projects', action: { label: 'Open', run: () => { location.hash = '#/projects/' + p.id; } } });
    }
    const panel = JAY.ui.openPanel({
      eyebrow: 'New project', title: 'Create a project', initialFocus: 'input.is-title',
      body: h('form', { class: 'jay-form', onsubmit: (e) => { e.preventDefault(); save(); } },
        h('div', { class: 'jay-field' }, h('label', { class: 'jay-label', for: idT }, 'Name'), title),
        h('div', { class: 'jay-field' }, h('label', { class: 'jay-label', for: idA }, 'Area'), area),
        h('div', { class: 'jay-field' }, h('label', { class: 'jay-label', for: idD }, 'Description'), desc),
        h('div', { class: 'jay-tip' }, icon('chat', 16), h('div', null, 'Or tell Jay: “Start a project for the office move, with a task to get three quotes.”'))),
      footer: [h('span', { class: 'jay-spacer' }), h('button', { type: 'button', class: 'jay-btn is-primary', onclick: save }, 'Create project')],
    });
  }

  function listItem(p, activeId) {
    return h('li', null, h('button', {
      type: 'button', class: ['jay-plist-item', p.id === activeId ? 'is-active' : ''], 'aria-current': p.id === activeId ? 'true' : null,
      onclick: () => { location.hash = '#/projects/' + encodeURIComponent(p.id); },
    },
    tile(p),
    h('span', { class: 'jay-plist-main' },
      h('span', { class: 'jay-plist-title' }, p.title),
      h('span', { class: 'jay-plist-meta' }, p.area + ' · ' + fmt.plural(p.openTasks, 'open task')),
      p.progress !== null && p.progress !== undefined ? h('span', { class: 'jay-progress', 'aria-hidden': 'true' }, h('span', { style: { width: p.progress + '%', background: 'var(--jay-tone-' + p.tone + ')' } })) : null),
    h('span', { class: 'jay-plist-value' }, p.progress !== null && p.progress !== undefined ? p.progress + '%' : ''),
    icon('chevron-right', 16, 'jay-plist-chev')));
  }

  function render(root, params) {
    const id = params._ ? decodeURIComponent(params._) : null;
    const listBox = h('ul', { class: 'jay-plist' });
    const detailBox = h('div', { class: 'jay-pdetail-wrap' });
    const wide = mqWide.matches;
    const showDetailOnly = !wide && id;

    const page = h('div', { class: ['jay-page', 'jay-projects', showDetailOnly ? 'is-detail' : '', !wide && !id ? 'is-list' : ''] },
      showDetailOnly ? null : h('header', { class: 'jay-page-head' },
        h('div', { class: 'jay-page-titles' }, h('h1', { class: 'jay-page-title' }, 'Projects'), h('span', { class: 'jay-page-count', id: 'jayProjCount' })),
        h('div', { class: 'jay-page-actions' }, h('button', { type: 'button', class: 'jay-btn is-primary', onclick: openCreate }, icon('plus', 16), h('span', null, 'New project')))),
      h('div', { class: 'jay-projects-body' },
        showDetailOnly ? null : h('nav', { class: 'jay-plist-wrap', 'aria-label': 'Projects' }, listBox),
        (wide || id) ? detailBox : null));
    mount(root, page);

    let seq = 0;
    async function load(quiet) {
      const my = ++seq;
      if (!quiet) { mount(listBox, JAY.ui.state('loading', { rows: 5 })); if (wide || id) mount(detailBox, JAY.ui.state('loading', { rows: 8 })); }
      try {
        const projects = await JAY.data.getProjects();
        if (my !== seq) return;
        const current = id || (wide && projects[0] ? projects[0].id : null);
        const cnt = document.getElementById('jayProjCount');
        if (cnt) cnt.textContent = projects.length + ' projects';
        if (!showDetailOnly) {
          if (!projects.length) mount(listBox, JAY.ui.state('empty', { icon: 'projects', title: 'No projects yet.', action: { label: 'New project', icon: 'plus', run: openCreate } }));
          else mount(listBox, projects.map((p) => listItem(p, wide ? current : null)));
        }
        if (current && (wide || id)) {
          const p = await JAY.data.getProject(current);
          if (my !== seq) return;
          const scrollTop = detailBox.scrollTop;
          mount(detailBox, p ? detail(p, { back: !wide }) : JAY.ui.state('empty', { title: 'Project not found.', action: { label: 'All projects', run: () => { location.hash = '#/projects'; } } }));
          if (quiet) detailBox.scrollTop = scrollTop;
        }
      } catch (_) {
        mount(wide || id ? detailBox : listBox, JAY.ui.state('error', { title: 'Couldn’t load projects.', action: { label: 'Retry', icon: 'refresh', run: () => load() } }));
      }
    }
    load();
    const offs = ['data:projects', 'data:tasks'].map((e) => JAY.on(e, () => load(true)));
    function onMq() { JAY.emit('route:rerender'); }
    mqWide.addEventListener('change', onMq);
    return () => { offs.forEach((off) => off()); mqWide.removeEventListener('change', onMq); };
  }

  JAY.projects = { openPreview, openCreate };
  JAY.views = JAY.views || {};
  JAY.views.projects = { title: 'Projects', render };
})();
