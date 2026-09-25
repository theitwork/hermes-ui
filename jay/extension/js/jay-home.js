/* JAY customization — Home command center (v2: floating panels + lime).
   Desktop (>= 1280): one filled panel grid —
     [Today 288] [Talk to Jay — dominant] [Attention feed 336]
     [Projects] [Tasks] [Continue] [Jay status]   (four bento panels)
   Small desktop (1024–1279): Talk + Attention side by side; bento 2×2 + Today below.
   Tablet (768–1023): the page scrolls, not the panels — Attention shows its
   top 3 (+ "See all"), Today folds earlier items; only the Talk thread scrolls.
   Phones (< 768): a vertical app — greeting, Ask Jay card, quick chips,
   Attention (top 3), Today, Projects, Continue, Status — full-width panels.
   Every block is an independent JAY.widget so one failure never blanks Home. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY || !JAY.data) return;
  const { h, icon, fmt, mount } = JAY;
  const ui = JAY.ui;

  const KIND = {
    event: { icon: 'calendar', label: 'Event', hue: 'blue' },
    task: { icon: 'check-square', label: 'Task', hue: 'lime' },
    reminder: { icon: 'bell', label: 'Reminder', hue: 'yellow' },
    automation: { icon: 'automations', label: 'Automation', hue: 'purple' },
    followup: { icon: 'phone', label: 'Follow-up', hue: 'orange' },
  };
  const LEVEL_LABEL = { critical: 'Critical', overdue: 'Overdue', respond: 'Needs reply', waiting: 'Waiting', info: 'FYI' };
  const SOURCE_ICON = { automation: 'automations', task: 'tasks', email: 'mail', calendar: 'calendar', followup: 'user-check' };
  // primary → lime fill; everything else renders as an outline button.
  const ACTIONS = {
    approve: { label: 'Approve', icon: 'check', primary: true, toast: 'Approved' },
    decline: { label: 'Decline', icon: 'x', toast: 'Declined' },
    done: { label: 'Done', icon: 'check', primary: true, toast: 'Marked done' },
    snooze: { label: 'Snooze', icon: 'snooze' },
    dismiss: { label: 'Dismiss', icon: 'x', toast: 'Dismissed' },
    view: { label: 'View', icon: 'eye' },
    open: { label: 'Open', icon: 'arrow-up-right' },
    inspect: { label: 'Inspect', icon: 'arrow-up-right' },
    reply: { label: 'Reply', icon: 'reply', primary: true },
  };
  const OPENERS = ['view', 'open', 'inspect'];
  const NEEDS_ME = ['critical', 'overdue', 'respond'];
  const TONES = [1, 2, 3, 4, 5];
  const HOUR = 3600000;
  // Tablet widths render the desktop grid, but the page scrolls instead of the panels.
  const mqTablet = window.matchMedia('(max-width: 1023.98px)');

  /* ── shared helpers ─────────────────────────────────────────────────── */
  // Panel header: 16px Poppins title (optional muted sub-line), count badge,
  // then the controls — circle / icon buttons and a "View all ›" link.
  // opts.class 'is-top' = the Today / Attention head recipe shared with Talk.
  function panelHead(title, opts) {
    const o = opts || {};
    const tools = [].concat(o.extra || [], o.action ? h('button', { type: 'button', class: 'jay-link jay-hp-link', onclick: o.action.run, 'aria-label': o.action.aria || null },
      h('span', null, o.action.label), icon('chevron-right', 14)) : []).filter(Boolean);
    return h('header', { class: ['jay-hp-head', o.class || ''] },
      h('div', { class: 'jay-hp-titles' },
        h('h2', { class: 'jay-hp-title', id: o.id || null }, title),
        o.sub ? o.sub : null),
      o.count !== undefined && o.count !== null ? o.count : null,
      h('span', { class: 'jay-spacer' }),
      tools.length ? h('div', { class: 'jay-hp-tools' }, tools) : null);
  }

  // Open Jay with a draft and/or an intent. The draft goes through
  // JAY.chat.prefill, so text the user already typed is kept. Talk opens
  // synchronously when the shell allows it, so the composer takes focus inside
  // the same tap (phones raise the keyboard).
  function goTalk(req) {
    const r = req || {};
    const hasDraft = typeof r.draft === 'string';
    if (hasDraft || r.intent) JAY.chat.prefill(hasDraft ? r.draft : null, r.intent ? { intent: r.intent } : {});
    const dock = !JAY.isMobile() ? document.querySelector('.jay-talk.is-dock') : null;
    if (!dock || !dock.isConnected) {
      if (JAY.shell && typeof JAY.shell.navigate === 'function') JAY.shell.navigate('#/talk');
      else { location.hash = '#/talk'; return; }
    }
    JAY.chat.focus();
  }

  function toneOf(p) { const t = Number(p && p.tone); return TONES.includes(t) ? t : 1; }
  function firstName(name) { return String(name || '').split(/\s+/)[0] || String(name || ''); }
  // The signed-in user's first name, or '' while JAY only knows a placeholder.
  function userName() { const u = JAY.me; return u && u.name && u.id !== 'me' ? firstName(u.name) : ''; }
  function isTablet() { return !JAY.isMobile() && mqTablet.matches; }
  // Soft top edge on a scroll area once its content has moved under the header.
  function edgeOnScroll(el) {
    const sync = () => el.classList.toggle('is-scrolled', el.scrollTop > 2);
    el.addEventListener('scroll', sync, { passive: true });
    return sync;
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
    h('span', { class: ['jay-tl-ic', 'is-' + k.hue], title: k.label, 'aria-hidden': 'true' }, icon(k.icon, 13)),
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
    const nowNode = () => h('li', { class: 'jay-tl-now', 'aria-label': 'Now, ' + fmt.time(now) },
      h('span', { class: 'jay-tl-time' }, fmt.time(now)),
      h('span', { class: 'jay-tl-now-line', 'aria-hidden': 'true' }));
    if (o.collapsePast && past.length) {
      const label = h('span', null, 'Show ' + fmt.plural(past.length, 'earlier item'));
      const toggle = h('li', { class: 'jay-tl-toggle' }, h('button', {
        type: 'button', class: 'jay-tl-earlier', 'aria-expanded': 'false',
        onclick: (e) => {
          const btn = e.currentTarget;
          const open = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', open ? 'false' : 'true');
          list.querySelectorAll('.jay-tl-hidden').forEach((n) => { n.hidden = open; });
          label.textContent = open ? 'Show ' + fmt.plural(past.length, 'earlier item') : 'Hide earlier';
        },
      }, icon('history', 14), label));
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

  // Today head sub-line: what is left of the day (the date is in the page header).
  function todaySubline(items) {
    const now = Date.now();
    const list = Array.isArray(items) ? items : [];
    const ahead = list.filter((it) => new Date(it.end || it.at).getTime() >= now);
    if (!list.length) return 'Nothing scheduled';
    if (!ahead.length) return 'Nothing left · ' + fmt.plural(list.length, 'item') + ' earlier';
    const next = ahead[0];
    return (new Date(next.at).getTime() <= now ? 'Now ' : 'Next ') + fmt.time(next.at) + ' · ' + ahead.length + ' of ' + list.length + ' left';
  }

  // Open the timeline around "now", snapped to a row edge so no item is cut in
  // half — also when the list is too short to put "now" a third of the way down.
  const ROW_GAP = 6;
  function scrollToNow(body, list) {
    const max = body.scrollHeight - body.clientHeight;
    if (max <= 1) { body.scrollTop = 0; return; }
    const nowEl = list.querySelector('.jay-tl-now');
    if (!nowEl) return;
    const base = body.getBoundingClientRect().top - body.scrollTop;
    const topOf = (el) => el.getBoundingClientRect().top - base;
    const limit = Math.min(topOf(nowEl) - body.clientHeight / 3, max + ROW_GAP);
    let snap = 0;
    Array.from(list.children).forEach((li) => { if (!li.hidden && topOf(li) <= limit) snap = topOf(li); });
    body.scrollTop = Math.max(0, Math.round(snap - ROW_GAP));
  }

  // CRM-style calculation bar: three cells, number over label.
  function renderTodaySummary(s) {
    const items = [
      { n: s.tasksDue, label: s.tasksDue === 1 ? 'task due' : 'tasks due', route: '#/tasks?due=today' },
      { n: s.reminders, label: s.reminders === 1 ? 'reminder' : 'reminders' },
      { n: s.waiting, label: 'waiting', route: '#/tasks?status=waiting' },
    ];
    return h('div', { class: 'jay-today-summary' }, items.map((it) =>
      h(it.route ? 'button' : 'span', it.route ? { type: 'button', class: 'jay-sum', onclick: () => { location.hash = it.route; } } : { class: 'jay-sum' },
        h('strong', null, String(it.n)), h('span', null, it.label))));
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
      person ? h('div', { class: 'jay-person-row' }, ui.avatar(person.name, { id: person.id, size: 'lg', decorative: true }),
        h('div', null, h('div', { class: 'jay-person-name' }, person.name), h('div', { class: 'jay-muted' }, person.role))) : null,
      it.kind === 'event' ? h('p', { class: 'jay-note' }, icon('lock', 14), 'Sample event. Calendar isn’t connected in this preview.') : null,
      it.kind === 'automation' ? h('p', { class: 'jay-note' }, icon('automations', 14), 'Sample automation. Real schedules live in Automations (Hermes scheduled jobs).') : null);
    const footer = [
      h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => { panel.close(); goTalk({ draft: 'About “' + it.title + '” at ' + fmt.time(it.at) + ': ' }); } }, icon('chat', 16), 'Ask Jay'),
      it.kind === 'automation' ? h('button', { type: 'button', class: 'jay-btn is-outline', onclick: () => { panel.close(); location.hash = '#/automations'; } }, 'Open Automations') : null,
      it.kind === 'reminder' ? h('button', { type: 'button', class: 'jay-btn is-outline', onclick: () => { panel.close(); ui.toast('Snoozed 30 minutes (preview).', { icon: 'snooze' }); } }, icon('snooze', 16), 'Snooze') : null,
    ];
    const panel = ui.openPanel({ eyebrow: k.label, title: it.title, body, footer });
  }

  /* ── Attention (Deepsleep activity feed) ───────────────────────────── */
  // "Read" is a per-browser UI preference (which cards have been opened), never data.
  const READ_KEY = 'home:attention-read';
  function readSet() { const v = JAY.storage.get(READ_KEY, []); return new Set(Array.isArray(v) ? v : []); }
  function isUnread(item) {
    if (readSet().has(item.id)) return false;
    // Unread = arrived in the last few hours and not opened here yet.
    const age = Date.now() - new Date(item.at).getTime();
    return age < 6 * 3600000;
  }
  function markRead(ids) {
    const set = readSet();
    ids.forEach((id) => set.add(id));
    JAY.storage.set(READ_KEY, Array.from(set).slice(-200));
    document.querySelectorAll('.jay-att-feed .jay-feed-item.is-unread').forEach((n) => {
      if (ids.includes(n.dataset.att)) n.classList.remove('is-unread');
    });
  }

  // Snooze choices are real times, computed when the menu opens. "This evening"
  // only while it is still ahead; late at night only the later options remain.
  function snoozeOptions(now) {
    const at = (dayOffset, hour) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0); return d; };
    const opts = [{ label: 'In 3 hours', icon: 'clock', until: new Date(now.getTime() + 3 * HOUR) }];
    const hour = now.getHours() + now.getMinutes() / 60;
    if (hour < 17) opts.push({ label: 'This evening', icon: 'moon', until: at(0, 18) });
    else if (hour < 20) opts.push({ label: 'Tonight', icon: 'moon', until: at(0, 21) });
    opts.push({ label: 'Tomorrow morning', icon: 'sun', until: at(1, 8) });
    return opts;
  }
  // "08:00 tomorrow", "18:00", "Fri 08:00" — from the time the item really returns.
  function untilLabel(d) {
    const day = (x) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y.getTime(); };
    const days = Math.round((day(d) - day(new Date())) / 86400000);
    if (days === 0) return fmt.time(d);
    if (days === 1) return fmt.time(d) + ' tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + fmt.time(d);
  }

  // opts.after runs once the action has been applied (a drawer closes itself).
  async function runAttention(item, action, anchor, opts) {
    const o = opts || {};
    if (OPENERS.includes(action)) { openAttention(item); return; }
    if (action === 'reply') {
      if (o.after) o.after();
      goTalk({ draft: 'Draft a reply to ' + (item.personName || 'this') + ' about “' + item.title + '”: ' });
      return;
    }
    if (action === 'snooze') {
      ui.menu(anchor, snoozeOptions(new Date()).map((op) => ({
        label: op.label, icon: op.icon, hint: untilLabel(op.until),
        run: () => doResolve(item, 'snooze', { until: op.until.toISOString() }).then((ok) => { if (ok && o.after) o.after(); }),
      })), { label: 'Snooze until' });
      return;
    }
    const spec = ACTIONS[action];
    if (o.after) o.after();
    doResolve(item, action, null, (spec && spec.toast) || 'Updated');
  }
  async function doResolve(item, action, opts, message) {
    try {
      const res = await JAY.data.resolveAttention(item.id, action, opts || undefined);
      let text = message;
      if (action === 'snooze') {
        // Say when the item really comes back, whatever the data source decided.
        const back = res && res.snoozedUntil ? new Date(res.snoozedUntil) : (opts && opts.until ? new Date(opts.until) : null);
        text = back && !Number.isNaN(back.getTime()) ? 'Snoozed until ' + untilLabel(back) : 'Snoozed';
      }
      const toastIcon = action === 'snooze' ? 'snooze' : (action === 'dismiss' || action === 'decline' ? 'x' : 'check');
      ui.toast(text + ': ' + (item.target || item.title), { icon: toastIcon, action: { label: 'Undo', run: () => JAY.data.restoreAttention(item.id) } });
      return true;
    } catch (err) {
      ui.toast('Couldn’t update that item.', { tone: 'danger', icon: 'alert-circle' });
      return false;
    }
  }

  function whoFor(item, people) {
    if (!item.actor) return null;
    const p = (people || []).find((x) => x.id === item.actor);
    if (p) return { id: p.id, name: p.name };
    if (item.actor === 'jay') return { id: 'jay', name: 'Jay' };
    if (item.personName) return { id: item.actor, name: item.personName };
    return { id: item.actor, name: item.actor.charAt(0).toUpperCase() + item.actor.slice(1) };
  }

  // Items about a project muted on its page stay listed but step back (no
  // unread bar, dimmed, after everything else). Needs JAY.projects.isMuted.
  function mutedProjectOf(item, projects) {
    const isMuted = JAY.projects && typeof JAY.projects.isMuted === 'function' ? JAY.projects.isMuted : null;
    if (!isMuted || !Array.isArray(projects) || !projects.length) return null;
    const ctx = [].concat(item.context || [], item.meta || []).map((c) => String(c).toLowerCase());
    const p = projects.find((x) => x && (x.id === item.projectId || ctx.some((c) => c === String(x.title || '').toLowerCase() || c.endsWith('· ' + String(x.title || '').toLowerCase()))));
    try { return p && isMuted(p.id) ? p : null; } catch (_) { return null; }
  }

  function attentionNode(item, people, muted) {
    const who = whoFor(item, people);
    const future = new Date(item.at).getTime() > Date.now() + 60000;
    const node = ui.feedItem({
      who,
      icon: item.icon || SOURCE_ICON[item.source] || 'bell',
      hue: item.hue || 'neutral',
      verb: item.verb || item.label,
      target: item.target || item.title,
      onTarget: () => openAttention(item),
      context: Array.isArray(item.context) && item.context.length ? item.context : [item.meta].filter(Boolean),
      time: future ? fmt.time(item.at) : fmt.ago(item.at),
      attachment: item.attachment || null,
      unread: !muted && isUnread(item),
      level: item.level,
      actions: (item.actions || []).filter((a) => ACTIONS[a]).map((a) => ({
        label: ACTIONS[a].label,
        primary: !!ACTIONS[a].primary,
        aria: ACTIONS[a].label + ': ' + (item.target || item.title),
        run: (btn) => runAttention(item, a, btn),
      })),
    });
    node.dataset.att = item.id;
    // Deepsleep shows first names in the feed line; the avatar keeps both initials.
    const strong = who ? node.querySelector('.jay-feed-line > strong') : null;
    if (strong) strong.textContent = firstName(who.name) + ' ';
    const time = node.querySelector('.jay-feed-time');
    if (time) time.title = new Date(item.at).toLocaleString();
    const line = node.querySelector('.jay-feed-line');
    if (line && (item.level === 'critical' || item.level === 'overdue')) line.appendChild(h('span', { class: 'jay-sr-only' }, ' (' + LEVEL_LABEL[item.level] + ')'));
    if (muted) {
      node.classList.add('is-muted');
      const ctx = node.querySelector('.jay-feed-ctx');
      if (ctx) ctx.appendChild(h('span', { class: 'jay-att-muted' }, icon('bell-off', 12), 'Muted'));
    }
    return node;
  }

  // Feed list; opts.limit shows the first N plus a "See all" inset button.
  function renderAttention(items, opts) {
    const o = opts || {};
    const people = o.people || [];
    const tagged = items.map((it) => ({ it, muted: mutedProjectOf(it, o.projects) }));
    const ordered = tagged.filter((x) => !x.muted).concat(tagged.filter((x) => x.muted));
    const shown = o.limit ? ordered.slice(0, o.limit) : ordered;
    const list = h('div', { class: 'jay-att-feed', role: 'list' }, shown.map((x) => {
      const n = attentionNode(x.it, people, !!x.muted);
      n.setAttribute('role', 'listitem');
      return n;
    }));
    if (o.limit && items.length > o.limit) {
      return h('div', { class: 'jay-att-wrap' }, list,
        h('button', { type: 'button', class: 'jay-btn is-inset is-block jay-att-more', onclick: () => openAllAttention() }, 'See all ' + items.length, icon('chevron-right', 15)));
    }
    return list;
  }

  // People and projects only decorate the feed (names, avatars, muted
  // projects): a slow or failing source degrades the cards instead of holding
  // Attention hostage.
  function soft(fn) {
    return Promise.race([
      Promise.resolve().then(fn).then((v) => (Array.isArray(v) ? v : []), () => []),
      new Promise((resolve) => setTimeout(() => resolve([]), 1500)),
    ]);
  }
  function loadAttention() {
    const canMute = JAY.projects && typeof JAY.projects.isMuted === 'function';
    return Promise.all([
      JAY.data.getAttentionItems(),
      soft(() => JAY.data.getPeople()),
      canMute ? soft(() => JAY.data.getProjects()) : [],
    ]).then(([items, people, projects]) => {
      if (items && items.__state) return items;
      return { items: Array.isArray(items) ? items : [], people, projects };
    });
  }

  // Keep keyboard focus in the feed when an action removes the focused card:
  // the same card if it is still there, else the one that took its place.
  function feedFocusMemo(listEl) {
    const active = document.activeElement;
    if (!listEl || !active || !listEl.contains(active)) return null;
    const card = active.closest('[data-att]');
    const cards = Array.from(listEl.querySelectorAll('[data-att]'));
    return { id: card ? card.dataset.att : null, index: card ? cards.indexOf(card) : 0 };
  }
  function restoreFeedFocus(memo, listEl, fallback) {
    if (!memo) return;
    setTimeout(() => {
      if (listEl.contains(document.activeElement)) return;
      if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('.jay-att-body, .jay-att-sheet')) return;
      const cards = Array.from(listEl.querySelectorAll('[data-att]'));
      const card = cards.find((c) => c.dataset.att === memo.id) || cards[Math.min(memo.index, cards.length - 1)];
      const target = card ? card.querySelector('.jay-feed-target, button') : null;
      if (target) target.focus({ preventScroll: false });
      else if (fallback) fallback.focus();
    }, 0);
  }

  function openAllAttention() {
    const box = h('div', { class: 'jay-att-sheet' });
    let current = null;
    const w = JAY.widget(box, {
      name: 'attention-all', domains: ['attention'], load: loadAttention,
      isEmpty: (d) => !d.items.length,
      render: (d) => {
        const memo = feedFocusMemo(current);
        current = h('div', { class: 'jay-att-list' }, renderAttention(d.items, { people: d.people, projects: d.projects }));
        restoreFeedFocus(memo, current, null);
        return current;
      },
      empty: { icon: 'check', title: 'You’re caught up.', text: 'Nothing needs you right now.' },
    });
    ui.openPanel({ eyebrow: 'Attention', title: 'Things that may need you', body: box, onDispose: () => w.dispose() });
  }

  async function openAttention(item) {
    markRead([item.id]);
    let task = null;
    if (item.taskId) { try { task = await JAY.data.getTask(item.taskId); } catch (_) { task = null; } }
    const att = item.attachment;
    const ctx = Array.isArray(item.context) && item.context.length ? item.context.join(' · ') : item.meta;
    const body = h('div', { class: 'jay-detail' },
      h('div', { class: 'jay-detail-hero' },
        h('span', { class: ['jay-level-badge', 'is-' + item.level] }, icon(SOURCE_ICON[item.source] || 'alert-circle', 15), item.label + ' · ' + LEVEL_LABEL[item.level])),
      h('dl', { class: 'jay-dl' },
        h('dt', null, 'When'), h('dd', null, fmt.relative(item.at) + ' · ' + fmt.time(item.at)),
        h('dt', null, 'Context'), h('dd', null, ctx),
        item.personName ? [h('dt', null, 'From'), h('dd', null, item.personName)] : null),
      item.detail ? h('blockquote', { class: 'jay-quote' }, item.detail) : null,
      att ? h('div', { class: 'jay-feed-att jay-att-file' },
        ui.fileBadge(att),
        h('span', { class: 'jay-feed-att-main' }, h('span', { class: 'jay-feed-att-name' }, att.name), att.meta ? h('span', { class: 'jay-feed-att-meta' }, att.meta) : null)) : null,
      task ? h('button', { type: 'button', class: 'jay-linked', onclick: () => { panel.close(); JAY.tasks.openTask(task.id); } },
        icon('tasks', 16), h('span', null, h('span', { class: 'jay-linked-title' }, task.title), h('span', { class: 'jay-muted' }, (task.project ? task.project.title + ' · ' : '') + 'Due ' + fmt.due(task.due).toLowerCase())), icon('chevron-right', 16)) : null,
      item.source === 'email' ? h('p', { class: 'jay-note' }, icon('lock', 14), 'Sample message. Email isn’t connected in this preview.') : null);
    const acts = (item.actions || []).filter((a) => ACTIONS[a] && !OPENERS.includes(a));
    // Every action closes the drawer once it has been applied (Snooze after a time is picked).
    const footer = [
      h('button', { type: 'button', class: 'jay-btn is-ghost', onclick: () => { panel.close(); goTalk({ draft: 'Help me with: ' + item.title + ' — ' }); } }, icon('chat', 16), 'Ask Jay'),
      acts.map((a) => h('button', {
        type: 'button', class: ['jay-btn', ACTIONS[a].primary ? 'is-primary' : 'is-outline'],
        onclick: (e) => runAttention(item, a, e.currentTarget, { after: () => panel.close() }),
      }, icon(ACTIONS[a].icon, 16), ACTIONS[a].label)),
    ];
    const panel = ui.openPanel({ eyebrow: 'Attention', title: item.title, body, footer });
  }

  // Desktop Attention panel: header, All / Needs me tabs, scrolling feed
  // (tablets: top 3 + "See all", and the page scrolls instead).
  function attentionPanel(widgets) {
    let filter = 'all';
    let last = null;
    let listEl = null;
    const body = h('div', { class: 'jay-att-body' });
    const syncEdge = edgeOnScroll(body);
    const tabs = ui.tabs([
      { id: 'all', label: 'All', badge: 0 },
      { id: 'me', label: 'Needs me', badge: 0 },
    ], { label: 'Attention filter', active: 'all', panel: body, onSelect: (id) => { filter = id; paint(); } });
    function setBadges(items) {
      const counts = { all: items ? items.length : 0, me: items ? items.filter((it) => NEEDS_ME.includes(it.level)).length : 0 };
      Object.keys(counts).forEach((id) => {
        const b = tabs.querySelector('[data-tab="' + id + '"] .jay-badge');
        if (!b) return;
        b.textContent = String(counts[id]);
        b.hidden = !counts[id];
      });
    }
    setBadges(null);
    function fill(target, d) {
      const items = filter === 'me' ? d.items.filter((it) => NEEDS_ME.includes(it.level)) : d.items;
      mount(target, items.length ? renderAttention(items, { people: d.people, projects: d.projects, limit: isTablet() ? 3 : 0 })
        : ui.state('empty', { icon: 'check', title: 'Nothing needs you.', text: 'What’s left here is FYI.', compact: true }));
    }
    function paint() {
      if (!listEl || !last || !listEl.isConnected) return;
      fill(listEl, last);
      body.scrollTop = 0;
      syncEdge();
    }
    const readAll = h('button', {
      type: 'button', class: 'jay-icon-btn', 'aria-label': 'Mark all as read', 'data-tip': 'Mark all read',
      onclick: () => { if (last) markRead(last.items.map((it) => it.id)); },
    }, icon('check', 17));
    const more = h('button', {
      type: 'button', class: 'jay-icon-btn', 'aria-label': 'Attention options', 'aria-haspopup': 'menu',
      onclick: (e) => ui.menu(e.currentTarget, [
        { label: 'Open as a list', icon: 'list', run: () => openAllAttention() },
        { label: 'Mark all as read', icon: 'check', run: () => { if (last) markRead(last.items.map((it) => it.id)); } },
        { label: 'Go to Tasks', icon: 'tasks', run: () => { location.hash = '#/tasks'; } },
      ], { label: 'Attention options', align: 'right' }),
    }, icon('more-vertical', 18));
    const el = ui.box({ class: ['is-col', 'jay-hp', 'jay-attention'], 'aria-labelledby': 'jayAttH', 'data-jay-region': 'attention', id: 'jayAttention' },
      panelHead('Attention', { id: 'jayAttH', extra: [readAll, more], class: 'is-top is-att' }),
      h('div', { class: 'jay-att-tabbar' }, tabs),
      body);
    const reset = () => { last = null; listEl = null; setBadges(null); };
    widgets.push(JAY.widget(body, {
      name: 'attention', domains: ['attention', 'people'], skeletonRows: 6,
      load: () => loadAttention().then((d) => { if (!d || d.__state || !d.items.length) reset(); return d; }, (err) => { reset(); throw err; }),
      isEmpty: (d) => !d.items.length,
      render: (d) => {
        const memo = feedFocusMemo(listEl);
        last = d;
        setBadges(d.items);
        listEl = h('div', { class: 'jay-att-list' });
        fill(listEl, d);
        restoreFeedFocus(memo, listEl, tabs.querySelector('[aria-selected="true"]'));
        requestAnimationFrame(syncEdge);
        return listEl;
      },
      empty: { icon: 'check', title: 'You’re caught up.', text: 'Nothing needs you right now.' },
    }));
    el.repaint = paint;
    return el;
  }

  /* ── Bento panels ───────────────────────────────────────────────────── */
  function renderProjects(projects, opts) {
    const o = opts || {};
    return h('ul', { class: 'jay-hp-rows' }, projects.slice(0, o.limit || 4).map((p) => {
      const hasProgress = p.progress !== null && p.progress !== undefined;
      const pct = hasProgress ? Math.max(0, Math.min(100, Math.round(Number(p.progress) || 0))) : null;
      const count = fmt.plural(Number(p.openTasks) || 0, 'task');
      // The button carries the whole name; the meter inside is decoration.
      const meter = hasProgress ? ui.meter(p.progress, { decorative: true }) : null;
      if (meter) meter.setAttribute('aria-hidden', 'true');
      return h('li', null,
        h('button', {
          type: 'button', class: 'jay-hp-row jay-proj-row', onclick: () => JAY.projects.openPreview(p.id),
          'aria-label': p.title + ', ' + (hasProgress ? pct + '% complete' : count),
        },
          h('span', { class: ['jay-side-dot', 'is-tone-' + toneOf(p)], 'aria-hidden': 'true' }),
          h('span', { class: 'jay-proj-title' }, p.title),
          meter || h('span', { class: 'jay-proj-n' }, count)));
    }));
  }

  function renderTaskCounts(c) {
    const rows = [
      { label: 'Today', n: c.today, route: '#/tasks?due=today', icon: 'calendar' },
      { label: 'Overdue', n: c.overdue, route: '#/tasks?due=overdue', icon: 'alert-triangle', tone: c.overdue ? 'danger' : '' },
      { label: 'In progress', n: c.in_progress, route: '#/tasks?status=in_progress', icon: 'circle-dashed' },
      { label: 'Waiting', n: c.waiting, route: '#/tasks?status=waiting', icon: 'hourglass' },
    ];
    return h('ul', { class: 'jay-hp-rows' }, rows.map((r) => h('li', null,
      h('button', { type: 'button', class: ['jay-hp-row', 'jay-count-row', r.tone ? 'is-' + r.tone : ''], onclick: () => { location.hash = r.route; }, 'aria-label': r.label + ': ' + r.n },
        icon(r.icon, 16, 'jay-count-ic'), h('span', { class: 'jay-count-label' }, r.label), ui.badge(Number(r.n) || 0, { tone: r.tone || null })))));
  }

  function openSession(s) {
    if (s.source === 'hermes') {
      location.hash = '#/chat';
      setTimeout(() => { if (typeof window.loadSession === 'function') window.loadSession(s.id); }, 80);
      return;
    }
    JAY.chat.open(s.id);
    if (JAY.isMobile() || !document.querySelector('.jay-talk.is-dock')) location.hash = '#/talk';
    else ui.toast('Opened “' + s.title + '”', { icon: 'chat' });
  }

  function renderSessions(sessions, opts) {
    const o = opts || {};
    return h('ul', { class: 'jay-hp-rows' }, sessions.slice(0, o.limit || 3).map((s) => h('li', null,
      h('button', { type: 'button', class: 'jay-hp-row jay-cont-row', onclick: () => openSession(s) },
        h('span', { class: 'jay-cont-ic', 'aria-hidden': 'true' }, icon(s.source === 'hermes' ? 'chat' : 'message-circle', 15)),
        h('span', { class: 'jay-cont-main' }, h('span', { class: 'jay-cont-title' }, s.title), h('span', { class: 'jay-cont-meta' }, s.context)),
        h('span', { class: 'jay-cont-time' }, fmt.ago(s.updatedAt))))));
  }

  const STATE_WORD = { online: 'online', warning: 'needs attention', offline: 'offline' };
  function renderStatus(st, opts) {
    const o = opts || {};
    const items = st && Array.isArray(st.items) ? st.items : [];
    const checked = st && st.checkedAt && !Number.isNaN(new Date(st.checkedAt).getTime()) ? fmt.relative(st.checkedAt) : null;
    return h('div', { class: 'jay-status' },
      h('ul', { class: 'jay-status-list' }, items.map((it) => h('li', { class: 'jay-status-row', title: it.detail || null },
        h('span', { class: 'jay-status-label' }, it.label),
        h('span', { class: ['jay-status-val', 'is-' + it.state] }, h('i', { class: 'jay-status-dot', 'aria-hidden': 'true' }), it.value, h('span', { class: 'jay-sr-only' }, ' (' + (STATE_WORD[it.state] || it.state) + ')'))))),
      o.hideCheck || !checked ? null : h('div', { class: 'jay-status-foot' }, icon('refresh', 13), h('span', null, 'Checked ' + checked.toLowerCase())));
  }

  // One bento panel: header + widget body (+ optional footer).
  function bento(widgets, cfg) {
    const body = h('div', { class: 'jay-hp-body' });
    const el = ui.box({ class: ['is-col', 'jay-hp', 'jay-bento-panel', cfg.class || ''], 'aria-labelledby': cfg.id },
      panelHead(cfg.title, { id: cfg.id, action: cfg.action, extra: cfg.extra }),
      body,
      cfg.foot ? h('div', { class: 'jay-hp-foot' }, cfg.foot) : null);
    widgets.push(JAY.widget(body, Object.assign({ name: cfg.name }, cfg.widget)));
    return el;
  }

  // Bento panels are short: their error states are compact so one failing
  // source never squeezes the Talk panel above.
  const COMPACT_ERROR = { compact: true, text: null };
  const WIDGETS = {
    projects: { domains: ['projects'], load: () => JAY.data.getProjects(), empty: { icon: 'projects', title: 'No projects yet.', compact: true }, error: COMPACT_ERROR, skeletonRows: 4 },
    tasks: { domains: ['tasks'], load: () => JAY.data.getTaskCounts(), render: renderTaskCounts, isEmpty: () => false, error: COMPACT_ERROR, skeletonRows: 4 },
    continue: { domains: ['sessions'], load: () => JAY.data.getRecentSessions(), empty: { icon: 'history', title: 'No recent work yet.', compact: true }, error: COMPACT_ERROR, skeletonRows: 3 },
    status: {
      domains: ['system'], load: () => JAY.data.getSystemStatus(), error: COMPACT_ERROR, skeletonRows: 5,
      isEmpty: (s) => !s || !Array.isArray(s.items) || !s.items.length,
      empty: { icon: 'system', title: 'No status yet.', compact: true },
      states: { disconnected: { title: 'Status unavailable', text: 'JAY can’t reach the status service.', compact: true } },
    },
  };

  /* ── Desktop composition ───────────────────────────────────────────── */
  function renderDesktop(root) {
    const widgets = [];
    const todayBody = h('div', { class: 'jay-today-body' });
    const todayFoot = h('div', { class: 'jay-today-foot' });
    const todaySub = h('div', { class: 'jay-hp-sub' });
    const syncTodayEdge = edgeOnScroll(todayBody);
    const chat = JAY.chat.create({ mode: 'dock' });
    // Keep Today opened at "now" while the panels around it settle (fonts,
    // bento widgets loading) — until the reader scrolls it themselves.
    let todayMoved = false;
    let todayAuto = null;
    todayBody.addEventListener('scroll', () => { if (todayAuto === null || Math.abs(todayBody.scrollTop - todayAuto) > 1) todayMoved = true; }, { passive: true });
    function autoScrollToday() {
      const list = todayBody.querySelector('.jay-timeline');
      if (!list || todayMoved) return;
      scrollToNow(todayBody, list);
      todayAuto = todayBody.scrollTop;
      syncTodayEdge();
    }
    const todayRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => autoScrollToday()) : null;
    if (todayRO) todayRO.observe(todayBody);

    // Same head recipe as Talk and Attention: 16px title, muted sub-line.
    const today = ui.box({ class: ['is-col', 'jay-hp', 'jay-today'], 'aria-labelledby': 'jayTodayH', 'data-jay-region': 'today' },
      panelHead('Today', {
        id: 'jayTodayH', class: 'is-top', sub: todaySub,
        extra: h('button', { type: 'button', class: 'jay-circle-btn is-sm', 'aria-label': 'Add a reminder with Jay', 'data-tip': 'Add reminder', onclick: () => goTalk({ intent: 'reminder' }) }, icon('plus', 16)),
      }),
      todayBody, todayFoot);

    const bentoRow = h('div', { class: 'jay-bento', role: 'region', 'aria-label': 'Overview' },
      bento(widgets, {
        name: 'projects', id: 'jayProjH', title: 'Projects', class: 'is-projects',
        action: { label: 'View all', aria: 'View all projects', run: () => { location.hash = '#/projects'; } },
        extra: h('button', { type: 'button', class: 'jay-circle-btn is-sm', 'aria-label': 'New project', 'data-tip': 'New project', onclick: () => JAY.projects.openCreate() }, icon('plus', 15)),
        widget: Object.assign({ render: (p) => renderProjects(p) }, WIDGETS.projects),
      }),
      bento(widgets, {
        name: 'tasks', id: 'jayTasksH', title: 'Tasks', class: 'is-tasks',
        extra: h('button', { type: 'button', class: 'jay-circle-btn is-sm', 'aria-label': 'Add task', 'data-tip': 'Add task', onclick: () => JAY.tasks.openCreate() }, icon('plus', 15)),
        widget: WIDGETS.tasks,
      }),
      bento(widgets, {
        name: 'continue', id: 'jayContH', title: 'Continue', class: 'is-continue',
        action: { label: 'Talk', aria: 'Open the full conversation', run: () => { location.hash = '#/talk'; } },
        widget: Object.assign({ render: (s) => renderSessions(s) }, WIDGETS.continue),
      }),
      bento(widgets, {
        name: 'status', id: 'jayStatH', title: 'Jay status', class: 'is-status',
        action: { label: 'System', aria: 'Open System', run: () => { location.hash = '#/system'; } },
        widget: Object.assign({ render: (s) => renderStatus(s, { hideCheck: true }) }, WIDGETS.status),
      }));

    chat.el.classList.add('jay-home-talk');
    const attention = attentionPanel(widgets);
    mount(root, h('div', { class: 'jay-layout is-fill jay-home' }, today, chat.el, attention, bentoRow));

    const todayW = JAY.widget(todayBody, {
      name: 'today', domains: ['today'],
      load: () => JAY.data.getTodayItems().then((items) => {
        todaySub.textContent = Array.isArray(items) ? todaySubline(items) : '';
        return items;
      }, (err) => { todaySub.textContent = ''; throw err; }),
      render: (items) => {
        // Tablets fold earlier items away; the page scrolls, not the panel.
        const list = renderToday(items, { collapsePast: isTablet() });
        requestAnimationFrame(() => { if (list.isConnected) autoScrollToday(); });
        return list;
      },
      empty: { icon: 'calendar', title: 'A clear day.', text: 'Nothing scheduled.', action: { label: 'Add a reminder', run: () => goTalk({ intent: 'reminder' }) } },
      states: { disconnected: { title: 'Calendar disconnected', text: 'Tasks and reminders still show here.' }, 'not-connected': { title: 'Connect Calendar', text: 'Events will appear here once a calendar is connected.' } },
      skeletonRows: 6,
    });
    widgets.push(todayW);
    widgets.push(JAY.widget(todayFoot, { name: 'today-summary', domains: ['today', 'tasks'], load: () => JAY.data.getTodaySummary(), render: renderTodaySummary, isEmpty: () => false, quietStates: true, skeletonRows: 1 }));

    // Crossing 1024px switches between scrolling panels and a scrolling page.
    const onWidth = () => { attention.repaint(); todayW.refresh({ quiet: true }); };
    if (typeof mqTablet.addEventListener === 'function') mqTablet.addEventListener('change', onWidth);
    const offPrime = JAY.on('chat:prime', () => chat.focus());
    return () => {
      widgets.forEach((w) => w.dispose());
      chat.destroy();
      offPrime();
      if (todayRO) todayRO.disconnect();
      if (typeof mqTablet.removeEventListener === 'function') mqTablet.removeEventListener('change', onWidth);
    };
  }

  /* ── Mobile composition ────────────────────────────────────────────── */
  function renderMobile(root) {
    const widgets = [];
    const summaryLine = h('div', { class: 'jay-m-summary' });
    const attBody = h('div', { class: 'jay-hp-body' });
    const attCount = ui.badge(0, { accent: true });
    attCount.hidden = true;
    const todayBody = h('div', { class: 'jay-hp-body' });

    const quick = h('div', { class: 'jay-m-quick', role: 'group', 'aria-label': 'Quick actions' }, [
      ['task', 'Task', 'plus'], ['reminder', 'Reminder', 'plus'], ['idea', 'Capture idea', 'lightbulb'], ['research', 'Research', 'search'],
    ].map(([intent, label, ic]) => h('button', { type: 'button', class: 'jay-quick-chip', onclick: () => goTalk({ intent }) }, icon(ic, 14), label)));

    const ask = ui.box({ class: 'jay-m-ask', 'aria-label': 'Ask Jay' },
      h('div', { class: 'jay-m-askrow' },
        h('button', { type: 'button', class: 'jay-m-askbox', onclick: () => goTalk() },
          ui.avatar('Jay', { id: 'jay', size: 'md', decorative: true }),
          h('span', { class: 'jay-m-askph' }, 'Ask Jay…')),
        h('button', {
          type: 'button', class: 'jay-m-mic', 'aria-label': 'Talk to Jay by voice',
          onclick: () => { location.hash = '#/talk'; setTimeout(() => { const b = document.querySelector('.jay-talk [aria-label="Dictate"]'); if (b) b.click(); }, 120); },
        }, icon('mic', 20))),
      quick);

    const att = ui.box({ class: ['is-col', 'jay-hp', 'jay-m-att'], 'aria-labelledby': 'jayMAtt', 'data-jay-region': 'attention', id: 'jayAttention' },
      panelHead('Attention', { id: 'jayMAtt', count: attCount }),
      attBody);

    mount(root, h('div', { class: 'jay-home is-mobile' },
      h('header', { class: 'jay-m-hello' },
        h('div', { class: 'jay-m-greet' }, fmt.greeting() + (userName() ? ', ' + userName() : '')),
        h('div', { class: 'jay-m-date' }, fmt.dayLong(new Date())),
        summaryLine),
      ask,
      att,
      ui.box({ class: ['is-col', 'jay-hp', 'jay-m-today'], 'aria-labelledby': 'jayMToday', 'data-jay-region': 'today' },
        panelHead('Today', { id: 'jayMToday' }), todayBody),
      bento(widgets, {
        name: 'm-projects', id: 'jayMProj', title: 'Projects',
        action: { label: 'View all', aria: 'View all projects', run: () => { location.hash = '#/projects'; } },
        widget: Object.assign({}, WIDGETS.projects, { render: (p) => renderProjects(p, { limit: 3 }), skeletonRows: 3 }),
      }),
      bento(widgets, {
        name: 'm-continue', id: 'jayMCont', title: 'Continue',
        widget: Object.assign({}, WIDGETS.continue, { render: (s) => renderSessions(s, { limit: 3 }) }),
      }),
      bento(widgets, {
        name: 'm-status', id: 'jayMStat', title: 'Jay status',
        action: { label: 'System', aria: 'Open System', run: () => { location.hash = '#/system'; } },
        widget: Object.assign({}, WIDGETS.status, { render: (s) => renderStatus(s, { hideCheck: true }) }),
      })));

    widgets.push(JAY.widget(summaryLine, {
      name: 'm-summary', domains: ['tasks', 'today'], isEmpty: () => false, quietStates: true, skeletonRows: 1,
      load: () => Promise.all([JAY.data.getTaskCounts(), JAY.data.getTodaySummary()])
        .then(([c, s]) => ((c && c.__state) || (s && s.__state) ? { __state: (c && c.__state) || s.__state } : [c, s])),
      render: ([c, s]) => h('span', { class: 'jay-m-crumbs' },
        h('span', null, fmt.plural(c.today, 'task') + ' today'),
        c.overdue ? [h('span', { class: 'jay-sep', 'aria-hidden': 'true' }, '|'), h('span', { class: 'jay-warn-text' }, c.overdue + ' overdue')] : null,
        s.next ? [h('span', { class: 'jay-sep', 'aria-hidden': 'true' }, '|'), h('span', null, 'Next ' + fmt.time(s.next.at) + ' ' + s.next.title)] : null),
    }));
    widgets.push(JAY.widget(attBody, {
      name: 'm-attention', domains: ['attention', 'people'], skeletonRows: 4, load: loadAttention,
      isEmpty: (d) => !d.items.length,
      render: (d) => { attCount.hidden = !d.items.length; attCount.textContent = String(d.items.length); return renderAttention(d.items, { limit: 3, people: d.people, projects: d.projects }); },
      empty: { icon: 'check', title: 'You’re caught up.', text: 'Nothing needs you right now.', compact: true },
    }));
    widgets.push(JAY.widget(todayBody, { name: 'm-today', domains: ['today'], load: () => JAY.data.getTodayItems(), render: (items) => renderToday(items, { collapsePast: true }), empty: { icon: 'calendar', title: 'A clear day.', compact: true }, skeletonRows: 4 }));
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
