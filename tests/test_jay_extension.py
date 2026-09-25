"""JAY extension bundle (jay/extension) — manifest, injection, safety and data layer.

JAY ships as a Hermes WebUI extension, so these tests pin the contract it relies
on (manifest + same-origin injection) and the guarantees the preview makes:
no external URLs, no unsafe DOM APIs, no write calls to Hermes, mock data only.
"""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
EXT_DIR = REPO_ROOT / "jay" / "extension"
MANIFEST = EXT_DIR / "extensions.json"
JS_DIR = EXT_DIR / "js"
CSS_DIR = EXT_DIR / "css"
PREVIEW_SCRIPT = REPO_ROOT / "scripts" / "jay-preview.sh"
NODE = shutil.which("node")


def _manifest_entry():
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = data["extensions"]
    assert len(entries) == 1
    return entries[0]


def _js_files():
    return sorted(JS_DIR.glob("*.js"))


def _css_files():
    return sorted(CSS_DIR.glob("*.css"))


# ── Manifest + injection ──────────────────────────────────────────────────


def test_manifest_lists_existing_assets_in_load_order():
    entry = _manifest_entry()
    assert entry["id"] == "jay"
    for rel in entry["stylesheets"] + entry["scripts"]:
        assert (EXT_DIR / rel).is_file(), rel
    scripts = entry["scripts"]
    # core first, boot last; data layer before any view
    assert scripts[0] == "js/jay-core.js"
    assert scripts[-1] == "js/jay-boot.js"
    assert scripts.index("js/jay-providers.js") < scripts.index("js/jay-home.js")
    assert entry["stylesheets"][0] == "css/jay-tokens.css"
    # every shipped asset is actually loaded (no orphan files)
    listed = set(entry["stylesheets"] + entry["scripts"])
    shipped = {p.relative_to(EXT_DIR).as_posix() for p in _js_files() + _css_files()}
    assert shipped == listed


def test_dense_density_is_an_isolated_override_layer():
    """Dense loads last and every rule is scoped to data-jay-density="dense",
    so the default (Comfortable) rendering cannot change through it."""
    entry = _manifest_entry()
    assert entry["stylesheets"][-1] == "css/jay-dense.css"
    css = re.sub(r"/\*.*?\*/", "", (CSS_DIR / "jay-dense.css").read_text(encoding="utf-8"), flags=re.S)
    selectors = []
    depth = 0
    buf = ""
    for ch in css:
        if ch == "{":
            head = buf.strip()
            if not head.startswith("@"):
                selectors.append(head)
            depth += 1
            buf = ""
        elif ch == "}":
            depth -= 1
            buf = ""
        elif ch == ";":
            buf = ""
        else:
            buf += ch
    assert selectors, "no rules parsed"
    for sel in selectors:
        for part in re.split(r",(?![^()]*\))", sel):
            assert '[data-jay-density="dense"]' in part, part.strip()
    shell = (JS_DIR / "jay-shell.js").read_text(encoding="utf-8")
    assert "setDensity" in shell and "data-jay-density-default" in shell
    # Dense is the default when nothing is stored and the page sets no default.
    assert re.search(r"DENSITIES\.includes\(d\) \? d : 'dense'", shell)


def test_manifest_urls_pass_core_url_validation():
    from api import extensions

    entry = _manifest_entry()
    for rel in entry["stylesheets"] + entry["scripts"]:
        assert extensions._is_safe_asset_url("/extensions/" + rel), rel


def test_core_injects_jay_assets_when_configured(monkeypatch):
    from api import extensions

    monkeypatch.setenv("HERMES_WEBUI_EXTENSION_DIR", str(EXT_DIR))
    monkeypatch.setenv("HERMES_WEBUI_EXTENSION_MANIFEST", "extensions.json")
    monkeypatch.delenv("HERMES_WEBUI_EXTENSION_SCRIPT_URLS", raising=False)
    monkeypatch.delenv("HERMES_WEBUI_EXTENSION_STYLESHEET_URLS", raising=False)
    html = extensions.inject_extension_tags("<html><head></head><body></body></html>")
    entry = _manifest_entry()
    head, body = html.split("</head>", 1)
    last = -1
    for rel in entry["stylesheets"]:
        tag = '<link rel="stylesheet" href="/extensions/%s">' % rel
        assert tag in head
        assert head.index(tag) > last
        last = head.index(tag)
    last = -1
    for rel in entry["scripts"]:
        tag = '<script src="/extensions/%s" defer></script>' % rel
        assert tag in body
        assert body.index(tag) > last
        last = body.index(tag)


