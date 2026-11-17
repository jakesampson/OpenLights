# Engineering notes

## Decisions

### 0.2 Audit
The audit uses one row per checklist index entry. Partial means code exists but full guide behaviour has not been verified. USB diagnostics and the audio timeline are explicit retained exceptions.

### 0.3 Coverage
Documentation-only setup does not change runtime behaviour. Existing tests and the documentation contract test provide validation.

## Deviations from the guide

Windows conventions replace macOS commands. Network outputs and other exclusions follow the checklist.

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
