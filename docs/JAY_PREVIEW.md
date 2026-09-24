# JAY — Development preview

The preview runs this checkout of Hermes WebUI with the JAY extension in a sandbox:

- binds **127.0.0.1 only** (default port **8789**; production Hermes WebUI defaults to 8787)
- uses isolated state under `~/.jay-preview` — never reads or writes `~/.hermes`
- starts the server with a scrubbed environment (`env -i`): no provider keys, gateway URLs or tokens from
  your shell are inherited, and no `hermes` CLI is on its `PATH`, so the WebUI's "Restart Service" cannot
  touch your production gateway
- skips Hermes onboarding and hides Claude Code / Codex CLI session imports
- all JAY data is mock data in your browser; nothing is sent to Hermes, an LLM or any third party

It does not modify systemd, Nginx, firewall, DNS, TLS, the Hermes Agent or Gateway configuration.

## 1. Install (once)

Requirements: Python 3.11–3.13, `python3-venv`, `curl`.

```bash
cd ~/hermes-ui                 # a separate checkout from production is recommended
git checkout feature/jay-v1
scripts/jay-preview.sh setup   # creates ./.venv with requirements.txt (PyYAML, cryptography)
```

`./scripts/test.sh` also creates `./.venv` (with test dependencies); either works.

## 2. Start / stop

```bash
scripts/jay-preview.sh start         # foreground; Ctrl+C stops it
scripts/jay-preview.sh start --bg    # background; logs in ~/.jay-preview/preview.log
scripts/jay-preview.sh status
scripts/jay-preview.sh stop          # stops the background preview
```

Address: `http://127.0.0.1:8789`. Change it with `JAY_PREVIEW_PORT=8790 scripts/jay-preview.sh start`.
Optional password (recommended if other users share the server): `JAY_PREVIEW_PASSWORD='…'`.
See `jay/preview.env.example` for all variables.

## 3. View it from your PC (SSH tunnel)

On OCI, start the preview (step 2). On your PC:

```bash
ssh -N -L 8789:127.0.0.1:8789 <user>@<oci-host>
```

Then open **http://localhost:8789** in your browser. Nothing new is exposed publicly — the tunnel
rides your existing SSH access. Use another local port if 8789 is busy on your PC:
`ssh -N -L 9789:127.0.0.1:8789 …` → `http://localhost:9789`.

Phone preview: the tunnel above only serves your PC's own `localhost`. To check the phone layout,
either use your browser's device mode (Chrome DevTools → Toggle device toolbar, 360–430px wide), or run
the same `-L 8789:127.0.0.1:8789` forward from an SSH client on the phone (e.g. Termius) and open
`http://localhost:8789` there.

## 4. Mock data and preview states

- **Reset demo data:** System → Preview tools → *Reset demo data* (or avatar menu → *Reset demo data*).
  Demo data also rebuilds automatically each day so "Today" stays current.
- **Reset server state:** `scripts/jay-preview.sh stop && scripts/jay-preview.sh reset`
  (wipes `~/.jay-preview` server state only).
- **Simulate widget states:** System → Preview tools → per widget: Loading, Empty, Error, Disconnected,
  Not connected. *Clear simulations* restores normal.
- **Data sources:** System → Data sources. Everything is *Mock* by default. *Hermes sessions* / *Hermes
  health* switch Continue and Status to read-only GETs against this preview's own Hermes (`api/sessions`,
  `health`). They never write.

## 5. What to try

| Area | Try |
|---|---|
| Home | Click Today items, Attention actions (Done → Undo toast), project rows, Continue items, Status |
| Talk to Jay | "What should I focus on today?", "Remind me to call the bank at 4pm", "Add a task to renew the domain", quick chips (+ Task, + Reminder, Capture idea, Research) |
| Tasks | Status chips, search, filters, sort, List ↔ Board, drag cards between columns, bulk select, New task |
| Projects | Select a project, open tasks, conversations, Ask Jay |
| Navigation | Chat / Files / Automations open real Hermes; the J rail (or the titlebar **JAY** button on phones) returns |
| Theme | Sun/moon in the topbar or rail; persists and is shared with Hermes |
| Search | Press `/` anywhere on a JAY page |
| Phone | Resize below 768px: bottom nav (Home · Tasks · Jay · More), full-screen Jay, bottom sheets |

## 6. Tests

```bash
./scripts/test.sh tests/test_jay_extension.py -q                        # JAY: 32 tests
./scripts/test.sh tests/test_extension_hooks.py tests/test_jay_extension.py -q
./scripts/test.sh -q                                                    # full Hermes suite (long)
```

`node` is required for the JAY data-layer tests (they run the real modules).

## 7. Turning JAY off

JAY only loads when `HERMES_WEBUI_EXTENSION_DIR` points at `jay/extension`. Without those variables the
same checkout serves stock Hermes WebUI.