def test_stock_hermes_is_unchanged_without_extension_env(monkeypatch):
    from api import extensions

    monkeypatch.setenv("HERMES_WEBUI_EXTENSION_DIR", str(REPO_ROOT / "does-not-exist"))
    monkeypatch.delenv("HERMES_WEBUI_EXTENSION_MANIFEST", raising=False)
    html = "<html><head></head><body></body></html>"
    assert "jay-" not in extensions.inject_extension_tags(html)


# ── Static safety scan ────────────────────────────────────────────────────

FORBIDDEN_JS = [
    (re.compile(r"\beval\s*\("), "eval"),
    (re.compile(r"new\s+Function\s*\("), "new Function"),
    (re.compile(r"document\.write"), "document.write"),
    (re.compile(r"insertAdjacentHTML"), "insertAdjacentHTML"),
    (re.compile(r"outerHTML\s*="), "outerHTML assignment"),
    (re.compile(r"XMLHttpRequest|WebSocket|EventSource|sendBeacon"), "other network APIs"),
]


@pytest.mark.parametrize("path", _js_files(), ids=lambda p: p.name)
def test_js_has_no_unsafe_apis(path):
    src = path.read_text(encoding="utf-8")
    for pattern, label in FORBIDDEN_JS:
        assert not pattern.search(src), "%s uses %s" % (path.name, label)


def test_innerhtml_is_only_used_for_static_icon_paths():
    hits = []
    for path in _js_files():
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if ".innerHTML" in line:
                hits.append((path.name, line.strip()))
    assert hits == [("jay-core.js", "svg.innerHTML = ICONS[name] || ICONS.circle;")]


def test_assets_reference_no_external_origins():
    allowed = {"http://www.w3.org/2000/svg"}
    for path in _js_files() + _css_files():
        src = path.read_text(encoding="utf-8")
        for url in re.findall(r"https?://[^\s'\")]+", src):
            # data: SVG in CSS carries an xmlns with escaped quotes
            url = url.rstrip("'%")
            assert url in allowed or url.startswith("http://www.w3.org/2000/svg"), "%s references %s" % (path.name, url)


def test_css_has_no_imports_or_remote_urls():
    for path in _css_files():
        src = path.read_text(encoding="utf-8")
        assert "@import" not in src, path.name
        for match in re.findall(r"url\(([^)]*)\)", src):
            ref = match.strip("\"'")
            if ref.startswith("../fonts/"):
                # self-hosted font files only, and they must ship with the bundle
                assert re.fullmatch(r"\.\./fonts/[a-z0-9-]+\.woff2", ref), (path.name, ref)
                assert (CSS_DIR / ref).resolve().is_file(), (path.name, ref)
                continue
            assert ref.startswith("data:image/svg+xml"), (path.name, match)


def test_self_hosted_fonts_ship_with_their_licenses():
    fonts = EXT_DIR / "fonts"
    assert sorted(p.name for p in fonts.glob("*.woff2"))
    assert (fonts / "LICENSE-Inter.txt").is_file()
    assert (fonts / "LICENSE-Poppins.txt").is_file()
    for lic in fonts.glob("LICENSE-*.txt"):
        assert "SIL Open Font License" in lic.read_text(encoding="utf-8")


def test_only_the_provider_layer_talks_to_hermes_and_only_reads():
    for path in _js_files():
        src = path.read_text(encoding="utf-8")
        if path.name == "jay-providers.js":
            assert src.count("fetch(") == 1
            assert not re.search(r"method\s*:", src), "provider fetch must stay GET-only"
            assert not re.search(r"\b(POST|PUT|PATCH|DELETE)\b", src)
        else:
            assert "fetch(" not in src, "%s must go through JAY.data" % path.name
            assert "/api/" not in src, "%s must not call Hermes APIs directly" % path.name


STORAGE_CALL = re.compile(r"storage\.(?:get|set|remove)\(\s*(?:'([^']*)'|([A-Za-z_$][\w$]*))")
STRING_CONST = re.compile(r"\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'\s*;")
SECRET_LIKE = re.compile(r"token|secret|password|apikey|api_key|credential", re.I)


