# JAY

JAY is a personal operating system shell built on Hermes WebUI. It ships as a
Hermes WebUI extension bundle — `jay/extension/` is the extension root, loaded
through Hermes' own extension hooks. Hermes source files are not modified.

- Run the preview: `scripts/jay-preview.sh setup && scripts/jay-preview.sh start`
- Docs: [`docs/JAY_PREVIEW.md`](../docs/JAY_PREVIEW.md),
  [`docs/JAY_ARCHITECTURE.md`](../docs/JAY_ARCHITECTURE.md),
  [`docs/JAY_CUSTOMIZATIONS.md`](../docs/JAY_CUSTOMIZATIONS.md),
  [`docs/JAY_IMPLEMENTATION_PLAN.md`](../docs/JAY_IMPLEMENTATION_PLAN.md)
- Tests: `./scripts/test.sh tests/test_jay_extension.py -q`

Phase 1 is mock-backed: no live integrations, nothing sent to Hermes or any LLM.
