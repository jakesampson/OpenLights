# Engineering notes

## Decisions

### 0.2 Audit
The audit uses one row per checklist index entry. Partial means code exists but full guide behaviour has not been verified. USB diagnostics and the audio timeline are explicit retained exceptions.

### 0.3 Coverage
Documentation-only setup does not change runtime behaviour. Existing tests and the documentation contract test provide validation.

## Deviations from the guide

Windows conventions replace macOS commands. Network outputs and other exclusions follow the checklist.

- 7.9: The guide's "Configure frames" (p.189) describes frame Previous/Next controls for sequential button activation and a frame priority for output precedence. The checklist's Done-when instead asks for exclusive frames and shared intensity/speed modifiers, so this item implements those (exclusive = one active cue at a time; intensity scales output; speed scales the page-switch fade). Sequentially cycling a frame with dedicated Previous/Next buttons is left for a later item.
- 7.10: The guide's "Add cue buttons" (p.180–181) adds presets/sequences to an existing cue by dragging them onto the *cue inspector*, and says to drag onto a frame (not a button) to create a new cue. The checklist explicitly asks for pages, frames **and cue buttons** as drop targets, so all three are supported; dropping onto a cue button merges its contents, and the inspector's sequence list provides the guide's route too. The guide's "insert a new button between two attached buttons" gesture and automatic frame growth are not implemented (the new cue is placed at the drop point); attachments remain available from the inspector. Ctrl stands in for the guide's Command key when splitting one button per dragged item.

## Known gaps

Historical note: earlier sessions recorded that Git commits were blocked by filesystem permissions (`.git/index.lock` could not be created). On the current `Grok_Auto` checkout commits succeed normally, so this no longer applies; roadmap items are committed as `roadmap N.N: ...`. Hardware and visual checks are tracked in ROADMAP_CHECKLIST.md.

## Test coverage

- `tests/adaptiveBackground.test.ts`: adaptiveBackground behaviour.
- `tests/automation.test.ts`: automation behaviour.
- `tests/colorWheel.test.ts`: colorWheel behaviour.
- `tests/cuePlaybackClock.test.ts`: cuePlaybackClock behaviour.
- `tests/demoProject.test.ts`: demoProject behaviour.
- `tests/dmx.test.ts`: dmx behaviour.
- `tests/dmxPorts.test.ts`: dmxPorts behaviour.
- `tests/dmxStatusLabel.test.ts`: dmxStatusLabel behaviour.
- `tests/effects.test.ts`: effects behaviour.
- `tests/liveDrops.test.ts`: preset/sequence drop encoding, page/frame/cue targets, Ctrl-split and active-cue sequences (7.10).
- `tests/liveFrames.test.ts`: frame membership, exclusivity, intensity/speed modifiers and fade scaling (7.9).
- `tests/liveOutput.test.ts`: liveOutput behaviour.
- `tests/presetColor.test.ts`: presetColor behaviour.
- `tests/presets.test.ts`: presets behaviour.
- `tests/previewOutput.test.ts`: previewOutput behaviour.
- `tests/projectName.test.ts`: projectName behaviour.
- `tests/sceneOutputIntegration.test.ts`: sceneOutputIntegration behaviour.
- `tests/stageTheme.test.ts`: stageTheme behaviour.
- `tests/store.test.ts`: store behaviour.
- `tests/tapTempo.test.ts`: tapTempo behaviour.
- `tests/trussGeometry.test.ts`: trussGeometry behaviour.

### 1.2 Migration policy
Future-version shows warn in the main-process console and preserve their schema and unknown fields. Invalid collection values are retained in migrationInvalidFields while runtime collections receive safe defaults. Legacy previewTrusses absence remains absent to preserve the old stage illustration.

### 1.3 History
Project edits use immutable snapshots capped at 200, with explicit begin/end grouping around panel pointer interactions. Playback-only selections do not enter history. Undo and redo restore programming state and refresh the active base look while preserving runtime playback selection. Snapshot identities are cloned.

