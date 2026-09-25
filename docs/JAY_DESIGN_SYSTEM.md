# JAY — Design system v2 ("floating panels + lime")

Direction set by the owner's two references:

- **Deepsleep project board** — near-black canvas, floating rounded charcoal panels, lime accent,
  icon rail with a lime logo tile and lime active bar, tree navigation with lime count badges,
  kanban with colored column markers, "Add Board" rows, solid mini tags, checklists, avatar faces,
  activity feed with Approve / Decline.
- **Sales CRM table** — neutral charcoal data surfaces, labelled navigation with count badges,
  underline tabs, filter pills ("Sort by · Pipeline Value ⌄"), dense rows with tinted tag chips and a
  "+2" overflow chip, avatar + name owner cells, segmented red→green meters with %, green mini
  sparklines, "calendar · date | label" cells, and a calculation footer bar.

JAY adopts that look for both modes. Dark is primary; light uses the same structure on white panels.
Hermes' `.dark` class on `<html>` drives both JAY and Hermes, so one toggle switches them together.

## 1. Tokens (css/jay-tokens.css)

Every JAY surface reads only `--jay-*` tokens. The tables below list every token the file defines,
with its exact value (`tests/test_jay_extension.py` checks this section against the CSS). Light is
`:root`; dark is `:root.dark`.

**Surfaces and text**

| Token | Dark | Light | Use |
|---|---|---|---|
| `--jay-canvas` | `#1C1C1C` | `#E6E6E2` | Page behind the floating panels; phone app bar |
| `--jay-bg` | `#1C1C1C` | `#EDEDEA` | Legacy alias for the page ground (no current style reads it) |
| `--jay-surface` | `#2A2A2A` | `#FFFFFF` | Floating panels (`.jay-box`); table head (same fill as the rows, as in the CRM) |
| `--jay-surface-2` | `#323232` | `#F5F5F2` | Cards and raised rows inside panels, filter pills, kanban cards |
| `--jay-surface-3` | `#383838` | `#EAEAE6` | Hover fills, neutral chips and badges, default buttons |
| `--jay-inset` | `#1F1F1F` | `#F0F0EC` | Search fields, inset buttons ("Add Subtask"), dark feed cards |
| `--jay-elevated` | `#2E2E2E` | `#FFFFFF` | Drawers, menus, palette |
| `--jay-text` | `#F4F4F4` | `#161616` | Primary text |
| `--jay-text-2` | `#BDBDBD` | `#4D4D4D` | Secondary text, tree items |
| `--jay-muted` | `#A3A3A3` | `#5F5F5F` | Meta, column heads, inactive tabs |
| `--jay-faint` | `#6E6E6E` | `#A3A3A3` | Separators, decoration, disabled (not for text) |
| `--jay-border` | `rgba(255, 255, 255, 0.065)` | `rgba(0, 0, 0, 0.075)` | Hairlines, panel border (light) |
| `--jay-border-strong` | `rgba(255, 255, 255, 0.12)` | `rgba(0, 0, 0, 0.14)` | Pill and circle-button borders |
| `--jay-hover` | `rgba(255, 255, 255, 0.045)` | `rgba(0, 0, 0, 0.04)` | Hover wash |
| `--jay-press` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.07)` | Pressed wash |

**Accent and status**

| Token | Dark | Light | Use |
|---|---|---|---|
| `--jay-accent` | `#A7E05F` | `#A7E05F` | Lime fills: primary buttons, logo tile, active bar, accent badges |
| `--jay-accent-strong` | `#B9EC7B` | `#97D24C` | Lime fill on hover |
| `--jay-accent-text` | `#B4E878` | `#3E6A0C` | Lime-family text (active tab in dark, links, active tree item); light-mode bars and underlines |
| `--jay-accent-soft` | `rgba(167, 224, 95, 0.14)` | `rgba(122, 184, 42, 0.16)` | Lime tint (active tree row in light, soft buttons) |
| `--jay-accent-softer` | `rgba(167, 224, 95, 0.07)` | `rgba(122, 184, 42, 0.09)` | Faint lime tint (active tree row in dark, active filter pill) |
| `--jay-on-accent` | `#10190A` | `#10190A` | Text on lime (11.6:1) |
| `--jay-danger` | `#FF7B6E` | `#B8301F` | Overdue, errors (text and icons) |
| `--jay-danger-soft` | `rgba(255, 123, 110, 0.13)` | `rgba(184, 48, 31, 0.10)` | Danger tint |
| `--jay-warning` | `#F5C542` | `#805800` | Warnings (text and icons) |
| `--jay-warning-soft` | `rgba(245, 197, 66, 0.13)` | `rgba(214, 160, 20, 0.14)` | Warning tint |
| `--jay-info` | `#5FB0DF` | `#2F6FB2` | Informational text on panels |
| `--jay-info-soft` | `rgba(95, 176, 223, 0.13)` | `rgba(47, 111, 178, 0.10)` | Info tint |
| `--jay-good` | `#3CCB7F` | `#1E9E5A` | Sparklines, online dots, the "Active" pill dot (graphic, not text) |
| `--jay-neutral-soft` | `rgba(255, 255, 255, 0.07)` | `rgba(0, 0, 0, 0.055)` | Neutral tint (reserved; no current style reads it) |

