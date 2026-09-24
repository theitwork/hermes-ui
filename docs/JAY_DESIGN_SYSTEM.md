# JAY — Design system v2 ("floating panels + lime")

Direction set by the owner's two references:

- **Deepsleep project board** — near-black canvas, floating rounded charcoal panels, lime accent,
  icon rail with a lime logo tile and lime active bar, tree navigation with lime count badges,
  kanban with colored column markers, "Add Board" rows, solid mini tags, checklists, avatar stacks,
  activity feed with Approve / Decline.
- **Sales CRM table** — neutral charcoal data surfaces, labelled navigation with count badges,
  underline tabs, filter pills ("Sort by · Pipeline Value ⌄"), dense rows with tinted tag chips and a
  "+2" overflow chip, avatar + name owner cells, segmented red→green meters with %, green mini
  sparklines, "calendar · date | label" cells, and a calculation footer bar.

JAY adopts that look for both modes. Dark is primary; light uses the same structure on white panels.

## 1. Tokens (css/jay-tokens.css)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--jay-canvas` | `#0A0A0A` | `#E6E6E2` | Page behind panels |
| `--jay-surface` | `#1B1B1B` | `#FFFFFF` | Floating panels (`.jay-box`) |
| `--jay-surface-2` | `#242424` | `#F5F5F2` | Cards and raised rows inside panels |
| `--jay-surface-3` | `#2D2D2D` | `#EAEAE6` | Hover fills, neutral chips, active nav pill |
| `--jay-inset` | `#141414` | `#F0F0EC` | Search fields, inset buttons ("Add Subtask"), table head |
| `--jay-elevated` | `#202020` | `#FFFFFF` | Drawers, menus, palette |
| `--jay-text` / `-2` / `muted` / `faint` | `#F4F4F4` / `#B5B5B5` / `#8C8C8C` / `#5E5E5E` | `#161616` / `#4D4D4D` / `#6B6B6B` / `#A3A3A3` | Text ladder |
| `--jay-accent` | `#A7E05F` | `#A7E05F` | Lime fills: primary buttons, logo tile, active bar, accent badges |
| `--jay-accent-text` | `#B4E878` | `#4A7A12` | Lime-family text (active tab, links, active tree item) |
| `--jay-on-accent` | `#10190A` | `#10190A` | Text on lime |
| `--jay-hue-{blue,purple,green,lime,orange,red,yellow,cyan,pink,neutral}` | light-on-dark | dark-on-light | Tags, feed icons, column markers, avatars |
| `--jay-meter-1..4`, `--jay-meter-off` | red, orange, yellow, green | same | Segmented meter ramp |
| `--jay-good` | `#3CCB7F` | `#1E9E5A` | Sparklines, online dots |
| Radii | `xs 6 · sm 8 · md 10 · lg 14 · xl 18` | | Panels use `xl`, cards `lg`, buttons `md`, tags `xs`/pill |
| `--jay-gap` / `--jay-pad` | 12px / 16px | | Gap between panels / panel padding |

Type: **Poppins** (`--jay-font-display`) for titles, panel headings, nav labels, tabs, buttons and
card titles. **Inter** (`--jay-font`) for body, tables, meta and chat prose. Both self-hosted in
`jay/extension/fonts` (OFL). Numbers use `tabular-nums`. Scale: 11 (eyebrow, uppercase +0.08em),
12, 13 (table), 14 (body), 16, 20 (panel/page title), 24 (hero greeting).

Contrast: every text/background pair in the table above is ≥ 4.5:1 except `--jay-faint`, which is
reserved for decoration and disabled states.

## 2. Shell layout (css/jay-shell.css, js/jay-shell.js)

```
canvas (padding 12, gap 12)
┌──────┐ ┌───────────────────────────────── header panel (.jay-header.jay-box, 64px) ─┐
│ rail │ │ Title  ●pill   crumbs | crumbs          [Search JAY /] (🔔)(＋)(☾)  (P) Pat │
│ 72px │ └───────────────────────────────────────────────────────────────────────────┘
│ .jay │ ┌── view (#jayView) — each view lays out its own panels with .jay-layout ─────┐
│ -box │ │ [side panel 264] [main panels 1fr] [aside feed 336]                          │
└──────┘ └──────────────────────────────────────────────────────────────────────────────┘
```

- Rail: lime logo tile ("J", 44px, radius 12, lime bg, dark text), icon buttons 44px, active = lime
  icon + 3px lime bar on the rail's left edge, bottom: bell with lime dot, theme, avatar.
- Header panel: page title in Poppins 20/600, optional `dotPill` status, crumbs separated by `|`
  (muted). Right: search pill (inset), circular icon buttons (`.jay-circle-btn`, 36px, bordered),
  avatar + name.
- `JAY.shell.setHeader({ title, pill: { label, hue }, crumbs: [..] })` — views call this after
  rendering to customise the header. Default: view title, no crumbs.
- Phones (< 768px): no rail, no floating canvas padding; header becomes the compact app bar;
  bottom nav (Home · Tasks · Jay · More). Panels become full-width cards with 12px gutters.

## 3. Components (css/jay-components.css; markup from JAY.ui.* in js/jay-core.js)

