# JAY — Implementation Plan (v1, mock-backed UI)

Status: phase 1 (UI/UX + architecture + mock data). No live integrations.
Branch: `feature/jay-v1`. Base: upstream `nesquena/hermes-webui` master @ `9a00b65`.

## 1. Current Hermes frontend (as inspected)

| Area | Where it lives | Notes |
|---|---|---|
| App shell | `static/index.html` | Titlebar → `.layout` = `.rail` (desktop ≥641px) + `.sidebar` (panel views) + `main.main` + workspace panel |
| Panel switching | `static/panels.js` → `switchPanel(name)` | Panels: chat, tasks (cron), kanban, skills, memory, workspaces, profiles, todos, insights, logs, settings |
| Boot / theme | `static/boot.js` → `_pickTheme()`, `_applySkin()`, `registerHermesSkin()` | Theme = `.dark` class on `<html>`; skin = `data-skin`; persisted to localStorage + `/api/settings` |
| Styles / tokens | `static/style.css` (7.3k lines) | Base tokens in `:root` / `:root.dark`; skins override accent/surfaces |
| Chat + composer | `static/messages.js`, `static/ui.js`, `#composerBox` | Tightly coupled to live session state (`S`), SSE streams, approvals |
| Sessions | `static/sessions.js`, `GET /api/sessions` | Session list, `/session/<id>` deep links |
| Files | `static/workspace.js` → `toggleWorkspacePanel()` | Right-hand workspace/file browser |
| Voice | `#btnMic`, `#btnVoiceMode` in composer | Browser dictation + TTS engines |
| Cron / automations | `panelTasks` → `loadCrons()` | "Scheduled jobs" |
| Icons | `static/icons.js` → `li(name)` | Self-hosted Lucide paths |
| Mobile | `@media (max-width:640px)` throughout | Sidebar becomes overlay drawer; hamburger in titlebar |
| **Extension surface** | `api/extensions.py`, `docs/EXTENSIONS.md` | `HERMES_WEBUI_EXTENSION_DIR` + manifest → same-origin CSS/JS injected into the shell; skins via `registerHermesSkin()` |

Discrepancies noted: `THEMES.md` lists fewer skins than `index.html` registers; `DESIGN.md` describes a serif
conversation font but the live token defaults `--font-conversation` to `--font-ui`. Implementation was trusted.

## 2. Core decision: JAY ships as a Hermes extension bundle

Hermes already has a supported, sandboxed extension loader. JAY uses it instead of editing Hermes core:

- `jay/extension/` is the extension root (`HERMES_WEBUI_EXTENSION_DIR`), with `extensions.json` as the manifest.
- Hermes injects JAY's CSS into `<head>` and JAY's deferred scripts after Hermes' own deferred scripts, so every
  Hermes global (`switchPanel`, `_pickTheme`, `toggleWorkspacePanel`, `registerHermesSkin`) exists when JAY boots.
- **Zero modified Hermes source files** (`static/*`, `api/*`, `server.py`). Upstream merges stay trivial.
- JAY is opt-in per process: without the extension env vars, the server is stock Hermes.

## 3. Reused Hermes features

| JAY destination | Maps to |
|---|---|
| Chat | Hermes chat panel + composer (`switchPanel('chat')`), untouched |
| Files | Hermes chat view + workspace panel (`toggleWorkspacePanel(true)`) |
| Automations | Hermes "Scheduled jobs" panel (`switchPanel('tasks')`) |
| System | JAY status placeholder + links to Hermes Settings, Logs, Insights |
| Theme toggle | Hermes `_pickTheme()` (same persistence: localStorage + `/api/settings`) |
| Palette | Registered `jay` skin via `registerHermesSkin()`, refined per mode in JAY CSS |
| Icon style | Lucide stroke icons, same family as `static/icons.js` |

Everything else in Hermes (skills, memory, profiles, kanban, logs, settings, auth, voice) stays reachable through
Hermes' own rail when JAY is in "Hermes mode".

## 4. Files JAY adds