### 1.5 Output model
The pure composer retains manually activated presets above effects and Live cues, preserving existing output. Master is already applied at fixture mapping in the runtime; composeOutput uses unity master there to avoid scaling twice. Blind/freeze accept held frames in the pure model; user controls arrive in section 9. Blackout emits a full explicit zero frame.

### 1.7 Startup state
Default is no active looks. Restore mode records active page, cue-button levels, presets and base scene at explicit save/autosave; opening restores those looks without automatically running cue-list clocks. Missing references are ignored.

### 2.1 Project lifecycle
Unsaved state is derived from the loaded/saved JSON baseline. New, Open, recent-project load, project Close and dirty native-window closure route through an in-app Save/Discard/Cancel prompt. Saved file Rename stays in its original directory, rejects collisions and updates the embedded name. Existing debounced autosave remains enabled.

### 2.3 Search targets
Search navigates without recalling output, and focuses matching controls after opening their panel. Sequence names are searchable from preserved future-model fields; sequence authoring and its navigation target arrive with section 6.6.

### 2.6 Live windows
Secondary windows are operator surfaces mirrored from the primary renderer. Only the primary sends DMX and runs the cue clock; secondary controls forward allowlisted commands. Window descriptors and size restore at relaunch. Independent simultaneous Live pages remain a section-7 parity gap; windows currently follow the main active page.

### 2.8 Lock mode
Lock is session-local. Optional passcode is held only in a module closure and never written to shows or broadcast to secondary windows. Store guards block programming before any action side effects; runtime cue triggering, tempo, master and blackout remain allowed. This is an operator edit lock, not an OS security boundary.

### 2.9 Shortcut scope
One registry now drives displayed shortcuts and keyboard dispatch. Only supported command families are displayed; commands for later checklist features will be added when their behaviour exists. Existing numeric scene recall is retained until migration 8.9. Native text-editing shortcuts retain focus priority.

### 3.3 Preview viewport
Zoom-to-fit includes fixture icons and rotated truss bounds. Selection fit ignores unselected objects. Empty input restores the canonical stage viewport. Windows Ctrl+=/-/0 and Ctrl+Shift+0 drive the same commands as the buttons. pypdf was installed only under ignored .tmp/pdf-tools to inspect the supplied guide; no application dependencies changed. The PDF text extraction has a damaged glyph map, so visual guide checks remain on Needs Jake.

### 3.8 Preview beams
Auto direction preserves the previous overhead/floor beam convention. Explicit angles and gel colours affect preview artwork only, with an Auto beam reset; transmitted DMX values are unchanged.

### 3.9 Split
Stage graphics is split into 3.9a (model/migration), 3.9b (authoring UI), and 3.9c (editing commands). Git cannot record the requested split commit because its metadata is read-only; the split is retained in the working checklist.

### 3.10 Fixture storage
New fixtures start stored; legacy fixtures remain on their prior layout even if they lack explicit coordinates. Storage changes visual placement only, never patch/output membership.

### 4.1 Profiles
Legacy FixtureType and FIXTURE_PRESETS exports remain as compatibility adapters generated from profile data. Mapping, effect output and preview now resolve profile channels. Migrated fixtures embed their profile to keep channel mapping stable even if a library entry changes. The eight bundled profiles retain the previously supported channel layouts.

### 4.3 Batch patching
The supported universe selector is fixed to universe 1 for USB-only output. Batch allocation searches for a complete free span for each fixture and fails atomically when capacity is insufficient.

### 4.6 Profile reassignment
Programming values are keyed by property name, so compatible properties map to the new channel layout automatically. Unsupported old properties remain in the original presets/scenes and are ignored by output instead of being deleted; assigning the original profile restores their usefulness.

### 4.7 Custom profiles
Built-in profiles are immutable; Duplicate/new creates a project-owned copy. Deleting a custom library entry keeps embedded fixture profiles intact, so an existing patch does not lose its channel definitions. Import/export uses OpenLights JSON.

