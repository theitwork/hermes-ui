/* JAY customization — "Talk to Jay".
   One component, two layouts: the Home dock and the focused conversation
   (full view on desktop, full-screen on phones). Phase 1 is mock-only: replies
   come from a small local responder and nothing is sent to Hermes or any LLM.
   v2 look: a floating panel with a lime "J", "Jay ● Preview" and
   "Personal | Main" crumbs; right-aligned surface-3 user bubbles,
   prose-first Jay turns, outlined quick pills (lime when active) and an
   inset composer with attach / mic / context chips and a lime send square.
   Shortcuts elsewhere ("Ask Jay", quick chips) go through JAY.chat.prefill so
   they never overwrite what the user typed. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;

  const INTENTS = {
    task: { label: 'Task', icon: 'tasks', placeholder: 'What needs to get done?' },
    reminder: { label: 'Reminder', icon: 'bell', placeholder: 'What should I remind you about?' },
    idea: { label: 'Idea', icon: 'lightbulb', placeholder: 'What’s the idea? I’ll file it for later.' },
    research: { label: 'Research', icon: 'search', placeholder: 'What would you like Jay to research?' },
  };
  const QUICK = [
    { intent: 'task', label: 'Task', icon: 'plus' },
    { intent: 'reminder', label: 'Reminder', icon: 'plus' },
    { intent: 'idea', label: 'Capture idea', icon: 'lightbulb' },
    { intent: 'research', label: 'Research', icon: 'search' },
  ];
  const DEFAULT_PLACEHOLDER = 'Ask Jay anything, or tell Jay what to do…';
  const CONTEXTS = ['Personal', 'Work', 'Business'];

  // Draft + active conversation are shared so "expand" keeps what you typed.
  // draftSource: 'user' (typed or edited here) or 'shortcut' (an untouched
  // "Ask Jay" prefill, which the next shortcut may replace).
  // focusNext: a shortcut ("Ask Jay", a quick chip) is opening Talk and wants
  // its composer focused even on phones; the focus view clears it once honoured.
  const shared = { draft: '', draftSource: null, intent: null, convId: 'main', focusNext: false, context: JAY.storage.get('context', 'Personal') };
  const live = new Set(); // mounted Talk components, newest last

  // Demo reset: the conversations and anything typed about them are gone.
  // Registered before any component, so every mounted one sees the reset state.
  JAY.on('data:reset', () => {
    shared.convId = 'main';
    shared.draft = '';
    shared.draftSource = null;
    shared.intent = null;
    shared.focusNext = false;
  });

  // The signed-in user's first name, or '' while JAY only knows a placeholder.
  function firstName() {
    const u = JAY.me;
    if (!u || !u.name || u.id === 'me') return '';
    return String(u.name).trim().split(/\s+/)[0] || '';
  }
  function hello() { const n = firstName(); return fmt.greeting() + (n ? ', ' + n : ''); }
  // A data result is usable only when it is a real value, not a {__state} marker.
  function usable(v) { return !!v && typeof v === 'object' && !v.__state; }
  const CANT_REACH_TASKS = {
    text: 'I can’t reach your tasks right now. Check System → Preview tools or try again.',
    link: { label: 'Open System', route: '#/system' },
  };

  /* ── Local mock responder ───────────────────────────────────────────── */
  function parseWhen(text) {
    const now = new Date();
    const t = text.toLowerCase();
    let day = 0;
    if (/\btomorrow\b/.test(t)) day = 1;
    const rel = t.match(/\bin (\d{1,3}) ?(min|minute|minutes|hour|hours|hr|hrs)\b/);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const ms = /^h/.test(rel[2]) ? n * 3600000 : n * 60000;
      return new Date(now.getTime() + ms);
    }
    const abs = t.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    const d = new Date(now);
    d.setDate(d.getDate() + day);
    if (abs) {
      let hr = parseInt(abs[1], 10);
      const mn = abs[2] ? parseInt(abs[2], 10) : 0;
      if (abs[3] === 'pm' && hr < 12) hr += 12;
      if (abs[3] === 'am' && hr === 12) hr = 0;
      if (!abs[3] && hr < 7) hr += 12; // "at 4" means 16:00 in a working day
      d.setHours(hr, mn, 0, 0);
      if (day === 0 && d < now) d.setDate(d.getDate() + 1);
      return d;
    }
    if (day === 1) { d.setHours(9, 0, 0, 0); return d; }
    const next = new Date(now.getTime() + 60 * 60000);
    next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);
    return next;
  }

  function cleanSubject(text, patterns) {
    let s = text.trim();
    patterns.forEach((p) => { s = s.replace(p, ''); });
    s = s.replace(/\b(tomorrow|today)\b/ig, '').replace(/\bat \d{1,2}(:\d{2})?\s*(am|pm)?\b/ig, '').replace(/\bin \d{1,3} ?(min|minute|minutes|hour|hours|hr|hrs)\b/ig, '');
    s = s.replace(/\s{2,}/g, ' ').replace(/^[\s,:-]+|[\s,.:-]+$/g, '');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  async function respond(text, intent) {
    const lower = text.toLowerCase();
    const isReminder = intent === 'reminder' || /\bremind me\b/.test(lower);
    const isTask = intent === 'task' || /^(add|create|new)\b.*\btask\b/.test(lower) || /^todo[:\s]/.test(lower);

    if (isReminder) {
      const when = parseWhen(text);
      const subject = cleanSubject(text, [/^remind me (to |about )?/i, /^reminder:?\s*/i]) || text.trim();
      const today = fmt.isoDate(when) === fmt.isoDate(new Date());
      await JAY.data.addReminder({ title: subject, at: when.toISOString() });
      return {
        text: today
          ? 'Done — I’ll remind you at ' + fmt.time(when) + ': “' + subject + '”. It’s on your Today list.'
          : 'Set for ' + fmt.due(when).toLowerCase() + ' at ' + fmt.time(when) + ': “' + subject + '”.',
        link: today ? { label: 'See Today', route: '#/home' } : null,
      };
    }
    if (isTask) {
      const title = cleanSubject(text, [/^(add|create|new)( a)?( new)? task( to)?:?\s*/i, /^todo:?\s*/i]) || text.trim();
      const task = await JAY.data.createTask({ title, status: 'inbox', source: 'jay' });
      return { text: 'Added “' + task.title + '” to your Inbox. Tell me a due date or project if you want it filed.', link: { label: 'Open in Tasks', route: '#/tasks?status=inbox' } };
    }
    if (intent === 'idea') {
      return { text: 'Captured: “' + text.trim() + '”. In the live version this goes to Notes → Ideas.' };
    }
    if (intent === 'research' || /^research\b/.test(lower)) {
      return { text: 'I’ll research “' + cleanSubject(text, [/^research:?\s*/i]) + '” once I’m connected to Hermes. In this preview nothing leaves your browser.' };
    }
    if (/\b(focus|priorit\w*|today|my day)\b/.test(lower) || /\bwhat\b.*\b(next|now)\b/.test(lower)) {
      // Each source may fail or answer {__state}; only the task counts are essential.
      const soft = (p) => Promise.resolve().then(() => p()).catch(() => null);
      const [counts, summary, attention] = await Promise.all([
        soft(() => JAY.data.getTaskCounts()), soft(() => JAY.data.getTodaySummary()), soft(() => JAY.data.getAttentionItems())]);
      if (!usable(counts) || !Number.isFinite(counts.today) || !Number.isFinite(counts.overdue)) return CANT_REACH_TASKS;
      const nextItem = usable(summary) && summary.next && summary.next.title ? summary.next : null;
      const next = nextItem ? ' Next up: ' + nextItem.title + ' at ' + fmt.time(nextItem.at) + '.' : '';
      const first = Array.isArray(attention) ? attention.find((a) => a && a.title) : null;
      const top = first ? ' Most urgent: ' + first.title.charAt(0).toLowerCase() + first.title.slice(1) + '.' : '';
      return { text: 'You have ' + fmt.plural(counts.today, 'task') + ' due today and ' + fmt.plural(counts.overdue, 'overdue item') + '.' + top + next };
    }
    if (/\b(overdue|late|slipped|behind)\b/.test(lower)) {
      let tasks = null;
      try { tasks = await JAY.data.getTasks({ due: 'overdue' }); } catch (_) { tasks = null; }
      if (!Array.isArray(tasks)) return CANT_REACH_TASKS;
      if (!tasks.length) return { text: 'Nothing is overdue. You’re caught up.' };
      return { text: 'Overdue: ' + tasks.map((t) => t.title + ' (' + fmt.due(t.due).toLowerCase() + ')').join('; ') + '.', link: { label: 'Show overdue', route: '#/tasks?due=overdue' } };
    }
    if (/^(hi|hey|hello|good (morning|afternoon|evening))\b/.test(lower)) {
      return { text: hello() + '. What should we take care of?' };
    }
    return { text: 'Preview mode: I’m not connected to Hermes yet, so I can’t act on this. In the live version this goes to your Hermes agent with your ' + shared.context + ' context.' };
  }

  /* ── Component ──────────────────────────────────────────────────────── */
  function create(opts) {
    const o = Object.assign({ mode: 'dock' }, opts || {});
    let convId = shared.convId;
    let conversation = null;
    let busy = false;
    let listening = null;
    const attachments = [];
    // Below 1024px the focus view hides its conversation tree, so the
    // "Personal | Main" control becomes the conversation switcher.
    const mqNoTree = window.matchMedia('(max-width: 1023.98px)');
    const switcher = () => o.mode === 'focus' && mqNoTree.matches;

    const contextBtn = h('button', {
      type: 'button', class: 'jay-talk-context', 'aria-haspopup': 'menu',
      onclick: (e) => { if (switcher()) openConversations(); else openContextMenu(e.currentTarget); },
    });
    const previewPill = JAY.ui.dotPill('Preview', 'lime');
    previewPill.classList.add('jay-talk-pill');
    previewPill.title = 'Replies are generated locally. Nothing is sent to Hermes in this preview.';

    const headActions = h('div', { class: 'jay-talk-actions' },
      o.mode === 'focus' ? h('button', { type: 'button', class: 'jay-btn is-outline is-sm jay-hide-mobile', onclick: () => { location.hash = '#/chat'; } }, icon('chat', 15), 'Hermes chat') : null,
      h('button', { type: 'button', class: 'jay-circle-btn', 'aria-label': 'New conversation', 'data-tip': 'New conversation', onclick: newConversation }, icon('compose', 16)),
      o.mode === 'dock'
        ? h('button', { type: 'button', class: 'jay-circle-btn', 'aria-label': 'Open full conversation', 'data-tip': 'Expand', onclick: () => { saveDraft(); location.hash = '#/talk'; } }, icon('expand', 15))
        : null);

    const head = h('header', { class: 'jay-talk-head' },
      o.mode === 'focus' ? h('button', { type: 'button', class: 'jay-icon-btn jay-talk-back', 'aria-label': 'Back', onclick: () => { saveDraft(); if (history.length > 1) history.back(); else location.hash = '#/home'; } }, icon('arrow-left', 20)) : null,
      h('div', { class: 'jay-talk-id' },
        JAY.ui.avatar('Jay', { id: 'jay', size: 'md', decorative: true }),
        h('div', { class: 'jay-talk-titles' },
          h('div', { class: 'jay-talk-name' }, h('h2', null, 'Jay'), previewPill),
          contextBtn)),
      headActions);

    const scroll = h('div', { class: 'jay-talk-scroll', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation with Jay' });
    const thread = h('div', { class: 'jay-thread' });
    scroll.appendChild(thread);
    // Stay pinned to the latest message while the panel resizes (fonts, sibling
    // panels loading, the composer growing) unless the reader scrolled up.
    let pinned = true;
    scroll.addEventListener('scroll', () => { pinned = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40; }, { passive: true });
    const resizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (pinned) scroll.scrollTop = scroll.scrollHeight; }) : null;
    if (resizeObs) { resizeObs.observe(scroll); resizeObs.observe(thread); }

    const textarea = h('textarea', { class: 'jay-composer-input', rows: '1', placeholder: DEFAULT_PLACEHOLDER, 'aria-label': 'Message Jay', enterkeyhint: 'send' });
    const intentTag = h('div', { class: 'jay-intent-tag', hidden: true });
    const attachTray = h('div', { class: 'jay-attach-tray', hidden: true });
    const fileInput = h('input', { type: 'file', class: 'jay-sr-only', multiple: true, tabindex: '-1', 'aria-hidden': 'true' });
    const sendBtn = h('button', { type: 'button', class: 'jay-send', 'aria-label': 'Send', disabled: true, onclick: send }, icon('send', 17));
    const micBtn = h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Dictate', 'aria-pressed': 'false', 'data-tip': 'Voice', onclick: toggleMic }, icon('mic', 17));
    const listenBar = h('div', { class: 'jay-listen', hidden: true, role: 'status' },
      h('span', { class: 'jay-listen-wave', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
      h('span', null, 'Listening… (voice preview)'),
      h('button', { type: 'button', class: 'jay-link', onclick: () => stopMic(true) }, 'Stop'));
    const composerContext = h('button', { type: 'button', class: 'jay-cchip', 'aria-haspopup': 'menu', title: 'Context Jay will use', onclick: (e) => openContextMenu(e.currentTarget) },
      icon('user', 14), h('span', { class: 'jay-chip-label' }, shared.context), icon('chevron-down', 13, 'jay-cchip-chev'));

    const composer = h('div', { class: 'jay-composer' },
      intentTag, attachTray, listenBar, textarea,
      h('div', { class: 'jay-composer-bar' },
        h('div', { class: 'jay-composer-left' },
          h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Attach file', 'data-tip': 'Attach', onclick: () => fileInput.click() }, icon('paperclip', 17)),
          micBtn,
          h('span', { class: 'jay-composer-divider', 'aria-hidden': 'true' }),
          composerContext,
          h('span', { class: 'jay-cchip is-static jay-hide-narrow', title: 'Replies are generated locally in this preview' }, icon('sparkle', 14), h('span', { class: 'jay-chip-label' }, 'Local preview'))),
        sendBtn),
      fileInput);

    const quick = h('div', { class: 'jay-quick', role: 'group', 'aria-label': 'Quick actions' },
      QUICK.map((q) => h('button', {
        type: 'button', class: 'jay-quick-chip', 'data-intent': q.intent, 'aria-pressed': 'false',
        onclick: () => prime(shared.intent === q.intent ? null : q.intent),
      }, icon(q.icon, 14), q.label)));

    const foot = h('div', { class: 'jay-talk-foot' }, quick, composer);
    const el = JAY.ui.box({ class: ['jay-talk', 'is-col', 'is-' + o.mode], 'aria-label': 'Talk to Jay' }, head, scroll, foot);

    /* Focus view on wide screens: Deepsleep-style conversation tree beside the
       thread (the shared .jay-layout.has-side hides it below 1024px). */
    let side = null;
    let sideSeq = 0;
    let sideQuery = '';
    const root = o.mode === 'focus' ? h('div', { class: 'jay-layout has-side is-fill jay-talk-layout' }, el) : el;
    function filterSide(q) {
      sideQuery = String(q || '').trim().toLowerCase();
      if (!side) return;
      side.querySelectorAll('.jay-side-item').forEach((b) => {
        const label = (b.querySelector('.jay-side-label') || b).textContent.toLowerCase();
        b.parentElement.hidden = !!sideQuery && !label.includes(sideQuery);
      });
    }
    // Recent JAY conversations (Hermes sessions open in Hermes chat instead),
    // plus the open one when it is too new to be listed yet.
    async function conversationList() {
      let sessions = [];
      try { const r = await JAY.data.getRecentSessions(); sessions = Array.isArray(r) ? r : []; } catch (_) { sessions = []; }
      const mine = sessions.filter((c) => c && c.source !== 'hermes' && c.id !== 'main');
      if (convId !== 'main' && conversation && !mine.some((c) => c.id === convId)) {
        mine.unshift({ id: convId, title: conversation.title || 'New conversation' });
      }
      return mine;
    }
    // The tree goes first in the layout; the shared .has-side rule hides the
    // .jay-side panel below 1024px.
    function placeSide(mine) {
      const next = JAY.ui.sideNav({
        label: 'Conversations',
        search: { placeholder: 'Search conversations', onInput: filterSide },
        sections: [
          { id: 'pinned', title: 'Pinned', items: [{ id: 'main', label: 'Main', icon: 'message-circle', active: convId === 'main', run: () => load('main') }] },
          { id: 'recent', title: 'Recent', items: mine.map((c) => ({ id: c.id, label: c.title, icon: 'chat', active: c.id === convId, run: () => load(c.id) })) },
        ],
        footer: { label: 'New conversation', icon: 'plus', run: newConversation },
      });
      next.classList.add('jay-talk-side');
      const searchInput = side ? side.querySelector('input') : null;
      const hadFocus = searchInput && document.activeElement === searchInput;
      if (side && side.parentNode === root) root.replaceChild(next, side); else root.insertBefore(next, el);
      side = next;
      const input = side.querySelector('input');
      if (input && sideQuery) { input.value = sideQuery; filterSide(sideQuery); }
      if (hadFocus && input) input.focus();
    }
    async function renderSide() {
      if (o.mode !== 'focus') return;
      const my = ++sideSeq;
      const mine = await conversationList();
      if (my !== sideSeq) return;
      placeSide(mine);
    }

    /* ── behaviours ── */
    function saveDraft() { shared.draft = textarea.value; shared.convId = convId; }
    function autosize() {
      textarea.style.height = 'auto';
      const max = o.mode === 'focus' ? 200 : 140;
      textarea.style.height = Math.min(max, textarea.scrollHeight) + 'px';
      sendBtn.disabled = !textarea.value.trim() || busy;
    }
    textarea.addEventListener('input', () => {
      autosize();
      shared.draft = textarea.value;
      shared.draftSource = textarea.value.trim() ? 'user' : null;
    });
    textarea.addEventListener('keydown', (e) => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse) { e.preventDefault(); send(); }
      if (e.key === 'Escape' && shared.intent) { e.preventDefault(); prime(null); }
    });
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files || []).forEach((f) => attachments.push({ name: f.name, size: f.size }));
      fileInput.value = '';
      renderAttachments();
      JAY.ui.toast('Attached locally — files are not uploaded in this preview.', { icon: 'paperclip' });
    });

    function renderAttachments() {
      attachTray.hidden = attachments.length === 0;
      mount(attachTray, attachments.map((a, i) => h('span', { class: 'jay-attach' }, icon('file', 14),
        h('span', { class: 'jay-attach-name' }, a.name),
        h('button', { type: 'button', class: 'jay-attach-x', 'aria-label': 'Remove ' + a.name, onclick: () => { attachments.splice(i, 1); renderAttachments(); } }, icon('x', 12)))));
    }

    // opts.focus === false sets the mode without moving focus (demo reset).
    function prime(intent, opts) {
      shared.intent = intent && INTENTS[intent] ? intent : null;
      const spec = shared.intent ? INTENTS[shared.intent] : null;
      textarea.placeholder = spec ? spec.placeholder : DEFAULT_PLACEHOLDER;
      quick.querySelectorAll('.jay-quick-chip').forEach((b) => {
        const on = b.dataset.intent === shared.intent;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      intentTag.hidden = !spec;
      if (spec) {
        mount(intentTag, icon(spec.icon, 13), h('span', null, spec.label),
          h('button', { type: 'button', class: 'jay-intent-x', 'aria-label': 'Clear ' + spec.label.toLowerCase() + ' mode', onclick: () => { prime(null); textarea.focus(); } }, icon('x', 12)));
      }
      if (!opts || opts.focus !== false) textarea.focus({ preventScroll: true });
    }

    function setContext(c) {
      if (!CONTEXTS.includes(c)) return;
      shared.context = c;
      JAY.storage.set('context', c);
      updateHeader();
      composerContext.querySelector('.jay-chip-label').textContent = c;
      JAY.emit('context', c);
    }
    function openContextMenu(anchor) {
      JAY.ui.menu(anchor, CONTEXTS.map((c) => ({
        label: c, icon: c === 'Personal' ? 'user' : (c === 'Work' ? 'server' : 'building'), active: c === shared.context,
        hint: c === shared.context ? 'Current' : '',
        run: () => setContext(c),
      })), { label: 'Context' });
    }

    // Phones and tablets: the conversation tree as a sheet — search, Main,
    // recent conversations, a new one, and the context the next reply uses.
    function openConversations() {
      const listEl = h('div', { class: 'jay-convs-list' }, JAY.ui.state('loading', { rows: 4 }));
      const searchId = JAY.nextId('convs-search');
      const input = h('input', { id: searchId, class: 'jay-input is-search is-inset', type: 'search', placeholder: 'Search conversations', 'aria-label': 'Search conversations', autocomplete: 'off' });
      const ctxLabelId = JAY.nextId('convs-ctx');
      const seg = JAY.ui.segmented(CONTEXTS.map((c) => [c, c]), shared.context, (c) => setContext(c), 'Context', { full: true });
      seg.setAttribute('aria-labelledby', ctxLabelId);
      seg.removeAttribute('aria-label');
      let convs = null;
      let panel = null;
      const pick = (id) => { if (panel) panel.close(); if (id !== convId) load(id); };
      const row = (c, ic) => {
        const on = c.id === convId;
        return h('li', null, h('button', {
          type: 'button', class: ['jay-side-item', on ? 'is-active' : ''], 'aria-current': on ? 'true' : null, onclick: () => pick(c.id),
        }, icon(ic, 16, 'jay-side-icon'), h('span', { class: 'jay-side-label' }, c.title || 'Untitled'),
        c.updatedAt ? h('span', { class: 'jay-convs-time' }, fmt.ago(c.updatedAt)) : null));
      };
      const section = (title, rows) => h('div', { class: 'jay-side-section' },
        h('div', { class: 'jay-side-title' }, title), h('ul', { class: 'jay-side-list' }, rows));
      function paint() {
        if (!convs) return;
        const q = input.value.trim().toLowerCase();
        const match = (c) => !q || String(c.title || '').toLowerCase().includes(q);
        const pinned = [{ id: 'main', title: 'Main' }].filter(match);
        const recent = convs.filter(match);
        mount(listEl,
          pinned.length ? section('Pinned', pinned.map((c) => row(c, 'message-circle'))) : null,
          recent.length ? section('Recent', recent.map((c) => row(c, 'chat'))) : null,
          !pinned.length && !recent.length ? JAY.ui.state('empty', { icon: 'search', title: 'No conversations match.', compact: true }) : null);
      }
      input.addEventListener('input', paint);
      const body = h('div', { class: 'jay-convs' },
        h('div', { class: 'jay-convs-ctx' }, h('div', { class: 'jay-convs-label', id: ctxLabelId }, 'Context'), seg),
        h('div', { class: 'jay-search jay-convs-search' }, icon('search', 15), input),
        listEl);
      const footer = h('button', { type: 'button', class: 'jay-btn is-primary is-block', onclick: () => { if (panel) panel.close(); newConversation(); } }, icon('plus', 16), 'New conversation');
      panel = JAY.ui.openPanel({ eyebrow: 'Talk', title: 'Conversations', body, footer });
      conversationList().then((list) => { convs = list; if (listEl.isConnected) paint(); });
    }

    function updateHeader() {
      const title = conversation ? conversation.title : 'Main';
      mount(contextBtn, h('span', null, shared.context), h('span', { class: 'jay-sep', 'aria-hidden': 'true' }, '|'), h('span', { class: 'jay-talk-conv' }, title), icon('chevron-down', 14));
      const sw = switcher();
      contextBtn.setAttribute('aria-haspopup', sw ? 'dialog' : 'menu');
      contextBtn.setAttribute('aria-label', sw
        ? 'Conversation: ' + title + ', context: ' + shared.context + '. Switch conversation or context'
        : 'Context: ' + shared.context + ', conversation: ' + title + '. Change context');
    }

    function messageNode(m) {
      if (m.role === 'user') {
        return h('div', { class: 'jay-msg is-user' }, h('div', { class: 'jay-bubble' }, m.text),
          h('div', { class: 'jay-msg-meta' }, h('span', null, fmt.time(m.at))));
      }
      return h('div', { class: 'jay-msg is-jay' },
        JAY.ui.avatar('Jay', { id: 'jay', size: 'sm', decorative: true }),
        h('div', { class: 'jay-msg-body' },
          h('div', { class: 'jay-msg-text' }, m.text),
          m.link ? h('button', { type: 'button', class: 'jay-msg-link', onclick: () => { location.hash = m.link.route; } }, m.link.label, icon('arrow-right', 14)) : null,
          h('div', { class: 'jay-msg-meta' }, h('span', { class: 'jay-msg-who' }, 'Jay'), h('span', null, fmt.time(m.at)), m.local ? h('span', { class: 'jay-msg-local' }, 'local preview reply') : null)));
    }

    function emptyNode() {
      return h('div', { class: 'jay-talk-empty' },
        JAY.ui.avatar('Jay', { id: 'jay', size: 'xl', decorative: true }),
        h('div', { class: 'jay-talk-greeting' }, hello() + '.'),
        h('div', { class: 'jay-talk-prompt' }, 'What should we take care of?'),
        h('div', { class: 'jay-talk-suggest' },
          ['What should I focus on today?', 'Remind me to call the bank at 4pm', 'What’s overdue?'].map((s) =>
            h('button', { type: 'button', class: 'jay-suggest', onclick: () => { textarea.value = s; autosize(); send(); } }, h('span', null, s), icon('arrow-up-right', 15)))));
    }

    function renderThread() {
      const msgs = conversation ? conversation.messages : [];
      el.classList.toggle('is-empty', msgs.length === 0);
      if (!msgs.length) { mount(thread, emptyNode()); return; }
      const nodes = [];
      let lastDay = null;
      msgs.forEach((m) => {
        const day = fmt.isoDate(m.at);
        if (day !== lastDay && lastDay !== null) nodes.push(h('div', { class: 'jay-day-sep' }, h('span', null, fmt.relative(m.at))));
        lastDay = day;
        nodes.push(messageNode(m));
      });
      mount(thread, nodes);
      pinned = true;
      requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
    }

    // Only the newest load (or a switch to a new conversation) may land: a slow
    // answer for a conversation the user already left never replaces the thread.
    let loadSeq = 0;
    async function load(id) {
      const my = ++loadSeq;
      convId = id || 'main';
      shared.convId = convId;
      mount(thread, JAY.ui.state('loading', { rows: 3 }));
      let fresh = null;
      try {
        fresh = await JAY.data.getConversation(convId);
      } catch (err) {
        if (my !== loadSeq) return;
        mount(thread, JAY.ui.state('error', { title: 'Couldn’t load this conversation.', action: { label: 'Retry', icon: 'refresh', run: () => load(convId) } }));
        return;
      }
      if (my !== loadSeq) return;
      // A conversation that no longer exists (demo reset, stale link) falls back to Main.
      if (!usable(fresh) && convId !== 'main') { load('main'); return; }
      conversation = usable(fresh) ? fresh : { id: convId, title: 'Main', messages: [] };
      if (!Array.isArray(conversation.messages)) conversation.messages = [];
      updateHeader();
      renderThread();
      renderSide();
    }

    async function newConversation() {
      const my = ++loadSeq;
      const id = await JAY.data.newConversation();
      if (my !== loadSeq) return;
      convId = id;
      shared.convId = convId;
      conversation = { id: convId, title: 'New conversation', messages: [] };
      updateHeader();
      renderThread();
      renderSide();
      prime(null);
    }

    function showTyping() {
      const t = h('div', { class: 'jay-msg is-jay is-typing', 'aria-label': 'Jay is typing' },
        JAY.ui.avatar('Jay', { id: 'jay', size: 'sm', decorative: true }),
        h('div', { class: 'jay-typing' }, h('i'), h('i'), h('i')));
      thread.appendChild(t);
      scroll.scrollTop = scroll.scrollHeight;
      return t;
    }

    async function send() {
      const text = textarea.value.trim();
      if (!text || busy) return;
      busy = true;
      const intent = shared.intent;
      textarea.value = '';
      shared.draft = '';
      shared.draftSource = null;
      autosize();
      prime(null);
      if (attachments.length) { attachments.splice(0, attachments.length); renderAttachments(); }
      try {
        const userMsg = await JAY.data.appendMessage(convId, { role: 'user', text });
        conversation.messages.push(userMsg);
        if (conversation.title === 'New conversation') conversation.title = text.length > 42 ? text.slice(0, 40).trim() + '…' : text;
        updateHeader();
        renderThread();
        const typing = showTyping();
        const [reply] = await Promise.all([respond(text, intent), new Promise((r) => setTimeout(r, JAY.mqReducedMotion.matches ? 150 : 650))]);
        typing.remove();
        const jayMsg = await JAY.data.appendMessage(convId, { role: 'jay', text: reply.text, link: reply.link || null, local: true });
        conversation.messages.push(jayMsg);
        renderThread();
      } catch (err) {
        console.warn('[jay] mock reply failed', err);
        JAY.ui.toast('Jay couldn’t reply in preview mode.', { tone: 'danger', icon: 'alert-circle' });
      } finally {
        busy = false;
        autosize();
      }
    }

    function toggleMic() { if (listening) stopMic(true); else startMic(); }
    function startMic() {
      listenBar.hidden = false;
      micBtn.classList.add('is-active');
      micBtn.setAttribute('aria-pressed', 'true');
      listening = setTimeout(() => stopMic(true), 4000);
    }
    function stopMic(announce) {
      clearTimeout(listening);
      listening = null;
      listenBar.hidden = true;
      micBtn.classList.remove('is-active');
      micBtn.setAttribute('aria-pressed', 'false');
      if (announce) JAY.ui.toast('Voice uses Hermes voice once JAY is connected. Nothing was recorded.', { icon: 'mic' });
    }

    // Store changed underneath (another view, a demo reset): follow it unless
    // this component is mid-send, when it already holds the newest messages.
    async function syncFromStore() {
      if (busy || !conversation) return;
      const id = convId;
      const seq = loadSeq;
      let fresh = null;
      try { fresh = await JAY.data.getConversation(id); } catch (_) { return; }
      // A load or reset moved on meanwhile: this answer is for another thread.
      if (busy || id !== convId || seq !== loadSeq) return;
      if (!usable(fresh)) { if (convId !== 'main') load('main'); return; }
      const msgs = Array.isArray(fresh.messages) ? fresh.messages : [];
      if (msgs.length === conversation.messages.length && fresh.title === conversation.title) return;
      conversation = Object.assign({}, fresh, { messages: msgs });
      updateHeader();
      renderThread();
      renderSide();
    }

    function focusComposer() {
      textarea.focus({ preventScroll: true });
      const end = textarea.value.length;
      try { textarea.setSelectionRange(end, end); } catch (_) { /* not focusable yet */ }
    }

    /* ── init ── */
    // Focus view: the tree goes in synchronously (recent items fill in once
    // loaded), so the thread is visible — and focusable — from the first frame.
    if (o.mode === 'focus') placeSide([]);
    textarea.value = shared.draft || '';
    autosize();
    if (shared.intent) prime(shared.intent); else textarea.placeholder = DEFAULT_PLACEHOLDER;
    load(shared.convId);
    // A shortcut opened this focus view and asked for the composer (phones
    // included). The caller focuses synchronously inside its tap; this is the
    // late retry once layout settles, after which the request is cleared.
    let focusTimer = null;
    if (o.mode === 'focus' && shared.focusNext) {
      focusTimer = setTimeout(() => {
        focusTimer = null;
        shared.focusNext = false;
        if (el.isConnected && !el.contains(document.activeElement)) focusComposer();
      }, 60);
    }

    const offCtx = JAY.on('context', () => { updateHeader(); composerContext.querySelector('.jay-chip-label').textContent = shared.context; });
    const offOpen = JAY.on('chat:open', (id) => load(id));
    const offPrime = JAY.on('chat:prime', (intent) => prime(intent));
    const offDraft = JAY.on('chat:draft', (p) => {
      textarea.value = shared.draft || '';
      autosize();
      if (p && p.intent !== undefined) prime(shared.intent);
    });
    const offChat = JAY.on('data:chat', () => { syncFromStore(); });
    // Demo reset (shared state was already cleared at module level): drop the
    // draft, mode, attachments and voice, and go back to Main. Focus stays put.
    const offReset = JAY.on('data:reset', () => {
      stopMic(false);
      textarea.value = '';
      if (attachments.length) { attachments.splice(0, attachments.length); renderAttachments(); }
      autosize();
      prime(null, { focus: false });
      load('main');
    });
    const offSessions = o.mode === 'focus' ? JAY.on('data:sessions', () => renderSide()) : () => {};
    const onTreeMq = () => updateHeader();
    if (typeof mqNoTree.addEventListener === 'function') mqNoTree.addEventListener('change', onTreeMq);

    const api = {
      el: root,
      focus: focusComposer,
      prime,
      load,
      destroy() {
        saveDraft(); stopMic(false); offCtx(); offOpen(); offPrime(); offDraft(); offChat(); offReset(); offSessions();
        if (typeof mqNoTree.removeEventListener === 'function') mqNoTree.removeEventListener('change', onTreeMq);
        if (resizeObs) resizeObs.disconnect();
        // Left before the retry ran: the request dies with this view.
        if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; shared.focusNext = false; }
        sideSeq += 1;
        loadSeq += 1;
        live.delete(api);
      },
    };
    live.add(api);
    return api;
  }

  // Put text in the composer for a shortcut ("Ask Jay about …") without losing
  // what the user typed: an empty or untouched-shortcut draft is replaced, a
  // user draft gets the text appended on a new line. opts.intent also sets the
  // mode; an intent-only shortcut clears an untouched shortcut draft, never a
  // typed one. Returns the resulting draft.
  function prefill(text, opts) {
    const o = opts || {};
    const add = typeof text === 'string' ? text : '';
    const cur = String(shared.draft || '');
    const typed = !!cur.trim() && shared.draftSource !== 'shortcut';
    if (add) {
      if (typed) { shared.draft = cur.replace(/\s+$/, '') + '\n' + add; shared.draftSource = 'user'; }
      else { shared.draft = add; shared.draftSource = 'shortcut'; }
    } else if (o.intent && !typed) {
      shared.draft = '';
      shared.draftSource = null;
    }
    const detail = {};
    if (o.intent !== undefined) {
      shared.intent = o.intent && INTENTS[o.intent] ? o.intent : null;
      detail.intent = shared.intent;
    }
    JAY.emit('chat:draft', detail);
    return shared.draft;
  }

  // Focus the newest mounted composer (caret at the end). False when none is on screen.
  function focusLive() {
    const list = Array.from(live).filter((c) => c.el && c.el.isConnected);
    const c = list[list.length - 1];
    if (!c) return false;
    c.focus();
    return true;
  }

  JAY.chat = {
    create,
    shared,
    prefill,
    focus: focusLive,
    open(id) { shared.convId = id; JAY.emit('chat:open', id); },
    // An intent shortcut (Task, Reminder …) replaces an untouched shortcut draft.
    prime(intent) {
      if (intent && shared.draftSource === 'shortcut') { shared.draft = ''; shared.draftSource = null; JAY.emit('chat:draft', {}); }
      shared.intent = intent;
      JAY.emit('chat:prime', intent);
    },
    respond,
  };
})();