```
jay/README.md                     pointer to docs
jay/preview.env.example           documented preview variables (no secrets)
jay/extension/extensions.json     extension manifest
jay/extension/css/*.css           tokens, shell, components, views, mobile
jay/extension/js/jay-core.js      namespace, DOM helpers, icons, store, drawer/sheet, toast
jay/extension/js/jay-data-mock.js realistic mock dataset
jay/extension/js/jay-providers.js data provider layer (getTodayItems(), getTasks(), …)
jay/extension/js/jay-shell.js     nav rail, mobile bottom nav, router, Hermes-mode bridge
jay/extension/js/jay-home.js      Home command center
jay/extension/js/jay-chat.js      "Talk to Jay" mock conversation + composer
jay/extension/js/jay-tasks.js     Tasks (table + board)
jay/extension/js/jay-projects.js  Projects (list + detail)
jay/extension/js/jay-places.js    Calendar, Notes, People, Integrations, System placeholders
jay/extension/js/jay-boot.js      boot sequence
scripts/jay-preview.sh            isolated, loopback-only preview launcher
tests/test_jay_extension.py       manifest/security/provider tests
docs/JAY_*.md                     plan, architecture, customizations, preview
```

## 5. Existing files modified

| File | Why |
|---|---|
| `README.md` | One-line pointer to the JAY docs (development note only) |

No Hermes runtime file is modified.

## 6. Mock → live swap path

The UI calls only `JAY.data.*` (async): `getTodayItems()`, `getAttentionItems()`, `getProjects()`, `getTasks()`,
`getRecentSessions()`, `getSystemStatus()`, `getConversation()`, plus mutations (`createTask()`, `updateTask()`,
`resolveAttention()`…). Each call is routed through a named **adapter** (`mock` today). Later adapters —
`hermes` (sessions, cron, health via existing `/api/*`), `jaycore` (tasks, projects, reminders, attention),
calendar/email/messaging adapters behind jay-core — register with `JAY.data.registerAdapter()` and are selected
per domain. Views never change. Every widget renders loading / empty / error / not-connected states independently.

## 7. Mobile strategy

- `< 768px`: Home recomposes into a single vertical flow (Talk to Jay → Attention → Today → Projects → Continue),
  JAY rail becomes a bottom nav (Home · Tasks · Jay · More), drawers become bottom sheets, Jay chat opens full-screen.
- Hermes mode on phones: JAY bottom nav hides (Hermes owns the composer); a "JAY" button is added to the Hermes
  titlebar to return home.
- Touch targets ≥ 44px, no hover dependency, `100dvh` + safe-area insets, no horizontal overflow.

## 8. Theme strategy

- JAY surfaces use `--jay-*` tokens defined for dark and light separately. v2 (see `docs/JAY_DESIGN_SYSTEM.md`)
  replaced the phase-1 palette (charcoal + muted green / warm ivory) with floating charcoal panels, a lime
  accent and self-hosted Inter / Poppins.
- The `.dark` class from Hermes drives both, so one toggle switches Hermes and JAY together.
- A registered `jay` skin applies the same palette to Hermes' own chrome when the user is in Chat/Files/etc.

## 9. Upstream compatibility

- Hermes core untouched; JAY lives in `jay/`, `scripts/jay-preview.sh`, `docs/JAY_*`, one test file.
- JAY depends only on documented extension hooks plus a small set of Hermes globals, all feature-detected
  (`typeof switchPanel === 'function'`). If a global disappears upstream, JAY degrades to a notice, not a crash.

## 10. Known risks

| Risk | Mitigation |
|---|---|
| Hermes renames a global JAY calls | Feature-detect every call; listed in `JAY_CUSTOMIZATIONS.md` |
| Hermes onboarding overlay competes with JAY overlay | Preview sets `HERMES_WEBUI_SKIP_ONBOARDING=1`; JAY yields to Hermes modals |
| Two rails side by side in Hermes mode | JAY rail = app nav; Hermes rail = workbench sub-nav, styled quieter under the `jay` skin |
| Hermes URL rewrites (`/session/<id>`) vs JAY hash routes | JAY owns only `#/…` routes; `/session/<id>` deep links open Hermes mode |
| Preview touching production state | Launcher uses isolated `HERMES_HOME`/state, strips credential env vars, binds 127.0.0.1 |

## 11. Development run command

```bash
./scripts/jay-preview.sh            # http://127.0.0.1:8789, isolated state under ~/.jay-preview
```

See `docs/JAY_PREVIEW.md` for SSH tunnelling, reset, and test commands.