### 4.12 USB reconnect
The engine retries the last explicitly selected port/protocol at one-second intervals after loss or write failure; explicit disconnect cancels retry. A connection generation rejects stale async opens. The universe remains in memory and is resent by the normal frame pump. Hardware validation is still required. Port renumbering by Windows is not automatically identity-matched.

### 5.4 Colour mixing
White and amber are extracted from visible RGB where those emitters exist; CMY uses subtractive complements. UV defaults to zero for a visible colour pick because visible RGB does not determine ultraviolet output; its dedicated property remains adjustable. Different selected fixture types are mixed independently.

### 5.9 Startup clear regression
The regression suite requires project loading with no active looks to clear all 512 channels. Preserve that behaviour; profile defaults apply to released/missing programmed properties and the default output layer after programming, while an explicit startup clear or blackout remains authoritative.

### 5.12 Fanning
Editable definitions are saved with scene/preset values. The editor supports linear, centre and reverse spreads, stage/name/address ordering and optional spacing. Pure evaluation supports intermediate anchors. Numeric endpoint controls replace the guide's graphical HUD initially; beam-specific and graphical anchor editing remain workflow gaps. Removal offers keep values or clear the property. Tests: `tests/fanning.test.ts`.

### 6.3 Preset contents
Preset contents expand in place, with per-property numeric edits, property/fixture removal and an update-from-selected-current-values command. Updating merges supported category properties; unrelated fixtures remain stored. Tests: tests/presetEditing.test.ts. Graphical preset editing from Design remains a workflow difference to review in the final audit.

### 6.4 Presets and overrides
Normal activation leaves Design overrides above presets. Apply copies a preset into overrides and replaces only the properties it defines. Add overrides merges overrides into the stored preset. Alt restricts either command to selected fixtures, following the guide's Option convention. Tests: tests/presetOverrides.test.ts.

### 6.5 Preset groups
Legacy presets are grouped by category with exclusivity disabled to preserve combined looks. Exclusive ancestors release other active descendants when a member is activated. Group removal preserves presets and reparents nested groups. Tests: tests/presetGroups.test.ts.

### 6.6 Sequence model
Sequences keep ordered steps with their own property values, preset references, fade and hold durations. Capture starts from the current scene plus manual overrides. Old projects migrate to an empty sequence list; preserved sequence data is normalized without dropping extra fields. Tests: tests/sequences.test.ts.

### 6.7 Sequence playback
The shared output pump runs sequences beneath effects, Live and Design overrides. Orders are deterministic, including seeded per-pass shuffling. Bounce visits each endpoint once. Finite sequences release by default, with a keep-last-step option; loop runs indefinitely. Playback state is not undo history. Tests: tests/sequenceClock.test.ts.

### 6.8 Sequence step commands
Step capture, duplicate, remove, move, reverse and shuffle all pass through project history. Duplicates have independent IDs and nested values. Sequence operator commands are forwarded to the primary output window. Tests: tests/sequences.test.ts.

### 6.9 Sequence timing
Manual hold and fade durations add together, with an overall time scale. Beat timing ignores hold seconds and uses per-step beat lengths and steps-per-beat; fades occur at beat boundaries without extending the step. Tap/manual BPM feeds the same runtime. Shared-grid quantization is deferred to 9.9. Long fades interrupted by a faster beat currently restart from the scheduled previous step, a parity gap. Tests: tests/sequenceClock.test.ts.

### 6.10 Fixture movements with sequences
Interpolates pan and tilt between position steps in sequences across fade durations. 16-bit position channels (pan/panFine, tilt/tiltFine) are interpolated as combined 16-bit words rather than separate 8-bit channels to prevent stepping and preserve fine precision. Tests: tests/sequenceMovement.test.ts.

