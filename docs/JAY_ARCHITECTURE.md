# JAY — Architecture (phase 1)

JAY is a personal operating system shell layered on Hermes WebUI. Phase 1 is UI, UX and architecture
with mock data. No live integrations and no production side effects.

## 1. Runtime shape

```
Browser
├── Hermes WebUI (unchanged: static/*, api/*)      ← chat, sessions, files, cron, memory, skills, settings
└── JAY extension (jay/extension, injected by core) ← Home, Tasks, Projects, placeholders, shell
     ├── js/
     │   ├── jay-core.js        DOM builder (textContent only), icons, events, storage, drawers/sheets,
     │   │                      menus, toasts, widget states, shared JAY.ui.* components
     │   ├── jay-data-mock.js   realistic dataset, built relative to "now"
     │   ├── jay-providers.js   JAY.data.*  → adapter registry (mock | hermes read-only | future jay-core)
     │   ├── jay-chat.js        Talk to Jay (dock + focused), shared draft, local mock responder
     │   ├── jay-home.js        Home: Today · Talk to Jay · Attention + bento row; phone composition
     │   ├── jay-tasks.js       Tasks table/board, shared kanban (renderBoard) + task drawer
     │   ├── jay-projects.js    Projects tree, detail (board/list/timeline/files/notes), activity feed
     │   ├── jay-places.js      Talk view, Calendar/Notes/People placeholders, Integrations, System
     │   ├── jay-shell.js       rail / bottom nav, header, hash router, identity (JAY.me), search,
     │   │                      theme, Hermes bridge
     │   └── jay-boot.js        start; on failure calls JAY.shell.stop(), removes itself, leaves stock Hermes
     ├── css/
     │   ├── jay-tokens.css     --jay-* tokens (dark + light), @font-face, the `jay` skin for Hermes chrome
     │   ├── jay-shell.css      rail, header panel, app bar, bottom nav, palette, JAY/Hermes mode layout
     │   ├── jay-components.css panels, layout grid, tree, tabs, buttons, pills, tags, meters, feed, overlays
     │   ├── jay-home.css       Home grid, Today, Attention, bento, Talk to Jay, phone composition
     │   ├── jay-tasks.css      Tasks table, toolbar, calc bar, kanban board, task drawer
     │   ├── jay-pages.css      Projects, placeholders, Integrations, System
     │   └── jay-dense.css      Dense density overrides (html[data-jay-density="dense"], ≥ 768px)
     └── fonts/                 self-hosted Inter + Poppins (woff2, latin, 400–700) and their OFL licences
```

Hermes loads JAY through its documented extension loader (`HERMES_WEBUI_EXTENSION_DIR` +
`HERMES_WEBUI_EXTENSION_MANIFEST`); `extensions.json` lists the stylesheets and scripts in load order.
JAY scripts are injected after Hermes' deferred scripts, so Hermes globals exist when JAY boots.

**Fonts are self-hosted.** `jay-tokens.css` declares `"JAY Inter"` and `"JAY Poppins"` with
`@font-face` rules that point at `../fonts/*.woff2` (same origin, served by the extension loader,
`font-display: swap`). JAY makes no requests to font CDNs or any other third party; the test suite
checks that every CSS `url()` is either one of these bundled font files or an inline SVG.

## 2. Two modes, one page

| Mode | What the user sees | How |
|---|---|---|
| **JAY mode** (`html[data-jay-mode="jay"]`) | Full JAY app | `#jayApp` covers the viewport; Hermes stays mounted but `visibility:hidden` + `inert` |
| **Hermes mode** (`data-jay-mode="hermes"`) | JAY rail + stock Hermes | `#jayApp` shrinks to the 72px rail; `body` gets matching left padding and Hermes floats as one rounded panel; JAY calls `switchPanel()` |

Phones: in Hermes mode JAY steps aside completely and a **JAY** button is added to the Hermes titlebar.

Hermes stays mounted in both modes, so live streams, timers and session state are never torn down by
navigation. While JAY covers Hermes, a capture-phase key guard blocks Hermes' global shortcuts
(`j`/`k` session switching, Cmd/Ctrl+K new chat, Cmd/Ctrl+B, Cmd/Ctrl+,, Enter-to-approve) so they
cannot act on the hidden UI.

