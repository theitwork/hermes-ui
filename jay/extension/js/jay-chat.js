/* JAY customization — "Talk to Jay".
   One component, two layouts: the Home dock and the focused conversation
   (full view on desktop, full-screen on phones). Phase 1 is mock-only: replies
   come from a small local responder and nothing is sent to Hermes or any LLM.
   Visual language follows Hermes' chat: compact right-aligned user bubbles,
   prose-first assistant turns, a quiet composer with transparent chips. */
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
  const shared = { draft: '', intent: null, convId: 'main', context: JAY.storage.get('context', 'Personal') };

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
      const [counts, summary, attention] = await Promise.all([JAY.data.getTaskCounts(), JAY.data.getTodaySummary(), JAY.data.getAttentionItems()]);
      const next = summary.next ? ' Next up: ' + summary.next.title + ' at ' + fmt.time(summary.next.at) + '.' : '';
      const top = attention[0] ? ' Most urgent: ' + attention[0].title.charAt(0).toLowerCase() + attention[0].title.slice(1) + '.' : '';
      return { text: 'You have ' + fmt.plural(counts.today, 'task') + ' due today and ' + fmt.plural(counts.overdue, 'overdue item') + '.' + top + next };
    }
    if (/\b(overdue|late|slipped|behind)\b/.test(lower)) {
      const tasks = await JAY.data.getTasks({ due: 'overdue' });
      if (!tasks.length) return { text: 'Nothing is overdue. You’re caught up.' };
      return { text: 'Overdue: ' + tasks.map((t) => t.title + ' (' + fmt.due(t.due).toLowerCase() + ')').join('; ') + '.', link: { label: 'Show overdue', route: '#/tasks?due=overdue' } };
    }
    if (/^(hi|hey|hello|good (morning|afternoon|evening))\b/.test(lower)) {
      return { text: fmt.greeting() + ', Pat. What should we take care of?' };
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

    const contextBtn = h('button', { type: 'button', class: 'jay-talk-context', 'aria-haspopup': 'menu', onclick: (e) => openContextMenu(e.currentTarget) });
    const previewPill = h('span', { class: 'jay-pill is-quiet', title: 'Replies are generated locally. Nothing is sent to Hermes in this preview.' }, 'Preview');

    const headActions = h('div', { class: 'jay-talk-actions' },
      h('button', { type: 'button', class: 'jay-icon-btn', 'aria-label': 'New conversation', 'data-tip': 'New conversation', onclick: newConversation }, icon('compose', 18)),
      o.mode === 'dock'
        ? h('button', { type: 'button', class: 'jay-icon-btn', 'aria-label': 'Open full conversation', 'data-tip': 'Expand', onclick: () => { saveDraft(); location.hash = '#/talk'; } }, icon('expand', 17))
        : h('button', { type: 'button', class: 'jay-btn is-ghost is-sm jay-hide-mobile', onclick: () => { location.hash = '#/chat'; } }, icon('chat', 15), 'Hermes chat'));

    const head = h('header', { class: 'jay-talk-head' },
      o.mode === 'focus' ? h('button', { type: 'button', class: 'jay-icon-btn jay-talk-back', 'aria-label': 'Back', onclick: () => { saveDraft(); if (history.length > 1) history.back(); else location.hash = '#/home'; } }, icon('arrow-left', 20)) : null,
      h('div', { class: 'jay-talk-id' },
        h('span', { class: 'jay-mark is-sm', 'aria-hidden': 'true' }, 'J'),
        h('div', { class: 'jay-talk-titles' },
          h('div', { class: 'jay-talk-name' }, h('h2', null, 'Jay'), previewPill),
          contextBtn)),
      headActions);

    const scroll = h('div', { class: 'jay-talk-scroll', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation with Jay' });
    const thread = h('div', { class: 'jay-thread' });
    scroll.appendChild(thread);

    const textarea = h('textarea', { class: 'jay-composer-input', rows: '1', placeholder: DEFAULT_PLACEHOLDER, 'aria-label': 'Message Jay', enterkeyhint: 'send' });
    const intentTag = h('div', { class: 'jay-intent-tag', hidden: true });
    const attachTray = h('div', { class: 'jay-attach-tray', hidden: true });
    const fileInput = h('input', { type: 'file', class: 'jay-sr-only', multiple: true, tabindex: '-1', 'aria-hidden': 'true' });
    const sendBtn = h('button', { type: 'button', class: 'jay-send', 'aria-label': 'Send', disabled: true, onclick: send }, icon('arrow-up', 18));
    const micBtn = h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Dictate', 'aria-pressed': 'false', 'data-tip': 'Voice', onclick: toggleMic }, icon('mic', 17));
    const listenBar = h('div', { class: 'jay-listen', hidden: true, role: 'status' },
      h('span', { class: 'jay-listen-wave', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
      h('span', null, 'Listening… (voice preview)'),
      h('button', { type: 'button', class: 'jay-link', onclick: () => stopMic(true) }, 'Stop'));
    const composerContext = h('span', { class: 'jay-chip is-static', title: 'Context Jay will use' }, icon('user', 14), h('span', { class: 'jay-chip-label' }, shared.context));

    const composer = h('div', { class: 'jay-composer' },
      intentTag, attachTray, listenBar, textarea,
      h('div', { class: 'jay-composer-bar' },
        h('div', { class: 'jay-composer-left' },
          h('button', { type: 'button', class: 'jay-icon-btn is-sm', 'aria-label': 'Attach file', 'data-tip': 'Attach', onclick: () => fileInput.click() }, icon('paperclip', 17)),
          micBtn,
          h('span', { class: 'jay-composer-divider', 'aria-hidden': 'true' }),
          composerContext,
          h('span', { class: 'jay-chip is-static jay-hide-narrow', title: 'Replies are generated locally in this preview' }, icon('sparkle', 14), h('span', { class: 'jay-chip-label' }, 'Local preview'))),
        sendBtn),
      fileInput);

    const quick = h('div', { class: 'jay-quick', role: 'group', 'aria-label': 'Quick actions' },
      QUICK.map((q) => h('button', {
        type: 'button', class: 'jay-quick-chip', 'data-intent': q.intent, 'aria-pressed': 'false',
        onclick: () => prime(shared.intent === q.intent ? null : q.intent),
      }, icon(q.icon, 14), q.label)));

    const foot = h('div', { class: 'jay-talk-foot' }, quick, composer);
    const el = h('section', { class: ['jay-talk', 'is-' + o.mode], 'aria-label': 'Talk to Jay' }, head, scroll, foot);

    /* ── behaviours ── */
    function saveDraft() { shared.draft = textarea.value; shared.convId = convId; }
    function autosize() {
      textarea.style.height = 'auto';
      const max = o.mode === 'focus' ? 200 : 140;
      textarea.style.height = Math.min(max, textarea.scrollHeight) + 'px';
      sendBtn.disabled = !textarea.value.trim() || busy;
    }
    textarea.addEventListener('input', () => { autosize(); shared.draft = textarea.value; });
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

    function prime(intent) {
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
      textarea.focus({ preventScroll: true });
    }

    function openContextMenu(anchor) {
      JAY.ui.menu(anchor, CONTEXTS.map((c) => ({
        label: c, icon: c === 'Personal' ? 'user' : (c === 'Work' ? 'server' : 'building'), active: c === shared.context,
        hint: c === shared.context ? 'Current' : '',
        run: () => { shared.context = c; JAY.storage.set('context', c); updateHeader(); composerContext.querySelector('.jay-chip-label').textContent = c; JAY.emit('context', c); },
      })), { label: 'Context' });
    }

    function updateHeader() {
      const title = conversation ? conversation.title : 'Main';
      mount(contextBtn, h('span', null, shared.context), h('span', { class: 'jay-dot-sep', 'aria-hidden': 'true' }, '•'), h('span', { class: 'jay-talk-conv' }, title), icon('chevron-down', 14));
      contextBtn.setAttribute('aria-label', 'Context: ' + shared.context + ', conversation: ' + title + '. Change context');
    }

    function messageNode(m) {
      if (m.role === 'user') {
        return h('div', { class: 'jay-msg is-user' }, h('div', { class: 'jay-bubble' }, m.text),
          h('div', { class: 'jay-msg-meta' }, fmt.time(m.at)));
      }
      return h('div', { class: 'jay-msg is-jay' },
        h('span', { class: 'jay-mark is-xs', 'aria-hidden': 'true' }, 'J'),
        h('div', { class: 'jay-msg-body' },
          h('div', { class: 'jay-msg-text' }, m.text),
          m.link ? h('button', { type: 'button', class: 'jay-msg-link', onclick: () => { location.hash = m.link.route; } }, m.link.label, icon('arrow-right', 14)) : null,
          h('div', { class: 'jay-msg-meta' }, fmt.time(m.at), m.local ? h('span', { class: 'jay-msg-local' }, ' · local preview reply') : null)));
    }

    function emptyNode() {
      return h('div', { class: 'jay-talk-empty' },
        h('div', { class: 'jay-talk-greeting' }, fmt.greeting() + ', Pat.'),
        h('div', { class: 'jay-talk-prompt' }, 'What should we take care of?'),
        h('div', { class: 'jay-talk-suggest' },
          ['What should I focus on today?', 'Remind me to call the bank at 4pm', 'What’s overdue?'].map((s) =>
            h('button', { type: 'button', class: 'jay-suggest', onclick: () => { textarea.value = s; autosize(); send(); } }, icon('arrow-right', 14), s))));
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
      requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
    }

    async function load(id) {
      convId = id || 'main';
      shared.convId = convId;
      mount(thread, JAY.ui.state('loading', { rows: 3 }));
      try {
        conversation = await JAY.data.getConversation(convId);
        if (!conversation) { conversation = { id: convId, title: 'Main', messages: [] }; }
      } catch (err) {
        mount(thread, JAY.ui.state('error', { title: 'Couldn’t load this conversation.', action: { label: 'Retry', icon: 'refresh', run: () => load(convId) } }));
        return;
      }
      updateHeader();
      renderThread();
    }

    async function newConversation() {
      convId = await JAY.data.newConversation();
      shared.convId = convId;
      conversation = { id: convId, title: 'New conversation', messages: [] };
      updateHeader();
      renderThread();
      prime(null);
    }

    function showTyping() {
      const t = h('div', { class: 'jay-msg is-jay is-typing', 'aria-label': 'Jay is typing' },
        h('span', { class: 'jay-mark is-xs', 'aria-hidden': 'true' }, 'J'),
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

    /* ── init ── */
    textarea.value = shared.draft || '';
    autosize();
    if (shared.intent) prime(shared.intent); else textarea.placeholder = DEFAULT_PLACEHOLDER;
    load(shared.convId);

    const offCtx = JAY.on('context', () => { updateHeader(); composerContext.querySelector('.jay-chip-label').textContent = shared.context; });
    const offOpen = JAY.on('chat:open', (id) => load(id));
    const offPrime = JAY.on('chat:prime', (intent) => prime(intent));

    return {
      el,
      focus() { textarea.focus({ preventScroll: true }); },
      prime,
      load,
      destroy() { saveDraft(); stopMic(false); offCtx(); offOpen(); offPrime(); },
    };
  }

  JAY.chat = {
    create,
    shared,
    open(id) { shared.convId = id; JAY.emit('chat:open', id); },
    prime(intent) { shared.intent = intent; JAY.emit('chat:prime', intent); },
    respond,
  };
})();
