/* JAY customization — mock dataset.
   Pure data, built relative to "now" so the preview always looks current.
   Consumed only by the mock adapter in jay-providers.js — never by views. */
(function () {
  'use strict';
  const JAY = window.JAY;
  if (!JAY) return;

  function at(base, dayOffset, hh, mm) {
    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hh, mm || 0, 0, 0);
    return d.toISOString();
  }
  function minutesAgo(base, m) { return new Date(base.getTime() - m * 60000).toISOString(); }
  function daysAgo(base, days, hh) { return at(base, -days, hh === undefined ? 10 : hh, 15); }

  function build(nowInput) {
    const now = nowInput ? new Date(nowInput) : new Date();

    const people = [
      { id: 'pat', name: 'Pat', role: 'You', relation: 'self' },
      { id: 'jay', name: 'Jay', role: 'Assistant', relation: 'assistant' },
      { id: 'antoine', name: 'Antoine Khoury', role: 'Client · Khoury Group', relation: 'client', lastContact: daysAgo(now, 6) },
      { id: 'tony', name: 'Tony Haddad', role: 'Hardware supplier', relation: 'supplier', lastContact: daysAgo(now, 4) },
      { id: 'mike', name: 'Mike Rahal', role: 'Supplier contracts', relation: 'supplier', lastContact: daysAgo(now, 3) },
      { id: 'sarah', name: 'Sarah Mitchell', role: 'Account manager · Northwind', relation: 'client', lastContact: minutesAgo(now, 42) },
      { id: 'rana', name: 'Rana Saad', role: 'Web designer', relation: 'partner', lastContact: daysAgo(now, 1) },
      { id: 'karim', name: 'Karim Nassar', role: 'Accountant', relation: 'partner', lastContact: daysAgo(now, 9) },
    ];

    const projects = [
      {
        id: 'hermes-jay', title: 'Hermes / Jay', area: 'Work', status: 'active', tone: 2, icon: 'server', progress: 42,
        description: 'Personal AI operating system on a self-hosted Hermes agent.',
        milestone: 'Mock-backed UI review', people: ['pat', 'jay'], updatedAt: minutesAgo(now, 34),
      },
      {
        id: 'company-website', title: 'Company Website', area: 'Business', status: 'active', tone: 1, icon: 'globe', progress: 68,
        description: 'Redesign and relaunch of the company site with new service pages.',
        milestone: 'Content freeze', people: ['pat', 'rana'], updatedAt: daysAgo(now, 1, 16),
      },
      {
        id: 'business-ops', title: 'Business Operations', area: 'Business', status: 'ongoing', tone: 3, icon: 'building', progress: null,
        description: 'Proposals, suppliers, renewals and monthly admin.',
        milestone: null, people: ['pat', 'sarah', 'tony', 'mike', 'karim', 'antoine'], updatedAt: minutesAgo(now, 42),
      },
      {
        id: 'personal', title: 'Personal', area: 'Personal', status: 'ongoing', tone: 5, icon: 'heart', progress: null,
        description: 'Health, errands, family and personal admin.',
        milestone: null, people: ['pat'], updatedAt: daysAgo(now, 2, 19),
      },
      {
        id: 'home', title: 'Home', area: 'Personal', status: 'ongoing', tone: 4, icon: 'home', progress: null,
        description: 'Maintenance, bills and household projects.',
        milestone: null, people: ['pat'], updatedAt: daysAgo(now, 1, 20),
      },
    ];

    let n = 0;
    function task(t) {
      n += 1;
      return Object.assign({
        id: 'task-' + String(n).padStart(3, '0'),
        tags: [],
        assignee: 'pat',
        description: '',
        createdAt: daysAgo(now, 8 + (n % 5)),
        updatedAt: daysAgo(now, n % 4, 9 + (n % 8)),
      }, t);
    }

    const tasks = [
      // Due today
      task({ title: 'Finalize company proposal', projectId: 'business-ops', status: 'in_progress', priority: 'high', due: at(now, 0, 14, 0), tags: ['proposal'], description: 'Pricing table, scope and timeline for the Khoury Group managed-services proposal. Needs final read before sending.', updatedAt: minutesAgo(now, 55) }),
      task({ title: 'Review Hermes voice bridge', projectId: 'hermes-jay', status: 'next', priority: 'medium', due: at(now, 0, 17, 0), tags: ['voice'], description: 'Check latency and wake-word handling on the latest bridge build.' }),
      task({ title: 'Schedule supplier call', projectId: 'business-ops', status: 'next', priority: 'medium', due: at(now, 0, 12, 0), tags: ['suppliers'] }),
      task({ title: 'Pay electricity bill', projectId: 'home', status: 'next', priority: 'low', due: at(now, 0, 18, 0), tags: ['bills'] }),
      // Overdue
      task({ title: 'Send proposal to ABC Logistics', projectId: 'business-ops', status: 'in_progress', priority: 'urgent', due: at(now, -1, 17, 0), tags: ['proposal', 'client'], description: 'Revised proposal after Tuesday’s call. They asked for a phased rollout option.', assignee: 'pat' }),
      task({ title: 'Follow up with Tony on hardware quote', projectId: 'business-ops', status: 'next', priority: 'high', due: at(now, -2, 12, 0), tags: ['suppliers'], description: 'Quote for 12 laptops and two firewalls. Need it before the ABC proposal goes out.' }),
      // In progress
      task({ title: 'Homepage copy review', projectId: 'company-website', status: 'in_progress', priority: 'medium', due: at(now, 2, 12, 0), tags: ['content'], assignee: 'rana' }),
      task({ title: 'Configure Hermes backup automation', projectId: 'hermes-jay', status: 'in_progress', priority: 'high', due: at(now, 1, 12, 0), tags: ['ops'], description: 'Nightly snapshot of Hermes state to object storage with 14-day retention.' }),
      task({ title: 'Mobile layout for JAY', projectId: 'hermes-jay', status: 'in_progress', priority: 'medium', due: at(now, 4, 12, 0), tags: ['design'], assignee: 'jay' }),
      task({ title: 'Prepare monthly expenses', projectId: 'business-ops', status: 'in_progress', priority: 'medium', due: at(now, 3, 12, 0), tags: ['finance'], assignee: 'pat' }),
      // Waiting
      task({ title: 'Renewal quote approval', projectId: 'business-ops', status: 'waiting', priority: 'high', due: at(now, 1, 12, 0), tags: ['client'], assignee: 'sarah', description: 'Northwind renewal — waiting on Sarah’s sign-off.' }),
      task({ title: 'Website hosting migration', projectId: 'company-website', status: 'waiting', priority: 'medium', due: at(now, 5, 12, 0), tags: ['infra'], assignee: 'rana' }),
      task({ title: 'Plumber visit confirmation', projectId: 'home', status: 'waiting', priority: 'low', due: at(now, 2, 12, 0), tags: [] }),
      // Next / inbox
      task({ title: 'Set up SSL monitoring for website', projectId: 'company-website', status: 'next', priority: 'high', due: at(now, 3, 12, 0), tags: ['infra'] }),
      task({ title: 'Draft JAY attention rules', projectId: 'hermes-jay', status: 'next', priority: 'medium', due: at(now, 6, 12, 0), tags: ['design'], assignee: 'jay' }),
      task({ title: 'Collect testimonials for website', projectId: 'company-website', status: 'next', priority: 'low', due: at(now, 8, 12, 0), tags: ['content'] }),
      task({ title: 'Renew car insurance', projectId: 'personal', status: 'next', priority: 'medium', due: at(now, 9, 12, 0), tags: ['admin'] }),
      task({ title: 'Pick up dry cleaning', projectId: 'personal', status: 'next', priority: 'low', due: at(now, 1, 18, 0), tags: ['errands'] }),
      task({ title: 'Book dentist appointment', projectId: 'personal', status: 'inbox', priority: 'low', due: null, tags: ['health'] }),
      task({ title: 'Gym plan for next month', projectId: 'personal', status: 'inbox', priority: 'low', due: null, tags: ['health'] }),
      task({ title: 'Research ergonomic desk chairs', projectId: 'personal', status: 'inbox', priority: 'low', due: null, tags: ['research'] }),
      task({ title: 'Order replacement water filter', projectId: 'home', status: 'inbox', priority: 'low', due: null, tags: ['errands'] }),
      // Done
      task({ title: 'Migrate Hermes to OCI', projectId: 'hermes-jay', status: 'done', priority: 'high', due: at(now, -3, 12, 0), tags: ['ops'], updatedAt: daysAgo(now, 3, 16) }),
      task({ title: 'Approve homepage wireframes', projectId: 'company-website', status: 'done', priority: 'medium', due: at(now, -4, 12, 0), tags: ['design'], updatedAt: daysAgo(now, 4, 11) }),
      task({ title: 'File quarterly VAT return', projectId: 'business-ops', status: 'done', priority: 'high', due: at(now, -5, 12, 0), tags: ['finance'], assignee: 'karim', updatedAt: daysAgo(now, 5, 15) }),
      task({ title: 'Fix kitchen tap', projectId: 'home', status: 'done', priority: 'low', due: at(now, -6, 12, 0), tags: [], updatedAt: daysAgo(now, 6, 18) }),
    ];

    // Calendar, reminders, automations and follow-ups for the Today stream.
    // Tasks due today are merged into the stream by the adapter.
    const agenda = [
      { id: 'ag-1', kind: 'automation', title: 'Morning briefing', at: at(now, 0, 7, 30), meta: 'Automation · Hermes', detail: 'Summarised overnight email, calendar and server health into the 07:30 briefing.' },
      { id: 'ag-2', kind: 'event', title: 'Team meeting', at: at(now, 0, 9, 0), end: at(now, 0, 9, 45), meta: 'Company · 45 min', location: 'Office — meeting room', people: ['pat', 'rana', 'karim'], detail: 'Weekly sync: website launch plan, supplier status, Q4 priorities.' },
      { id: 'ag-3', kind: 'reminder', title: 'Call Tony about hardware quote', at: at(now, 0, 10, 0), meta: 'Reminder', detail: 'Created by Jay from your conversation this morning.', personId: 'tony' },
      { id: 'ag-4', kind: 'followup', title: 'Call Antoine', at: at(now, 0, 11, 30), meta: 'Follow-up · Khoury Group', personId: 'antoine', detail: 'Walk through the managed-services proposal before it goes out at 14:00.' },
      { id: 'ag-5', kind: 'reminder', title: 'Transfer rent', at: at(now, 0, 16, 30), meta: 'Reminder · Home', detail: 'Monthly transfer — same amount as last month.' },
      { id: 'ag-6', kind: 'automation', title: 'Hermes backup', at: at(now, 0, 18, 0), meta: 'Automation · nightly', detail: 'Snapshot of Hermes state, sessions and skills. Runs every day at 18:00.' },
      { id: 'ag-7', kind: 'event', title: 'Dinner with Lea', at: at(now, 0, 20, 30), meta: 'Personal', location: 'Mar Mikhael', detail: 'Table for two, booked last week.' },
    ];

    const attention = [
      { id: 'at-1', level: 'critical', source: 'automation', label: 'Automation', title: 'Daily backup failed', meta: 'Company file server', at: minutesAgo(now, 18), detail: 'The 02:00 backup of the company file server stopped at 61% with “destination quota exceeded”. The previous successful backup is from yesterday.', actions: ['inspect', 'dismiss'] },
      { id: 'at-2', level: 'overdue', source: 'task', label: 'Overdue', title: 'Send proposal to ABC Logistics', meta: 'Due yesterday · Business Operations', at: at(now, -1, 17, 0), taskId: 'task-005', actions: ['done', 'snooze'] },
      { id: 'at-3', level: 'overdue', source: 'task', label: 'Overdue', title: 'Follow up with Tony on hardware quote', meta: 'Due 2 days ago · Business Operations', at: at(now, -2, 12, 0), taskId: 'task-006', actions: ['done', 'snooze'] },
      { id: 'at-4', level: 'respond', source: 'email', label: 'Email', title: 'Approval needed: renewal quote', meta: 'Sarah Mitchell', at: minutesAgo(now, 42), personId: 'sarah', detail: '“Hi Pat — attached is the renewal quote for next year. Could you approve by Friday so we can lock the current rate?”', actions: ['view', 'reply'] },
      { id: 'at-5', level: 'respond', source: 'calendar', label: 'Conflict', title: 'Supplier call overlaps rent transfer reminder', meta: 'Today 16:30', at: at(now, 0, 16, 30), detail: 'Tony proposed 16:30 for the supplier call, which is when you planned the rent transfer. Jay can move the reminder to 16:00.', actions: ['open', 'dismiss'] },
      { id: 'at-6', level: 'waiting', source: 'followup', label: 'Follow-up', title: 'Mike hasn’t replied', meta: 'Supplier contract · last contact 3 days ago', at: daysAgo(now, 3), personId: 'mike', actions: ['open', 'snooze'] },
      { id: 'at-7', level: 'info', source: 'automation', label: 'Hermes', title: 'Voice bridge build finished', meta: 'Hermes / Jay', at: minutesAgo(now, 70), detail: 'Build 0.4.2 passed all checks. Ready for your review.', actions: ['open', 'dismiss'] },
    ];

    function msg(role, text, minutes) { return { role, text, at: minutesAgo(now, minutes) }; }

    const conversations = [
      {
        id: 'main', title: 'Main', context: 'Personal', updatedAt: minutesAgo(now, 5),
        messages: [
          msg('user', 'What should I focus on today?', 41),
          msg('jay', 'You have two important follow-ups, the company proposal is due at 14:00, and your 11:30 call with Antoine is your next appointment.', 41),
          msg('user', 'Remind me to call Tony after the team meeting.', 22),
          msg('jay', 'Done — I’ll remind you at 10:00, right after the team meeting.', 22),
          msg('user', 'Anything urgent from yesterday?', 6),
          msg('jay', 'The ABC proposal slipped past its deadline, and the daily backup failed this morning. Want me to draft a short note to ABC while you look at the backup?', 6),
        ],
      },
      {
        id: 'voice-bridge', title: 'Hermes Voice Bridge', context: 'Hermes / Jay', projectId: 'hermes-jay', updatedAt: minutesAgo(now, 34),
        messages: [
          msg('user', 'How is the voice bridge latency looking after the last change?', 52),
          msg('jay', 'Median round trip is down to 1.4 s from 2.1 s. Wake-word false positives are still around 3 per hour in noisy rooms.', 51),
          msg('user', 'Good. Put the false-positive issue on my list for tomorrow.', 35),
          msg('jay', 'Added “Tune wake-word sensitivity” to Hermes / Jay for tomorrow morning.', 34),
        ],
      },
      {
        id: 'proposal-research', title: 'Company Proposal Research', context: 'Business Operations', projectId: 'business-ops', updatedAt: daysAgo(now, 1, 17),
        messages: [
          msg('user', 'Compare our managed-services pricing with the two competitors we discussed.', 60 * 24 + 40),
          msg('jay', 'Both competitors price per device; we price per user. For Khoury Group (42 users, 60 devices) we come in about 11% lower with a comparable SLA.', 60 * 24 + 38),
          msg('user', 'Draft the pricing section using that framing.', 60 * 24 + 20),
          msg('jay', 'Drafted — it’s in the proposal document under “Commercials”. I kept the phased option ABC asked about as an appendix.', 60 * 24 + 18),
        ],
      },
      {
        id: 'budget-planning', title: 'Budget Planning', context: 'Personal', projectId: 'personal', updatedAt: daysAgo(now, 2, 20),
        messages: [
          msg('user', 'What did we spend on subscriptions last month?', 60 * 48 + 30),
          msg('jay', 'Eleven subscriptions totalling about $214. Three overlap: two cloud storage plans and two music services.', 60 * 48 + 29),
        ],
      },
      {
        id: 'hosting-options', title: 'Website hosting options', context: 'Company Website', projectId: 'company-website', updatedAt: daysAgo(now, 4, 15),
        messages: [
          msg('user', 'Shortlist hosting for the new site. Static, EU region, simple SSL.', 60 * 96 + 10),
          msg('jay', 'Three fit: a static host with EU edge, a managed VPS, or your existing OCI tenancy behind a CDN. Rana prefers the static host for previews.', 60 * 96 + 8),
        ],
      },
    ];

    const notes = [
      { id: 'note-1', projectId: 'hermes-jay', title: 'JAY information architecture', excerpt: 'Home = awareness. Jay = action. Left: what is happening. Right: what needs me.', updatedAt: daysAgo(now, 1, 21) },
      { id: 'note-2', projectId: 'hermes-jay', title: 'jay-core entities', excerpt: 'projects, tasks, reminders, followups, people, attention_items, integration_accounts — SQLite first.', updatedAt: daysAgo(now, 3, 11) },
      { id: 'note-3', projectId: 'company-website', title: 'Service page outline', excerpt: 'Managed IT, cybersecurity, governance. One proof point and one CTA per page.', updatedAt: daysAgo(now, 2, 10) },
      { id: 'note-4', projectId: 'business-ops', title: 'ABC call notes', excerpt: 'Wants phased rollout; decision maker is the COO; budget approved for Q4.', updatedAt: daysAgo(now, 2, 15) },
      { id: 'note-5', projectId: 'personal', title: 'October goals', excerpt: 'Three gym sessions a week, finish the leadership book, plan the long weekend.', updatedAt: daysAgo(now, 5, 9) },
      { id: 'note-6', projectId: 'home', title: 'Water filter model', excerpt: 'Under-sink unit, cartridge every 6 months. Last changed in March.', updatedAt: daysAgo(now, 12, 18) },
    ];

    const files = [
      { id: 'f-1', projectId: 'hermes-jay', name: 'jay-architecture.md', kind: 'doc', size: '14 KB', updatedAt: daysAgo(now, 1, 21) },
      { id: 'f-2', projectId: 'hermes-jay', name: 'voice-bridge-latency.csv', kind: 'sheet', size: '88 KB', updatedAt: minutesAgo(now, 50) },
      { id: 'f-3', projectId: 'company-website', name: 'homepage-v3.fig', kind: 'image', size: '4.2 MB', updatedAt: daysAgo(now, 1, 16) },
      { id: 'f-4', projectId: 'company-website', name: 'service-pages-copy.docx', kind: 'doc', size: '61 KB', updatedAt: daysAgo(now, 2, 12) },
      { id: 'f-5', projectId: 'business-ops', name: 'Khoury-proposal-draft.docx', kind: 'doc', size: '212 KB', updatedAt: minutesAgo(now, 55) },
      { id: 'f-6', projectId: 'business-ops', name: 'supplier-quotes.xlsx', kind: 'sheet', size: '37 KB', updatedAt: daysAgo(now, 4, 14) },
      { id: 'f-7', projectId: 'personal', name: 'insurance-policy.pdf', kind: 'doc', size: '1.1 MB', updatedAt: daysAgo(now, 20, 10) },
      { id: 'f-8', projectId: 'home', name: 'electricity-sep.pdf', kind: 'doc', size: '240 KB', updatedAt: daysAgo(now, 3, 9) },
    ];

    const activity = [
      { id: 'ac-1', projectId: 'hermes-jay', at: minutesAgo(now, 34), text: 'Jay added “Tune wake-word sensitivity”.' },
      { id: 'ac-2', projectId: 'hermes-jay', at: minutesAgo(now, 70), text: 'Voice bridge build 0.4.2 finished.' },
      { id: 'ac-3', projectId: 'hermes-jay', at: daysAgo(now, 3, 16), text: 'Completed “Migrate Hermes to OCI”.' },
      { id: 'ac-4', projectId: 'company-website', at: daysAgo(now, 1, 16), text: 'Rana uploaded homepage v3.' },
      { id: 'ac-5', projectId: 'company-website', at: daysAgo(now, 4, 11), text: 'Completed “Approve homepage wireframes”.' },
      { id: 'ac-6', projectId: 'business-ops', at: minutesAgo(now, 42), text: 'Sarah sent the renewal quote.' },
      { id: 'ac-7', projectId: 'business-ops', at: minutesAgo(now, 55), text: 'Proposal draft updated.' },
      { id: 'ac-8', projectId: 'business-ops', at: daysAgo(now, 5, 15), text: 'Karim filed the quarterly VAT return.' },
      { id: 'ac-9', projectId: 'personal', at: daysAgo(now, 2, 20), text: 'Budget planning conversation with Jay.' },
      { id: 'ac-10', projectId: 'home', at: daysAgo(now, 6, 18), text: 'Completed “Fix kitchen tap”.' },
    ];

    const automations = [
      { id: 'au-1', title: 'Morning briefing', schedule: 'Daily 07:30', state: 'ok' },
      { id: 'au-2', title: 'Hermes backup', schedule: 'Daily 18:00', state: 'ok' },
      { id: 'au-3', title: 'Company file server backup', schedule: 'Daily 02:00', state: 'failed' },
      { id: 'au-4', title: 'Weekly review prep', schedule: 'Fridays 16:00', state: 'ok' },
      { id: 'au-5', title: 'Invoice reminders', schedule: 'Mondays 09:00', state: 'ok' },
    ];

    const system = {
      checkedAt: now.toISOString(),
      items: [
        { key: 'jay', label: 'Jay', state: 'online', value: 'Online', detail: 'Preview assistant (mock)' },
        { key: 'hermes', label: 'Hermes', state: 'online', value: 'Online', detail: 'Agent and gateway reachable' },
        { key: 'voice', label: 'Voice', state: 'online', value: 'Online', detail: 'Voice bridge 0.4.2' },
        { key: 'automations', label: 'Automations', state: 'warning', value: '12 active', detail: '1 failed in the last 24 h' },
        { key: 'oci', label: 'OCI', state: 'online', value: 'Healthy', detail: 'Frankfurt · 2 OCPU · 34% disk' },
      ],
    };

    const integrations = [
      { id: 'calendar', title: 'Calendar', icon: 'calendar', text: 'Events and free time in Today and Calendar.' },
      { id: 'email', title: 'Email', icon: 'mail', text: 'Replies and approvals that need you, in Attention.' },
      { id: 'whatsapp', title: 'WhatsApp', icon: 'message-circle', text: 'Messages and follow-ups from key people.' },
      { id: 'telegram', title: 'Telegram', icon: 'send', text: 'Talk to Jay from anywhere.' },
      { id: 'contacts', title: 'Contacts', icon: 'people', text: 'People, relationships and last contact.' },
      { id: 'finance', title: 'Finances', icon: 'wallet', text: 'Budgets, spending and bills.' },
      { id: 'weather', title: 'Weather', icon: 'weather', text: 'A quiet forecast line on Home.' },
      { id: 'news', title: 'News', icon: 'news', text: 'A short, curated briefing.' },
    ];

    return { now: now.toISOString(), user: { id: 'pat', name: 'Pat', context: 'Personal', workspace: 'Main' }, people, projects, tasks, agenda, attention, conversations, notes, files, activity, automations, system, integrations };
  }

  JAY.mock = { build };
})();