### 6.12 Preset palette filtering and related cues
Pure helper functions filter presets and sequences by name query, preset category, and fixture overlap with the current selection. findRelatedCues inspects Live pages and controls to locate all cue buttons referencing a given preset ID. Tests: tests/presetPalette.test.ts.

### 2.4a Design/Live switch placement and Live page dropdown
The Design/Live segmented switch moved out of the top toolbar (`WorkspaceToolbar.tsx`) to a new `ViewSwitch.tsx` mounted in `App.tsx` on the divider between the Preview and bottom panel (CSS `.view-switch`, translated up by half its height so it straddles the divider). The Design/Live handlers remain in the toolbar `actions` object because `runToolbarCommand` requires the full `Record<ToolbarCommand, ...>` contract, but no Design/Live buttons are rendered in the toolbar. In Live view the Live segment gains a chevron and toggles a `role="dialog"` page manager for pick/add/rename/reorder. Switch state, dropdown visibility and page commands live in the pure `lib/viewSwitch.ts` helpers (no new dependencies) so they can be unit-tested without DOM; the UI routes changes through the existing store `setLivePages`/`selectLivePage` actions and project history. `selectLivePage` still clears `activeLiveValues`; item 7.2 will revisit that behaviour. Visual comparison with the supplied reference screenshot cannot be performed by this model and is recorded on Needs Jake. Tests: tests/viewSwitch.test.ts.

### 2.4b Playback-only bottom panel
The initial 2.4b implementation put scene launch tiles in Design and was corrected by Jake in 2.4c: Design now hosts fixture programming and scenes launch from Live. The stable chrome remains Master, content and shortcuts, with the small divider switch and Live page manager as navigation. Camera footage visible in the mzx reference frames was deliberately ignored. No dependencies were added. Tests: `tests/bottomPanel.test.ts`, `tests/viewSwitch.test.ts`.

### 2.4c Jake correction: Design programming and Live scenes
Jake's desktop test clarified that the Design bottom surface is for fixture programming, while scene launch buttons belong to Live. `BottomPlayback` now mounts the existing fixture controls in Design and shows global scene launch buttons above current-page custom controls in Live. The divider Edit action in Live opens the full page editor immediately in edit mode; its add row can create a button from any existing scene or add a custom cue, cuelist, label or frame. This reuses existing show fields and store history, so no migration or dependency is needed.

### 6.13 Preset palette JSON export/import
`lib/presetPaletteIo.ts` exports a versioned document (`openlights-preset-palette` v1) carrying presets plus a fixture descriptor (name, profileId/profileName, legacy type) for every referenced fixture id. Import matches each descriptor to a target fixture by case-insensitive name and profile (profile id first, then profile name, then legacy type; name-only when no profile info exists), re-maps preset fixtureValues and fan fixtureIds, and drops fans left with no fixtures. Unmatched fixtures are returned in a `skipped` list and passed to an `onSkip` callback so the UI logs them; imported presets get fresh ids by default (with `preserveIds`/`makeId` options for deterministic round trips). No new dependencies; uses `structuredClone`. The palette UI in `LiveWorkspace.tsx` gained Export/Import JSON buttons wired through `updateProject`, so imported presets enter project history. Tests: tests/presetPaletteIo.test.ts.

### 6.14 Scene to preset conversion
`shared/sceneConversion.ts` converts every `SceneDef` into an equivalent `PresetDef` by deep-copying `fixtureValues` and `fans` verbatim (so `computeSceneChannels` yields byte-identical DMX at any master level) and inferring a palette category from the most common attribute property type in the patch profiles (tie-break intensity → color → position → other). The generated id is stable (`preset-from-scene:<sceneId>`), making the conversion idempotent when merged by id. Scene `fadeMs`/`blackout` have no preset equivalent; fade time is a Live page concern and blackout is a playback flag, so they are intentionally not carried over — DMX values are unaffected. The store action `convertScenesToPresets` appends only not-yet-present presets and keeps all original scenes (non-destructive until 8.9); a "Convert scenes" button in the Live palette exposes it. Tests: tests/sceneConversion.test.ts, tests/store.test.ts.