def test_no_placeholder_copy_or_secret_like_keys():
    for path in _js_files():
        src = path.read_text(encoding="utf-8")
        assert "lorem" not in src.lower(), path.name
        consts = dict(STRING_CONST.findall(src))
        # Key constants are checked even when no storage call names them directly.
        keys = [v for k, v in consts.items() if k.endswith("_KEY")]
        for literal, ident in STORAGE_CALL.findall(src):
            if ident:
                # Fail closed: a key the scan cannot resolve cannot be checked.
                assert ident in consts, "%s: storage key %s is not a string constant" % (path.name, ident)
                keys.append(consts[ident])
            else:
                keys.append(literal)
        for key in keys:
            assert not SECRET_LIKE.search(key), (path.name, key)


def test_storage_key_scan_resolves_constants():
    src = "const DEMO_KEY = 'demo-v2';\nJAY.storage.get(DEMO_KEY, null);\nJAY.storage.set('adapters', x);"
    consts = dict(STRING_CONST.findall(src))
    found = [consts.get(ident, ident) if ident else literal for literal, ident in STORAGE_CALL.findall(src)]
    assert found == ["demo-v2", "adapters"]
    assert SECRET_LIKE.search("api_token")


# ── Data layer (runs the real modules in Node) ────────────────────────────

