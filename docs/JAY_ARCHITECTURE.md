# JAY — Architecture (phase 1)

JAY is a personal operating system shell layered on Hermes WebUI. Phase 1 is UI, UX and architecture
with mock data. No live integrations and no production side effects.

## 1. Runtime shape

```
Browser
├── Hermes WebUI (unchanged: static/*, api/*)      ← chat, sessions, files, cron, memory, skills, settings
└── JAY extension (jay/extension, injected by core) ← Home, Tasks, Projects, placeholders, shell
     ├── jay-core.js        DOM builder (textContent only), icons, events, storage, drawers/sheets, widget states
     ├── jay-data-mock.js   realistic dataset, built relative to "now"
     ├── jay-providers.js   JAY.data.*  → adapter registry (mock | hermes read-only | future jay-core)
     ├── jay-chat.js        Talk to Jay (dock + focused), local mock responder
     ├── jay-home.js        Home: Today · Talk to Jay · Attention + shelf; phone composition
     ├── jay-tasks.js       Tasks table/board + task drawer
     ├── jay-projects.js    Projects list/detail + preview drawer
     ├── jay-places.js      Talk view, Calendar/Notes/People placeholders, Integrations, System
     ├── jay-shell.js       rail / bottom nav, topbar, hash router, search, theme, Hermes bridge
     └── jay-boot.js        start; on failure removes itself and leaves stock Hermes
```

Hermes loads JAY through its documented extension loader (`HERMES_WEBUI_EXTENSION_DIR` +
`HERMES_WEBUI_EXTENSION_MANIFEST`). JAY scripts are injected after Hermes' deferred scripts, so Hermes
globals exist when JAY boots.

## 2. Two modes, one page

| Mode | What the user sees | How |
|---|---|---|
| **JAY mode** (`html[data-jay-mode="jay"]`) | Full JAY app | `#jayApp` covers the viewport; Hermes stays mounted but `visibility:hidden` + `inert` |
| **Hermes mode** (`data-jay-mode="hermes"`) | JAY rail + stock Hermes | `#jayApp` shrinks to the 72px rail; `body` gets matching left padding; JAY calls `switchPanel()` |

Phones: in Hermes mode JAY steps aside completely and a **JAY** button is added to the Hermes titlebar.

Hermes stays mounted in both modes, so live streams, timers and session state are never torn down by
navigation. While JAY covers Hermes, a capture-phase key guard blocks Hermes' global shortcuts
(`j`/`k` session switching, Cmd/Ctrl+K new chat, Cmd/Ctrl+B, Cmd/Ctrl+,, Enter-to-approve) so they
cannot act on the hidden UI.

## 3. Routing

Hash routes only (`#/…`), so Hermes' `/session/<id>` URLs and its `pushState` calls keep working (Hermes
preserves the hash).

| Route | Target |
|---|---|
| `#/home` | JAY Home (default; `/session/<id>` deep links default to `#/chat`) |
| `#/talk` | Focused Jay conversation (full-screen on phones) |
| `#/tasks?status=&due=&project=&view=` | Tasks |
| `#/projects`, `#/projects/<id>` | Projects |
| `#/calendar`, `#/notes`, `#/people`, `#/integrations`, `#/system` | JAY pages |
| `#/chat`, `#/files`, `#/automations`, `#/hermes/<panel>` | Hermes mode (`chat`, `chat` + workspace panel, `tasks`, any panel) |

## 4. Data layer contract

Views call only `JAY.data.*`. Every call is async and domain-routed:

| Domain | Reads | Writes |
|---|---|---|
| today | `getTodayItems()`, `getTodaySummary()`, `getAgendaItem(id)` | `addReminder()` |
| attention | `getAttentionItems()` | `resolveAttention(id, action)`, `restoreAttention(id)` |
| tasks | `getTasks(filter)`, `getTask(id)`, `getTaskCounts()` | `createTask()`, `updateTask()`, `completeTask()`, `deleteTask()` |
| projects | `getProjects()`, `getProject(id)` | `createProject()` |
| sessions | `getRecentSessions()` | — |
| chat | `getConversation(id)` | `appendMessage()`, `newConversation()` |
| system | `getSystemStatus()`, `getAutomations()` | — |
| people / integrations | `getPeople()`, `getPerson(id)`, `getIntegrations()` | — |

Mutations emit `data:<domain>` events; each Home block is a `JAY.widget` that refreshes independently and
renders its own loading / empty / error / disconnected / not-connected state. One failing source never
blanks Home.

### Swapping mock for live

```js
JAY.data.registerAdapter('jaycore', { async getTasks(f) { /* GET /jay-core/tasks */ }, … });
JAY.data.useAdapter('tasks', 'jaycore');   // per domain; unimplemented methods fall back to mock
```

The existing `hermes` adapter is the template: read-only `GET api/sessions` for Continue and `GET health`
for Status. It is opt-in from System → Data sources and sends nothing.

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

- Tokens: `--jay-*` in `css/jay-tokens.css`, designed separately for dark (charcoal `#101210`, sage accent)
  and light (warm ivory `#F5F2EA`, forest accent). The `.dark` class from Hermes drives both.
- The `jay` skin (registered via `registerHermesSkin`) carries the palette into Hermes' own chrome.
- Hierarchy: only the Jay conversation is a raised card; Today and Attention sit on the canvas; the
  Projects/Tasks/Continue/Status shelf is one quiet surface split by hairlines.
- Icons: Lucide stroke set (same family as `static/icons.js`), no emoji in navigation.
- Accessibility: semantic buttons, `aria-current`, labelled icon buttons, focus-visible rings, focus-trapped
  drawers with Escape, `prefers-reduced-motion`, 44px touch targets on coarse pointers.
