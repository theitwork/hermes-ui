# JAY — Customizations vs upstream Hermes WebUI

Upstream: `https://github.com/nesquena/hermes-webui` (remote `upstream`). Base: master @ `9a00b65`.
Keep this file current whenever JAY touches anything outside `jay/`.

## Summary

| Category | Count | Upstream merge difficulty |
|---|---|---|
| Hermes runtime files modified (`static/*`, `api/*`, `server.py`) | **0** (`git diff --stat 9a00b65 -- static api server.py` is empty) | None |
| Upstream docs modified | 1 (`README.md`, 3-line link block) | Trivial |
| Files added | see below | None (new paths only) |

## Added files

| Path | Purpose |
|---|---|
| `jay/extension/extensions.json` | Extension manifest (id `jay`) consumed by Hermes' loader |
| `jay/extension/css/jay-tokens.css` | `--jay-*` design tokens (dark + light), `@font-face` for the bundled fonts, and the `jay` skin for Hermes chrome |
| `jay/extension/css/jay-shell.css` | Rail, header panel, phone app bar, bottom nav, search palette, JAY/Hermes mode layout |
| `jay/extension/css/jay-components.css` | Panels, layout grid, side tree, tabs, buttons, pills, tags, meters, sparklines, feed cards, drawers/sheets, menus, toasts, states |
| `jay/extension/css/jay-home.css` | Home grid, Today, Attention, bento row, Talk to Jay, phone composition |
| `jay/extension/css/jay-tasks.css` | Tasks table, toolbar, calculation bar, kanban board (shared with Projects), task drawer |
| `jay/extension/css/jay-pages.css` | Projects, placeholders (Calendar, Notes, People), Integrations, System |
| `jay/extension/fonts/*` | Self-hosted Inter and Poppins (8 woff2 files: latin subset, weights 400–700) with `LICENSE-Inter.txt` and `LICENSE-Poppins.txt` (SIL Open Font License 1.1) |
| `jay/extension/js/jay-*.js` (10 files) | Runtime — see `docs/JAY_ARCHITECTURE.md` |
| `jay/README.md`, `jay/preview.env.example` | Pointer + documented preview variables (no secrets) |
| `scripts/jay-preview.sh` | Isolated, loopback-only preview launcher |
| `tests/test_jay_extension.py` | Manifest/injection, safety scan (no external URLs, fonts bundled with licences), data layer and its contracts, design-token doc sync, launcher safety |
| `docs/JAY_IMPLEMENTATION_PLAN.md`, `docs/JAY_ARCHITECTURE.md`, `docs/JAY_DESIGN_SYSTEM.md`, `docs/JAY_CUSTOMIZATIONS.md`, `docs/JAY_PREVIEW.md` | Documentation |
| `docs/ui-ux/jay/*.png`, `docs/ui-ux/jay/README.md` | Review screenshots (desktop, tablet, phone; dark + light) |

The v1 stylesheet `css/jay-views.css` no longer exists: v2 split it into `jay-tasks.css` and
`jay-pages.css`. The manifest lists every shipped stylesheet and script, and the tests fail on an
orphan file.

## Modified upstream files

| File | Change | Why |
|---|---|---|
| `README.md` | Added a "JAY (fork development)" link block at the end of **Docs** | Discoverability of the preview docs. Safe to drop when syncing upstream if it conflicts. |

## Hermes surfaces JAY depends on (feature-detected)

JAY calls only these public globals, each guarded with `typeof … === 'function'`. If upstream renames
one, JAY shows a notice instead of crashing, and stock Hermes keeps working.