# Browser stand-ins shared by the Node harnesses: an in-memory localStorage
# (`store`), no-op media queries and a bare document. `loadModules` runs the
# named files from the JS directory passed as argv[2], in order.
NODE_PRELUDE = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  key: (i) => (Object.keys(store)[i] === undefined ? null : Object.keys(store)[i]),
  get length() { return Object.keys(store).length; },
};
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
global.document = { getElementById: () => null, body: {} };
global.requestAnimationFrame = (f) => setTimeout(f, 0);
const dir = process.argv[2];
function loadModules(files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
}
"""

NODE_HARNESS = NODE_PRELUDE + r"""
// A superseded demo blob (with a typed chat message) and a Hermes key that is not ours.
const LEGACY = JSON.stringify({ builtOn: '2020-01-01', data: { conversations: [{ id: 'main', messages: [{ role: 'user', text: 'typed by the owner' }] }] } });
store['jay:demo-v1'] = LEGACY;
store['hermes-theme'] = 'dark';
loadModules(['jay-core.js', 'jay-data-mock.js', 'jay-providers.js', 'jay-chat.js']);
(async () => {
  const D = window.JAY.data;
  const out = {};
  out.legacySweptOnLoad = !('jay:demo-v1' in store);
  out.counts = await D.getTaskCounts();
  const today = await D.getTodayItems();
  out.todaySorted = today.every((it, i) => i === 0 || new Date(today[i - 1].at) <= new Date(it.at));
  out.todayKinds = Array.from(new Set(today.map((t) => t.kind))).sort();
  const att = await D.getAttentionItems();
  out.firstAttention = att[0].level;
  out.attentionCount = att.length;
  out.sessions = (await D.getRecentSessions()).map((s) => s.id);
  await D.createTask({ title: 'Renew domain', status: 'inbox' });
  out.afterCreate = await D.getTaskCounts();
  const pick = (t) => ({ status: t.status, progress: t.progress, prevStatus: t.prevStatus || null });
  out.task005Before = pick(await D.getTask('task-005'));
  await D.resolveAttention('at-2', 'done');
  out.afterDone = await D.getTaskCounts();
  out.task005 = (await D.getTask('task-005')).status;
  out.attentionAfterDone = (await D.getAttentionItems()).map((a) => a.id);
  await D.restoreAttention('at-2');
  const restored = await D.getTask('task-005');
  out.task005Restored = restored.status;
  out.task005AfterUndo = pick(restored);
  out.task005UndoEvent = restored.lastEvent && restored.lastEvent.label;
  out.attentionAfterUndo = (await D.getAttentionItems()).some((a) => a.id === 'at-2');
  out.overdueFilter = (await D.getTasks({ due: 'overdue' })).map((t) => t.id).sort();
  // Undoing a snooze must not reopen a task that was completed in the meantime.
  await D.resolveAttention('at-2', 'snooze');
  await D.completeTask('task-005', true);
  await D.restoreAttention('at-2');
  out.undoSnoozeTask = pick(await D.getTask('task-005'));
  out.undoSnoozeAttention = (await D.getAttentionItems()).some((a) => a.id === 'at-2');
  await D.completeTask('task-005', false);
  // Undoing a snooze on an open task brings the item straight back.
  await D.resolveAttention('at-2', 'snooze');
  out.snoozedHidden = !(await D.getAttentionItems()).some((a) => a.id === 'at-2');
  await D.restoreAttention('at-2');
  out.unsnoozedVisible = (await D.getAttentionItems()).some((a) => a.id === 'at-2');
  out.task005AfterSnoozeUndo = (await D.getTask('task-005')).status;
  D.useAdapter('projects', 'hermes');
  out.projectsViaFallback = (await D.getProjects()).length;
  D.useAdapter('projects', 'mock');
  D.simulate('attention', 'error');
  try { await D.getAttentionItems(); out.simError = 'resolved'; } catch (e) { out.simError = 'rejected'; }
  D.simulate('tasks', 'empty');
  out.simEmpty = (await D.getTasks({})).length;
  D.clearSimulations();
  const r1 = await window.JAY.chat.respond('Remind me to call the bank in 30 minutes', null);
  out.reminderReply = r1.text;
  out.reminderAdded = JSON.parse(store['jay:demo-v2']).data.agenda.some((a) => a.kind === 'reminder' && a.title === 'Call the bank');
  const r2 = await window.JAY.chat.respond('Add a task to renew the car registration', null);
  out.taskReply = r2.text;
  const r3 = await window.JAY.chat.respond('Something unrelated', null);
  out.fallbackReply = r3.text;
  out.persisted = Object.keys(store).filter((k) => k.startsWith('jay:')).sort();
  // Reset demo data also clears a superseded blob that reappears (another tab on an old build).
  store['jay:demo-v1'] = LEGACY;
  D.resetDemo();
  out.afterReset = Object.keys(store).filter((k) => k.startsWith('jay:')).sort();
  out.foreignKeptAfterReset = store['hermes-theme'] === 'dark';
  console.log(JSON.stringify(out));
})().catch((e) => { console.error(e); process.exit(1); });
"""


def _run_node_harness(tmp_path_factory, source):
    if not NODE:
        pytest.skip("node is required for the JAY data-layer test")
    harness = tmp_path_factory.mktemp("jay") / "harness.js"
    harness.write_text(source, encoding="utf-8")
    proc = subprocess.run([NODE, str(harness), str(JS_DIR)], capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def data_layer(tmp_path_factory):
    return _run_node_harness(tmp_path_factory, NODE_HARNESS)


def test_mock_counts_match_home_widgets(data_layer):
    c = data_layer["counts"]
    assert (c["today"], c["overdue"], c["in_progress"], c["waiting"]) == (4, 2, 6, 3)


def test_today_is_one_chronological_stream(data_layer):
    assert data_layer["todaySorted"] is True
    assert data_layer["todayKinds"] == ["automation", "event", "followup", "reminder", "task"]


def test_attention_is_priority_ordered(data_layer):
    assert data_layer["firstAttention"] == "critical"
    assert data_layer["attentionCount"] == 7


def test_continue_excludes_the_home_conversation(data_layer):
    assert "main" not in data_layer["sessions"]
    assert data_layer["sessions"][0] == "voice-bridge"


def test_mutations_flow_through_every_domain(data_layer):
    assert data_layer["afterCreate"]["inbox"] == data_layer["counts"]["inbox"] + 1
    assert data_layer["afterDone"]["overdue"] == 1
    assert data_layer["task005"] == "done"
    assert "at-2" not in data_layer["attentionAfterDone"]
    assert data_layer["task005Restored"] == "in_progress"
    assert data_layer["overdueFilter"] == ["task-005", "task-006"]


def test_attention_undo_reverses_exactly_the_action(data_layer):
    before = data_layer["task005Before"]
    assert before["status"] == "in_progress" and before["progress"] < 100
    # Undo "Done" reopens the task with its checklist progress, not 100%.
    assert data_layer["task005AfterUndo"] == before
    assert data_layer["task005UndoEvent"] == "Status"
    assert data_layer["attentionAfterUndo"] is True
    # Undo "Snooze" never reopens a task completed elsewhere; its item stays resolved.
    assert data_layer["undoSnoozeTask"]["status"] == "done"
    assert data_layer["undoSnoozeTask"]["progress"] == 100
    assert data_layer["undoSnoozeAttention"] is False
    assert data_layer["snoozedHidden"] is True
    assert data_layer["unsnoozedVisible"] is True
    assert data_layer["task005AfterSnoozeUndo"] == "in_progress"


def test_unimplemented_adapter_methods_fall_back_to_mock(data_layer):
    assert data_layer["projectsViaFallback"] == 5


def test_simulated_widget_states(data_layer):
    assert data_layer["simError"] == "rejected"
    assert data_layer["simEmpty"] == 0


def test_mock_responder_is_local_and_honest(data_layer):
    assert "Call the bank" in data_layer["reminderReply"]
    assert data_layer["reminderAdded"] is True
    assert "Renew the car registration" in data_layer["taskReply"]
    assert "not connected to Hermes" in data_layer["fallbackReply"]


def test_only_demo_state_is_persisted(data_layer):
    # The harness seeds jay:demo-v1 before load; loading sweeps it.
    assert data_layer["legacySweptOnLoad"] is True
    assert data_layer["persisted"] == ["jay:adapters", "jay:demo-v2"]


def test_reset_demo_clears_superseded_demo_blobs(data_layer):
    assert data_layer["afterReset"] == ["jay:adapters"]
    assert data_layer["foreignKeptAfterReset"] is True


# ── Data-layer contracts the views rely on (fresh Node process) ───────────
# Each section records its result, or {"error": ...} when it throws, so one
# broken contract fails its own test instead of hiding the others. Sections
# run in order on one dataset and each uses items the others leave alone.

NODE_CONTRACTS = NODE_PRELUDE + r"""
// A blob saved earlier today by the previous schema (no `schema`, tasks
// without streams, no user) must be rebuilt instead of served as it is.
const STALE_TITLE = 'Edited before the schema bump';
loadModules(['jay-core.js', 'jay-data-mock.js']);
const J = window.JAY;
const stale = J.mock.build(new Date());
stale.tasks.forEach((t) => { delete t.stream; });
delete stale.user;
stale.tasks[0].title = STALE_TITLE;
store['jay:demo-v2'] = JSON.stringify({ builtOn: J.fmt.isoDate(new Date()), data: stale });
loadModules(['jay-providers.js']);
const D = J.data;
const out = {};
const blob = () => {
  const b = JSON.parse(store['jay:demo-v2'] || 'null');
  if (!b || !b.data) throw new Error('the demo blob was never persisted');
  return b;
};
const ids = (list) => list.map((t) => t.id);
const events = [];
['tasks', 'today', 'projects', 'attention', 'reset'].forEach((e) => J.on('data:' + e, () => events.push(e)));
const seen = () => Array.from(new Set(events)).sort();
async function section(name, fn) {
  try { out[name] = await fn(); } catch (e) { out[name] = { error: String((e && e.stack) || e) }; }
}
(async () => {
  await section('streams', async () => {
    const projects = await D.getProjects();
    const byId = new Map(projects.map((p) => [p.id, p]));
    const inProject = (t, p) => !!p && Array.isArray(p.streams) && typeof t.stream === 'string' && p.streams.includes(t.stream);
    const served = await D.getTasks({});
    const built = J.mock.build(new Date());
    return {
      total: served.length,
      notInProject: served.filter((t) => !inProject(t, byId.get(t.projectId))).map((t) => t.id + ':' + t.stream),
      builtNotInProject: built.tasks.filter((t) => !inProject(t, built.projects.find((p) => p.id === t.projectId))).map((t) => t.id),
      staleServed: served.some((t) => t.title === STALE_TITLE),
    };
  });

  await section('user', () => D.getUser());

  await section('owner', async () => {
    const none = ids(await D.getTasks({}));
    return {
      none,
      any: ids(await D.getTasks({ owner: 'any' })),
      all: ids(await D.getTasks({ owner: 'all' })),
      rana: (await D.getTasks({ owner: 'rana' })).map((t) => t.assignee),
    };
  });

  await section('sort', async () => {
    const time = (v) => new Date(v).getTime();
    const RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
    const ordered = (list, cmp, dir) => list.every((t, i) => i === 0 || (dir === 'asc' ? cmp(list[i - 1], t) <= 0 : cmp(list[i - 1], t) >= 0));
    const PRIMARY = {
      title: (a, b) => String(a.title).localeCompare(String(b.title)),
      updated: (a, b) => time(a.updatedAt) - time(b.updatedAt),
      priority: (a, b) => RANK[a.priority] - RANK[b.priority],
      status: (a, b) => D.STATUS_ORDER.indexOf(a.status) - D.STATUS_ORDER.indexOf(b.status),
    };
    // Due: open tasks first, undated after dated, and only the dates follow dir.
    const dueOrdered = (list, dir) => {
      const firstDone = list.findIndex((t) => t.status === 'done');
      const doneLast = firstDone < 0 || list.slice(firstDone).every((t) => t.status === 'done');
      const open = list.filter((t) => t.status !== 'done');
      const firstUndated = open.findIndex((t) => !t.due);
      const undatedLast = firstUndated < 0 || open.slice(firstUndated).every((t) => !t.due);
      return doneLast && undatedLast && ordered(open.filter((t) => t.due), (a, b) => time(a.due) - time(b.due), dir);
    };
    const res = {};
    for (const key of ['due', 'priority', 'status', 'updated', 'title']) {
      const asc = await D.getTasks({ sort: key, dir: 'asc' });
      const desc = await D.getTasks({ sort: key, dir: 'desc' });
      const dflt = ids(await D.getTasks({ sort: key })).join();
      const check = key === 'due' ? dueOrdered : (list, dir) => ordered(list, PRIMARY[key], dir);
      res[key] = {
        differs: ids(asc).join() !== ids(desc).join(),
        ascOrdered: check(asc, 'asc'),
        descOrdered: check(desc, 'desc'),
        defaultDir: dflt === ids(asc).join() ? 'asc' : (dflt === ids(desc).join() ? 'desc' : 'neither'),
      };
    }
    return res;
  });

  await section('snooze', async () => {
    const until = new Date(Date.now() + 26 * 3600000).toISOString();
    const res = await D.resolveAttention('at-6', 'snooze', { until });
    const stored = blob().data.attention.find((a) => a.id === 'at-6').snoozedUntil;
    const hidden = !(await D.getAttentionItems()).some((a) => a.id === 'at-6');
    await D.restoreAttention('at-6', { action: 'snooze' });
    const back = (await D.getAttentionItems()).some((a) => a.id === 'at-6');
    // A time that is not in the future, or not a time at all, falls back to 3 h.
    const t0 = Date.now();
    const past = await D.resolveAttention('at-6', 'snooze', { until: new Date(t0 - 3600000).toISOString() });
    await D.restoreAttention('at-6', { action: 'snooze' });
    const junk = await D.resolveAttention('at-6', 'snooze', { until: 'not a date' });
    await D.restoreAttention('at-6', { action: 'snooze' });
    const minutes = (iso) => Math.round((new Date(iso).getTime() - t0) / 60000);
    return { until, returned: res.snoozedUntil, stored, hidden, back, pastMinutes: minutes(past.snoozedUntil), junkMinutes: minutes(junk.snoozedUntil) };
  });

  await section('deleteRestore', async () => {
    const before = blob().data;
    const index = before.tasks.findIndex((t) => t.id === 'task-005');
    const original = JSON.stringify(before.tasks[index]);
    const count = before.tasks.length;
    events.length = 0;
    const snap = await D.deleteTask('task-005');
    const r = { originalIndex: index, deleteEvents: seen() };
    r.snapKeys = Object.keys(snap || {}).sort();
    r.snapTaskId = snap && snap.task ? snap.task.id : null;
    r.snapIndex = snap ? snap.index : null;
    r.snapAttention = snap ? snap.attentionIds : null;
    const afterDelete = blob().data;
    r.removed = !afterDelete.tasks.some((t) => t.id === 'task-005') && afterDelete.tasks.length === count - 1;
    r.getTaskAfterDelete = await D.getTask('task-005');
    const linked = afterDelete.attention.find((a) => a.id === 'at-2');
    r.linkedAfterDelete = { resolved: linked.resolved, resolvedBy: linked.resolvedBy || null };
    r.hiddenAfterDelete = !(await D.getAttentionItems()).some((a) => a.id === 'at-2');
    events.length = 0;
    const restored = await D.restoreTask(snap);
    r.restoreEvents = seen();
    const afterRestore = blob().data;
    r.restoredId = restored ? restored.id : null;
    r.restoredIndex = afterRestore.tasks.findIndex((t) => t.id === 'task-005');
    r.restoredUnchanged = JSON.stringify(afterRestore.tasks[r.restoredIndex]) === original;
    const reopened = afterRestore.attention.find((a) => a.id === 'at-2');
    r.linkedAfterRestore = { resolved: reopened.resolved, hasResolvedBy: 'resolvedBy' in reopened };
    r.visibleAfterRestore = (await D.getAttentionItems()).some((a) => a.id === 'at-2');
    await D.restoreTask(snap);
    r.copiesAfterSecondRestore = blob().data.tasks.filter((t) => t.id === 'task-005').length;
    r.countRestored = blob().data.tasks.length === count;
    // An item resolved before the delete is not the delete's to reopen.
    await D.resolveAttention('at-3', 'dismiss');
    const snap6 = await D.deleteTask('task-006');
    await D.restoreTask(snap6);
    r.priorResolvedSnapAttention = snap6.attentionIds;
    r.priorResolvedStays = blob().data.attention.find((a) => a.id === 'at-3').resolved === true;
    try { await D.deleteTask('task-missing'); r.missing = 'resolved'; } catch (e) { r.missing = String(e.message); }
    return r;
  });

  await section('streamWrites', async () => {
    const kept = await D.createTask({ title: 'Stream kept', projectId: 'company-website', stream: 'Hosting' });
    const foreign = await D.createTask({ title: 'Stream from another project', projectId: 'company-website', stream: 'Finance' });
    const moved = await D.updateTask(kept.id, { projectId: 'home' });
    const picked = await D.updateTask(kept.id, { stream: 'Bills' });
    return { kept: kept.stream, foreign: foreign.stream, moved: moved.stream, picked: picked.stream, schema: blob().schema };
  });

  await section('activityLink', async () => {
    const p = await D.getProject('business-ops');
    const a = p.activity.find((x) => x.id === 'ac-6');
    const at = (await D.getAttentionItems()).find((x) => x.id === a.attentionId);
    return { attentionId: a.attentionId, actions: at ? at.actions : null };
  });

  await section('reset', async () => {
    events.length = 0;
    D.resetDemo();
    return { events: seen(), stored: 'jay:demo-v2' in store };
  });

  console.log(JSON.stringify(out));
})().catch((e) => { console.error(e); process.exit(1); });
"""


@pytest.fixture(scope="module")
def contracts(tmp_path_factory):
    return _run_node_harness(tmp_path_factory, NODE_CONTRACTS)


def _section(results, name):
    value = results[name]
    assert not (isinstance(value, dict) and "error" in value), "%s threw:\n%s" % (name, value.get("error"))
    return value


def test_every_mock_task_has_a_stream_from_its_project(contracts):
    s = _section(contracts, "streams")
    assert s["total"] > 20
    assert s["builtNotInProject"] == []
    assert s["notInProject"] == []
    # The same-day blob saved without a schema was rebuilt, not served.
    assert s["staleServed"] is False


def test_get_user_returns_the_demo_user(contracts):
    assert _section(contracts, "user") == {"id": "pat", "name": "Pat", "context": "Personal", "workspace": "Main"}


def test_owner_any_equals_no_filter(contracts):
    o = _section(contracts, "owner")
    assert o["any"] == o["none"]
    assert o["all"] == o["none"]
    # A real owner still filters.
    assert o["rana"] and set(o["rana"]) == {"rana"}
    assert len(o["rana"]) < len(o["none"])


@pytest.mark.parametrize("key", ["due", "priority", "status", "updated", "title"])
def test_sort_direction_changes_order(contracts, key):
    r = _section(contracts, "sort")[key]
    assert r["differs"] is True, "dir asc/desc returned the same order for sort=%s" % key
    assert r["ascOrdered"] is True
    assert r["descOrdered"] is True
    # Without dir: newest first for Last update, ascending for everything else.
    assert r["defaultDir"] == ("desc" if key == "updated" else "asc")


def test_snooze_until_sets_snoozed_until(contracts):
    s = _section(contracts, "snooze")
    assert s["returned"] == s["until"]
    assert s["stored"] == s["until"]
    assert s["hidden"] is True
    assert s["back"] is True
    # Past or unparseable times fall back to three hours from now.
    assert 179 <= s["pastMinutes"] <= 181
    assert 179 <= s["junkMinutes"] <= 181


def test_delete_task_snapshot_restores_in_place(contracts):
    r = _section(contracts, "deleteRestore")
    assert r["snapKeys"] == ["attentionIds", "index", "task"]
    assert r["snapTaskId"] == "task-005"
    assert r["snapIndex"] == r["originalIndex"]
    assert r["removed"] is True
    assert r["getTaskAfterDelete"] is None
    assert r["deleteEvents"] == ["attention", "projects", "tasks", "today"]
    # Back at the same index with the same id and stored fields.
    assert r["restoredId"] == "task-005"
    assert r["restoredIndex"] == r["originalIndex"]
    assert r["restoredUnchanged"] is True
    assert r["restoreEvents"] == ["attention", "projects", "tasks", "today"]
    # A second restore of the same snapshot changes nothing.
    assert r["copiesAfterSecondRestore"] == 1
    assert r["countRestored"] is True
    assert r["missing"] == "Task not found"


def test_delete_task_resolves_and_restore_reopens_only_its_attention(contracts):
    r = _section(contracts, "deleteRestore")
    assert r["snapAttention"] == ["at-2"]
    assert r["linkedAfterDelete"] == {"resolved": True, "resolvedBy": "delete"}
    assert r["hiddenAfterDelete"] is True
    assert r["linkedAfterRestore"] == {"resolved": False, "hasResolvedBy": False}
    assert r["visibleAfterRestore"] is True
    # at-3 was dismissed before its task was deleted: not in the snapshot, still resolved.
    assert r["priorResolvedSnapAttention"] == []
    assert r["priorResolvedStays"] is True


def test_task_stream_must_belong_to_the_task_project(contracts):
    w = _section(contracts, "streamWrites")
    assert w["kept"] == "Hosting"
    assert w["foreign"] is None
    assert w["moved"] is None
    assert w["picked"] == "Bills"
    assert w["schema"] == 3


def test_project_activity_links_to_its_attention_request(contracts):
    a = _section(contracts, "activityLink")
    assert a["attentionId"] == "at-4"
    assert a["actions"] == ["approve", "decline"]


def test_reset_demo_emits_data_reset(contracts):
    r = _section(contracts, "reset")
    assert "reset" in r["events"]
    assert {"attention", "projects", "tasks", "today"} <= set(r["events"])
    assert r["stored"] is False


# ── Design-system doc stays in step with the tokens ───────────────────────

TOKENS_CSS = CSS_DIR / "jay-tokens.css"
DESIGN_DOC = REPO_ROOT / "docs" / "JAY_DESIGN_SYSTEM.md"


def _css_vars(src, selector):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    m = re.search(r"^%s\s*\{(.*?)^\}" % re.escape(selector), src, flags=re.M | re.S)
    assert m, selector
    return {k: " ".join(v.split()) for k, v in re.findall(r"(--jay-[\w-]+)\s*:\s*([^;]+);", m.group(1))}


def _doc_token_rows():
    text = DESIGN_DOC.read_text(encoding="utf-8")
    section = text.split("\n## 1.", 1)[1].split("\n## 2.", 1)[0]
    rows = {}
    for line in section.splitlines():
        if not line.startswith("| `--jay-"):
            continue
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", line.strip())[1:-1]]
        token = cells[0].strip("`")
        assert token not in rows, "%s is documented twice" % token
        rows[token] = [" ".join(c.strip("`").split()) for c in cells[1:-1]]
    return rows


def test_design_doc_token_table_matches_tokens_css():
    src = TOKENS_CSS.read_text(encoding="utf-8")
    light = _css_vars(src, ":root")
    dark = _css_vars(src, ":root.dark")
    rows = _doc_token_rows()
    defined = set(light) | set(dark)
    assert set(rows) == defined, "undocumented: %s; not in CSS: %s" % (sorted(defined - set(rows)), sorted(set(rows) - defined))
    for token, cells in rows.items():
        if len(cells) == 2:  # | token | dark | light | use |
            assert cells == [dark.get(token, light.get(token)), light.get(token)], token
        else:  # | token | value | use | — the same in both modes
            assert token not in dark, "%s differs by mode but has one value in the doc" % token
            assert cells == [light[token]], token


# ── Preview launcher safety ───────────────────────────────────────────────


def test_preview_script_is_valid_bash():
    proc = subprocess.run(["bash", "-n", str(PREVIEW_SCRIPT)], capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr


def test_preview_script_is_isolated_and_loopback_only():
    src = PREVIEW_SCRIPT.read_text(encoding="utf-8")
    assert 'HOST="127.0.0.1"' in src
    assert "env -i" in src
    for var in ("HERMES_HOME=", "HERMES_BASE_HOME=", "HERMES_WEBUI_STATE_DIR=", "HERMES_CONFIG_PATH="):
        assert '"%s$PREVIEW_HOME' % var in src, var
    assert "HERMES_WEBUI_EXTENSION_DIR=$EXT_DIR" in src
    assert "0.0.0.0" not in src


def test_preview_script_refuses_a_home_inside_real_hermes(tmp_path):
    env = dict(os.environ, HOME=str(tmp_path), JAY_PREVIEW_HOME=str(tmp_path / ".hermes" / "jay"))
    proc = subprocess.run(["bash", str(PREVIEW_SCRIPT), "status"], capture_output=True, text=True, env=env, timeout=30)
    assert proc.returncode != 0
    assert "Refusing" in proc.stderr


def test_jay_docs_exist():
    for name in ("JAY_IMPLEMENTATION_PLAN.md", "JAY_ARCHITECTURE.md", "JAY_CUSTOMIZATIONS.md", "JAY_PREVIEW.md"):
        assert (REPO_ROOT / "docs" / name).is_file(), name