### 7.2 Live page active state and crossfade
`lib/pageSwitch.ts` holds the pure switch logic: leaving a page stores its active cue levels in a runtime `pageActiveValues` map (not persisted), returning restores them, and the new optional show field `deactivateOnPageSwitch` (default false = restore) makes switching release and forget levels instead. `selectLivePage` now uses this helper rather than clearing `activeLiveValues`; `setShow` resets the map, `setLivePages` prunes deleted pages and `clearLiveValues` forgets the current page's levels. The crossfade is the existing `configureLiveOutput(patch, pageFade)` path in `App.tsx`, which uses the incoming page's `fadeMs` on a page change; blackout stays authoritative in `composeOutput` and `setShow` cancels any in-flight live fade. `deactivateOnPageSwitch` is additive/optional so legacy shows are unaffected (no data dropped). Tests: tests/pageSwitch.test.ts, tests/pageFade.test.ts, tests/store.test.ts.

### 7.5 Live page multi-select and multi-object commands
`lib/livePageObjects.ts` holds the pure logic over all three object collections (cues, cue-list widgets, annotations): bounds for marquee hit-testing (with negative drag handled via min/max), immutable move/delete, and deep-copied clipboard with fresh-id paste/duplicate. Selection (`selectedPageObjects`) and clipboard (`pageClipboard`) are runtime store state, not persisted. Shift-click toggles a ref; clicking an already-selected object keeps the group so a drag moves them all (the dragged object is previewed, all selected objects get the same snapped delta). Dragging on empty page space draws a marquee and selects intersecting objects. Delete, Duplicate, Copy and Paste are exposed as buttons and via Del / Ctrl+C / Ctrl+V / Ctrl+D (Windows convention per the project rules); Escape clears the selection. The four show-mutating commands are in the history/lock-gated command list so they undo/redo as one step; deleting cues also prunes their `activeLiveValues` and per-page remembered levels, and undo/redo clears the now-stale selection. No new dependencies. Tests: tests/livePageObjects.test.ts, tests/store.test.ts.

### 7.6 Live object resize and inline rename
`shared/liveObjectDefaults.ts` holds the shared size defaults (cue 160×90, cue-list 240×120, label 160×40, frame 360×200) and `clampLiveSize`, which keeps a dimension in 40–900px and snaps to the 10px grid. `LiveControl` and `cueListWidgets` gained optional `width`/`height`; annotations already had them. `migrateShow` fills defaults for legacy cues/widgets additively (existing valid sizes kept, no `schemaVersion` bump) so opening an older show never drops sizes. `lib/livePageObjects.ts` adds pure `objectSize`/`resizeObject`/`renameObject`; `positionedObjects` now reads the stored sizes (this widened the cue-list default from 160 to 240 to match its real rendered width). Store `resizePageObject`/`renamePageObject` are history/lock-gated like the other object commands, so resize and rename undo/redo as single steps. In the UI a resize handle appears on the bottom-right corner of the single selected object during edit mode; double-clicking a cue or annotation (or using the width/height/text fields in the inspector) renames it inline. Cue-list widget names come from their cue list, so they are resize-only. No new dependencies. Tests: tests/livePageObjects.test.ts, tests/migrations.test.ts, tests/store.test.ts.

### 7.7 Attaching page objects
Objects gained an optional `attachedTo` field holding the id of another object on the same page (IDs are unique per page). It is additive and survives migration like the size fields. `lib/livePageObjects.ts` adds `setAttachment` (rejects self/self-cycle and attaching to a descendant, accepts null to detach), `withAttached` (transitive, visited-set cycle-safe expansion) and `objectLabel`. `moveObjects` now expands the moving set through `withAttached`, so dragging a frame carries attached buttons and chains of buttons attached to other buttons. Deleting an object clears `attachedTo` on survivors that pointed at it; copy/paste and duplicate remap `attachedTo` to the copied ids when the target is in the same clipboard, otherwise keep the original target. Store `attachPageObject` is history/lock-gated; the "Attached to" select in each inspector exposes it. No new dependencies. Tests: tests/livePageObjects.test.ts, tests/store.test.ts.