`JAY.shell.stop()` detaches every listener, timer and observer `start()` attached, disposes the
current view, removes the injected Hermes buttons, and hands the document title and browser-chrome
colour back to Hermes. `jay-boot.js` calls it when start-up fails.

## 3. Routing

Hash routes only (`#/…`), so Hermes' `/session/<id>` URLs and its `pushState` calls keep working (Hermes
preserves the hash). A hash is `#/<route>[/<path remainder>][?query]`; views receive the query as
params and the path remainder as `params._`.

| Route | Target |
|---|---|
| `#/home` | JAY Home (default; `/session/<id>` deep links default to `#/chat`) |
| `#/talk` | Focused Jay conversation (full-screen on phones) |
| `#/tasks?status=&project=&due=&owner=&view=board` | Tasks. List is the default and writes no `view`; the filters in effect stay in the address; sort and direction are stored preferences |
| `#/projects`, `#/projects/<id>?tab=<tab>` | Projects (`tab` omitted for the Tasks tab) |
| `#/calendar`, `#/notes`, `#/people`, `#/integrations`, `#/system` | JAY pages |
| `#/chat`, `#/files`, `#/automations`, `#/hermes/<panel>` | Hermes mode (`chat`, `chat` + workspace panel, `tasks`, any allowed panel) |

Views never write `location` for their own state: `JAY.shell.navigate(target, { replace, params })`
changes route synchronously, and `JAY.shell.replaceParams(route, params)` rewrites the current
route's params without a re-render (see `docs/JAY_DESIGN_SYSTEM.md` §2).

**Identity.** Before the first route, the shell resolves `JAY.me` from `JAY.data.getUser()` (falling
back to the `relation: 'self'` person), capped at 600ms; it is refreshed on `data:people` and
`data:reset`. If the data layer cannot answer, `JAY.me` is the placeholder `{ id: 'me', name: 'You' }`
and views skip the name.

## 4. Data layer contract

Views call only `JAY.data.*`. Every call is async and domain-routed:

| Domain | Reads | Writes |
|---|---|---|
| today | `getTodayItems()`, `getTodaySummary()`, `getAgendaItem(id)` | `addReminder(input)` |
| attention | `getAttentionItems()` | `resolveAttention(id, action, opts?)`, `restoreAttention(id, { action })` |
| tasks | `getTasks(filter)`, `getTask(id)`, `getTaskCounts()` | `createTask(input)`, `updateTask(id, patch)`, `completeTask(id, done)`, `deleteTask(id)`, `restoreTask(snapshot)` |
| projects | `getProjects()`, `getProject(id)` | `createProject(input)`, `updateProject(id, patch)` |
| sessions | `getRecentSessions()` | — |
| chat | `getConversation(id)` | `appendMessage(convId, message)`, `newConversation()` |
| system | `getSystemStatus()`, `getAutomations()` | — |
| people | `getPeople()`, `getPerson(id)`, `getUser()` | — |
| integrations | `getIntegrations()` | — |

(`notes` and `files` are domains too; today their data arrives inside `getProject(id)`.)

Details the views rely on:

- `getTasks({ q, status, projectId, due, owner, sort, dir })` — `dir` `'asc'` / `'desc'` applies to
  the primary sort key (default `'desc'` for `sort: 'updated'`, `'asc'` otherwise); `owner` `'any'`
  or `'all'` means no owner filter.
- `resolveAttention(id, action, { until })` — for `'snooze'`, a future ISO `until` sets
  `snoozedUntil`; anything else snoozes for 3 hours. `restoreAttention(id, { action })` reverses
  exactly that action; without `action` it uses the one `resolveAttention` recorded. Only undoing
  "done" reopens the linked task.
- `deleteTask(id)` returns `{ task, index, attentionIds }` and resolves the task's open attention
  items (`resolvedBy: 'delete'`). `restoreTask(snapshot)` puts the task back at `index` with the same
  id, `createdAt` and `prevStatus`, and reopens only the items that delete resolved; a second restore
  does nothing. An unknown id rejects with "Task not found".
