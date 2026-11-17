# Lightkey interface and workflow roadmap

Goal: align OpenLights' main user interface and user workflows with the Lightkey user guide. Use the guide as the acceptance reference, and preserve existing show data during migration. Windows interaction conventions and USB DMX support remain necessary platform adaptations.

Reference: https://www.lightkeyapp.com/media/pages/help/manual/0def2c007d-1793179423/Lightkey%20User%20Guide.pdf
Feature inventory: https://lightkeyapp.com/en/specs

## Delivery rules

- Compare each area with the guide and record its specific behaviour before implementation. The list below is a roadmap, not a claim that every subsection has already been audited.
- Replace OpenLights-only user-facing workflows when a corresponding Lightkey workflow is available. Audit and remove obsolete controls after their replacement works; retain migration code for existing shows.
- USB DMX is the current output scope. Do not reintroduce Art-Net as part of interface parity.
- Test actual DMX output, project save/reopen, blackout, undo where applicable, keyboard and pointer interactions. Exercise the desktop app as well as automated tests.
- Keep existing projects usable: migrate legacy scenes, cue lists, trusses and pages without silently discarding data. Document any remaining mismatch.

## 1. Foundation and output behaviour

- [ ] Inventory every screen, command and settings page against the guide; mark each as matching, partial, missing, or OpenLights-only. Include guide section and verification evidence.
- [ ] Define a consistent output model for cues, presets, sequences, overrides, effects, master and blackout. Ensure deterministic precedence and release.
- [ ] Restore each page's active cues when returning by default, with an option to deactivate on switching. Crossfade outgoing and incoming page output; verify interruption, blackout and project changes.
- [ ] Implement undo/redo and safe save/open migration for new editing actions. Validate old show files and round trips.

## 2. Main window and preview

- [ ] Match main toolbar, menus, Design/Live switch, inspectors, panels, selection feedback and keyboard shortcuts; adapt shortcuts to Windows.
- [ ] Implement fixture selection, grouping, positioning, alignment, sizing, zoom and visual feedback as described in the guide.
- [ ] Complete preview layout editing, stage objects, labels and fixture representations. Preserve existing truss layouts while using the guide to determine equivalent controls.
- [ ] Support locking and operator-facing views as described in the guide.

## 3. Fixtures and patching

- [ ] Match fixture patch and setup workflows, including address, mode, quantity, conflicts, replacement and fixture options.
- [ ] Provide fixture profile creation/editing and supported imports; validate channel properties and meaningful fixture controls.
- [ ] Implement fixture grouping, selection, ordering and property handling, including multi-beam where supported by the model.
- [ ] Keep USB interface selection, reconnection and DMX testing functional as platform-specific necessities.

## 4. Design and presets

- [ ] Align Design controls, property panels, colour, dimmer, position and other fixture-specific controls with the guide.
- [ ] Implement manual overrides with visible property-level status, selective release, clear precedence and accurate preview.
- [ ] Create, edit, duplicate, organize, import and export presets; support nested groups and mutual exclusion.
- [ ] Add sequences with editable steps, fade/hold times, playback modes and beat timing. Retain existing presets and scenes through migration.

## 5. Live page editing

- [ ] Implement page manager, inspector, ordering, duplication, page fade and the documented active-state behaviour.
- [ ] Add cue, frame and cuelist inspectors; add selection, multiselect, copy/paste, alignment, snapping, resize and arrangement commands.
- [ ] Support preset/sequence drag-and-drop to pages, frames, cue buttons and inspectors, including the guide's multi-item operations.
- [ ] Complete labels and frames, button styling, attachment, exclusive groups and frame modifiers.
- [ ] Implement split Live views, additional windows, page priorities and window restoration where feasible on Windows.

## 6. Cue and cuelist workflows

- [ ] Build cues from presets, sequences and ad-hoc properties, with editing, ordering, priority, fades and modifiers.
- [ ] Support toggle, flash and fader behaviour, visual feedback, grouping and safe release.
- [ ] Edit cue lists directly in Live: insert, remove, reorder, copy, rename and inspect cues; show current/next cues and timing.
- [ ] Add auto-advance, looping, manual crossfade and documented list options. Ensure page switching and cue-list state behave consistently.
- [ ] Replace the separate Scenes & cues workflow once the guide's equivalent workflows cover existing capabilities; migrate existing content.

## 7. Effects, timing and operation

- [ ] Match effect creation/editing, property and fixture targeting, templates, timing, phase, ordering and layering.
- [ ] Support beat controls, tap tempo, timing multipliers and documented cue/effect modifiers.
- [ ] Implement blind mode and freeze/resume with clear live-output indicators.
- [ ] Add documented playback shortcuts and external-control workflows appropriate to supported hardware.

## 8. Settings, help and finish

- [ ] Audit project creation, opening, saving, recovery and naming against the guide.
- [ ] Match relevant preferences, timing defaults, appearance, menus, context menus, tooltips and accessibility.
- [ ] Remove or consolidate redundant OpenLights-only panels and controls after migration and validation; retain USB-specific configuration.
- [ ] Run a guide-section acceptance pass, desktop interaction checks, project compatibility tests and an Enttec Open DMX USB fixture test. Record known gaps rather than marking partial features complete.

## Immediate next implementation

1. Audit the Live page editor and output model against the guide, including active-page restoration and fade behaviour.
2. Implement cue and cuelist inspectors and editing in Live, with automated output and persistence tests.
3. Add sequences and migrate scene-based cues before retiring the separate Scenes & cues editor.