| Global | Used for |
|---|---|
| `switchPanel(name)` | Chat, Automations (`tasks`), System links (`settings`, `profiles`, `skills`, `memory`, `insights`, `logs`) |
| `mobileSwitchPanel(name)`, `closeMobileSidebar()`, `_isDesktopWidth()` | Correct panel behaviour on phones |
| `toggleWorkspacePanel(true)` | Files |
| `loadSession(id)` | Opening a real Hermes session from Continue (opt-in Hermes adapter only) |
| `_pickTheme(v)`, `_pickSkin(v)`, `registerHermesSkin(desc)` | Shared theme persistence; `jay` skin registration |
| `_syncThemeColorMeta()` | Hands the browser-chrome colour back to Hermes when JAY enters Hermes mode or stops |
| DOM: `.app-titlebar`, `.app-titlebar-left`, `.layout`, `.sidebar > .sidebar-nav`, `#approvalCard`, `meta[name="theme-color"]`, `document.title` | Hide/inert Hermes under JAY; "JAY" buttons in the phone titlebar and drawer; approval-key guard; browser-chrome colour and tab title while JAY is shown (Hermes' title is restored on the way out) |
| Endpoints (GET only, opt-in): `api/sessions`, `health` | Read-only Hermes adapter |
| Extension loader env: `HERMES_WEBUI_EXTENSION_DIR`, `HERMES_WEBUI_EXTENSION_MANIFEST` | Loading JAY |

## Runtime behaviour JAY adds on top of Hermes

- On first run only, adopts the `jay` skin if the user's skin is still `default` (stored under
  `jay:skin-initialized`). Any later skin choice in Hermes Settings is respected.
- While JAY covers Hermes: Hermes is `inert` and `visibility:hidden`; Hermes' global shortcuts (`j`/`k`,
  Cmd/Ctrl+K/B/,/`/`, Enter-to-approve) are stopped at capture phase so they cannot act invisibly.
- Browser-local keys (all prefixed `jay:`): `demo-v2` (mock data with `schema: 3`, rebuilt daily or when
  the schema changes; superseded `jay:demo-*` blobs are removed), `adapters`, `simulate`, `tasks-ui`
  (layout, sort, direction), `projects-ui` (tab, layout, filter, open tree sections, favorite and mute
  overrides, read markers), `home:attention-read`, `context`, `skin-initialized`. No secrets.
- Fonts: Inter and Poppins load from the extension's own `fonts/` directory (same origin). JAY
  makes no third-party requests.

## Untouched Hermes functionality

Chat and streaming, sessions and history, approvals and clarifications, files/workspaces, memory, skills,
cron/automations, kanban, profiles, model selection, voice (dictation, voice mode, TTS), settings,
authentication (password, passkeys, OIDC), CSRF protection, extension security model, PWA/service worker,
mobile login. All of it runs exactly as upstream; JAY only navigates to it.

## Known limitations (v1)

| Item | Detail |
|---|---|
| Mock only | Tasks, projects, agenda, attention, conversations and status are demo data in the browser (`jay:demo-v2`), rebuilt daily. A blob saved by an older build is rebuilt once, which drops that day's demo edits. |
| Voice / attach | Visual only: no audio is recorded and files are not uploaded. |
| English only | JAY strings do not go through Hermes i18n yet. |
| Naming overlap | In Hermes mode, Hermes' own rail still calls scheduled jobs "Tasks"; JAY calls them Automations. |
| Preview Hermes chat | The isolated preview has no provider configured, so Hermes Chat cannot reach a model (by design). |
| Board drag-and-drop | Desktop pointer only; on touch, change status from the task drawer. |
| Upstream overflow | Stock Hermes' collapsed right panel extends the document 14px at desktop widths (pre-existing, hidden by `body{overflow:hidden}`); JAY itself has no overflow. |

## What could move upstream or into a standalone extension

- The whole `jay/extension` bundle is already a standalone extension; it could live in its own repo and be
  installed via `HERMES_WEBUI_EXTENSION_DIR` without forking Hermes at all.
- Generic pieces worth proposing upstream: the "shortcut guard while an overlay owns the page" pattern,
  and a documented `hermesExt.navigate(panel)` API so extensions don't depend on `switchPanel` directly.

## Syncing with upstream

```bash
git fetch upstream
git checkout feature/jay-v1
git merge upstream/master        # expected conflicts: none (README link block at most)
./scripts/test.sh tests/test_jay_extension.py tests/test_extension_hooks.py -q
```