**Hues** (one `--jay-h` per component picks one of these: tags, avatars, tree dots, feed icons,
file badges, column markers). Dark uses light-on-dark pastels, light uses text-safe darker hues.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--jay-hue-blue` | `#7AAEFF` | `#2563EB` | Tags, avatars, "Next" status |
| `--jay-hue-purple` | `#B09CFF` | `#7C3AED` | Tags, avatars, Figma files |
| `--jay-hue-green` | `#5FD99A` | `#15803D` | Tags, "Done" status, sheets |
| `--jay-hue-lime` | `#B4E878` | `#3E6A0C` | Tags, "In progress" status, tone-1 projects |
| `--jay-hue-orange` | `#F6A55E` | `#C2410C` | Tags, "Waiting" status |
| `--jay-hue-red` | `#FF8A7F` | `#DC2626` | Tags, PDFs, failed-run spark bars |
| `--jay-hue-yellow` | `#F5CE5A` | `#A16207` | Tags, archives |
| `--jay-hue-cyan` | `#5ED0EC` | `#0E7490` | Tags, logs |
| `--jay-hue-pink` | `#F58AC4` | `#BE185D` | Tags, images |
| `--jay-hue-neutral` | `#BDBDBD` | `#5C5C5C` | Default hue, "Inbox" status |

**Meters, project tones, effects**

| Token | Dark | Light | Use |
|---|---|---|---|
| `--jay-meter-1` | `#E5484D` | `#E5484D` | Meter ramp: red |
| `--jay-meter-2` | `#F08C3A` | `#F08C3A` | Meter ramp: orange |
| `--jay-meter-3` | `#E8C33A` | `#E8C33A` | Meter ramp: yellow |
| `--jay-meter-4` | `#3CCB7F` | `#3DBE6E` | Meter ramp: green (every filled run ends here) |
| `--jay-meter-off` | `rgba(255, 255, 255, 0.10)` | `rgba(0, 0, 0, 0.10)` | Unfilled meter bars |
| `--jay-tone-1` | `#A7E05F` | `#7CB82A` | Project tone 1 (dots, tiles) |
| `--jay-tone-2` | `#5FB0DF` | `#3B82F6` | Project tone 2 |
| `--jay-tone-3` | `#F09A55` | `#EA7A2C` | Project tone 3 |
| `--jay-tone-4` | `#F5C542` | `#D4A514` | Project tone 4 |
| `--jay-tone-5` | `#A48BFF` | `#8B5CF6` | Project tone 5 |
| `--jay-shadow-sm` | `none` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Panels (dark panels are flat) |
| `--jay-shadow-md` | `none` | `0 1px 2px rgba(0, 0, 0, 0.04), 0 6px 20px rgba(0, 0, 0, 0.05)` | Raised cards (reserved; no current style reads it) |
| `--jay-shadow-lg` | `0 28px 72px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4)` | `0 24px 64px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06)` | Drawers, menus, palette |
| `--jay-scrim` | `rgba(0, 0, 0, 0.6)` | `rgba(10, 10, 10, 0.32)` | Behind drawers and sheets |
| `--jay-focus` | `0 0 0 2px var(--jay-surface), 0 0 0 4px rgba(167, 224, 95, 0.65)` | `0 0 0 2px var(--jay-surface), 0 0 0 4px rgba(122, 184, 42, 0.6)` | Focus ring as a box-shadow (reserved). Controls draw focus with a 2px `--jay-accent` outline, offset 2px (olive `--jay-accent-text` on light primary buttons and cards) |

**Shape, rhythm, type** (the same in both modes)

| Token | Value | Use |
|---|---|---|
| `--jay-r-xs` | `6px` | Small shapes: sortable column-head buttons, tiny chips |
| `--jay-r-sm` | `8px` | Small buttons, file badges, segmented buttons |
| `--jay-r-md` | `10px` | Buttons, tree rows, Tasks toolbar pills, segmented track |
| `--jay-r-lg` | `14px` | Cards (feed, kanban), side-tree footer button, phone panels |
| `--jay-r-xl` | `18px` | Floating panels (`.jay-box`), drawers |
| `--jay-r-pill` | `999px` | Tags, filter pills (`fpill`), dot pills, badges, header search |
| `--jay-gap` | `12px` | Gap between panels; canvas padding |
| `--jay-pad` | `16px` | Panel inner padding |
| `--jay-rail-w` | `72px` | Icon rail width |
| `--jay-side-w` | `264px` | Side tree panel (Tasks overrides to 244px) |
| `--jay-aside-w` | `336px` | Right feed panel (Home Attention, Projects Activity) |
| `--jay-topbar-h` | `64px` | Header panel height |
| `--jay-bottomnav-h` | `64px` | Phone bottom nav height (plus the safe area) |
| `--jay-font` | `"JAY Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif` | Body, tables, meta, chat prose |
| `--jay-font-display` | `"JAY Poppins", "JAY Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | Titles, panel heads, nav labels, tabs, buttons, card titles |
| `--jay-font-mono` | `var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace)` | Key hints (`kbd`) |
| `--jay-ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | Transitions |
| `--jay-dur` | `160ms` | Transitions |