### 7.8 Text styles and defaults for new objects
`LiveObjectStyle` (font size, bold, italic, colour, alignment) is optional on cues, cue-list widgets and annotations; `LivePage.defaultStyles` holds per-kind (`cue`/`list`/`label`/`frame`) overrides. `shared/liveObjectDefaults.ts` has built-in `DEFAULT_OBJECT_STYLES` and `styleFor`, which merges built-in → page defaults → the object's own style. New objects are built by pure `newCueObject`/`newWidgetObject`/`newAnnotationObject` factories (also the single source of the size defaults), so a test can assert they inherit the defaults. `migrateShow` fills styles additively for older shows using the same `styleFor`, keeping any existing fields and introducing no schema bump. The store's `setPageObjectStyle` is history/lock-gated; the inspector exposes the format fields and a "Default styles for new objects" editor, and the page renders the resolved font weight/style/size/colour/alignment. No new dependencies. Tests: tests/livePageObjects.test.ts, tests/migrations.test.ts, tests/store.test.ts.

### 7.9 Frame exclusivity and modifiers
Frames (frame-typed annotations) gained an optional `FrameConfig`: `exclusive`, `intensity` and `speed`, all percentages/flags filled additively by `migrateShow` (exclusive false, intensity/speed 100%, no schema bump) using `frameConfigFor`/`clampModifier` in `shared/liveObjectDefaults.ts`. The new pure `lib/liveFrames.ts` decides frame membership geometrically by the cue's centre (a cue belongs to the first frame whose bounds contain it), then provides `exclusiveSiblings`, `frameIntensity`/`frameSpeed`, `effectiveLiveLevel`, `liveOutputLevels` and `liveFadeMs`. `setLiveValue` clears sibling levels when a cue in an exclusive frame is activated (deactivation to 0 and non-exclusive frames are untouched), mirroring the preset-group release model. `getLiveOutputLevels` returns raw cue levels with frame intensity applied (0–255 clamped); `App.tsx` feeds those into the live DMX layer instead of the raw values, so intensity genuinely scales output. `liveFadeMs` scales the page-switch fade by the slowest active frame's speed (200% halves, 50% doubles); at the default 100% it is a no-op, so existing shows are unaffected — this is the closest available "shared speed" hook because fades are applied to the whole live layer, not per cue. Store `configureFrame` is history/lock-gated and exposed as an "Exclusive / Intensity % / Speed %" inspector on frames. No new dependencies. Tests: tests/liveFrames.test.ts, tests/store.test.ts, tests/migrations.test.ts.

