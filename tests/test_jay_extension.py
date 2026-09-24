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


def test_no_placeholder_copy_or_secret_like_keys():
    for path in _js_files():
        src = path.read_text(encoding="utf-8")
        assert "lorem" not in src.lower(), path.name
        for key in re.findall(r"storage\.(?:get|set|remove)\('([^']+)'", src):
            assert not re.search(r"token|secret|password|apikey|api_key|credential", key, re.I), key


# ── Data layer (runs the real modules in Node) ────────────────────────────

NODE_HARNESS = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const store = {};
global.window = global;
global.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
global.document = { getElementById: () => null, body: {} };
global.requestAnimationFrame = (f) => setTimeout(f, 0);
const dir = process.argv[2];
for (const f of ['jay-core.js', 'jay-data-mock.js', 'jay-providers.js', 'jay-chat.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
}
(async () => {
  const D = window.JAY.data;
  const out = {};
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
  await D.resolveAttention('at-2', 'done');
  out.afterDone = await D.getTaskCounts();
  out.task005 = (await D.getTask('task-005')).status;
  out.attentionAfterDone = (await D.getAttentionItems()).map((a) => a.id);
  await D.restoreAttention('at-2');
  out.task005Restored = (await D.getTask('task-005')).status;
  out.overdueFilter = (await D.getTasks({ due: 'overdue' })).map((t) => t.id).sort();
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
  console.log(JSON.stringify(out));
})().catch((e) => { console.error(e); process.exit(1); });
"""


@pytest.fixture(scope="module")
def data_layer(tmp_path_factory):
    if not NODE:
        pytest.skip("node is required for the JAY data-layer test")
    harness = tmp_path_factory.mktemp("jay") / "harness.js"
    harness.write_text(NODE_HARNESS, encoding="utf-8")
    proc = subprocess.run([NODE, str(harness), str(JS_DIR)], capture_output=True, text=True, timeout=60)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout.strip().splitlines()[-1])


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
    assert data_layer["persisted"] == ["jay:adapters", "jay:demo-v2"]


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