Type: **Poppins** and **Inter** are self-hosted in `jay/extension/fonts` (latin subset, weights
400/500/600/700, woff2, SIL OFL 1.1 with their licence files) and declared in `jay-tokens.css` as
`"JAY Poppins"` / `"JAY Inter"` with `font-display: swap`. JAY makes no third-party font requests.
Inside `#jayApp`, Hermes' `--font-ui` / `--font-conversation` resolve to JAY Inter. Numbers use
`tabular-nums`. Scale: 11 (eyebrow, uppercase +0.08em), 12, 12.5 (meta, crumbs), 13 (table),
13.5 (tabs, tree), 14 (body), 16 (panel title), 18 (phone app bar), 20 (page title), 24 (hero).

Contrast: `--jay-text`, `-2`, `muted`, `accent-text`, `danger` and `warning` are ≥ 4.5:1 on every
surface above (canvas, surface, surface-2, surface-3, inset, elevated) in both modes. The tightest
pairs are dark `muted` and `danger` on surface-3 (4.6:1) and light `danger` on canvas (4.8:1).
Light `--jay-info` reaches 4.5:1 on surface, surface-2 and inset only (4.2:1 on canvas); where it
sits on its own tint, components mix it 24% toward `--jay-text`, as they do for hue text on tints.
`--jay-faint` is reserved for decoration and disabled states, and `--jay-good` is a graphic colour.

The same file registers the **`jay` skin** for Hermes' own chrome (Chat, Files, Automations,
Settings): `:root:not(.dark)[data-skin="jay"]` and `:root.dark[data-skin="jay"]` map Hermes'
variables (`--bg`, `--surface`, `--accent`, …) onto this palette.

## 2. Shell layout (css/jay-shell.css, js/jay-shell.js)

```
canvas (padding 12, gap 12)
┌──────┐ ┌───────────────────────────────── header panel (.jay-header.jay-box, 64px) ─┐
│ rail │ │ Title  ●pill   crumb | crumb               [Search JAY  /] (＋)(☾)  (P) Pat ⌄│
│ 72px │ └───────────────────────────────────────────────────────────────────────────┘
│ .jay │ ┌── view (#jayView) — each view lays out its own panels with .jay-layout ─────┐
│ -box │ │ [side panel 264] [main panels 1fr] [aside feed 336]                          │
└──────┘ └──────────────────────────────────────────────────────────────────────────────┘
```

- **Rail** (`nav.jay-rail.jay-box`): lime logo tile "J" (`.jay-mark.is-rail`, 52px, radius 14,
  Poppins 21px, dark text on `--jay-accent`; `--jay-accent-strong` on hover), then Home · Chat ·
  Tasks · Projects · Calendar · Notes · Files · Automations · People, a hairline, Integrations ·
  System, and at the bottom the bell, the theme toggle and the account avatar (`JAY.me`). Chat,
  Files and Automations open Hermes. Buttons are 44px, radius 12, muted icons with 2px strokes;
  active = `--jay-accent-text` icon + a 3px lime bar on the rail's left edge (light: an olive
  `--jay-accent-text` bar and a `--jay-accent-soft` fill, so the state never rests on pale lime).
  Short windows tighten the rail: ≤ 860px tall the tile is 44px / radius 12 and buttons 40px;
  ≤ 740px (fine pointer) the tile is 40px and buttons 36px; ≤ 680px the rail scrolls without a bar.