### 7.10 Dragging presets and sequences onto the Live page
`LiveControl.sequenceIds` is optional and migration fills it additively (empty array, no schema bump). The new pure `lib/liveDrops.ts` owns the whole operation: `LIVE_DROP_MIME` carries an encoded `{ presetIds, sequenceIds, presetNames?, sequenceNames? }` payload (the legacy single-preset MIME is still written and read), `normalizeDropPayload` deduplicates ids, `dropLabel` derives a readable cue name, and `applyLiveDrop` handles the three targets — `page`/`frame` create a new cue (frame drops clamp the cue centre inside the frame so the 7.9 geometric membership still applies), `cue` merges ids into an existing cue without duplicates. All three are covered by tests with the logic outside the JSX. Holding Ctrl on Windows (the guide's Command key) passes `split`, creating one cue per dragged item in a grid; this is also pure and tested. The store action `dropOnLivePage` is history/lock-gated and sets the new/updated cue as the selection. `App.tsx` unions `activeSequenceIds` with `activeCueSequenceIds(show?.livePages, activeLiveValues)` so sequences on lit cues run and stop with the cue; the effect loop's existing start/stop bookkeeping handles the rest. The palette now click-selects multiple presets and has a draggable Sequences row; the cue inspector also lists sequences so dropped items can be removed. No new dependencies. Tests: tests/liveDrops.test.ts, tests/store.test.ts, tests/migrations.test.ts."

### 7.11 Selection-driven Live inspector
`lib/liveInspector.ts` is the single field-schema contract for page, cue, cuelist, frame and label selection. Live edit mode now presents one labelled inspector after the canvas; with no object selected it edits page name/fade, while object selection presents the existing type-specific contents, style, attachment and frame controls in that same region. The schema is pure and independently tested, which keeps later cue-option additions explicit. No persisted shape changed and no dependency was added. Tests: `tests/liveInspector.test.ts`.

### 8.2 Cue contents
Cue content changes use a pure command reducer for preset and sequence references plus per-fixture ad-hoc values. The store action is history- and lock-gated. The Live inspector displays all three content groups, including numeric editing and individual removal of ad-hoc properties. Values clamp to DMX byte range; unrelated properties remain untouched. No show-format change or dependency was needed. Tests: `tests/cueContents.test.ts`, `tests/store.test.ts`.

### 8.3 Cue timing and fade curves
Cues now store delay, independent fade-in/fade-out durations and a curve name. Migration fills legacy cues additively with zero-duration linear timing. The pure evaluator covers linear, quadratic ease-in/out, combined ease-in-out and smooth S-curve interpolation, including delayed activation and release. Timing edits are history/lock-gated and exposed with cue contents. No dependency was added. Tests: `tests/fadeCurves.test.ts`, `tests/store.test.ts`, `tests/migrations.test.ts`.

### 8.4 Cue appearance and release behaviour
Cue appearance stores an OpenLights colour and a release-others flag; the existing cue name remains its editable label and existing type remains toggle/flash/fader. Legacy controls gain neutral colour and disabled release-others additively. Activating a release-others cue clears the other controls on its page before frame exclusivity is applied. The Live playback surface uses the stored colour. Tests: `tests/store.test.ts`, `tests/migrations.test.ts`.

### 8.5 Cue modifiers
Each cue has live intensity, speed and size percentages (0–200, legacy default 100). Cue intensity multiplies the control level before its containing frame's intensity, so both modifiers compose and clamp to one DMX byte. Speed and size are persisted and exposed for downstream sequence/effect and movement consumers. Tests: `tests/liveFrames.test.ts`, `tests/store.test.ts`, `tests/migrations.test.ts`.

### 8.6 Cue priority
Active Live controls are merged in ascending explicit priority and then activation order, making the last activated cue win where priorities are equal and a higher configured priority win regardless of activation time. Activation order is runtime-only; priority is additive persisted data with legacy default zero. Tests: `tests/cuePriority.test.ts`, `tests/store.test.ts`, `tests/migrations.test.ts`.

### 8.7 Live cuelist editing
The selected Live cuelist widget exposes add/remove/reorder/copy/paste, scene reassignment and name filtering. Pure immutable commands back the history/lock-gated store action. A separate status helper resolves current, next (including loop wrap) and remaining fade+hold time without UI timing assumptions. Tests: `tests/cueListEditing.test.ts`, `tests/store.test.ts`.

### 8.8 Cuelist playback
The existing Go/Back/direct jump, follow timer and loop behavior remain the playback authority. Follow timers are revision-keyed so a jump during an active fade/hold cancels the stale advance. Cue steps can share an optional group id. The Live cuelist transport now exposes a runtime-only manual crossfade position; the pure channel blender defines the exact 0–1 mix and is tested at 50%. Tests: `tests/cuePlaybackClock.test.ts`, `tests/cueListPlayback.test.ts`, `tests/store.test.ts`.