- `createTask` accepts `stream`; `createTask` and `updateTask` set it to `null` when it is not one
  of the task's project's streams (for example after a move to another project).
- `updateProject(id, patch)` changes only `favorite`, `muted`, `status`, `title` and `description`.
- `getUser()` → `{ id, name, context, workspace }` (demo: Pat, Personal, Main).

Mutations emit `data:<domain>` events (`updateTask`, `completeTask`, `deleteTask` and
`restoreTask` emit `tasks`, `today`, `projects` and `attention`; `createTask` the first three;
attention writes emit `attention`); each Home block is a `JAY.widget` that refreshes independently and renders its own
loading / empty / error / disconnected / not-connected state. One failing source never blanks Home.

Registry and preview controls on the same object: `registerAdapter(name, impl)`,
`useAdapter(domain, name)`, `adapterName(domain)`, `isMock(domain)`, `simulate(domain, state)`,
`simulated()`, `clearSimulations()`, `resetDemo()` (rebuilds the demo, emits every
`data:<domain>` and then `data:reset`), plus `DOMAINS` and `STATUS_ORDER`.

The mock keeps its dataset in `localStorage` as `jay:demo-v2` = `{ builtOn, schema: 3, data }`. It is
rebuilt when the day changes (dates are relative to "now") or when `schema` differs, so a blob saved
by an older build is replaced once (dropping that day's demo edits). Superseded `jay:demo-*` keys
are removed on load and on reset.

### Swapping mock for live

```js
JAY.data.registerAdapter('jaycore', { async getTasks(f) { /* GET /jay-core/tasks */ }, … });
JAY.data.useAdapter('tasks', 'jaycore');   // per domain; unimplemented methods fall back to mock
```

The existing `hermes` adapter is the template: read-only `GET api/sessions` for Continue and `GET health`
for Status. It is opt-in from System → Data sources and sends nothing. `jay-providers.js` is the only
file allowed to call `fetch`, and only with GET.

## 5. Future ownership (not built)

| Owner | Responsibilities |
|---|---|
| **Hermes** | chat, sessions, memory, files/workspaces, models, profiles, skills, cron automations, agent execution |
| **jay-core** (future service, SQLite first) | tasks, expanded projects, reminders, follow-ups, people, attention aggregation, integration normalisation |

Candidate jay-core entities: `projects`, `tasks`, `reminders`, `followups`, `people`, `attention_items`,
`integration_accounts`. Credentials for Calendar, Email, WhatsApp and Telegram live server-side in
jay-core and are never exposed to the browser. The WebUI would reach jay-core through a loopback
sidecar (`docs/EXTENSIONS.md` → *Trusted local sidecars*, `proxy_auth: token-v1`) — no new core routes.

## 6. Design system

Full contract: `docs/JAY_DESIGN_SYSTEM.md` (v2, "floating panels + lime").

- Tokens: `--jay-*` in `css/jay-tokens.css`, one set per mode: dark (canvas `#1C1C1C`, panels
  `#2A2A2A`) and light (canvas `#E6E6E2`, white panels), with a lime accent (`#A7E05F`; olive
  `#3E6A0C` for lime-family text in light). Hermes' `.dark` class drives both.
- The `jay` skin (registered via `registerHermesSkin`) carries the palette into Hermes' own chrome.
- Structure: an icon rail, a header panel and floating rounded panels on the canvas; views compose
  them with `.jay-layout` (side tree | main | aside feed). Shared parts come from `JAY.ui.*`, so every
  screen renders the same tree, tabs, pills, tags, meters, sparklines and feed cards.
- Type: self-hosted Poppins (titles, navigation, buttons) and Inter (body, tables), see §1.
- Icons: Lucide stroke set (same family as `static/icons.js`), no emoji in navigation.
- Accessibility: semantic buttons, `aria-current`, labelled icon buttons, focus-visible rings, tabs and
  radio groups with arrow keys, focus-trapped drawers with Escape, `prefers-reduced-motion`, 40–44px
  touch targets on coarse pointers, text tokens ≥ 4.5:1 on every surface.
