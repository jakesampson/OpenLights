# OpenLights roadmap checklist (agent-ready)

Supersedes the planning in `LIGHTKEY_UI_ROADMAP.md`, which stays in place for reference. This file is the one to work through.

Reference guide: `docs/Lightkey-User-Guide.pdf` (351 pages). Page numbers below are the guide's printed page numbers. Once item 0.2 is done, `docs/lightkey-audit.md` is the working reference.

---

## How to work this file (read this first, every session)

1. **Work strictly in numbered order.** Find the first unticked `- [ ]` item that is not tagged `(Jake)` and do it. Never skip ahead, and never re-do a ticked item.
2. **After each item, check your work.** Run all three of these and fix every failure before moving on:
   - `npm run typecheck`
   - `npm test` (vitest)
   - `npm run build`
3. **Every item needs automated tests.** Add or extend tests in `tests/` that prove the item's "Done when" line. Prefer testing the store (`showStore.ts`) and the pure `lib/` logic, so behaviour is tested without the UI.
4. **Tick and commit.** Change `- [ ]` to `- [x]` and add a one-line evidence note (the main files touched). Then commit with the message `roadmap N.N: <short summary>`, for example `roadmap 1.3: add undo/redo history to show store`.
5. **Go straight to the next item.** Don't stop to report progress, summarise, or ask for approval between items.
6. **Don't ask questions.** When something is ambiguous, make a sensible choice that follows the guide's behaviour, log it in `NOTES.md` (create the file if it's missing) under the item number, and keep going.
7. **Log human checks and keep going.** If an item needs a human (a desktop click-through, real DMX hardware, a visual comparison with Lightkey), finish the code and tests, add a line to **Needs Jake** at the bottom, tick the item, and continue. An item that needs a human check is never a reason to stop.
8. **If an item is too big for one run,** split it into `N.Na`, `N.Nb` and so on in this file, commit the split, then do `N.Na`.
9. **If you're blocked** (for example the build is broken by something outside the item), fix it as its own commit `roadmap fix: ...`. If it truly can't be fixed, log why in `NOTES.md`, mark the item `- [ ] (blocked: reason)`, and move to the next item.
10. **Stop only when every item not tagged `(Jake)` is ticked or blocked,** and typecheck, tests and build all pass.

### Rules that always apply

- **USB DMX only.** Supported output is Enttec Open DMX USB, Enttec USB Pro-style serial, and the virtual output. Don't add or extend Art-Net, sACN, OLA or network output. Skip guide content about network nodes.
- **Keep old shows working.** Every change to the show format goes through the versioned migration from item 1.2. Never silently drop data from an existing show file: migrate it, or keep it and log it.
- **Replicate behaviour, layout and workflow, not assets.** Don't copy Lightkey icons, artwork, screenshots, product names or manual wording into the app or docs. Write OpenLights' own labels, help text and icons.
- **Windows conventions.** Use Ctrl where the guide says Cmd and Alt where it says Option, and follow normal Windows window and menu behaviour.
- **Don't break what works.** Blackout, master, DMX connection and save/open must keep working after every item. The existing tests must stay green.
- **Don't add dependencies** unless an item can't reasonably be done without one. If you add one, log why in `NOTES.md`.

### Current architecture (for orientation)

- Main process: `src/main/index.ts` (window, show file IPC: load/open/save/save-as/list/delete, DMX connect, DMX test).
- Shared: `src/shared/types.ts` (show model), `src/shared/dmx.ts`, `src/shared/dmxPorts.ts` (Open DMX USB discovery).
- Renderer state: `src/renderer/src/stores/showStore.ts` (zustand, all editing actions).
- Output layering: `src/renderer/src/lib/output.ts` (preset / live / override / effects layers, fades, blackout).
- UI: `App.tsx`, `DesignTab.tsx`, `LiveTab.tsx`, `LiveWorkspace.tsx` (Live page editor), `StagePreview.tsx`, `PatchPanel.tsx`, `SceneGrid.tsx` and `CueListPanel.tsx` (the separate Scenes & cues editor), `EffectsPanel.tsx`, `AutomationPanel.tsx`, `MidiPanel.tsx`.

---

## 0. Setup and audit

- [x] 0.1 Put the Lightkey User Guide in the repo at `docs/Lightkey-User-Guide.pdf`. *(Already there.)*
- [x] 0.2 Write `docs/lightkey-audit.md`, a table with one row per guide section listed in the **Guide section index** at the bottom of this file. Columns: guide section, page, OpenLights status (`matching` / `partial` / `missing` / `out of scope` / `OpenLights-only`), the OpenLights files involved, and a one-line gap note. Also list the OpenLights-only features (audio automation timeline, Scenes & cues editor, MIDI panel, DMX test panel) with a keep, merge or retire recommendation.
  Done when: the file exists and every section in the index has a row with a status. This item is docs only, so no new test is needed. Evidence: `docs/lightkey-audit.md`; typecheck, 101 tests and build passed.
- [x] 0.3 Create `NOTES.md` with headings for decisions, deviations from the guide, and known gaps. Add a test-coverage note listing which `tests/*.test.ts` file covers which area.
  Done when: `NOTES.md` exists and has those headings. Evidence: `NOTES.md`, `tests/roadmapDocs.test.ts`; typecheck, 102 tests and build passed. Commit pending: Git metadata is read-only.

Evidence 1.1: `shared/types.ts`, default/new shows, `tests/migrations.test.ts`; typecheck, 103 tests and build passed. Commit pending: Git metadata permission.

## 1. Foundation: show model, migration, undo, output order

- [x] 1.1 Add `schemaVersion` to `ShowDef` and set it on every newly created show. Old files without it count as version 0.
  Done when: a test loads a version-0 show object (copy the current default or demo show from `showStore.ts`) and gets the current version back with all fixtures, scenes, presets, cue lists, live pages, trusses, effects, automations and MIDI mappings intact.
- [x] 1.2 Create `src/shared/migrations.ts` with a `migrateShow(raw): ShowDef` step chain, and run it on every load path (load-show, open-show, the list-shows preview). Invalid or partial input is filled with defaults instead of throwing.
  Evidence: `shared/migrations.ts`, all main-process load paths, store entry, `tests/migrations.test.ts`; typecheck, 106 tests and build passed; commit blocked by Git permissions.
  Done when: tests cover a version-0 round trip (load, then save, then load gives the same data), missing optional arrays, unknown extra fields being kept, and a future-version file loading read-only or warning (log the choice in NOTES).
- [x] 1.3 Add an undo/redo history to the show store: snapshot-based, capped at 200 steps, grouping continuous drags into one step, and covering every action that changes the `ShowDef` (not live playback state). Guide: Undo changes, p.44 and p.117.
  Evidence: `showStore.ts`, grouped panel interactions in `App.tsx`, `tests/history.test.ts`; 110 tests, typecheck and build passed. Commit blocked by Git permissions.
  Done when: tests show undo and redo for add/remove fixture, preset capture/rename/delete, cue list step add/move/remove, live page add/duplicate/delete and control move, and that selecting a page or going to a cue is *not* undoable.
- [x] 1.4 Wire Edit > Undo and Redo plus Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z, ignored while a text input has focus.
  Evidence: Edit menu in `App.tsx`, `lib/shortcuts.ts`, `tests/shortcuts.test.ts`; typecheck, 112 tests and build passed. Commit blocked by Git permissions.
  Done when: a unit test on the key handler (pull it out into `lib/shortcuts.ts`) maps each key to the right action, and the focus guard is tested.
- [x] 1.5 Write the output order of precedence as one pure function in `lib/outputModel.ts`, taking these layers: base cues/presets, sequences, effects, manual overrides (Design), master dimmer, blackout, blind and freeze. Guide: Output order of precedence, p.223. Document the order at the top of the file. Move the existing `output.ts` layering onto it without changing current behaviour.
  Evidence: `lib/outputModel.ts`, output integration, `tests/outputModel.test.ts`; typecheck, 114 tests and build passed. Commit blocked by Git permissions.
  Done when: tests pin the precedence of each layer pair, show release returning to the layer below, and show that blackout beats everything while master only scales intensity channels.
- [x] 1.6 Hide Art-Net from the UI and status. Keep `connect-artnet` IPC and the `mode: 'artnet'` type only as far as old settings need to load. If a saved Art-Net setting is found, fall back to virtual output and log it.
  Evidence: `shared/outputSettings.ts`, legacy IPC fallback, `tests/outputSettings.test.ts`; typecheck, 115 tests and build passed; commit blocked by Git permissions.
  Done when: no UI path offers Art-Net, a test shows an old status or settings object with `artnet` mapping to virtual, and the typecheck passes.
- [x] 1.7 Startup state: choose what is active when a project opens (nothing, or the last state). Guide: Startup state, p.222.
  Evidence: startup model, store save/open restoration, Settings selector, `tests/startup.test.ts`; typecheck, 116 tests and build passed; commit blocked by Git permissions.
  Done when: there's a show-level setting with a default, and a test opens a show with each option and checks the active cues and presets.

## 2. Projects and the main window (guide ch.5 to 6)

- [x] 2.1 Project lifecycle: New, Open, Open Recent, Save, Save As/copy, Rename and Close, with an unsaved-changes prompt. Guide: Projects, p.39 to 41. Check the existing `ProjectBar.tsx` against the guide.
  Evidence: `ProjectBar.tsx`, `projectLifecycle.ts`, rename IPC and `tests/projectLifecycle.test.ts`; typecheck, 118 tests and build passed; commit blocked by Git permissions.
  Done when: store/IPC tests cover a dirty flag set by edits and cleared on save, rename updating the file name, and close with unsaved changes asking first (prompt logic tested as a pure function).
- [x] 2.2 Manage projects: list, delete, duplicate, and show a last-modified date. Guide: p.42.
  Evidence: project-file helpers, duplicate IPC/UI, `tests/projectLifecycle.test.ts`; typecheck, 119 tests and build passed; commit blocked by Git permissions.
  Done when: tests cover duplicate creating a new id and file, and delete removing it from the list.
- [x] 2.3 Search a project: a search box that finds fixtures, groups, presets, sequences, cues, cue lists and pages by name, and jumps to the item. Guide: Search a project, p.43.
  Evidence: `ProjectSearch.tsx`, `lib/searchProject.ts`, search target hooks, `tests/searchProject.test.ts`; typecheck, 120 tests and build passed; commit blocked by Git permissions.
  Done when: a pure `searchProject(show, query)` returns typed results, and a test covers each item type plus a case-insensitive partial match.
- [x] 2.4 Toolbar: one toolbar that matches the guide's structure (Design/Live switch, blackout, master, blind, freeze, beat/tap, DMX status), using OpenLights' own icons. Guide: Toolbar, p.46. Blind and freeze may be disabled placeholders until section 9.
  Evidence: `WorkspaceToolbar.tsx`, `toolbarCommands.ts`, `tests/toolbar.test.ts`; typecheck, 121 tests and build passed; commit blocked by Git permissions.
  Done when: there's a component test or store test that each toolbar command calls the right action, and the Needs Jake list has a visual-check entry.
- [x] 2.4a **Fix from Jake (do this first):** move the Design/Live switch out of the top toolbar to the bottom centre of the window, sitting on the divider between the Preview and the bottom panel, as in Lightkey. Reference screenshot: `docs/reference/lightkey-design-live-switch.png`. In Design view it shows "Design" and "Live" as a segmented switch. In Live view the "Live" side becomes a dropdown (chevron) that opens the page manager, so you can pick, add, rename and reorder Live pages from there. Remove the Design/Live buttons from the top toolbar; keep the rest of the toolbar as is. Guide: Design and Live views, and the page manager in ch.11.
  Done when: the switch renders bottom-centre in both views, the Live dropdown opens the page manager and switching pages works from it, there is no Design/Live control left in the top toolbar, a test covers the switch and dropdown, and the Needs Jake list has a visual check against the reference screenshot.
  Evidence: `ViewSwitch.tsx` + `lib/viewSwitch.ts` (bottom-centre segmented switch; Live-side chevron dropdown page manager with pick/add/rename/reorder), `App.tsx` mount on the preview/bottom divider, `WorkspaceToolbar.tsx` buttons removed (command handlers retained), `index.css` styles, `tests/viewSwitch.test.ts`; typecheck, 195 tests and build passed; visual comparison against the reference screenshot added to Needs Jake.
- [x] 2.4b **Fix from Jake (do this next): make the bottom panel and Design/Live switch match Lightkey exactly.**
  - **Note from Jake:** the mzx-0125/0208 frames have a live video of the stage lights in the bottom-right corner. That is camera footage edited into the video, NOT part of the Lightkey GUI; ignore it and do not build it.
  Primary source: YouTube https://www.youtube.com/watch?v=SQw-4lZBp9s (Simple Stage Lighting Automation with Lightkey). Secondary, only for Live pages SQw does not show: https://www.youtube.com/watch?v=mzx-1e0tRWk from 1:20, plus Jake's cuelist screenshot `docs/reference/lightkey-design-live-switch.png`. Frames live in `docs/reference/lightkey/`. Base the layout on the SQw frames; use mzx and the cuelist screenshot only to fill Live-page gaps.
  Frames:
  - `docs/reference/lightkey/SQw-0240.jpg` — Design overview. Bottom panel is *playback only*: Master fader at far left (Full / BPM), a grid of scene tiles you fire (not an editor), small centred "Design" + "Live ⌄" switch on the Preview/bottom divider, "Edit" on the right of the bottom bar, Shortcuts–Preview in the bottom-right. Scenes are a tree in the *right sidebar*. Compact top toolbar (no Design/Live control there).
  - `docs/reference/lightkey/SQw-0450.jpg` — Design with fixtures selected; same bottom playback tiles and right-sidebar Scenes list.
  - `docs/reference/lightkey/SQw-0610.jpg` — same Design bottom panel with output on and a camera preview.
  - `docs/reference/lightkey/SQw-0555.jpg` — fixture Dim/Color controls are a floating overlay on the Preview, not a section of the bottom panel.
  - `docs/reference/lightkey/SQw-0905.jpg` — right-click on a bottom tile opens a small context menu; it is not a scene/cue editor in the bottom panel.
  - `docs/reference/lightkey/mzx-0125.jpg`, `mzx-0208.jpg` — Live view (from mzx-1e0tRWk). Same switch, Master and right-sidebar Scenes tree; the bottom panel is large *playback* buttons for the current Live page (Pre/Post, Live Talk, Worship 1.1, etc.). Still no scene/cue editor in the bottom.
  - `docs/reference/lightkey-design-live-switch.png` — Live *cuelist* page (not clear in the SQw frames): Name / Hold Time / Fade Time table with +/-, Master at left, stop/pause/next at right, Shortcuts–Cuelist.
  Differences to fix vs current OpenLights:
  1. The Design/Live control is a large pink pill sitting right of centre. Lightkey uses small centred "Design" text and a "Live ⌄" dropdown on the Preview/bottom divider.
  2. OpenLights' bottom panel is collapsible property and scene-editing sections (Copy/Paste properties, Custom properties and layout, colour wheel, Edit scene). Lightkey's bottom panel is playback only — Design: scene tiles; Live: a button page or a cuelist (Name/Hold/Fade) with Master, transport and shortcuts.
  3. **Jake: scenes are only edited from the right side panel.** The bottom panel must not contain scene or cue lists or editors. Remove those from the bottom panel and move that editing to the right sidebar (the Scenes tree).
  4. Match the bottom chrome: Master at far left, centred view switch, Edit on the right, shortcuts in the bottom-right corner.
  Use OpenLights' own icons and typography; do not copy Lightkey artwork, icons or manual wording.
  Done when: Design and Live bottom panels and the Design/Live switch match the frames above, scene/cue editing is only in the right sidebar, tests cover the switch, the Live dropdown/page manager, and that the bottom panel has no scene/cue editor, and typecheck, tests and build pass.
  Evidence: superseded in part by Jake's 2.4c correction below; `BottomPlayback.tsx`, `App.tsx`, `GroupsPresetsPanel.tsx`, compact `ViewSwitch.tsx`, `lib/bottomPanel.ts` and `tests/bottomPanel.test.ts`; visual comparison added to Needs Jake.
- [x] 2.4c **Correction from Jake:** Design's bottom panel is fixture programming; scene buttons belong to Live. Live's divider Edit button must open the page editor and allow adding scene buttons and custom cue/list/label/frame controls.
  Evidence: `BottomPlayback.tsx` mounts `DesignTab` for Design and scene/page playback for Live; `App.tsx` opens `LiveWorkspace` from the Live Edit button; `LiveWorkspace.tsx` starts in edit mode and adds existing scenes as page buttons alongside custom controls; `tests/bottomPanel.test.ts` covers the corrected modes and add-control set. Typecheck, tests and build passed.

- [x] 2.5 Customise the window: panels can be shown or hidden (Preview, Fixture/Preset palette, inspector), and the layout is saved per project. Guide: p.47.
  Evidence: project layout model/migration, Settings visibility controls, Preview/palette/inspector rendering, `tests/windowLayout.test.ts`; typecheck, 122 tests and build passed; commit blocked by Git permissions.
  Done when: the layout state is saved in the show or app settings, and a test round-trips it.
- [x] 2.6 Full screen view toggle (F11) and Live windows: open a Live page in its own window and restore open windows on relaunch where feasible. Guide: p.48 to 49.
  Evidence: Live-window IPC/preload bridge, F11, saved window descriptors, `tests/liveWindows.test.ts`; typecheck, 123 tests and build passed. Mirrored-page limitation recorded in NOTES; multi-window human check pending. Commit blocked by Git permissions.
  Done when: IPC for opening a Live window exists, the open window list is saved, tests cover saving and restoring the list, and Needs Jake has an entry for a multi-window check.
- [x] 2.7 Adaptive background colour driven by stage output. Guide: p.49. *(Evidence: `lib/adaptiveBackground.ts`, `tests/adaptiveBackground.test.ts`, commit `eb75339`.)* (verify against the guide's behaviour in the audit)
- [x] 2.8 Lock the app: a lock mode with an optional passcode that blocks editing and allows only the permitted Live operations. Guide: Lock Lightkey, p.49 to 50.
  Evidence: guarded store actions, operator toolbar unlock, `tests/lock.test.ts`; typecheck, 124 tests and build passed; human lock check pending; commit blocked by Git permissions.
  Done when: store tests show that edit actions are rejected while locked, Live cue triggering still works, and unlock needs the passcode.
- [x] 2.9 Keyboard shortcuts: one shortcut table in `lib/shortcuts.ts` that follows Appendix 1 (p.324 to 351) adapted for Windows, and an in-app shortcut list built from that same table (replacing the hard-coded list in `App.tsx`, including the "Delete step (stub)" entry).
  Evidence: shared shortcut table and matcher, generated help, project-command dispatch, `tests/shortcuts.test.ts`; typecheck, 125 tests and build passed. Guide commands for unimplemented later sections remain pending with those features; commit blocked by Git permissions.
  Done when: a test checks there are no duplicate key bindings and every listed shortcut has a handler.

## 3. Preview (guide ch.4 steps 4 to 7, ch.7)

- [x] 3.1 Select fixtures in the Preview by click and Shift-click, and drag selected fixtures to move them. *(Evidence: `StagePreview.tsx`, `showStore.selectFixtures/setFixturePositions`, commit `40bc8b5`.)*
- [x] 3.2 Truss stage objects: add, move and rotate, kept in the show. *(Evidence: `StagePreview.tsx`, `lib/trussGeometry.ts`, `tests/trussGeometry.test.ts`, commit `2ba5e89`.)*
- [x] 3.3 Zoom: zoom in, out, to fit and to selection, with the shortcuts from the guide. Guide: Zoom, p.52. (StagePreview has some zoom; check it.)
  Evidence: `previewViewport.ts`, Preview fit controls and registry shortcuts, `tests/previewViewport.test.ts`; typecheck, 127 tests and build passed; commit blocked by Git permissions.
  Done when: the pure view-transform maths in a lib file has tests for zoom-to-fit and zoom-to-selection.
- [x] 3.4 Edit mode for the Preview: a clear switch between viewing and editing the layout, with marquee (rubber-band) selection and Select All. Guide: Edit the Preview, Select objects, p.53.
  Evidence: Preview marquee, additive selection and Select all, `previewSelection.ts`, `tests/previewSelection.test.ts`; typecheck, 129 tests and build passed; commit blocked by Git permissions.
  Done when: a pure hit-test and marquee function is tested for fixtures and objects.
- [x] 3.5 Align and distribute selected objects (left, right, top, bottom, centres, space evenly). Guide: p.55.
  Evidence: `lib/align.ts`, Preview object alignment integration, `tests/align.test.ts`; typecheck, 131 tests and build passed; commit blocked by Git permissions.
  Done when: `lib/align.ts` has tests for each align mode and for even spacing.
- [x] 3.6 Resize and rotate fixture icons and objects with handles, plus a numeric size and rotation field. Guide: p.56 to 57.
  Evidence: fixture transform defaults/migration, numeric fields and pointer handles, `tests/fixtureGeometry.test.ts`; typecheck, 133 tests and build passed; commit blocked by Git permissions.
  Done when: fixtures store `iconSize` and `rotation` (migrated with defaults), and tests cover the maths and migration.
- [x] 3.7 Fixture name position (above, below, hidden). Guide: p.58.
  Evidence: name-position model/migration, Preview label rendering and controls, fixture-geometry migration tests; typecheck, 134 tests and build passed; commit blocked by Git permissions.
  Done when: there's a per-fixture setting with a default, and a migration test covers it.
- [x] 3.8 Beam direction and beam colour per fixture for the Preview rendering. Guide: p.58 to 61 and ch.4 steps 6 to 7 (p.36 to 37).
  Evidence: beam appearance model/migration, Preview controls/rendering, `tests/previewOutput.test.ts`; typecheck, 135 tests and build passed; commit blocked by Git permissions.
  Done when: the settings are stored and migrated, and the preview output computation uses them (tested in `previewOutput`).
- [x] 3.9a Stage-object model and non-destructive migration from previewTrusses, preserving original fields. Guide: p.65 to 69.
  Evidence: `StageObject` model, migration, synchronized store CRUD, `tests/stageObjects.test.ts`; typecheck, 137 tests and build passed; commit blocked by Git permissions.
  Done when: migration tests preserve old trusses and store tests cover stage-object CRUD and undo.
- [x] 3.9b Shapes, images and text authoring in Preview: add, select, move and edit geometry/style/text.
  Evidence: `StageObjects.tsx`, geometry/style validation, Preview integration and tests; typecheck, 138 tests and build passed; visual checks on Needs Jake; commit blocked by Git permissions.
  Done when: Preview exposes the model through working controls and renderer, and property/geometry tests pass. Needs Jake: visual comparison.
- [x] 3.9c Stage-object copy/paste, duplicate, delete, flip and front/back ordering.
  Evidence: stage clipboard/duplicate/flip/order store actions, Preview controls/keyboard handlers, `tests/stageObjects.test.ts`; typecheck, 139 tests and build passed; commit blocked by Git permissions.
  Done when: store tests cover each command, clipboard identity and undo.
- [x] 3.10 Fixture storage: fixtures patched but not placed on the stage sit in a storage tray, and can be dragged onto or off the stage. Guide: Fixture Storage, p.70.
  Evidence: fixture storage model/migration, tray drag/drop and store placement, `tests/fixtureStorage.test.ts`; typecheck, 140 tests and build passed; commit blocked by Git permissions.
  Done when: a store test shows an unplaced fixture listed in storage and placing it sets a position.
- [x] 3.11 Locate fixtures: highlight a fixture's real output (full white, open) for a short time without changing the programmed state. Guide: Locate fixtures, p.32 and p.64.
  Evidence: Locate patch builder, timed output overlay, Preview command and `tests/locateFixtures.test.ts`; typecheck, 142 tests and build passed; commit blocked by Git permissions.
  Done when: an output-model test shows locate sitting above cues and being fully released afterwards.

## 4. Fixtures and patching (guide ch.2, 4 step 3, 13)

- [x] 4.1 Fixture profile model: replace the hard-coded `FIXTURE_PRESETS` and `FixtureType` channel logic with data-driven profiles (modes, and channels with property type, range, default and highlight value). Ship the current eight types as built-in profiles. Guide: Find the right fixture profile, p.28 and p.239.
  Evidence: shared profile/mode/channel model, built-in profile definitions, data-driven output mapping/migration, `tests/fixtureProfiles.test.ts`; typecheck, 143 tests and build passed; commit blocked by Git permissions.
  Done when: every existing fixture type has a profile, a migration maps old `type` and `channels` fixtures to profile and mode with identical DMX output (tested channel by channel), and all existing tests pass.
- [x] 4.2 Fixture library browser: search and filter by manufacturer, name and channel count, plus favourites. Guide: Filter the fixture library, p.239, and Manage favourite profiles, p.250.
  Evidence: profile browser search/manufacturer/channel/favourite controls and persisted favourites, `tests/filterProfiles.test.ts`; typecheck, 144 tests and build passed; commit blocked by Git permissions.
  Done when: a pure filter function is tested, and favourites are saved.
- [x] 4.3 Add fixtures: choose profile, mode, quantity, start address and universe; auto-address the next free channels and name fixtures in sequence. Guide: Add your fixtures, p.29, and Add DMX fixtures, p.240.
  Evidence: mode/quantity/start/universe patch controls, allocation/store batch command, `tests/patch.test.ts`; typecheck, 145 tests and build passed; commit blocked by Git permissions.
  Done when: tests cover a quantity of 4 getting sequential addresses and names, and the start address skipping used channels.
- [x] 4.4 Address conflict detection and display (overlapping channels, past 512). Guide: Fixture addresses, p.20, and Change a fixture's DMX address, p.243.
  Evidence: conflict detection, patch row warnings, overlap/range/universe tests; typecheck, 146 tests and build passed; commit blocked by Git permissions.
  Done when: `lib/patch.ts` `findConflicts()` is tested, and the patch panel marks conflicting fixtures.
- [x] 4.5 Fixture info editing: name, address, universe and notes. Duplicate fixtures, disable fixtures (no output, kept in the show) and delete fixtures (with cleanup of their references in presets and cues). Guide: p.241 to 246.
  Evidence: duplicate/disable/notes commands, output masking, reference cleanup, `tests/fixtureEditing.test.ts`; typecheck, 147 tests and build passed; commit blocked by Git permissions.
  Done when: store tests cover duplicate, disable producing no output, and delete removing the references with undo restoring them.
- [x] 4.6 Reassign fixture profile or mode, keeping the values that can be mapped. Guide: Reassign fixture profiles, p.245.
  Evidence: store reassignment, profile selector and `tests/fixtureEditing.test.ts`; typecheck, 148 tests and build passed; commit blocked by Git permissions.
  Done when: a test reassigns RGB to RGBW and keeps the colour and dimmer values in presets.
- [x] 4.7 Fixture profile editor: create, duplicate, edit and delete user profiles, saved in the project with export/import as JSON. Guide: Work with fixture profiles, p.250 to 252.
  Evidence: project profile editor/CRUD/import/export, shared validation, browser integration, `tests/profileValidation.test.ts`; typecheck, 150 tests and build passed; commit blocked by Git permissions.
  Done when: tests cover a profile round trip and validation (no duplicate channel numbers, ranges inside 0 to 255).
- [x] 4.8 Export and import fixtures (patch list as CSV and JSON), and a printable patch list (HTML or PDF via the Electron print dialog). Guide: p.247 to 250.
  Evidence: patch exchange UI, CSV/JSON helpers and print IPC, `tests/fixtureExchange.test.ts`; typecheck, 151 tests and build passed; commit blocked by Git permissions.
  Done when: tests cover a CSV export and import round trip.
- [x] 4.9 Fixture groups: create from selection, rename, reorder, delete, and nested groups; select a group from the palette. Guide: Step 5, Group fixtures, p.35 and p.64. (`groupSelectedFixtures` exists; extend it.)
  Evidence: nested group model/migration/store commands and palette tree, `tests/fixtureGroups.test.ts`; typecheck, 152 tests and build passed; commit blocked by Git permissions.
  Done when: store tests cover each command and undo.
- [x] 4.10 Multi-beam fixtures (like the PAN 4x1x30 17ch pixel bar): treat each cell as a selectable beam. Guide: Select light beams, p.74.
  Evidence: profile beam property maps, cell selection/rendering and Design editing, `tests/fixtureBeams.test.ts`; typecheck, 153 tests and build passed; commit blocked by Git permissions.
  Done when: the profile supports sub-beams, a cell can be selected and set alone, and a test checks the DMX channel each cell maps to.
- [x] 4.11 USB DMX interface: Enttec Open DMX USB discovery, protocol detection, a connection status label and a DMX test panel. *(Evidence: `shared/dmxPorts.ts`, `DmxConnection.tsx`, `DmxTestPanel.tsx`, `tests/dmxPorts.test.ts`, `tests/dmxStatusLabel.test.ts`, commits `300f0b2`, `0a506df`.)*
- [x] 4.12 USB reconnection: detect an unplugged interface, show it in the status, and reconnect automatically when it comes back, resending the current frame. Guide: DMX Output settings, Open DMX interfaces, p.253 to 254.
  Evidence: serial loss listeners, guarded retry/cancellation and `tests/dmxReconnect.test.ts`; typecheck, 154 tests and build passed; hardware check on Needs Jake; commit blocked by Git permissions.
  Done when: a test with a mocked serial port covers disconnect, the status change, reconnect and the frame being resent.
- [x] 4.13 Monitor DMX output: a 512-channel grid showing the live value, with the fixture name for each channel. Guide: Monitor DMX output, p.265. (`DmxMonitor.tsx` exists; check it against the guide.)
  Evidence: 512-channel monitor with fixture/property names, `channelLabels.ts`, `tests/channelLabels.test.ts`; typecheck, 155 tests and build passed; commit blocked by Git permissions.
  Done when: a pure channel-to-fixture label map is tested.

## 5. Design view: fixture properties (guide ch.8)

- [x] 5.1 Selection tools: Select All, select by type, select by name (search), and select by location (left/right/front/back halves of the stage). Guide: Select fixtures, p.72 to 73.
  Evidence: selection helper and Design selection tools, `tests/fixtureSelection.test.ts`; typecheck, 156 tests and build passed; location filters use explicitly placed fixture coordinates; commit blocked by Git permissions.
  Done when: there are pure selection helpers with tests for each.
- [x] 5.2 Property panel driven by the fixture profile's property types: only show the controls the selected fixtures support. Guide: Fixture properties, p.77 to 80.
  Evidence: profile property intersection and Design integration, `tests/availableProperties.test.ts`; typecheck, 157 tests and build passed; commit blocked by Git permissions.
  Done when: a pure `availableProperties(fixtures)` is tested for a mixed selection.
- [x] 5.3 Dimmer control and master dimmer. *(Evidence: `DesignTab.tsx`, `showStore.setMaster`, commit `62e1b21`.)* (verify that master behaves as on p.82)
- [x] 5.4 Colour: a colour picker that maps to RGB, RGBW, RGBA, RGBAW+UV and CMY (white/amber/UV extraction), plus colour favourites. Guide: Colour, p.83 to 86. (The colour wheel UI exists.)
  Evidence: emitter mixing, per-fixture colour programming/favourites and Design controls, `tests/colorMix.test.ts`; typecheck, 159 tests and build passed; commit blocked by Git permissions.
  Done when: `lib/colorMix.ts` is tested for each emitter set, and favourites are saved.
- [x] 5.5 Colour wheel and gobo wheel properties (slots from the profile, plus spin/scroll modes). Guide: p.87 to 90.
  Evidence: profile wheel ranges/editor, Design wheel controls, `tests/wheelProperties.test.ts`; typecheck, 160 tests and build passed; commit blocked by Git permissions.
  Done when: tests cover slot-to-DMX mapping and mode values.
- [x] 5.6 Position: a pan/tilt pad, fine channels, and invert or swap per fixture. Guide: Position, p.91 to 96.
  Evidence: position pad, per-fixture inversion/swap settings, fine-channel mapping, `tests/position.test.ts`; typecheck, 161 tests and build passed; commit blocked by Git permissions.
  Done when: tests cover 16-bit pan/tilt splitting and inversion.
- [x] 5.7 Remaining standard properties: On/Off, Shutter/Strobe, Movement Speed, Prism, Focus, Zoom, Iris, Frost, Fog, Lamp, Command. Guide: p.97 to 113. Split into 5.7a to 5.7c if needed.
  Evidence: standard property controls and range/option mapping, `tests/propertyValues.test.ts`; typecheck, 162 tests and build passed; manufacturer-specific commands require explicit profile ranges; commit blocked by Git permissions.
  Done when: each property kind maps from profile to DMX, with a test for each.
- [x] 5.8 Custom properties (slider or list of options), with reorder and hide. Guide: p.110 to 112.
  Evidence: profile custom slider/option controls, hidden/order settings, `tests/customProperties.test.ts`; typecheck, 163 tests and build passed; commit blocked by Git permissions.
  Done when: the profile supports custom properties, and tests cover the mapping and the saved order.
- [x] 5.9 Default values per property, from the profile and overridable in the project. Guide: Default values, p.114.
  Evidence: fixture profile/project defaults, output fallback layer and controls, `tests/propertyDefaults.test.ts`; startup clear regression corrected; typecheck, 165 tests and build passed; commit blocked by Git permissions.
  Done when: a test shows a released property going back to its default value.
- [x] 5.10 Copy and paste fixture properties between fixtures, with type-safe mapping. Guide: p.114.
  Evidence: `copyProperties.ts`, store and Design controls, `tests/copyProperties.test.ts`; typecheck, 165 tests and build passed. Commit blocked by Git permissions.
  Done when: there's a store test for copy/paste across different profiles.
- [x] 5.11 Overridden properties: show which properties are manually overridden (per fixture, per property), with Clear for all, for the selection, or for one property. Guide: View overridden fixture properties, p.116, and Clear fixture properties, p.116.
  Evidence: `propertyOverrides.ts`, `OverrideProperties.tsx`, store and output-fallback test; typecheck, 166 tests and build passed. Commit blocked by Git permissions.
  Done when: store tests cover selective clearing and the output falling back to the layer below (using the 1.5 output model).
- [x] 5.12 Fanning: fan a property across the selection (linear, from the centre, and so on), edit it, and delete it. Guide: Fanning, p.118 to 122.
  Evidence: `fanning.ts`, `FanningEditor.tsx`, saved fan definitions and `tests/fanning.test.ts`; typecheck, 169 tests and build passed. Graphical HUD/beam workflow gap recorded in NOTES; commit blocked by Git permissions.
  Done when: `lib/fanning.ts` is tested for each fan mode with 1, 2 and odd/even fixture counts.

## 6. Presets and sequences (guide ch.9)

- [x] 6.1 Capture a preset from the current fixture values, with a category. *(Evidence: `showStore.capturePreset`, `PresetEditor.tsx`, `tests/presets.test.ts`, commit `b265547`.)*
- [x] 6.2 Activate and deactivate presets (toggle), rename and delete. *(Evidence: `showStore.togglePreset/renamePreset/deletePreset`, `tests/presets.test.ts`.)*
- [x] 6.3 View preset contents (which fixtures and properties) and edit a preset in place (update from current, remove a property or fixture). Guide: p.126 to 128.
  Evidence: `PresetContents.tsx`, preset editing store actions and `tests/presetEditing.test.ts`; typecheck, 170 tests and build passed. Commit blocked by Git permissions.
  Done when: store tests cover update-from-current and removing a property.
- [x] 6.4 Presets and overridden properties: activating a preset while overrides exist behaves as the guide describes. Guide: p.128 to 129.
  Evidence: Apply/Add overrides commands, `tests/presetOverrides.test.ts`; typecheck, 171 tests and build passed. Commit blocked by Git permissions.
  Done when: an output-model test covers that interaction.
- [x] 6.5 Preset groups, with mutually exclusive behaviour (activating one releases the others in the same group) and nested groups. Guide: Create a preset group, p.130, and Organize presets and sequences, p.141.
  Evidence: migrated category groups, nested group editor/palette, `tests/presetGroups.test.ts`; typecheck, 172 tests and build passed. Commit blocked by Git permissions.
  Done when: store tests cover exclusivity and nesting, and the migration puts existing presets in a default group by category.
- [x] 6.6 Sequence model: an ordered list of steps (each step a set of property values or presets), with fade and hold per step. Guide: Create a sequence, p.131.
  Evidence: sequence types/migration, store CRUD, `SequenceEditor.tsx` and `tests/sequences.test.ts`; typecheck, 173 tests and build passed. Commit blocked by Git permissions.
  Done when: types, a migration (no sequences in old shows) and store CRUD are tested.
- [x] 6.7 Run sequences: playback engine with the order modes (forward, backward, bounce, random) and loop. Guide: Run sequences, Sequence order, p.132.
  Evidence: deterministic `sequenceClock.ts`, shared output pump, run/stop controls, `tests/sequenceClock.test.ts`; typecheck, 175 tests and build passed. Project change releases playback; commit blocked by Git permissions.
  Done when: tests on a pure step clock cover each order mode deterministically (seeded random).
- [x] 6.8 Reorder sequence steps, and add, remove and duplicate steps. Guide: p.133.
  Evidence: sequence step commands/editor and undo tests in `tests/sequences.test.ts`; typecheck, 176 tests and build passed. Commit blocked by Git permissions.
  Done when: store tests cover each command and undo.
- [x] 6.9 Sequence timing: manual (fade/hold in seconds) and beat-controlled (steps per beat, using the existing BPM and tap tempo). Guide: p.134 to 138.
  Evidence: manual/beat step clock, per-step beat lengths and timing controls, `tests/sequenceClock.test.ts`; typecheck, 177 tests and build passed. Commit blocked by Git permissions.
  Done when: step-clock tests cover both modes at 120 BPM.
- [x] 6.10 Fixture movements with sequences (position steps with fades). Guide: p.139 to 140.
  Evidence: 16-bit paired interpolation in `sequenceClock.ts`, `tests/sequenceMovement.test.ts`; typecheck, 180 tests and build passed.
  Done when: a test covers interpolated pan/tilt between steps.
- [x] 6.11 Preset Palette shown in Live edit mode. *(Evidence: `LiveWorkspace.tsx` preset palette block.)*
- [x] 6.12 Split the Preset Palette, filter it (by name, type, fixtures in the selection), and find related cues (which cues use this preset). Guide: p.143 to 144.
  Evidence: `lib/presetPalette.ts`, `tests/presetPalette.test.ts`; typecheck, 186 tests and build passed.
  Done when: there are pure filter and related-cue functions with tests.
- [x] 6.13 Export and import Preset Palette items as JSON, with fixture matching by name and profile. Guide: p.144.
  Done when: there's a round-trip test, including a fixture that isn't found and gets skipped and logged.
  Evidence: `lib/presetPaletteIo.ts` (portable export doc + fixture descriptors, import re-maps values/fans by name+profile, skips+logs unmatched), Export/Import JSON buttons in `LiveWorkspace.tsx` palette, `tests/presetPaletteIo.test.ts` (round-trip, id re-map, unmatched fixture skipped+logged); typecheck, 202 tests and build passed; UI check on Needs Jake.
- [x] 6.14 Convert existing scenes into presets or sequences (one-way, keeping the originals until 8.9). This feeds the retirement of the Scenes & cues editor.
  Done when: a migration helper converts every `SceneDef` to an equivalent preset with identical DMX output (tested).
  Evidence: `shared/sceneConversion.ts` (stable id, deep-copied values/fans, profile-based category inference), store `convertScenesToPresets` action (idempotent, keeps scenes) + "Convert scenes" button in the Live palette, `tests/sceneConversion.test.ts` (identical `computeSceneChannels` output for every scene at multiple master levels) and `tests/store.test.ts`; typecheck, 208 tests and build passed; UI check on Needs Jake.

## 7. Live view pages (guide ch.11, p.177 to 190)

- [x] 7.1 Page manager: add, rename, reorder (up/down), duplicate, delete with confirm, and per-page fade time. *(Evidence: `LiveWorkspace.tsx`, commit `9513318`.)*
- [x] 7.2 Active-state behaviour when switching pages: by default restore each page's active cues when you return to it, with a show setting to deactivate cues when switching; crossfade outgoing and incoming page output using the page fade. Guide: Live view pages, p.177 to 178. (Right now `selectLivePage` clears `activeLiveValues`, so cues are deactivated.)
  Done when: store and output tests cover restore on, restore off, crossfade timing, and blackout and project change during a page fade.
  Evidence: `lib/pageSwitch.ts` (immutable per-page active-level memory, restore vs deactivate, prune deleted pages), store `pageActiveValues` + `setPageSwitchMode` setting + "Deactivate cues when switching pages" checkbox in Manage pages; `App.tsx` applies the incoming page fade on switch; `tests/pageSwitch.test.ts`, `tests/pageFade.test.ts` (crossfade timing, blackout, project change) and `tests/store.test.ts`; typecheck, 220 tests and build passed; desktop check on Needs Jake.
- [x] 7.3 Add cue buttons, cue list widgets, text labels and frames to a page, and drag to move them with snap to grid. *(Evidence: `LiveWorkspace.tsx` addControl/addList/addAnnotation, beginDrag.)*
- [x] 7.4 Drag a preset onto empty page space to create a cue, or onto an existing cue to add it. *(Evidence: `LiveWorkspace.tsx` onDrop handlers.)*
- [x] 7.5 Multi-select on the page (Shift-click, marquee), and move, delete, duplicate, copy and paste several objects. Guide: Select objects, p.183, through Delete objects, p.187.
  Done when: store tests cover each multi-object command and undo.
  Evidence: `lib/livePageObjects.ts` (pure selection/marquee/move/delete/copy/paste/duplicate across cues, cue-list widgets and annotations), store `selectedPageObjects`/`pageClipboard` + multi-object actions (history/lock-gated, prune active levels on delete, fresh ids on paste, clear selection on undo/redo), `LiveWorkspace.tsx` Shift-click toggle, marquee drag, group drag, Delete/Ctrl+C/Ctrl+V/Ctrl+D and toolbar buttons; `tests/livePageObjects.test.ts` + `tests/store.test.ts` (each command plus undo/redo); typecheck, 233 tests and build passed; desktop check on Needs Jake."
- [x] 7.6 Resize objects with handles, and rename objects inline. Guide: p.185 to 186.
  Done when: cue buttons and frames store width and height (migrated), and tests cover resize clamping.
  Evidence: `shared/liveObjectDefaults.ts` (size defaults, 40–900 clamp, 10px snapping), `LiveControl`/`cueListWidgets` gained optional width/height with an additive legacy migration in `shared/migrations.ts` (no schema bump), `lib/livePageObjects.ts` resize/rename/objectSize helpers, store `resizePageObject`/`renamePageObject` (history/lock-gated), resize corner handle + double-click-to-rename and width/height inspector inputs in `LiveWorkspace.tsx`; `tests/livePageObjects.test.ts` (clamping/snapping), `tests/migrations.test.ts` (legacy fill/idempotent), `tests/store.test.ts` (resize/rename undo); typecheck, 242 tests and build passed; desktop check on Needs Jake.
- [x] 7.7 Attach buttons to each other or to a frame so they move together. Guide: Attach buttons, p.184.
  Done when: a store test shows moving a frame moves its attached buttons.
  Evidence: objects gained optional `attachedTo` (additive, migration-safe) with `setAttachment`/`withAttached`/`objectLabel` pure helpers in `lib/livePageObjects.ts`; `moveObjects` follows the attachment tree (cycle-safe, transitive) so dragging a frame carries its buttons and buttons attached to other buttons; `attachPageObject` store action (history/lock-gated); deleting clears dangling links and paste/duplicate remaps them to the copies; "Attached to" inspector select on cues, widgets and annotations in `LiveWorkspace.tsx`; `tests/livePageObjects.test.ts` + `tests/store.test.ts` (store test moves a frame and checks its buttons); typecheck, 249 tests and build passed; desktop check on Needs Jake.
- [x] 7.8 Text formatting for labels and default styles for new objects. Guide: p.187 to 188.
  Done when: style fields are saved and migrated, and a test shows new objects using the defaults.
  Evidence: `LiveObjectStyle` (font size, bold, italic, colour, alignment) added to cues, cue-list widgets and annotations, plus `LivePage.defaultStyles`; built-in defaults and `styleFor` in `shared/liveObjectDefaults.ts`; pure `newCueObject`/`newWidgetObject`/`newAnnotationObject` factories and `setObjectStyle` in `lib/livePageObjects.ts`; migration fills styles additively (page defaults applied, existing style fields kept, no schema bump); store `setPageObjectStyle` (history/lock-gated); inspector format controls + "Default styles for new objects" editor with rendered formatting in `LiveWorkspace.tsx`; `tests/livePageObjects.test.ts` (new objects use built-in/page defaults), `tests/migrations.test.ts`, `tests/store.test.ts`; typecheck, 256 tests and build passed; visual check on Needs Jake.
- [x] 7.9 Configure frames: exclusive frames (one active cue at a time) and frame modifiers (shared intensity, speed). Guide: Configure frames, p.189.
  Done when: store tests cover exclusivity in a frame and a modifier scaling output.
  Evidence: frames gained optional `FrameConfig` (exclusive, intensity %, speed %), migration-filled additively (defaults 100%, exclusive false, no schema bump); pure `lib/liveFrames.ts` (frame membership by cue centre, `exclusiveSiblings`, `frameIntensity`/`frameSpeed`, `effectiveLiveLevel`, `liveOutputLevels`, `liveFadeMs`, `setFrameConfig`); `setLiveValue` releases sibling cues when activating a cue in an exclusive frame; `getLiveOutputLevels` store action feeds frame-scaled levels into `App.tsx` DMX output, and frame speed scales the page-switch fade (default 100% is a no-op); frame config inspector in `LiveWorkspace.tsx` (history/lock-gated `configureFrame`); `tests/liveFrames.test.ts`, `tests/store.test.ts` (exclusivity + modifier scaling), `tests/migrations.test.ts`; typecheck, 277 tests and build passed; desktop check on Needs Jake.
- [x] 7.10 Drag sequences and multiple presets at once to pages, frames and cue buttons. Guide: Add cue buttons, p.181.
  Done when: store tests cover each drop target, with the drop logic pulled out of the JSX into a tested function.
  Evidence: `LiveControl.sequenceIds` (optional, migration-filled additively, no schema bump); pure `lib/liveDrops.ts` (encode/decode `LIVE_DROP_MIME`, `normalizeDropPayload`, `dropLabel`, `applyLiveDrop` for page/frame/cue targets including Ctrl-split into one cue per dragged item, `activeCueSequenceIds`); click-to-multi-select presets plus a draggable Sequences row in the `LiveWorkspace.tsx` palette, with page/frame/cue drop handlers delegating to the history/lock-gated store `dropOnLivePage`; cue inspector lists attached sequences; `App.tsx` includes sequences on lit cues in `configureSequences`; `tests/liveDrops.test.ts` (19 tests), `tests/store.test.ts` (all three targets + lock), `tests/migrations.test.ts`; typecheck, 302 tests and build passed; desktop check on Needs Jake.
- [x] 7.11 Inspector panel for the selected page, frame, cue or cue list, replacing the scattered inline controls. Guide: Edit a page, p.180, and Edit cue contents and options, p.198.
  Done when: the inspector shows the right fields for each selection type (tested as a pure field-schema function).
  Evidence: `lib/liveInspector.ts` defines the pure field schema for page, frame, cue, cuelist and label targets; `LiveWorkspace.tsx` renders one selection-driven inspector (including page name/fade when nothing is selected) and exposes its schema; `tests/liveInspector.test.ts` verifies every target. Typecheck, 309 tests and build passed.

## 8. Cues and cuelists (guide ch.11, p.190 to 221)

- [x] 8.1 Cue control types toggle, flash and fader on Live pages. *(Evidence: `types.ts` LiveControl, `LiveWorkspace.tsx`, `App.tsx` output.)* (verify flash release and the fader curve in the audit)
- [x] 8.2 Edit cue contents: add or remove presets, sequences and ad-hoc properties in a cue, and view the cue's contents. Guide: Edit cue contents, View cue contents, Edit ad hoc properties, p.199 to 202.
  Done when: store tests cover each, using the existing `adHocValues`.
  Evidence: `lib/cueContents.ts` immutable add/remove/edit commands, history/lock-gated `editCueContents` store action, `CueContentsEditor.tsx` contents view/editor, `tests/cueContents.test.ts` and `tests/store.test.ts`; typecheck, 314 tests and build passed.
- [x] 8.3 Cue timing options (fade in, fade out, delay) and fade curves (linear, ease and the guide's other curves). Guide: p.203, and Fade curves, p.209 to 214.
  Done when: `lib/fadeCurves.ts` is tested at 0, 0.5 and 1 for each curve, and cue timing is applied in the output tests.
  Evidence: additive `LiveControl.timing` migration, `lib/fadeCurves.ts` curve/timed-output evaluator, history/lock-gated `configureCueTiming`, timing inspector fields, `tests/fadeCurves.test.ts`, `tests/store.test.ts`, `tests/migrations.test.ts`; typecheck, 321 tests and build passed.
- [x] 8.4 Button appearance and behaviour (colour, label, toggle/flash/fader, "release others"). Guide: p.204.
  Done when: fields are saved, migrated and tested.
  Evidence: additive `LiveControl.appearance` migration, history/lock-gated `configureCueAppearance`, colour/release-others inspector and coloured Live playback buttons; release-others runtime in `setLiveValue`; `tests/store.test.ts` + `tests/migrations.test.ts`; typecheck, 322 tests and build passed.
- [x] 8.5 Cue modifiers (intensity, speed, size and so on, adjustable live). Guide: Edit modifiers, p.205 to 208, and Change modifiers, p.217.
  Done when: an output test shows a modifier scaling the cue's contribution.
  Evidence: additive cue intensity/speed/size modifiers, history/lock-gated `configureCueModifiers`, Live inspector controls, cue+frame scaling in `effectiveLiveLevel`, `tests/liveFrames.test.ts`, `tests/store.test.ts`, `tests/migrations.test.ts`; typecheck, 324 tests and build passed.
- [x] 8.6 Cue priority between overlapping cues (latest takes precedence, or an explicit priority), using the 1.5 model.
  Done when: output tests cover two cues on the same property.
  Evidence: additive cue priority, runtime activation ordering, `lib/cuePriority.ts` orders active controls so explicit priority then latest activation wins before App output merge, inspector/store support; `tests/cuePriority.test.ts`, `tests/store.test.ts`, `tests/migrations.test.ts`; typecheck, 327 tests and build passed.
- [x] 8.7 Cuelists in Live: add, remove, reorder, copy/paste, rename and filter cues inside the cuelist widget, and show the current and next cue with remaining time. Guide: Edit cuelists, p.191 to 198.
  Done when: store tests cover each command, and a pure "current/next/remaining" function is tested.
  Evidence: `lib/cueListEditing.ts` immutable commands/filter/status, history/lock-gated store command, `CueListEditor.tsx` Live widget authoring UI, `tests/cueListEditing.test.ts` + `tests/store.test.ts`; typecheck, 330 tests and build passed.
- [x] 8.8 Cuelist playback: Go, Back, jump to any cue, auto-advance with follow times, loop, cue groups, and a manual crossfade fader. Guide: Cuelist timing, p.193, Cue groups, p.192, and Live control with cuelists, p.218 to 220. (Next/prev, hold and loop exist in `showStore` and `cuePlaybackClock.ts`; extend them.)
  Done when: clock tests cover auto-follow, loop, a jump while fading, and a manual crossfade at 50%.
  Evidence: existing Go/Back/jump/follow/loop store+clock extended with cue `groupId`, manual-crossfade operator state/UI and pure `cueListPlayback.ts` patch blend/group bounds; clock jump/loop tests and `tests/cueListPlayback.test.ts`; typecheck, 335 tests and build passed.
- [x] 8.9 Retire the separate Scenes & cues editor (`SceneGrid.tsx`, `CueListPanel.tsx`): migrate scenes to presets (6.14) and cue steps to cuelist cues, and remove the tab once every capability exists in Live. Keep the migration code.
  Done when: a test opens the demo show and a version-0 show, migrates them, and gets identical DMX output for each former scene and cue step. Add a Needs Jake check on a real show.
  Evidence: removed `EditTab.tsx`, `SceneGrid.tsx`, `CueListPanel.tsx` and toolbar entry; retained non-destructive scene→preset conversion and cuelist migration paths; `tests/editorRetirement.test.ts` verifies demo/version-0 scene and cue-step output equivalence; typecheck, 337 tests and build passed; real-show check remains on Needs Jake.
- [x] 8.10 Step through buttons in a frame (next/previous button), and continue effects across cues. Guide: p.216 to 217 and p.221.
  Done when: store tests cover both.
  Evidence: optional cue frame-step action, `lib/frameStepping.ts` cycling frame members, store action and Live control rendering/editor; global effects remain unchanged across cue advances; `tests/frameStepping.test.ts` + `tests/store.test.ts`; typecheck, 339 tests and build passed.

## 9. Effects, beat control and operation (guide ch.10, ch.11 end, ch.12)

- [x] 9.1 Basic waveform effects (sine, triangle, square, saw, random) on one attribute, with BPM sync, size, offset and phase spread. *(Evidence: `lib/effects.ts`, `EffectsPanel.tsx`, `tests/effects.test.ts`.)* This is roughly the guide's curve effects; gaps go in the audit.
- [x] 9.2 Effect model rework: effects belong to a preset, sequence or cue (not only to the global list), with a migration that keeps the existing global effects working. Guide: Add an effect, p.148, and Edit an effect, p.149.
  Done when: tests show a migrated show producing the same output, and a cue-owned effect starting and stopping with its cue.
  Evidence: optional non-destructive `EffectDef.owner`, `lib/effectOwnership.ts` keeps legacy/global effects active and gates preset/sequence/cue-owned effects, App output integration and `tests/effectOwnership.test.ts`; typecheck, 340 tests and build passed.
- [x] 9.3 Effect timing (speed, phase, beat-synced rate multipliers) and fixture order editing (forward, reverse, random, custom). Guide: p.150 to 152.
  Done when: tests cover phase per fixture for each order.
  Evidence: existing speed/BPM/phase spread extended with persisted forward/reverse/stable-random/custom fixture order in `effects.ts`; ordering and phase output tests in `tests/effects.test.ts`; typecheck, 341 tests and build passed.
- [x] 9.4 Curve effects to full parity (curve shapes, min/max, applied to any property). Guide: p.147 and p.161 to 164.
  Done when: there are curve shape tests.
  Evidence: `lib/effects.ts` supports sine, cosine, triangle, square, pulse, saw, random and smooth curve shapes with optional explicit min/max mapping on every fixture property; `tests/effects.test.ts` covers the added shapes and non-intensity property range output; typecheck, 342 tests and build passed.
- [x] 9.5a Pattern effects: Chase, Scanner and Yo-yo. Guide: p.153 to 160.
  Done when: each pattern is a pure `(t, fixtureIndex, count) -> level` with deterministic tests.
  Evidence: pure normalized `patternLevel` chase/scanner/yo-yo evaluator and deterministic boundary/direction tests in `tests/patternEffects.test.ts`; typecheck, 344 tests and build passed.
- [x] 9.5b Pattern effects: Fill, Rain and Meteor. Guide: p.153 to 160.
  Done when: each pattern is a pure `(t, fixtureIndex, count) -> level` with deterministic tests.
  Evidence: pure fill/rain/meteor branches in `patternLevel` with progression, repeatability and tail tests; typecheck, 346 tests and build passed.
- [x] 9.5c Pattern effects: Sparkle and Fire. Guide: p.153 to 160.
  Done when: each pattern is a pure `(t, fixtureIndex, count) -> level` with deterministic seeded-random tests.
  Evidence: deterministic seeded sparkle and fire evaluators with frame stability/range tests in `tests/patternEffects.test.ts`; typecheck, 348 tests and build passed.
- [x] 9.5d Pattern effects: Jellyfish and Snakes. Guide: p.153 to 160.
  Done when: each pattern is a pure `(t, fixtureIndex, count) -> level` with deterministic tests.
  Evidence: pure breathing jellyfish and dual-head snakes evaluators with set-time fixture-level tests; typecheck, 350 tests and build passed.
- [x] 9.6 Movement effects (circle, figure-eight, line and so on), with path editing and transforms. Guide: p.165 to 171.
  Done when: path generators are tested for pan/tilt at set times.
  Evidence: pure `movementPoint` generates circle/figure-eight/line or interpolated custom paths and applies independent scaling, rotation and pan/tilt offsets; fixed-time and transform tests in `tests/movementEffects.test.ts`; typecheck, 352 tests and build passed.
- [x] 9.7 Copy/paste and delete effects, overlay (layering) effects, and effect templates. Guide: p.172 to 174.
  Done when: store tests cover each, plus an output test for two overlaid effects.
  Evidence: store-backed effect clipboard, fresh-id paste/delete and persisted templates; replace/add/max channel blending with a three-layer output test; `tests/store.test.ts` covers editing/template commands; typecheck, 355 tests and build passed.
- [x] 9.8 Tap tempo and BPM. *(Evidence: `lib/tapTempo.ts`, `lib/bpm.ts`, `tests/tapTempo.test.ts`.)*
- [ ] 9.9 Beat grid: set it by tapping, by an exact value, or by MIDI Beat Clock; beat-controlled sequences and effects follow it, with a beat indicator. Guide: ch.12, p.225 to 228. Ableton Link and OS2L are out of scope.
  Done when: a MIDI clock parsing test (24 ppq to BPM) and a beat-phase test pass.
- [ ] 9.10 Blind mode: edit without changing live output; the Preview shows the blind state and a clear indicator marks blind. Guide: Blind mode, p.221.
  Done when: output-model tests show edits in blind not reaching DMX and committing them on exit (or discarding, per the guide; log it).
- [ ] 9.11 Freeze output: hold the current DMX frame while cues change underneath, then resume. Guide: Freeze output, p.222.
  Done when: output tests show the frame frozen and resume fading to the current state.
- [ ] 9.12 External control: extend `MidiPanel` and `midi.ts` towards the guide's bindings, triggers and actions model (MIDI only), with quick assign (learn). Guide: ch.16, p.277 to 293. OSC, ProPresenter and VirtualDJ triggers are out of scope for now.
  Done when: there's a migration from existing `midiMappings`, plus tests for learn and for each action type.

## 10. Settings, help and finish

- [ ] 10.1 Preferences window: timing defaults (default fade, page fade), appearance (the existing themes), startup state, Live switching behaviour (from 7.2), and DMX interface. Guide: appearance and settings references in ch.6.
  Done when: settings are saved and tested.
- [ ] 10.2 Menus and context menus: a Windows menu bar (File, Edit, View, Live, Window, Help) and right-click menus on fixtures, presets, cues and pages, all driven by the 2.9 shortcut table.
  Done when: a test checks every menu command maps to an existing action.
- [ ] 10.3 Tooltips and accessibility: every icon button has a tooltip and aria-label, focus is visible, and the Live page works from the keyboard.
  Done when: a lint-style test scans components for `<button` without aria-label or text (or this is logged in NOTES if it isn't practical).
- [ ] 10.4 Remove or merge leftover OpenLights-only panels after their replacements work (old live controls, stub tabs like `EditTab.tsx`, and anything else marked retire in the audit). Keep the audio automation timeline and the DMX test panel unless the audit says otherwise.
  Done when: the dead components are removed, the build passes, and the audit is updated.
- [ ] 10.5 Final audit pass: update `docs/lightkey-audit.md` with every status after the work. List the remaining gaps in NOTES, don't mark partial features as matching.
  Done when: there are no rows with stale statuses.

---

## Needs Jake (human checks; the agent appends here and keeps working)

The agent never waits on these. It adds a line here (item number plus what to check), ticks the item, and carries on.

- [ ] (Jake) Desktop click-through of the Live page editor: drag a preset onto empty space and onto an existing cue, drag labels and frames, use the page manager. (From the existing preset palette and drag work.)
- [ ] (Jake) Enttec Open DMX USB output test with real fixtures: connect, blackout, master, a preset, a cue fade, unplug and replug the interface (after 4.12).
- [ ] (Jake) Open a real existing show (for example the PRBC test fixtures show) after 1.2, after 4.1 and after 8.9, then save, reopen and check nothing is lost.
- [ ] (Jake) Visual comparison of the toolbar, Design view, Preview and Live view against the guide's layout.
- [ ] (Jake) Visual check of the bottom-centre Design/Live switch against `docs/reference/lightkey-design-live-switch.png`: placement on the Preview/bottom divider, segmented look in Design view, chevron dropdown in Live view, and page manager pick/add/rename/reorder (2.4a).
- [ ] (Jake) Compare the complete bottom panel against all 2.4b reference frames: compact centred switch, Master at left, Design scene tiles, Live buttons/cuelist, Edit and shortcuts chrome, Preview property overlay, and scene Edit appearing on hover in the right tree; confirm no camera footage or bottom editor appears.
- [ ] (Jake) Test the corrected 2.4c flow: Design bottom shows fixture controls; Live shows scenes and page controls; Live Edit opens immediately and can add an existing scene button, custom cue, cuelist, label and frame.
- [ ] (Jake) Preset palette Export/Import JSON click-through in Live edit mode: export a palette, import it into a show with renamed fixture ids, and confirm values re-map by name/profile and an unmatched fixture is skipped and reported (6.13).
- [ ] (Jake) Click "Convert scenes" in the Live palette and confirm presets appear with the same looks while the originals remain in Scenes & cues (6.14).
- [ ] (Jake) Live page switching click-through (7.2): active cues restore when you return to a page by default, the "Deactivate cues when switching pages" checkbox releases them instead, and the page fade visibly crossfades outgoing/incoming looks (check blackout and opening another project mid-fade).
- [ ] (Jake) Multi-select click-through in Live edit mode (7.5): Shift-click and marquee-select several cues/labels/frames, drag them together, then try Delete, Duplicate, Copy, Paste (buttons and Del / Ctrl+C / Ctrl+V / Ctrl+D) and undo each one.
- [ ] (Jake) Resize and inline-rename click-through in Live edit mode (7.6): select a cue/list/frame and drag its bottom-right handle (sizes snap to 10px and stay within 40–900px), double-click a cue or label to rename it, and try the width/height inspector inputs; reopen an older show to confirm object sizes are kept and undo works.
- [ ] (Jake) Attachment click-through (7.7): in Live edit mode set a cue's "Attached to" to a frame (and another cue to that first cue), then drag the frame and confirm both buttons follow; detach again, and check undo plus copy/paste of an attached group.
- [ ] (Jake) Label/button formatting check (7.8): change font size, colour, alignment, bold and italic on a label, frame, cue and cue list and confirm the page updates; set "Default styles for new objects", add each object type and confirm it inherits them; reopen an older show to confirm styles are filled and kept.
- [ ] (Jake) Frame configuration check (7.9): select a frame, enable "Exclusive" with two cues physically inside it and confirm only the last-activated cue stays lit; set Intensity 50% and confirm cues in the frame output at half level while a cue outside it is unaffected; set Speed and switch pages to confirm the crossfade speed changes; reopen an older show to confirm frame defaults are filled."
- [ ] (Jake) Multi-preset/sequence drag check (7.10): in Live edit mode click several presets and a sequence in the palette, drag them onto blank page space (one combined cue), onto a frame (new cue inside it) and onto an existing cue (ids merged, undo restores); hold Ctrl while dropping to create one button per item; activate a cue with a sequence and confirm it plays; reopen an older show to confirm `sequenceIds` are filled and preserved."
- [ ] (Jake) Multi-window check for Live windows and window restore (after 2.6).
- [ ] (Jake) Lock mode check on the Live machine (after 2.8).

---

## Out of scope for now (don't build)

- Lightkey licences (ch.3), Smart lights / Philips Hue (ch.15, p.267 to 276).
- Network DMX: Art-Net, sACN, ESP Net, OLA, network node universe setup (ch.14, p.255 to 265).
- Ableton Link, OS2L, OSC, ProPresenter and VirtualDJ triggers, Live Triggers (audio-triggered), macOS shortcuts, multi-touch gestures (ch.12 and 16). These can be revisited later.

---

## Guide section index (for item 0.2's audit table)

| Ch. | Section | Page |
|---|---|---|
| 2 | Intro to DMX: Connect your fixtures / DMX interfaces / Fixture addresses | 15 / 19 / 20 |
| 4 | Set up your lights: Create a project, Choose output, Patch fixtures, Build the Preview, Group fixtures, Beam directions, Beam colours | 26 to 37 |
| 5 | Projects: Create, Open/close, Rename/save a copy, Manage, Search, Undo | 39 to 44 |
| 6 | Lightkey window: Toolbar, Customise, Full screen, Live windows, Adaptive background, Lock, Shortcuts | 45 to 51 |
| 7 | Preview: Zoom, Edit objects (select, move, align, space, resize/rotate), Edit fixtures (size, names, beam direction/colour, options, group, locate, add/remove), Shapes/images/text, Fixture Storage | 52 to 70 |
| 8 | Fixture properties: Select fixtures, Select light beams, Properties, Dimmer/Master, Colour, Colour Wheel, Gobo Wheel, Position, On/Off, Shutter/Strobe, Movement Speed, Prism, Focus, Zoom, Iris, Frost, Fog, Custom, Lamp, Command, Defaults, Copy/paste, Overridden, Clear, Undo, Fanning | 71 to 122 |
| 9 | Presets and sequences: Create/view/activate/edit preset, Overridden properties, Preset groups, Create/view/run sequence, Order, Reorder steps, Timing (manual, beat), Movements, Organise, Split palette, Filter, Related cues, Export/import | 124 to 144 |
| 10 | Effects: Pattern/Curve/Movement, Add, Edit, Timing, Fixture order, Pattern types (Chase to Snakes), Curve, Movement paths, Copy/paste, Delete, Overlay, Templates | 146 to 174 |
| 11 | Live control: Pages, Build pages (cue buttons, frames, labels, select/move/attach/resize/rename/duplicate/copy/delete, formatting, default styles, frames, cuelists), Edit cuelists (add, groups, timing, playback selection, organise, copy/paste, filter), Cue contents and options (contents, ad hoc, timing, appearance, modifiers, fade curves), Live control with buttons and cuelists, Blind, Freeze, Startup state, Output precedence | 176 to 223 |
| 12 | Beat control: Sequences, Effects, Beat grid (tap, exact, MIDI clock, Ableton Link, OS2L), Examples | 225 to 235 |
| 13 | Manage DMX fixtures: Find profile, Filter library, Add, Edit (info, address/universe, duplicate, edit/reassign profile, disable, delete), Export/import, Print, Fixture profiles (favourites, edit, import, create, duplicate, delete) | 237 to 252 |
| 14 | DMX output and input: Output settings, Serial/Open DMX USB, other USB, (Art-Net, sACN, ESP Net, OLA: out of scope), Universes, Monitor output | 253 to 265 |
| 15 | Smart lights (out of scope) | 267 to 276 |
| 16 | External control: Quick assign, External Control window (configurations, MIDI inputs, bindings, triggers, actions, shift, notes), Live Triggers, ProPresenter, Send MIDI, MIDI routing, OSC, VirtualDJ, Log, macOS shortcuts, Multi-Touch | 277 to 322 |
| App. 1 | Shortcuts and gestures (general, projects, editing, view, setup assistant, preview editing, preview, Design view, Preset Palette, Live) | 324 to 351 |

- [ ] (Jake) 2.4 Compare the unified toolbar placement, wrapping, keyboard focus and available space with the guide on the Live machine.

- [ ] (Jake) 3.9b Verify shape, text and image editing, colour, opacity, transforms and layering against the local guide.