| Helper | Markup | Look |
|---|---|---|
| `JAY.ui.box(attrs, ...)` | `section.jay-box` | Panel: surface, radius 18, 1px border (light) / borderless (dark), padding via children |
| layout | `div.jay-layout` + `.has-side` / `.has-aside` / `.is-fill` | CSS grid of panels, gap 12; `.is-fill` fills view height, inner panels scroll |
| `sideNav(cfg)` | `aside.jay-box.jay-side` > `.jay-side-search`, `.jay-side-section` > (`button.jay-side-head` or `.jay-side-title`) + `ul.jay-side-list` > `button.jay-side-item` (dot/icon, label, badge), `.jay-side-foot` > `.jay-btn.is-inset.is-block` | Deepsleep tree: 14px Poppins labels, chevron section heads, 8px dots, active item lime text (or lime-tinted pill), lime count badges, "+ Add New Task" inset button pinned bottom |
| `tabs(items, opts)` | `div.jay-tabs` > `button.jay-tab` (+ `.jay-badge`) | Underline tabs: Poppins 13.5/500, muted; active = text + 2px accent underline (lime text in dark); `is-boxed` variant sits inside a panel |
| `fpill(cfg)` | `button.jay-fpill` > `.jay-fpill-k` + `.jay-fpill-v` + chevron | CRM filter pill: 32px, radius 10, surface-2, 1px border; key muted, value text |
| `tag(label)` / `tags(list,{max})` | `span.jay-tag.is-{hue}`, `.is-solid`, `.is-more` | Tinted pill (hue 15% fill, 30% border, hue text, radius 7, 22px); solid mini tag for cards (hue fill, dark text, 18px, radius 5); "+N" neutral |
| `meter(pct)` | `span.jay-meter` > `.jay-meter-bars` > 14×`i` (`is-on is-b1..4`) + `.jay-meter-val` | Thin 3px bars, 12px tall, 2px gap; on bars colored by band; off bars `--jay-meter-off` |
| `spark(values)` | `span.jay-spark` > `i` (height %) | 14 bars, 3px wide, 18px tall box, `--jay-good` (lime variant with `.is-lime`), zero days are 2px dots |
| `avatar(name,{id,size})` / `avatarStack` | `span.jay-av.is-{xs,sm,md,lg}.is-{hue}` / `span.jay-av-stack` | Colored initials circle (hue 22% fill, hue text); Jay = lime rounded-square "J"; stacks overlap −8px with 2px ring |
| `badge(n,{accent})` | `span.jay-badge` / `.is-accent` | Neutral: surface-3 pill 20px; accent: lime square-ish (radius 5), dark text |
| `dotPill(label,hue)` | `span.jay-dotpill.is-{hue}` | "● Active": 24px, border, hue dot |
| `feedItem(cfg)` | `article.jay-feed-item` > avatar/`.jay-feed-icon`, `.jay-feed-body` (`.jay-feed-top` line + `.jay-feed-time`, `.jay-feed-target` lime, `.jay-feed-ctx` with `|`, `.jay-feed-att` file chip with `.jay-file-badge`, `.jay-feed-quote`, `.jay-feed-actions`) | Deepsleep feed card: surface-2, radius 14, 12px padding; unread = 3px lime bar on the right edge |
| buttons | `.jay-btn` + `.is-primary` / `.is-outline` / `.is-inset` / `.is-ghost` / `.is-sm` / `.is-block` | Primary = lime fill, dark text (Approve, New task); outline = transparent + light border (Decline, Export); inset = inset bg, lime text (Add Subtask, Add New Task) |
| `.jay-circle-btn` | icon button | 36px circle, 1px border, surface |

## 4. Screen recipes

- **Home**: `jay-layout is-fill` → Today panel (timeline) | Talk to Jay panel (dominant) |
  Attention feed panel (feed items with Approve/Decline, Done/Snooze) ; below: four bento panels
  (Projects with meters, Tasks counts, Continue, Status).
- **Tasks**: `has-side` → side tree (Views with counts, Projects with dots + lime counts, "+ Add New
  Task") | main panel: underline tabs (List · Board), toolbar of filter pills + Export (outline) +
  "+ New Task" (primary), CRM-style table (checkbox, task, project & tags with +N, owner avatar +
  name, status dot-pill, progress meter + %, activity sparkline, "calendar · date | last event",
  due), calculation footer bar ("26 tasks in view · Σ due this week · Avg progress · + Add
  calculation"). Board view = Deepsleep kanban (`JAY.tasks.renderBoard`).
- **Projects**: `has-side has-aside` → project tree (Favorites, Areas → projects with lime counts,
  Finished, Archive, "+ Add Project") | header panel (title, streams as `|` crumbs, icons) + tabs
  panel (Overview · Tasks · Timeline · Files · Notes, avatar stack, "+") + content (List View /
  Board View toggle, Filter; board = kanban New / In Progress / Completed) | activity feed aside.
- **Placeholders / Integrations / System**: panels on the canvas with the same header, tags, pills.

## 5. Shared contracts between modules

- `JAY.tasks.renderBoard(tasks, { columns?, onAdd?, compact? })` → element (kanban). Columns:
  `[{ id, label, hue, statuses: [...] }]`; dropping a card sets the column's first status.
- `JAY.tasks.openTask(id)`, `openCreate(prefill)`, `statusPill`, `priorityMark`, `dueNode`,
  `projectTag`, `checkToggle`, `toggleDone`, `STATUS` remain stable.
- `JAY.home.goTalk()`, `JAY.projects.openPreview()`, `JAY.projects.openCreate()`,
  `JAY.chat.*`, `JAY.data.*` remain stable.
- Task fields (mock, future jay-core): `checklist[{text,done}]`, `progress`, `activity[14]`,
  `comments`, `attachments`, `lastEvent{at,label}`, `watchers[personId]`.
- Attention fields: `actor`, `icon`, `hue`, `verb`, `target`, `context[]`, `attachment`,
  actions include `approve` / `decline`.
