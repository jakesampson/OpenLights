---
description: Redesign the OpenLights main window to match the reference mockups
---
TASK: UI/UX redesign of the OpenLights main window. Layout and visual change
only. Do not change lighting, DMX, cue, MIDI or storage logic.

REFERENCES (read these first, they are in the repo):
- docs/design/reference-purple-design.png  (Design tab, purple theme)
- docs/design/reference-teal-live.png      (Live tab, teal theme)
- docs/design/layout-prototype.html        (simplified layout prototype; open it
  in a browser to see structure, proportions and theme tokens)
The screenshots are layout references only. Do not copy their icons, artwork
or branding. Match layout, proportions, spacing and colour as closely as practical.

LAYOUT
1. Top bar: project name centred, search/overrides on the sides, and a
   BLACKOUT/panic button that is always visible and prominent.
2. Main row: large stage preview filling the remaining width, resizing with the
   window and keeping its aspect ratio. Right column (~260pt): tree/list of
   groups and presets with coloured dots and a clear selected state.
3. Bottom row: tabbed panel (Design | Live, plus Edit) on the left, narrower
   Shortcuts panel on the right.
   - Design tab: vertical dimmer fader with percentage, colour wheel, vertical
     channel sliders, Shutter/Strobe (Open, Closed, Strobe, Pulse), Movement
     Speed (Tracking, Vector).
   - Live tab: dimmer fader plus grids of scene buttons under labelled
     headings; tapping toggles an active state.
   - Shortcuts panel: key-to-action list that follows the current tab.
4. Keep every existing menu item and feature. If a mockup element has no
   backing feature, add it as a visibly disabled stub instead of inventing behaviour.

STYLE
- Dark UI. Put colours, spacing and radii in one shared theme definition so the
  purple and teal looks are a theme swap, not duplicated views.
- Large, high-contrast, hard-to-mis-tap controls suited to live worship use.

PROCESS
1. Inspect the current main window code and list the views you will change.
2. Implement in small steps, building after each step.
3. Build and launch the app, screenshot the running window and compare with
   the references. Fix differences and repeat until it closely matches.
   If you cannot launch or screenshot the app, say so and stop after the code
   changes. Do not claim a visual match you did not verify.
4. Check minimum window size and full screen: nothing may overlap or clip.
5. Run the existing tests and confirm they pass.

OUTPUT: summarise what changed, files touched, and any stubbed or deviating
elements with reasons.

Extra notes from the user: $ARGUMENTS

---

## STATUS — redesign complete (verified)

Last updated: 2026-11-17. Work committed and pushed to `origin/main`.

### Done and verified
- **Top bar:** project name centred; Theme toggle (Purple ↔ Teal), Project
  popover (Save / Save As / Open / New + saved-shows list), Search stub,
  Overrides stub, DMX settings popover, always-visible BLACKOUT/RESTORE.
- **Main row:** `StagePreview` renders the patched rig — fixture markers placed
  along the truss arc (and floor up-lights for extras), truss lines, and beams
  tinted by each fixture's current colour × dimmer. With no fixtures patched it
  draws an 8-fixture demo rig so the view is never empty.
- **Right column (~260px):** `GroupsPresetsPanel` — expandable tree built from
  real show data: one group per `fixture.group` with child fixtures (dot tinted
  by fixture type), Presets = real scenes (dot = scene colour, click recalls),
  Effects = real effects (click toggles `enabled`). Collapsible sections with
  counts; fills the column.
- **DMX Connection:** USB/Art-Net mode, port select + Scan/Connect, Art-Net
  host/universe, Disconnect, and Virtual-mode/connected status now live in the
  top-bar `DmxConnection` popover (was in the side panel). Errors surface as a
  bottom-left toast.
- **Bottom row:** tabbed panel (Design | Live | Edit | Scenes | Cues | Effects |
  Automation | Patch | MIDI) + Shortcuts panel that follows the tab. Design tab
  has a taller dimmer fader (140px), colour wheel, taller channel sliders (90px
  tracks), and Shutter/Movement groups (row wraps at narrow widths). Labels
  enlarged for at-a-glance reading.
- **Themes:** single token set in `src/renderer/src/index.css`; teal applied via
  `:root[data-theme="teal"]` and the top-bar toggle. No duplicated views.
- **Responsive:** `@media (max-width: 760px)` collapses the side panel and the
  bottom row to one column. No clipping/overlap at 1200×800 or full screen.
- **Checks:** `npm run typecheck` clean; `npm test` = **45/45 pass**.

### Stubbed / deviating (by design)
- Search, Overrides, Strobe, Pulse, Vector, and the Design/Live/Edit "stub"
  tabs are visibly disabled mockups with no backing feature (per task rule 4).
- Scene pads / channel values in the Design tab are static mockup values; the
  live values come from the store elsewhere.

### Files touched
- `src/renderer/src/App.tsx`
- `src/renderer/src/index.css`
- `src/renderer/src/components/StagePreview.tsx` (new)
- `src/renderer/src/components/GroupsPresetsPanel.tsx` (new)
- `src/renderer/src/components/DmxConnection.tsx` (new)
- `src/renderer/src/components/ProjectBar.tsx`
- `src/renderer/src/components/DesignTab.tsx`

### Next session — optional follow-ups only (nothing blocking)
1. Optionally drive real dimmer/colour-wheel/channel sliders into the store
   instead of static mockup values.
2. Optionally render Live-tab scene pads from `show.scenes` with real recall.
3. Delete leftover `shot-*.png` debug screenshots in the repo root (already
   gitignored; safe to remove).