- **Rail badges are dots, not numbers** (Deepsleep's rail carries none): an 8px dot with a 2px
  surface ring at the icon's top-right. Home gets a lime dot while critical or overdue attention
  items are open; Tasks gets a `--jay-danger` dot while tasks are overdue (light: the lime dot
  becomes olive). The count moves into the button's accessible name and tooltip ("Tasks, 2
  overdue" / "Tasks · 2 overdue"). The bell has the same lime dot while any attention item is open,
  and its name counts them. The phone bottom nav keeps numeric badges (capped at "9+").
- **Header panel**: page title in Poppins 20/500 (`h1.jay-header-title`, takes focus after in-app
  navigation), an optional `dotPill`, then crumbs separated by `|` in `--jay-faint` (crumb text
  12.5px `--jay-muted`; tones: muted, text, accent, warning, danger, good, info). Home's title is
  the greeting plus the user's name (only when `JAY.me` is a real user), and its crumbs are
  "date | N tasks today | N overdue". Right: search pill (inset, 264px; 208px below 1180; a circle
  button below 980), circular icon buttons (`.jay-circle-btn`, 36px, bordered: Create menu,
  theme), and the account pill (avatar + name + chevron; avatar only below 980). The bell lives on
  the rail, not in the header.
- **`JAY.shell.setHeader(cfg)`** — views call it after rendering. Present fields replace the
  current value:
  - `route`: ignore this call unless it is still the current route (late async calls are dropped).
  - `title` (string; `null`/`''` resets to the view default), `pill: { label, hue }` or a string
    (`null` clears), `crumbs: [string | { label, tone, icon, run } | Node]` (`[]` clears; at most 8;
    a crumb with `run` is a button).
  - `docTitle`: the browser tab name when it should differ from the title.
  - `back: { label?, run }`: on phones (< 768) a back chevron before the app-bar title; `label` is
    its accessible name (default "Back"); a value without a `run` function counts as `null`. It is
    cleared on every route or params render, when entering Hermes mode and in `stop()`, so a view
    sets it again after each render.
- **`JAY.shell.navigate(target, { replace?, params? })`** — synchronous (the view has rendered
  when it returns, so the caller can focus inside the same gesture). `target` is a route or hash
  (`'projects'`, `'#/projects/x?tab=files'`). With `params`, the hash becomes the target's route +
  `params`: `_` is the already-encoded path remainder, every other non-empty key becomes the query,
  and any path or query in `target` is replaced. `replace` swaps the history entry.
- **`JAY.shell.replaceParams(route, params)`** — a view rewrites its own URL state (tab, layout,
  filters) without a re-render; same `params` shape; returns `false` unless `route` is current.
  The shell keeps `JAY.shell.state.params` in step.
- **`JAY.shell.stop()`** — detaches everything `start()` attached, disposes the view, removes the
  Hermes "JAY" buttons, restores Hermes' document title and calls `window._syncThemeColorMeta()`
  when Hermes has it. `jay-boot.js` calls it on a failed start, leaving stock Hermes.
  Other exports: `start`, `setTheme`, `toggleTheme`, `themePreference`, `isDark`, `openHermes`,
  `openSearch`, `openMore`, `focusAttention`, `state`.
- **`JAY.me`** — the signed-in user, `{ id, name, context }`. `start()` resolves it before the
  first route from `JAY.data.getUser()` (falling back to the `relation: 'self'` entry of
  `getPeople()`), capped at 600ms so a slow people source never blocks JAY; a late answer still
  lands. It is refreshed on `data:people` and `data:reset` (rail avatar, header account, Home
  greeting). When the data layer cannot answer at all, it is the placeholder
  `{ id: 'me', name: 'You' }`; Home, Chat and Projects treat id `'me'` as "don't greet by name",
  and Tasks uses `'pat'` as the default owner until a real user is known.
- **Panel widths**: side tree `--jay-side-w` 264px, aside feed `--jay-aside-w` 336px. Below 1280
  the aside stacks under main (Projects turns it into an Activity tab instead); below 1024 the side
  tree hides. Tasks is the exception: a slimmer 244px tree so every CRM column (incl. Last update)
  fits at 1440, hidden below 1200, where view chips and an in-page search take over.
- **Phones (< 768px)**: no rail and no canvas padding. The header becomes a 56px app bar (plus the
  safe area) on the canvas: optional back chevron, brand tile (32px) + title (Poppins 18/600; Home
  shows "JAY"), then the search circle and the account avatar (Create and the theme toggle are
  hidden; the More sheet holds Appearance). Bottom nav: Home · Tasks · Jay · More. Panels become
  full-width cards (radius 14) with 12px gutters. The shell publishes `--jay-vvh` (visible height)
  and `--jay-kb` (how much the soft keyboard covers), so sheets and the composer sit above it.
- **Hermes mode** (≥ 768): JAY shrinks to its floating rail and Hermes floats beside it as one
  rounded panel on the same canvas.

## 3. Components (css/jay-components.css; markup from JAY.ui.* in js/jay-core.js)

One custom property, `--jay-h`, carries the hue for tags, avatars, tree dots, dot pills, feed icons,
file badges and sparklines; an `.is-{hue}` or `.is-tone-{1..5}` class sets it. `--jay-on-hue` is the
text colour on a solid hue fill (white in light, `--jay-on-accent` in dark). Screen stylesheets may
refine a component per screen; those refinements are listed with the screen in §4.

| Helper | Markup | Look |
|---|---|---|
| `JAY.ui.box(attrs, ...)` | `section.jay-box` (+ optional `.jay-box-head` / `-title` / `-body` / `-foot`) | Panel: `--jay-surface`, radius 18 (14 on phones), 1px border in light, borderless in dark, `--jay-shadow-sm`. `.is-col` makes a flex column whose body scrolls |
| layout | `div.jay-layout` + `.has-side` / `.has-aside` / `.is-fill`; `div.jay-stack` | CSS grid of panels, gap 12; `.is-fill` fills the view height and inner panels scroll. Responsive rules target the tree by class (`> .jay-side`, which `sideNav` always adds), never by position: < 1280 the aside stacks, < 1024 the tree hides. `.jay-stack` stacks panels in one cell |
| `sideNav(cfg)` | `aside.jay-box.jay-side` > `.jay-side-search`, `nav.jay-side-scroll` > `.jay-side-section` > (`button.jay-side-head` or `.jay-side-title`) + `ul.jay-side-list` > `button.jay-side-item` (dot/icon, label, badge), `.jay-side-foot` > `.jay-btn.is-inset.is-block` | Deepsleep tree: 42px inset search; section heads Poppins 15/500 with a chevron (static titles are 11px eyebrows); items Poppins 13.5/400 `--jay-text-2`, 36px, 18px indent per `depth`; 8px rounded-square dots (`hollow` = outline); count badges (lime when `countAccent`). Active item: dark = lime text on `--jay-accent-softer`, 500 weight; light = stronger `--jay-accent-soft` tint, 600 weight and a 3px `--jay-accent-text` leading bar with square left corners, only on the deepest active row (a parent active because of its child keeps no bar). "+ Add …" inset button (44px) pinned at the bottom |
| `tabs(items, opts)` | `div.jay-tabs[role=tablist]` > `button.jay-tab[role=tab]` (icon, label, `.jay-badge`) | Underline tabs: Poppins 13.5/500, 44px, muted; active = text colour + 2px lime underline (dark: lime text; light: olive underline). `is-boxed`: 56px tabs with a 3px underline and inactive tabs in primary text (Deepsleep). Arrow / Home / End keys move and select. `opts.panel` (element) or `panelId` adds `aria-controls` and gives the panel `role=tabpanel` + `aria-labelledby`. The element exposes `.sync(id)`, `.tabId(id)` and `.bindPanel(el)` (wire a panel built after the tabs) |
| `segmented(options, value, onPick, label, opts)` | `div.jay-segmented[role=radiogroup]` > `button[role=radio]` | APG radio group (one tab stop, arrows move and select). Inset track, radius 10, 3px padding; 30px buttons, radius 8, Poppins 12.5/500; checked = `--jay-surface-3` (light: elevated fill + ring), icon in lime. `opts.full` stretches it. The element exposes `.setValue(v)` (repaint without `onPick`) and `.getValue()` |
| `fpill(cfg)` | `button.jay-fpill` > icon? + `.jay-fpill-k` + `.jay-fpill-v` + chevron | Filter pill ("Sort by  Due date ⌄"): 32px full pill (radius 999), `--jay-surface-2`, 1px `--jay-border-strong`, 12.5px; key muted, value text 550. `active`: lime-tinted with the value in `--jay-accent-text`. `.setValue(v, active)` updates it |
| `tag(label, {hue, solid})` / `tags(list, {max = 2, solid})` / `tagHue` / `toneHue` | `span.jay-tags` > `span.jay-tag.is-{hue}` (+ `.is-solid`, `.is-more`) | Tinted pill: 22px, radius 999, 12px/500. Light: hue text pulled 24% toward ink on a 15% tint with a 30% border; dark: hue text mixed 62% with `--jay-text` on a 16% tint over the surface, 26% border. "+N" is a neutral surface-3 chip whose title lists the rest. Solid mini tag (cards): 18px, radius 5, 10.5/600, hue fill with `--jay-on-hue` text. `tagHue(label)` maps known words (client → blue, finance → green, ops → yellow …) and hashes the rest; `toneHue(toneOrProject)` maps a project tone 1–5 to lime / blue / orange / yellow / purple (else neutral) for text tags, while `--jay-tone-N` stays for dots and tiles |
| `meter(pct, opts)` | `span.jay-meter[role=meter]` > `.jay-meter-bars` > 16×`i` (`is-on is-b1..4`) + `.jay-meter-val` | 16 bars, 2px wide × 10px tall, 2px gap. The filled bars ramp red → orange → yellow → green across the filled run, so every value ends on green like the CRM; off bars `--jay-meter-off`. Options: `segments`, `showValue`, `label`; `ramp: false` (+ `tone` good / warning / danger / accent) gives one flat colour for "used" gauges such as disk space; `decorative` drops the meter role |
| `spark(values, {hue, label})` | `span.jay-spark[role=img]` > `i` (height %) | 3px bars, 2px gap, 14px tall box, `--jay-good` (hue variants via `.is-{hue}`); zero days are 2px dots; a negative value marks one failed run as a full-height red bar (`.is-fail`) |
| `avatar(name, {id, size, hue, decorative, title})` / `avatarStack(people, {max = 3, size})` | `span.jay-av.is-{xs,sm,md,lg,xl}.is-{hue}` / `span.jay-av-stack` | Initials circle, 20 / 24 / 32 / 40 / 56px, hue 22% over the surface with hue text; Jay = lime rounded-square "J". Stacks overlap −3px (sm), −5px (md), −7px (lg) with a 2px ring in `--jay-av-ring` (default: surface), then a neutral "+N". Kanban card footers and the Projects team strip restyle theirs as separate rounded-square faces 4px apart with no ring, as in Deepsleep |
| `badge(n, {accent, tone})` | `span.jay-badge` (+ `.is-accent`, `.is-danger` / `-warning` / `-info` / `-quiet`) | Neutral: surface-3 pill, 20px, 11/600; accent: 18px lime square-ish (radius 5), 10.5/700 dark text; tones use their soft tint |
| `dotPill(label, hue)` | `span.jay-dotpill.is-{hue}` | "● Active": 24px pill, surface-2, 1px border-strong, 7px dot (green uses `--jay-good`) |
| `fileBadge(att, {fromName})` | `span.jay-file-badge.is-{kind}` (decorative) | 32px tile, radius 8, 9.5/700 label: PDF, DOC, XLS, IMG, ZIP, FIG, LOG … (`att.badge` wins; `fromName` reads the extension first). Hue by type: pdf red, doc blue, sheet/xls/csv green, zip yellow, fig purple, log cyan, image pink, ai orange |
| `dateCell(date, label, {text, title})` | `span.jay-date-cell` > icon + `.jay-date-cell-d` + `.jay-sep` + `.jay-date-cell-l` | CRM "▢ Sep 18 \| label" cell, 12.5px tabular; `text` replaces the formatted date (e.g. a schedule). Used for Tasks' Last update (`.jay-lastev`), Projects files and next due, People last contact, System schedules |
| `feedItem(cfg)` | `article.jay-feed-item` > avatar or `.jay-feed-icon`, `.jay-feed-body` (`.jay-feed-top` line + `.jay-feed-time`, `.jay-feed-target`, `.jay-feed-ctx` with `\|`, `.jay-feed-att` with a `fileBadge`, `.jay-feed-quote`, `.jay-feed-actions`) | Deepsleep feed card: radius 14, 12px / 14px padding; light = surface-2 card, dark = recessed `--jay-inset` well with its file / quote chips on surface-2. The target is a lime link when it has `onTarget`. Actions: `primary` → small lime button, others outline. Unread = 3px lime bar on the right edge (light: olive) |
| buttons | `.jay-btn` + `.is-primary` / `.is-outline` / `.is-inset` / `.is-ghost` / `.is-soft` / `.is-danger` / `.is-sm` / `.is-lg` / `.is-block` / `.is-icon` | 36px, radius 10, Poppins 13/500 on surface-3. Primary = lime fill, dark text (Approve, New Task); outline = transparent + text-tinted border (Decline, Export); inset = inset fill, lime text (Add Subtask, Add New Task); sm = 30px radius 8; lg = 44px radius 14 |
| `.jay-circle-btn` / `.jay-icon-btn` | icon buttons | Circle: 36px, 1px border-strong, surface (30px `.is-sm`). Icon: 34px borderless, radius 10, muted |
| overlays | `openPanel` (drawer / center / sheet), `menu`, `toast(message, {icon, tone, action})`, `state(kind, opts)`, `JAY.widget(el, cfg)` | Drawers float 12px from the edge (440px, radius 18); phone sheets rise from the bottom above the keyboard (`--jay-kb`) and Back closes them. Toasts carry an optional action (Undo). `state` renders loading / empty / error / disconnected / not-connected blocks; `widget` wires one data source to its own states |

## 4. Screen recipes

- **Home** (≥ 1280): `.jay-layout.is-fill.jay-home`, a grid of `288px | 1fr | 1fr | 336px`.
  - Today panel: timeline of agenda items and tasks due today, opened at "now". Its sub-line reads
    `Next: <title> <HH:MM>` (or `Now: …` while an item is under way), then `<n> due · <n>
    reminders` once nothing is ahead, or `Nothing scheduled`; a summary footer counts the day.
  - Talk to Jay (spans the two middle columns): the docked conversation, quick intent chips (Task,
    Reminder, Capture idea, Research) and the composer with its context chip.
  - Attention (aside column): tabs All · Needs me with lime counts, "mark all read", then feed
    items. Approve, Done and Reply are lime primary buttons; Decline, Snooze and Dismiss are outline.
    Snooze opens "Snooze until" (In 3 hours · This evening 18:00 before 17:00, or Tonight 21:00
    before 20:00 · Tomorrow morning 08:00) and passes `{ until }`. Every action toasts with Undo → `restoreAttention(id, { action })`.
  - Bento row under it, aligned to the same columns (subgrid): Projects (meters), Tasks counts,
    Continue, Jay status.
  - 1024–1279: Talk + Attention in a 600px row, then the bento 2×2 beside Today. 768–1023: the page
    scrolls; Talk full width, Attention (top 3 + "See all") beside Today, then the bento.
  - Phones: greeting, date and a one-line summary; "Ask Jay…" box + mic + quick chips (Task,
    Reminder, Capture idea, Research); Attention (3); Today; Projects; Continue; Jay status. A
    shortcut opens `#/talk` with the composer focused (`JAY.chat.shared.focusNext`); the focused
    Talk view shows its own Back button on phones only.
- **Tasks**: `.jay-layout.has-side.is-fill.jay-tasks` → side tree, 244px, shown at ≥ 1200 (search,
  Views with counts — Overdue in danger — Projects with tone dots + lime open counts, "+ Add New
  Task") | main panel (container `jaytasks`). Header: "Tasks" + "N open" pill; crumbs "<view> ·
  <project> | N tasks due today | N overdue" (the last one, in danger, opens the Overdue view).
  - Tabs row: List · Board (no count badges: the total sits in the header pill, the tree and the
    calc bar). Toolbar: filter pills Sort by · Project · Due · Owner (squared to radius 10 here,
    like the CRM toolbar) + Export (outline) + "+ New Task" (primary). Selecting rows swaps the
    toolbar for a bulk bar (Mark done / Reopen, Move to ⌄, Delete, Clear selection).
  - URL: List is the default and writes no `view` param (`#/tasks`); Board writes `view=board`. The
    filters in effect (`status`, `project`, `due`, `owner`) stay in the address when the layout
    changes; sort and direction live in stored preferences (`jay:tasks-ui`). An old `?view=list`
    link still works. Clicking the active column head flips the direction (`aria-sort`); a new
    sort starts descending for Last update and ascending otherwise.
  - Table (CRM): one select checkbox per row (16px; 20px on touch) and a select-all in the head;
    completion lives in the row menu and the drawer, not in a second control. Density: 38px rows
    (44px on touch, 48px on touch tablets < 1280), 13px text, 7px cell padding, 20px tags, and a
    sticky 36px head on `--jay-surface`. Columns: select · Task (the row header, `th scope="row"`,
    with comment and attachment counts) · Project & tags (one chip when the first label is long,
    otherwise two, then "+N") · Owner (avatar + first name) · Status (dot + label, no pill box) ·
    Progress (16-bar meter + %) · Activity (14-day sparkline) · Last update ("▢ date | event") ·
    Due · ⋮. The whole row opens the task.
  - Column priority follows the main panel's own width, dropping in this order: counts (< 1265px)
    → last update (< 1063) → owner names (< 911) → activity (< 882) → extra tags (collapse to the
    first tag + "+N") and the meter bars (< 800) → progress (< 756) → owner (< 689) → project & tags
    (< 637). The panel is ≈ 1076px at 1440, so every column shows there.
  - Below 1200 the tree hides; view chips and an in-page search take over, and Export / New Task
    move up into the tabs row. Phones show cards instead of rows.
  - Footer: calculation bar "N tasks in view | Due this week N | Avg progress N% | + Add
    calculation" (hidden on phones).
  - Board view = Deepsleep kanban (`JAY.tasks.renderBoard`): one explicit track per column,
    `grid-template-columns: repeat(var(--jay-kcols), minmax(200px, 400px))` (phones: 84vw tracks,
    snap scrolling, a bounded height with per-column scroll). Column heads: 10px colour marker,
    Poppins 14 label, count, ⋮; then an "Add Task" row. Cards (surface-2, radius 14) carry one row
    of tiny solid tags (one or two + "+N", no wrapping). An untagged card shows a status pill only
    when its status differs from the column's own. Cards also carry a checklist (4 items, 2 when
    compact), "Add Subtask", and a footer with 2 watcher faces + "+N" and comment/attachment counts.
    Completed cards stay readable, without strike-through; list rows keep it.
- **Projects**: `.jay-layout.has-side.has-aside.is-fill.jay-projects` at ≥ 1280 (264 | 1fr | 336).
  - Tree (`.jay-pj-side`): search; **Favorites** (filled lime squares) · **Active** → areas (Work,
    Business, Personal; collapsible) → projects (lime chevron, down = streams open, lime open-count
    badge) → streams (hollow lime squares; the selected one fills) · **Finished** · **Archive**
    (both closed by default); "+ Add Project". Which sections are open is remembered
    (`jay:projects-ui`). The active project row keeps no fill; the light-mode bar marks the deepest
    active row.
  - Header panel: project title + status `dotPill`, streams as `|` crumbs, then mute, favorite and
    ⋮. Picking a stream (crumb or tree) filters the board, the list and the feed; picking it again
    clears it, and a "Stream: X ×" chip shows the filter. The shell header keeps the portfolio line
    ("Projects", "N active", areas); on phones its title names the project.
  - Tabs panel (boxed tabs): Overview · Tasks (open-count badge) · Timeline · Files · Notes, the
    team as separate faces and "+". Below 1280 the Activity feed becomes a first tab, "Activity",
    with an unread badge. URL: `#/projects/<id>?tab=<tab>` (no `tab` for Tasks).
  - Tasks tab: List View / Board View toggle, the stream chip, Filter menu (All tasks · Open only ·
    Assigned to me · Due this week · Overdue). Board = `renderBoard` with New (inbox + next, red) /
    In Progress (in progress + waiting, blue) / Completed (lime); list = compact rows grouped the
    same way. The Add Task buttons in a stream view prefill `{ projectId, stream }`; the task form
    carries the stream through to `createTask` (the provider drops it if the chosen project has no
    such stream). Until a layout is chosen, wider screens open the board and
    phones the list.
  - Activity (aside ≥ 1280): title, "N new", mark read, mute; tabs All · Mentions; the stream chip;
    feed cards. An activity linked to an open Attention request (`activity.attentionId`, else the
    same actor and target) shows Approve / Decline; answering resolves it on Home too, with Undo →
    `restoreAttention(id, { action })`. A target opens its task, else its stream, else the project.
  - Below 1024 the tree hides and `#/projects` shows project cards (Favorites first) with search
    and "New project"; a project opens as a stacked detail with a back arrow.
- **Placeholders** (Calendar, Notes, People): the same header with a "Not connected" / "Coming
  soon" pill and honest previews built from demo data (tags, `dateCell` for last contact).
- **Integrations**: tabbed grid of planned sources. **System**: status rows; Automations rows with a
  `dateCell` schedule ("▢ Daily | 07:30"), a 14-day runs sparkline (a failed run is one red bar) and
  an OK / Failed pill; data-source and theme `segmented` controls; preview tools.

## 4a. Density (css/jay-dense.css)

Two densities share one component set. **Comfortable** (default) is the floating-panel layout
described above. **Dense** follows the Sales CRM reference: one flush window instead of floating
panels.

- **Switch:** `JAY.shell.setDensity('comfortable' | 'dense')` / `JAY.shell.density()`. Stored per
  browser as `jay:density`. A page can set the default with `<html data-jay-density-default="dense">`.
  Two entry points, kept in sync: the account menu (*Dense layout* / *Comfortable layout*) and
  System → Appearance → Density.
- **Mechanism:** the shell sets `html[data-jay-density]`. `jay-dense.css` loads last and holds only
  rules scoped to `[data-jay-density="dense"]` inside `@media (min-width: 768px)`, so Comfortable and
  phones are unchanged (a test enforces the scoping).
- **Window:** `--jay-gap: 1px`, no outer padding. Window panels (rail and view panels, not overlays)
  lose radius and shadow and draw a 1px `--jay-line` outline into the gap. Neighbours share one
  hairline, and a short column leaves plain surface instead of a grey block.
- **Tokens (dense):** `--jay-pad 14`, `--jay-rail-w 56`, `--jay-side-w 236`, `--jay-aside-w 320`,
  `--jay-topbar-h 56`, `--jay-line` (#E4E4E0 light / #2A2A2A dark). Dark uses one deeper surface:
  surface #1A1A1A, surface-2 #222, surface-3 #2A2A2A.
- **Type and controls:** base 13px, header on one line (15/600 title), panel titles 14/600, tree
  section heads 11px uppercase, tree rows 30px, buttons 32px, filter pills 30px.
- **Tasks table:** 32px head, 34px rows, 12.5px cells; tree 228px at ≥ 1200. Boards: 34px Add Task
  rows, 10/12 card padding; the Projects board cards step up to surface-2.
- **Phones (< 768px):** unchanged in both densities (touch sizing).

## 5. Shared contracts between modules

- `JAY.tasks`: `openTask(id, { focus })`, `openCreate(prefill)` (`{ projectId, status, stream,
  assignee, … }`), `statusPill`, `priorityMark`, `dueNode`, `checkToggle`, `toggleDone`,
  `renderBoard`, `STATUS`, `VIEWS` remain stable.
- `JAY.tasks.renderBoard(tasks, { columns?, onAdd?, compact?, label?, addLabel?, showProject?,
  onMove? })` → element (kanban). Columns: `[{ id, label, hue, statuses: [...] }]`; dropping a card
  sets the column's first status.
- `JAY.home`: `goTalk({ draft?, intent? })`, `renderAttention`, `renderToday`, `openAttention`,
  `openTodayItem`. `JAY.projects`: `openPreview(id)`, `openCreate()`, `isMuted(idOrProject)`.
- `JAY.chat`: `prefill(text, { intent })` puts text in the shared draft without losing what the
  user typed (an untouched shortcut draft is replaced, a typed one gets the text on a new line) and
  returns the draft; `focus()` focuses the newest mounted composer and returns `false` when none is
  on screen; `create`, `open(id)`, `prime(intent)`, `respond`, and `shared` (`draft`,
  `draftSource`, `intent`, `convId`, `focusNext`, `context`). On `data:reset` the shared state and
  every mounted composer go back to the main conversation with an empty draft.
- `JAY.shell` and `JAY.me`: see §2.
- `JAY.data` (every call async; see `docs/JAY_ARCHITECTURE.md` for the full table):
  - `getTasks({ q, status, projectId, due, owner, sort, dir })`: `dir` `'asc'` / `'desc'` applies
    to the primary sort key (default `'desc'` for `updated`, `'asc'` otherwise); `owner` `'any'` or
    `'all'` means no owner filter.
  - `resolveAttention(id, action, opts?)`: for `'snooze'`, `opts.until` (an ISO time in the future)
    sets `snoozedUntil`; otherwise it is now + 3h. `restoreAttention(id, { action })` reverses
    exactly that action (only undoing "done" reopens the linked task).
  - `deleteTask(id)` → snapshot `{ task, index, attentionIds }` and resolves the task's open
    attention items with `resolvedBy: 'delete'`; `restoreTask(snapshot)` puts the task back at its
    index with the same id and reopens only those items. Unknown ids reject with "Task not found".
  - `createTask(input)` accepts `stream`; `createTask` / `updateTask` set it to `null` when it is
    not one of the project's streams. `updateProject(id, patch)` changes `favorite`, `muted`,
    `status`, `title`, `description`. `getUser()` → `{ id, name, context, workspace }`.
  - `resetDemo()` rebuilds the demo, emits every `data:<domain>` and then `data:reset`.
- Data fields (mock, future jay-core):
  - Task: `stream` (one of its project's streams, or `null`), `checklist[{ text, done }]`,
    `progress`, `activity[14]`, `comments`, `attachments`, `lastEvent{ at, label }`,
    `watchers[personId]`, `prevStatus`.
  - Attention: `actor`, `icon`, `hue`, `verb`, `target`, `context[]`, `attachment`, `actions`
    (incl. `approve` / `decline`), `taskId`, `snoozedUntil`, `resolved`, `resolvedBy`.
  - Activity: `actor`, `verb`, `target`, `context[]`, `attachment`, `quote`, `attentionId` (links a
    request to its Attention item; `ac-6` → `at-4` in the demo).
  - Project: `streams[]`, `favorite`, `area`, `tone`. Automation: `runs[14]` (1 ran, 0 not
    scheduled, −1 failed), `lastRun`, `state`, `schedule`.
- Events: `data:<domain>` after every mutation, `data:reset`, `chat:prime`, `chat:draft`,
  `chat:open`, `route:rerender`.
