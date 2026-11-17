# Lightkey workflow audit

Reference: `Lightkey-User-Guide.pdf`, repository edition (351 pages). This is a source-code audit against the checklist section index; visual and hardware parity remain unverified. File paths below are relative to `src/renderer/src/` except `shared/` paths, which are relative to `src/`. No area is labelled matching solely because a similar control exists.

| Guide section | Printed page | OpenLights status | Files involved | Gap |
|---|---|---|---|---|
| 2: Intro to DMX: Connect your fixtures / DMX interfaces / Fixture addresses | 15 / 19 / 20 | partial | shared/dmx.ts; components/DmxConnection.tsx | USB setup exists; address validation and profile-based fixture workflows incomplete. |
| 4: Set up your lights: Create a project, Choose output, Patch fixtures, Build the Preview, Group fixtures, Beam directions, Beam colours | 26 to 37 | partial | components/ProjectBar.tsx; components/PatchPanel.tsx; components/StagePreview.tsx | Setup is spread across panels; no coherent setup assistant. |
| 5: Projects: Create, Open/close, Rename/save a copy, Manage, Search, Undo | 39 to 44 | partial | components/ProjectBar.tsx; stores/showStore.ts | Search, undo, dirty tracking and lifecycle prompts incomplete. |
| 6: Lightkey window: Toolbar, Customise, Full screen, Live windows, Adaptive background, Lock, Shortcuts | 45 to 51 | partial | App.tsx; lib/adaptiveBackground.ts | Panel customisation, Live windows, locking and complete shortcuts missing. |
| 7: Preview: Zoom, Edit objects (select, move, align, space, resize/rotate), Edit fixtures (size, names, beam direction/colour, options, group, locate, add/remove), Shapes/images/text, Fixture Storage | 52 to 70 | partial | components/StagePreview.tsx; lib/trussGeometry.ts | Basic fixtures and trusses work; storage, marquee, shape styling and precise object tools incomplete. |
| 8: Fixture properties: Select fixtures, Select light beams, Properties, Dimmer/Master, Colour, Colour Wheel, Gobo Wheel, Position, On/Off, Shutter/Strobe, Movement Speed, Prism, Focus, Zoom, Iris, Frost, Fog, Custom, Lamp, Command, Defaults, Copy/paste, Overridden, Clear, Undo, Fanning | 71 to 122 | partial | components/DesignTab.tsx; lib/automationRuntime.ts | Hard-coded channels limit supported controls; fanning, fine position and selective property release missing. |
| 9: Presets and sequences: Create/view/activate/edit preset, Overridden properties, Preset groups, Create/view/run sequence, Order, Reorder steps, Timing (manual, beat), Movements, Organise, Split palette, Filter, Related cues, Export/import | 124 to 144 | partial | components/PresetEditor.tsx; stores/showStore.ts | Basic presets exist; editable sequences, nesting and palette exchange missing. |
| 10: Effects: Pattern/Curve/Movement, Add, Edit, Timing, Fixture order, Pattern types (Chase to Snakes), Curve, Movement paths, Copy/paste, Delete, Overlay, Templates | 146 to 174 | partial | components/EffectsPanel.tsx; lib/effects.ts | Global waveform effects only; ownership, pattern templates and movement path editor missing. |
| 11: Live control: Pages, Build pages (cue buttons, frames, labels, select/move/attach/resize/rename/duplicate/copy/delete, formatting, default styles, frames, cuelists), Edit cuelists (add, groups, timing, playback selection, organise, copy/paste, filter), Cue contents and options (contents, ad hoc, timing, appearance, modifiers, fade curves), Live control with buttons and cuelists, Blind, Freeze, Startup state, Output precedence | 176 to 223 | partial | components/LiveWorkspace.tsx; lib/output.ts | Page canvas and basic controls exist; inspectors, full cue model, list editing, blind/freeze and page state restoration incomplete. |
| 12: Beat control: Sequences, Effects, Beat grid (tap, exact, MIDI clock, Ableton Link, OS2L), Examples | 225 to 235 | partial | lib/tapTempo.ts; lib/bpm.ts | Tap and manual BPM exist; MIDI clock, beat grid and sequence timing missing. |
| 13: Manage DMX fixtures: Find profile, Filter library, Add, Edit (info, address/universe, duplicate, edit/reassign profile, disable, delete), Export/import, Print, Fixture profiles (favourites, edit, import, create, duplicate, delete) | 237 to 252 | partial | components/PatchPanel.tsx; shared/types.ts | Basic built-in fixture selection only; profile editor, library search and bulk patching missing. |
| 14: DMX output and input: Output settings, Serial/Open DMX USB, other USB, (Art-Net, sACN, ESP Net, OLA: out of scope), Universes, Monitor output | 253 to 265 | partial | components/DmxConnection.tsx; components/DmxMonitor.tsx | USB output and test exist; reconnection and labelled monitor need verification; network output excluded. |
| 15: Smart lights (out of scope) | 267 to 276 | out of scope | None | Smart-light integrations excluded by project scope. |
| 16: External control: Quick assign, External Control window (configurations, MIDI inputs, bindings, triggers, actions, shift, notes), Live Triggers, ProPresenter, Send MIDI, MIDI routing, OSC, VirtualDJ, Log, macOS shortcuts, Multi-Touch | 277 to 322 | partial | components/MidiPanel.tsx; lib/midi.ts | Limited MIDI mappings; unified bindings/actions/learn incomplete; other integrations excluded. |
| App. 1: Shortcuts and gestures (general, projects, editing, view, setup assistant, preview editing, preview, Design view, Preset Palette, Live) | 324 to 351 | partial | App.tsx | Scattered shortcuts; a shared command table and full focus guards missing. |

## OpenLights-specific workflows

| Feature | Status | Recommendation | Reason |
|---|---|---|---|
| Audio automation timeline | OpenLights-only | Keep | Explicit checklist exception; retain existing shows and audio workflows. |
| Scenes & cues editor | OpenLights-only | Retire after migration | Move authoring into presets, sequences and Live inspectors before removal. |
| Separate MIDI panel | partial | Merge | Keep MIDI support, move toward unified binding, trigger and action configuration. |
| DMX test panel | partial | Keep | Necessary USB diagnostics; retain independently of cue programming. |

## Verification

Every row corresponds to a row in the checklist Guide section index. More granular acceptance criteria live in the numbered checklist items. Needs Jake contains visual, hardware and interaction verification.
