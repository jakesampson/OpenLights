# Lightkey workflow audit

Reference: `Lightkey-User-Guide.pdf`, repository edition (351 pages). This is a source-code audit against the checklist section index. Visual and real-hardware parity remain human checks in **Needs Jake**. Paths are relative to `src/renderer/src/` except `shared/`, which is relative to `src/`. “Implemented in scope” excludes integrations the roadmap explicitly rules out.

| Guide section | Printed page | OpenLights status | Evidence | Remaining gap |
|---|---|---|---|---|
| 2: Intro to DMX | 15 / 19 / 20 | implemented; hardware check pending | `shared/dmx.ts`; `components/DmxConnection.tsx`; patch validation | Real Open DMX USB fixtures and reconnect need Jake. USB only; network DMX is excluded. |
| 4: Set up your lights | 26 to 37 | implemented; visual check pending | `ProjectBar.tsx`; `PatchPanel.tsx`; `StagePreview.tsx`; setup/project tests | Final desktop flow and visual comparison need Jake. |
| 5: Projects | 39 to 44 | implemented in scope | `ProjectBar.tsx`; `ProjectSearch.tsx`; `showStore.ts`; lifecycle/history tests | Real existing-show reopen remains a Jake data-safety check. |
| 6: Lightkey window | 45 to 51 | implemented; visual check pending | `App.tsx`; `WorkspaceToolbar.tsx`; `ViewSwitch.tsx`; menus, windows, lock and shortcut tests | Windows native chrome, multi-window and lock-machine checks need Jake. |
| 7: Preview | 52 to 70 | implemented; visual check pending | `StagePreview.tsx`; `StageObjects.tsx`; geometry/viewport/selection tests | Image/shape rendering and precision need final desktop comparison. |
| 8: Fixture properties | 71 to 122 | implemented in scope | `DesignTab.tsx`; property controls; profile-driven runtime; fanning/default/override tests | Breadth depends on fixture profile definitions; real fixture behaviour needs hardware checks. |
| 9: Presets and sequences | 124 to 144 | implemented in scope | active preset/sequence surfaces; palette exchange; sequence timing/movement tests | Desktop usability and real-show palette exchange remain Jake checks. |
| 10: Effects | 146 to 174 | partial | `lib/effects.ts`; ownership, patterns, curves, movement paths, templates and layering tests | Engine/model parity is present, but a unified visual pattern/curve/path editor is still missing. |
| 11: Live control | 176 to 223 | implemented; interaction check pending | `LiveWorkspace.tsx`; `BottomPlayback.tsx`; cue/page/frame/list/output tests | Dense drag, resize, attachment, formatting and playback interactions need Jake click-through. |
| 12: Beat control | 225 to 235 | implemented in scope | `beatGrid.ts`; `tapTempo.ts`; MIDI 24-PPQ and phase tests | Ableton Link and OS2L are explicitly out of scope. |
| 13: Manage DMX fixtures | 237 to 252 | implemented in scope | `PatchPanel.tsx`; `FixtureProfileEditor.tsx`; import/export/print/profile tests | Manufacturer-library breadth and real fixture profiles remain ongoing data work. |
| 14: DMX output and input | 253 to 265 | implemented in scope; hardware check pending | USB serial engine, reconnect, output settings, monitor and test panel | Real Open DMX USB output needs Jake; Art-Net/sACN/OLA/network DMX are excluded and have no runtime path. |
| 15: Smart lights | 267 to 276 | out of scope | None | Smart-light integrations excluded by project scope. |
| 16: External control | 277 to 322 | partial | `MidiPanel.tsx`; `midi.ts`; mapping migration, learn, trigger and action tests | MIDI configurations, shift layers, routing/send/log remain; OSC, ProPresenter and VirtualDJ are out of scope. |
| App. 1: Shortcuts and gestures | 324 to 351 | partial | `shortcuts.ts`; `menuModel.ts`; focus guards and accessibility/menu tests | Lightkey's full gesture catalogue is broader; implemented commands are tested and shared by menus. |

## OpenLights-specific workflows

| Feature | Status | Decision | Reason |
|---|---|---|---|
| Audio automation timeline | retained | Keep | Explicit roadmap exception; retains existing shows and audio workflows. |
| Scenes & cues editor | retired | Removed after migration | Presets, sequences and Live inspectors own authoring; legacy scene/cue data remains readable and non-destructively convertible. |
| MIDI panel | merged | External Control surface | MIDI devices, learn, bindings, triggers and actions share one surface. |
| DMX test panel | retained | Keep | Required for USB-only diagnostics independently of cue programming. |

## Verification

Every guide-index row is current as of roadmap 10.5. No row is marked matching merely because a similar control exists. Automated evidence is referenced in the checklist; visual, interaction, existing-show and hardware verification remains in **Needs Jake**.
