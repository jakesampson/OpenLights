import type { FanDef, FaderControlProperty, FrameConfig, LiveControl, LiveObjectStyle, SpeedModifierAspect } from '@shared/types'
import { cuesToPresets } from '@shared/cueConversion'
import { resolveCue, resolveCueValues, fanPresetFixtureValues } from '@shared/cueResolution'
import { fanColourToBeams } from '@shared/fixtureProfiles'
import { prunePageValues, switchLivePage, type PageActiveValues } from '../lib/pageSwitch'
import { exclusiveSiblings, frameForCue, frameMembers, liveOutputLevels, setFrameConfig, touchingGroupSiblings } from '../lib/liveFrames'
import { orderedLiveControls } from '../lib/cuePriority'
import { isLatchingControl } from '../lib/liveControlBehavior'
import { applyLiveDrop, normalizeDropPayload, type LiveDropPayload, type LiveDropTarget } from '../lib/liveDrops'
import { applyCueContents, applyCueDefContents, type CueContentsCommand } from '../lib/cueContents'
import { editCueList as applyCueListCommand, type CueListCommand, nextListCueName, renumberCueNames, addCueListGroup as buildCueListGroup } from '../lib/cueListEditing'
import { manualCrossfade, manualCrossfadeNextIndex, manualCrossfadeProgress, nextEnabledIndex } from '../lib/cueListPlayback'
import { stepFrame } from '../lib/frameStepping'
import {
  copyObjects, deleteObjects, duplicateObjects, isClipboardEmpty, moveObjects, newCueObject,
  objectsInRect, pasteObjects, renameObject, resizeObject, resizeObjectTo, setAttachment, setObjectStyle,
  type PageClipboard, type PageObjectRef, type Rect
} from '../lib/livePageObjects'
import { addOverridesTargetIds } from '../lib/liveOverrideTargets'
import { evaluateFan } from '../lib/fanning'
import { matchesPresetCategory } from '../lib/presetProperties'
import { autoPresetName, derivePresetCategory, uniquePresetName } from '../lib/presetAutoName'
import { sequenceOrder } from '../lib/sequenceClock'
import type { PresetGroup } from '@shared/types'
import type { SequenceDef, SequenceStep } from '@shared/types'
import { syncPresetGroups, activateGroupedPreset } from '../lib/presetGroups'
import { resolvePaletteDrop, type PaletteDragItem } from '../lib/paletteDrop'
import { create } from 'zustand'
import { CURRENT_SCHEMA_VERSION, migrateShow } from '@shared/migrations'
import { homeFixtureValues } from '../lib/calibration'
import type { WizardStep } from '../lib/setupWizard'
import type { ShowTemplate } from '../lib/templates'
import { nextGroupName } from '../lib/fixtureGroups'
import { sanitizeStageObjectPatch } from '../lib/stageObjectGeometry'
import { locateFixturePatch } from '../lib/locateFixtures'
import { configureLocateOutput } from '../lib/output'
import type {
  AutomationDef,
  CueListDef,
  CueStepDef,
  EffectDef,
  FixtureDef,
  FixturePreset,
  MidiMapping,
  MovementPathDef,
  PresetDef,
  PresetCategory,
  PreviewTruss,
  CueDef,
  ShowDef
} from '@shared/types'
import type { LivePage } from '@shared/types'
import type { StageObject } from '@shared/types'
import type { FixtureProfile } from '@shared/types'
import { allocateFixtures, type PatchOptions } from '../lib/patch'
import { instancePositions, landingPositions } from '../lib/previewLayout'
import { proposeShortName } from '@shared/shortNames'
import { validateProfile } from '@shared/profileValidation'
import { BUILTIN_PROFILES } from '@shared/fixtureProfiles'
import { fixtureMode } from '@shared/fixtureProfiles'
import { canParentGroup, moveFixturesToGroup, syncFixtureGroups } from '../lib/fixtureGroups'
import { mixColor, baseColorChannels, colorChannels, normalizeColorFavorite, type RgbColor } from '../lib/colorMix'
import { mapCopiedProperties } from '../lib/copyProperties'
import { releaseOverrides } from '../lib/propertyOverrides'
import { computeCueChannels, fixtureAttributes } from '../lib/automationRuntime'
import { completePresetBaseColour } from '../lib/presetColor'
import { effectiveIntensityLevels, liveIntensityLevels, resolvedActiveCueValues, withEffectiveIntensity } from '../lib/effectiveIntensity'
import { allZeroPatch, completedSequenceIds, getCurrentPatch, getEffectTime, sendChannels, sendImmediate, setBlindOutput, setFreezeOutput, setHighlightOutput, setEffectBlackout, configureSequences, configurePresetOutput, configureLiveOutput, configureOverrideOutput, suppressPresetsForCue, patchBrightness, lerpLevels, reassertBase } from '../lib/output'
import { resolveFadeMs, activeLivePageFadeMs } from '../lib/fadeTimes'
import { computeEffectPatch } from '../lib/effects'
import { fixtureChannelMap } from '@shared/fixtureProfiles'
import { LIVE_CUE_SIZE, LIVE_FADER_HORIZONTAL_SIZE, LIVE_FADER_VERTICAL_SIZE } from '@shared/liveObjectDefaults'

interface ShowState {
  locked: boolean
  lockApp: (passcode?: string) => void
  unlockApp: (passcode?: string) => boolean
  undoStack: ShowDef[]
  redoStack: ShowDef[]
  historyGrouping: boolean
  historyGroupRecorded: boolean
  beginHistoryGroup: () => void
  endHistoryGroup: () => void
  undo: () => void
  redo: () => void
  show: ShowDef | null
  cues: CueDef[]
  presets: PresetDef[]
  activeSequenceIds: string[]
  toggleSequence: (id: string) => void
  stopSequences: () => void
  activePresetIds: string[]
  activeLiveValues: Record<string, number>
  liveActivationOrder: Record<string, number>
  liveActivationCounter: number
  activeLivePageId: string | null
  pageActiveValues: PageActiveValues
  /** Live Edit mode for the active Live page (LightKey "Edit Live View"). UI-only state, like the page selection: it is not persisted in the show, not undo history, and it does not gate firing — cues fire the same in Live and in Edit (see LiveWorkspace). */
  liveEditing: boolean
  setLiveEditing: (editing: boolean) => void
  /** Alignment guides off (Video 2 Shortcuts panel, "A = Disable
   * alignment"): while off, dragging and resizing snap to the 10px
   * grid only, with no edge guides and no edge snapping. UI-only. */
  liveAlignmentOff: boolean
  setLiveAlignmentOff: (off: boolean) => void
  /** Preview edit mode (LightKey Guide p.53, "Edit the Preview"): the header Edit button toggles it, and the StagePreview becomes editable — fixtures and trusses can be moved, the grid is shown. UI-only state, like liveEditing: not persisted, not undo history. */
  previewEditing: boolean
  setPreviewEditing: (editing: boolean) => void
  /** Preview editing selection — also session-only. The right side panel
      becomes the Preview inspector in edit mode (LightKey's Inspector,
      Guide p.53), so the selection lives in the store where both the
      canvas (StagePreview) and the panel (PreviewEditPanel) can reach it. */
  selectedPreviewTrussId: string | null
  setSelectedPreviewTrussId: (value: string | null) => void
  selectedLayoutTrussIds: string[]
  setSelectedLayoutTrussIds: (value: string[]) => void
  selectedStageObjectId: string | null
  setSelectedStageObjectId: (value: string | null) => void
  selectedPageObjects: PageObjectRef[]
  pageClipboard: PageClipboard | null
  manualOverrides: Record<string, Record<string, number>>
  /** Fanned values saved in Design without a cue being edited ad-hoc
   * live here, beside the overrides they ride on (Guide ch.8, p.122:
   * fanned properties appear in Overrides) — session-only, never
   * persisted, so a fan stays re-editable from the Design panel without
   * minting a cue. A fan id lives in exactly one place: here, or on
   * the cue being edited ad-hoc (its `fans`). */
  manualFans: FanDef[]
  /** The OFL library as the main process last reported it (Jake,
   *  20 Nov 2026, image-18): the migration needs it to heal stale OFL
   *  fixture snapshots, and migrateShow cannot see the main process on
   *  its own. Loaded once at startup by App; not persisted in the show,
   *  not undo history. */
  oflProfiles: FixtureProfile[]
  setOflProfiles: (profiles: FixtureProfile[]) => void
  /** Counts the OFL heals that actually changed the open show's fixtures
   *  (Jake, 23 Nov 2026 — the quit hang): the heal is load-time
   *  normalisation, not a user edit, so ProjectBar re-bases the saved
   *  snapshot when this changes instead of marking the show Unsaved.
   *  Not persisted in the show, not undo history. */
  oflHealRevision: number
  automations: AutomationDef[]
  effects: EffectDef[]
  cueLists: CueListDef[]
  midiMappings: MidiMapping[]
  master: number
  blackout: boolean
  blind: boolean
  freeze: boolean
  /** Highlight Mode (Guide pp.32, 64): only the selected fixtures light
   *  up. Operator state, like blind/freeze: not persisted in the show,
   *  not undo history. */
  highlightMode: boolean
  /** Setup wizard (Piece 5, Guide ch.4 pp.26–37): the new-project flow —
   *  DMX Output, Fixture Patching, Build Your Preview, Fixture Groups,
   *  Light Beam Directions, That's It. Null when no wizard is running.
   *  UI-only state: not persisted in the show, not undo history. */
  setupWizardStep: WizardStep | null
  setSetupWizardStep: (step: WizardStep | null) => void
  startSetupWizard: () => void
  exitSetupWizard: () => void
  /** Group the current selection (Guide p.35: Layout > Group, or
   *  Control-click → Group). The name is the next free "Group N" —
   *  editable afterwards in the Fixture Groups panel. */
  groupSelection: () => void
  /** "Create Groups for Me" (video 06:30): the video's auto-grouping puts
   *  everything into one group — replicated, not improved. */
  createGroupsForMe: () => void
  /** Wizard Go! (video 09:30): applies the default home position with the
   *  lights on — a "Home" cue, created only when the show has no cues yet —
   *  activates it and exits the wizard to the Design view. */
  finishSetupWizard: () => void
  /** Project Browser (the welcome screen, Guide p.26): shown on launch,
   *  with Recent Projects and templates. UI-only. */
  welcomeOpen: boolean
  setWelcomeOpen: (open: boolean) => void
  /** New Project name dialog (Guide p.26: "Enter a name … then click
   *  Save"). UI-only. */
  newProjectDialogOpen: boolean
  setNewProjectDialogOpen: (open: boolean) => void
  /** The template a new project starts from, when the New Project dialog
   *  was opened from a template row. Null = a blank project (which runs
   *  the setup wizard); a template starts in the Design view directly. */
  newProjectTemplate: ShowTemplate | null
  setNewProjectTemplate: (template: ShowTemplate | null) => void
  bpm: number
  isPlaying: boolean
  activeCueId: string | null
  selectedFixtureIds: string[]
  selectedBeams: { fixtureId: string; beamId: string }[]
  selectFixtureBeam: (fixtureId: string, beamId: string, additive?: boolean) => void
  updateSelectedBeamValues: (values: Record<string, number>, manual?: boolean) => void
  /** Write values to one explicit beam of one fixture (beam 1's sliders):
   * the same beam mapping as updateSelectedBeamValues, without needing
   * that beam to be the current selection. */
  updateBeamValues: (fixtureId: string, beamId: string, values: Record<string, number>, manual?: boolean) => void
  activeCueListId: string | null
  activeCueIndex: number
  cuePlaying: boolean
  /** Playback paused (the ❚❚ transport button, Guide ch.11, p.218):
   *  the current cue stays lit but its hold time stops running. A Go,
   *  a jump or Stop clears it. Session-only, never persisted. */
  cuePaused: boolean
  cueRevision: number
  manualCrossfade: number
  /**
   * The Xfade slider end (0 or 1) that represents the current cue.
   * LightKey's slider alternates direction (Guide ch.11, p.219): it rests
   * at one end for the current cue and a drag to the opposite end
   * crossfades to the next cue, so the blend is the distance from this
   * end, not the raw position. Operator state, like `manualCrossfade`:
   * not persisted in the show, not undo history.
   */
  manualCrossfadeAnchor: number

  setShow: (show: ShowDef | null) => void
  updateProject: (patch: Partial<ShowDef>) => void
  updatePreferences: (patch: Partial<NonNullable<ShowDef['preferences']>>) => void
  setStartupMode: (mode: 'none' | 'restore') => void
  showForSave: () => ShowDef | null
  setLivePages: (pages: LivePage[]) => void
  setControlCue: (controlId: string, cueId: string | undefined) => void
  dropOnLivePage: (payload: LiveDropPayload, target: LiveDropTarget, split?: boolean) => void
  setLiveValue: (id: string, value: number) => void
  getLiveOutputLevels: () => Record<string, number>
  clearLiveValues: () => void
  selectLivePage: (id: string | null) => void
  setPageSwitchMode: (deactivateOnSwitch: boolean) => void
  setPageObjectSelection: (refs: PageObjectRef[]) => void
  togglePageObjectSelection: (ref: PageObjectRef) => void
  selectPageObjectsInRect: (rect: Rect) => void
  clearPageObjectSelection: () => void
  moveSelectedPageObjects: (dx: number, dy: number) => void
  resizePageObject: (ref: PageObjectRef, width: number, height: number) => void
  /** Resize anchored at any corner/edge (8-handle resize): the new
   * top-left as well as the size, so the opposite edge stays put. */
  resizePageObjectTo: (ref: PageObjectRef, x: number, y: number, width: number, height: number) => void
  renamePageObject: (ref: PageObjectRef, name: string) => void
  attachPageObject: (ref: PageObjectRef, targetId: string | null) => void
  setPageObjectStyle: (ref: PageObjectRef, patch: Partial<LiveObjectStyle>) => void
  configureFrame: (frameId: string, patch: Partial<FrameConfig>) => void
  editCueContents: (controlId: string, command: CueContentsCommand) => void
  /** The same contents commands against a cue definition — its preset /
   * sequence references and its own ad-hoc fixtureValues (Jake, 27 Nov
   * 2026: a button's Get Info list edits the CUE's ingredients). */
  editCueDefContents: (cueId: string, command: CueContentsCommand) => void
  /**
   * Promote a cue's / button's ad-hoc values to a reusable preset
   * (Video 2: right-click Ad hoc properties → Add to Palette): the
   * preset joins the cue's (or button's) contents and the ad-hoc values
   * are cleared, so the look is unchanged. Returns the new preset id,
   * or null when there was nothing to promote.
   */
  promoteAdHocToPreset: (source: { cueId: string } | { controlId: string }) => string | null
  /**
   * Add Previous/Next step buttons to a frame (Guide ch.11 p.188):
   * 'previous' / 'next' / 'both' create the small step buttons at the
   * frame's bottom edge; 'none' removes them.
   */
  configureFramePrevNext: (frameId: string, mode: 'none' | 'previous' | 'next' | 'both') => void
  /** Move a button out of its frame (LightKey's "Remove From Frame"):
   * it drops just below the frame, so frame stepping and the frame's
   * Previous/Next buttons no longer include it. No-op when the button
   * is not in a frame. */
  removeFromFrame: (controlId: string) => void
  /** Release the buttons / cues running sequences that have finished
   * their last pass (Video 2: run-once sequences auto-deactivate when
   * finished; looping ones never complete). */
  deactivateCompletedSequences: () => void
  configureCueTiming: (controlId: string, patch: Partial<NonNullable<LiveControl['timing']>>) => void
  configureCueAppearance: (controlId: string, patch: Partial<NonNullable<LiveControl['appearance']>>) => void
  /** Change a button's type (LightKey's Control Type menu, guide
   * p.204): Push Button, Fader Horizontal or Fader Vertical. The
   * button is released first, then the type is patched. Behaviour is
   * a separate field — see configureControlBehavior. */
  configureControlType: (controlId: string, type: LiveControl['type']) => void
  /** Change a Push Button's behaviour (LightKey's Behavior menu, guide
   * p.204): Toggle latches, Flash is momentary. The button is released
   * first, then the behaviour is patched. Faders have no behaviour. */
  configureControlBehavior: (controlId: string, behavior: NonNullable<LiveControl['behavior']>) => void
  /** Toggle one of LightKey's modifiers in the button's selected set
   * (guide ch.11, pp.205–207 — the Modifiers submenu). The selection
   * is what the menu proves; the Live-view value control and output
   * application are not built yet. */
  toggleCueModifier: (controlId: string, modifier: string) => void
  configureCueModifiers: (controlId: string, patch: Partial<NonNullable<LiveControl['modifiers']>>) => void
  /** Set a fader's Controls scope (LightKey guide ch.11, p.204): 'all'
   *  or the one property the fader value affects. */
  configureFaderControls: (controlId: string, controls: 'all' | FaderControlProperty) => void
  /** Set which aspects the Speed modifier affects (guide pp.206–207,
   *  the Speed modifier's Options menu). */
  configureSpeedModifierOptions: (controlId: string, options: SpeedModifierAspect[]) => void
  configureCuePriority: (controlId: string, priority: number) => void
  configureCueFrameStep: (controlId: string, action?: 'next' | 'previous') => void
  editCueListCommand: (listId: string, command: CueListCommand) => void
  deleteSelectedPageObjects: () => void
  duplicateSelectedPageObjects: () => void
  copySelectedPageObjects: () => void
  pastePageObjects: (dx?: number, dy?: number) => void
  setManualOverrides: (values: Record<string, number>) => void
  clearManualOverrides: () => void
  /** Release overrides: one property, a property group (several
   * attributes, e.g. a label row's Color = red/green/blue), or all
   * properties of the given fixtures (no property = all). */
  releaseManualOverrides: (fixtureIds?: string[], property?: string | string[]) => void
  /** Merge the current manual overrides into the ad-hoc properties of
   * the given cues / Live buttons (Guide ch.11, p.202, "Add Overrides").
   * ids omitted = resolve from the Live selection, else the active cue.
   * selectedOnly = Option held: only the selected fixtures merge. */
  addOverridesToCues: (ids?: string[], selectedOnly?: boolean) => void
  /** Whether the Preview shows the per-fixture override labels (the
   * white callouts LightKey shows when Overrides is toggled on). */
  showOverrideLabels: boolean
  setShowOverrideLabels: (visible: boolean) => void
  toggleOverrideLabels: () => void
  /** The preset whose saved values the Preview labels (LightKey's
   * per-fixture callouts, Guide ch.11 p.116) while it is selected in
   * the palette, or null. Set by clicking a preset row; cleared when
   * the selection moves away or the preset is deleted. */
  previewPresetId: string | null
  setPreviewPresetId: (id: string | null) => void
  /**
   * The contents row selected in a cue button's Get Info inspector
   * (Jake, 27 Nov 2026 — LightKey cue editing, Video 2): the palette
   * highlights the item and the Preview labels the fixtures its values
   * touch. Session-only, never persisted.
   */
  contentsPreview: { kind: 'preset' | 'sequence' | 'effect' | 'ad-hoc'; id: string; values: Record<string, Record<string, number>> } | null
  setContentsPreview: (preview: ShowState['contentsPreview']) => void
  /**
   * Ask the palette to reveal an item (Show in Palette): the panel
   * expands the group holding it and scrolls it into view. The nonce
   * makes a repeat reveal of the same item fire again.
   */
  paletteReveal: { kind: 'preset' | 'sequence' | 'effect'; id: string; nonce: number } | null
  setPaletteReveal: (kind: 'preset' | 'sequence' | 'effect', id: string) => void
  locateFixtures: (ids: string[]) => void
  setBpm: (bpm: number) => void
  setAudioPath: (path: string | null) => void
  setIsPlaying: (playing: boolean) => void

  setMaster: (value: number) => void
  setBlackout: (active: boolean) => void
  toggleBlackout: () => void
  setBlind: (active: boolean) => void
  toggleBlind: () => void
  setFreeze: (active: boolean) => void
  toggleFreeze: () => void
  setHighlightMode: (active: boolean) => void
  toggleHighlightMode: () => void

  selectFixture: (id: string, additive?: boolean) => void
  selectFixtures: (ids: string[]) => void
  groupSelectedFixtures: (name: string) => void
  createFixtureGroup: (name: string, parentId?: string | null) => string
  renameFixtureGroup: (id: string, name: string) => void
  parentFixtureGroup: (id: string, parentId: string | null) => void
  moveFixtureGroup: (id: string, direction: -1 | 1) => void
  removeFixtureGroup: (id: string) => void
  /** Dissolve every group containing a selected fixture (Layout >
   *  Ungroup / right-click → Ungroup, Guide p.64). The fixtures stay
   *  selected and become ungrouped; groups that contained no selected
   *  fixture are untouched. Unlike the Fixture groups panel's Delete
   *  (which removes one named group record), this works from the
   *  canvas selection. */
  ungroupSelectedFixtures: () => void
  updateSelectedFixtures: (values: Record<string, number>, manual?: boolean) => void
  setSelectedColor: (color: RgbColor, manual?: boolean) => void
  /** Set the base colour (the wheel's hue / saturation / brightness) on
      the selected fixtures, without touching White / Amber / UV / Lime:
      those are separate LEDs with their own sliders, and deriving them
      from the RGB makes the wheel's arcs move each other (Jake,
      19 Nov 2026). The centre picker still uses
      setSelectedColor, which applies a whole colour via mixColor. */
  setSelectedBaseColor: (color: RgbColor, manual?: boolean) => void
  /** Store each selected fixture's current colour as its default colour
      (LightKey Guide p.114, "Set as Default"): the colour the fixture
      falls back to when no preset, cue or sequence defines one. */
  setColorDefault: () => void
  /** Write each selected fixture's default colour into the active cue
      (Guide p.114, "Load Default"). */
  loadColorDefault: () => void
  /** Clear each selected fixture's custom default colour, restoring the
      built-in default (blue — Guide p.85). */
  resetColorDefault: () => void
  /** Save a colour to the project's colour favourites (Guide p.86); duplicates and non-colours are ignored. */
  addColorFavorite: (hex: string) => void
  /** Remove a colour from the project's colour favourites. */
  removeColorFavorite: (hex: string) => void
  propertyClipboard: { fixture: FixtureDef; values: Record<string, number>; property?: string } | null
  copyFixtureProperties: (property?: string) => void
  pasteFixtureProperties: (manual?: boolean) => void
  saveFan: (fan: FanDef) => void
  deleteFan: (id: string, keepValues: boolean) => void
  activateCue: (id: string) => void
  /** Turn the active cue off (Jake, 26 Nov 2026): clicking the lit cue
   * in the Live tab's Cues section deactivates it — the rig fades back
   * to the base look with no cue. Activation-only callers (wizard,
   * cue-list playback, MIDI, number keys, search) keep using
   * activateCue; only the LiveTab cue button toggles. */
  deactivateCue: () => void
  /** Re-send the base look (the active cue, or the defaults when no cue
   * is active) with the current effective intensities — the base is
   * otherwise only recomputed when a cue activates, so a dimmer drag
   * after that would leave it stale (Jake, 20 Nov 2026: the dimmer
   * drags but no light appears). Called after any manual-override
   * change. A no-op under blackout or with no show open. */
  refreshBaseOutput: (fadeMs?: number) => void
  flashCue: (id: string) => void
  endFlash: () => void
  capturePreset: (name: string, category: PresetCategory) => void
  /**
   * Capture a preset from the current look on the selected fixtures, with
   * LightKey's auto-name (Jake, 22 Nov 2026 — no name/category form).
   * Plain: whatever was touched in Design (the manual overrides).
   * Snapshot: the combined look — active cue, then applied presets, then
   * overrides on top. Returns the created preset, or null when nothing
   * was captured (no fixtures selected, or nothing touched / nothing in
   * the look). Optionally files it into a preset group.
   */
  capturePresetFromLook: (snapshot: boolean, groupId?: string | null) => { id: string; name: string } | null
  convertCuesToPresets: () => number
  togglePreset: (id: string) => void
  /** Set the active preset list wholesale (LightKey palette, Jake 22 Nov
   *  2026): a plain palette click selects one preset alone, so the list
   *  is replaced rather than toggled. Unknown ids are dropped. */
  setActivePresets: (ids: string[]) => void
  /** Set the enabled effect list wholesale (Jake 22 Nov 2026): a plain
   *  palette click selects one effect alone, so the list is replaced
   *  rather than toggled. Unknown ids are dropped. */
  setActiveEffects: (ids: string[]) => void
  clearPresets: () => void
  renamePreset: (id: string, name: string) => void
  updatePresetContents: (id: string, values: PresetDef['fixtureValues']) => void
  updatePresetFromCurrent: (id: string) => void
  /** In-place preset editing: id of the preset open in Design, or null. */
  editingPresetId: string | null
  startEditingPreset: (id: string) => void
  saveEditingPreset: () => void
  cancelEditingPreset: () => void
  /** In-place cue ad-hoc editing (Guide ch.11, p.201, "Edit Ad Hoc
   * Properties"): id of the cue whose ad-hoc layer is open in Design,
   * or null. Mirrors preset editing — Design writes land in the cue
   * while it is open, and Cancel restores the cue's previous values. */
  editingCueAdHocId: string | null
  startEditingCueAdHoc: (id: string) => void
  saveEditingCueAdHoc: () => void
  cancelEditingCueAdHoc: () => void
  updateEditingPresetValues: (values: Record<string, number>, beams?: { fixtureId: string; beamId: string }[]) => void
  applyPaletteDrop: (drag: PaletteDragItem, targetGroupId: string | null, before?: { kind: 'preset' | 'sequence'; id: string } | null) => void
  applyPresetsToOverrides: (ids: string[], selectedOnly?: boolean) => void
  addOverridesToPresets: (ids: string[], selectedOnly?: boolean) => void
  removePresetProperty: (id: string, fixtureId: string, attribute?: string) => void
  deletePreset: (id: string) => void
  createPresetGroup: (name: string, parentId?: string | null) => void
  updatePresetGroup: (id: string, patch: Partial<PresetGroup>) => void
  assignPresetGroup: (presetId: string, groupId: string) => void
  assignSequenceGroup: (sequenceId: string, groupId: string | null) => void
  duplicatePreset: (id: string) => void
  deletePresetGroup: (id: string) => void
  createSequence: (name: string) => void
  updateSequence: (id: string, patch: Partial<SequenceDef>) => void
  deleteSequence: (id: string) => void
  duplicateSequence: (id: string) => void
  updateSequenceStep: (id: string, stepId: string, patch: Partial<SequenceStep>) => void
  addSequenceStep: (id: string) => void
  removeSequenceStep: (id: string, stepId: string) => void
  duplicateSequenceStep: (id: string, stepId: string) => void
  moveSequenceStep: (id: string, stepId: string, toIndex: number) => void
  reorderSequenceSteps: (id: string, order: 'backward' | 'random', seed?: number) => void
  addCue: (ids?: { presetIds?: string[]; sequenceIds?: string[] }, name?: string) => CueDef
  /** Create a cue AND append it to a cuelist in one update (LightKey,
      Guide ch.11 pp.191–192): the cuelist "+ Cue" button and a palette
      drag onto a cuelist widget both land here, so "+ Cue" works from
      zero cues and a drag mints the cue it drops. Returns the new cue
      id, or '' when the list does not exist. */
  addCueToList: (listId: string, ids?: { presetIds?: string[]; sequenceIds?: string[] }, name?: string) => string
  /**
   * LightKey's New Cue (Guide ch.11, p.191): add a cue to a cuelist at
   * an index — below the clicked step, above it with Shift, at the end
   * with no anchor. The cue is auto-numbered ("001 New Cue", …) and
   * captures the active presets and sequences plus overridden
   * properties as ad-hoc properties, exactly as buildNewCue does. A
   * new cue's fade time is 500ms — LightKey's default, proven by
   * Jake's screenshots (both new steps show 00:00.5). Returns the new
   * cue's id so the caller can open its inspector.
   */
  addCueToListAt: (listId: string, index?: number, ids?: { presetIds?: string[]; sequenceIds?: string[] }, name?: string) => string
  /** Create a cue AND make it active when no cue is active (the write
      paths' model — mirroring updateSelectedFixtures). addCue on its own
      deliberately does not activate (the Add-cue button's behaviour), so
      write paths that assumed it did must call this instead. */
  ensureActiveCue: () => void
  duplicateCue: (id: string) => void
  updateCue: (id: string, patch: Partial<CueDef>) => void
  deleteCue: (id: string) => void

  addFixture: (preset: FixturePreset, name?: string, group?: string) => void
  addProfileFixtures: (profile: FixtureProfile, options: PatchOptions) => void
  updateFixture: (id: string, patch: Partial<FixtureDef>) => void
  setFixturePosition: (id: string, position: { x: number; y: number }) => void
  setFixturePositions: (positions: Record<string, { x: number; y: number }>) => void
  /** Move individual Count instances, keyed `${fixtureId}:${instance}` (see previewLayout.instanceKey). */
  setFixtureInstancePositions: (positions: Record<string, { x: number; y: number }>) => void
  /** Fixtures patched since the Preview last saw them — the appear
   * animation marker. Session-only: set by addProfileFixtures, cleared
   * by the Preview after the animation plays; never persisted. */
  newFixtureIds: string[]
  clearNewFixtureIds: () => void
  setPreviewTrusses: (trusses: PreviewTruss[]) => void
  setStageObjects: (objects: StageObject[]) => void
  addStageObject: (object: StageObject) => void
  updateStageObject: (id: string, patch: Partial<StageObject>) => void
  removeStageObjects: (ids: string[]) => void
  stageClipboard: StageObject[]
  copyStageObjects: (ids: string[]) => void
  pasteStageObjects: () => string[]
  duplicateStageObjects: (ids: string[]) => string[]
  flipStageObjects: (ids: string[], axis: 'x' | 'y') => void
  orderStageObjects: (ids: string[], side: 'front' | 'back' | 'forward' | 'backward') => void
  removeFixture: (id: string) => void
  duplicateFixture: (id: string) => void
  reassignFixtureProfile: (id: string, profile: FixtureProfile, modeId?: string) => void
  saveFixtureProfile: (profile: FixtureProfile) => void
  deleteFixtureProfile: (id: string) => void

  addAutomation: (automation: AutomationDef) => void
  updateAutomation: (id: string, patch: Partial<AutomationDef>) => void
  removeAutomation: (id: string) => void

  addEffect: (effect: EffectDef) => void
  updateEffect: (id: string, patch: Partial<EffectDef>) => void
  removeEffect: (id: string) => void
  /** Duplicate an effect — the guide's Overlay path (p.173): a second effect
   *  for the same property, added on top of the first. */
  duplicateEffect: (id: string) => string | null
  /** Delete an effect, keeping its current values as static values in the
   *  owning cue/preset (Guide p.152: "Delete and Keep Values"). */
  deleteEffectAndKeepValues: (id: string) => void
  /** The effect open in the visual effect editor (Guide ch.10), below the
   *  Preview. Session-only: never persisted. */
  editingEffectId: string | null
  setEditingEffectId: (id: string | null) => void
  /** The property the effects chooser (Guide ch.10) is open for, below the
   *  Preview. Session-only: never persisted. */
  effectChooserAttribute: string | null
  setEffectChooserAttribute: (attribute: string | null) => void
  /** The template effect currently previewing from the chooser (Jake,
   *  25 Nov 2026: click a template tile to preview it live on the
   *  selected fixtures, click the Add button to apply it). Session-only:
   *  never stored on a fixture, never captured into cues, never
   *  persisted — it runs only through the output runtime, and stops
   *  when the chooser closes, the editor opens, or another show loads. */
  previewEffect: EffectDef | null
  /** Id of the template the preview effect was built from (for the
   *  click-again-to-stop toggle). */
  previewEffectTemplateId: string | null
  /** Start a chooser preview (effect + its template id), or stop it
   *  with null. */
  setPreviewEffect: (effect: EffectDef | null, templateId?: string | null) => void
  effectClipboard: EffectDef | null
  copyEffect: (id: string) => void
  pasteEffect: () => string | null
  saveEffectTemplate: (id: string, includeFixtureOrder?: boolean) => void
  applyEffectTemplate: (id: string) => string | null
  /** The saved effect template being edited (LightKey Guide ch.9, p.128:
   *  hover a preset → Edit → its name appears in the toolbar with
   *  Update). Session-only: never persisted. */
  editingEffectTemplateId: string | null
  /** Open a saved effect template in the editor (Edit): creates a working
   *  copy of the template and binds the session to it. Returns the
   *  working effect's id, or null when the template doesn't exist. */
  startEditingEffectTemplate: (id: string) => string | null
  /** Write the working copy back into the saved template (Update) and end
   *  the session; the live effect stays as an ordinary effect. */
  updateEffectTemplate: () => void
  /** End a template-edit session, discarding the working copy Edit
   *  created (the saved template is untouched). */
  cancelEditingEffectTemplate: () => void
  /** The live effect open in the editor from the Preset Palette (Jake,
   *  22 Nov 2026): Edit on a palette effect row opens a draft session —
   *  the effect's pre-edit values are snapshotted, its name appears in
   *  the toolbar with Update/Cancel, Update ends the session keeping
   *  the edits, Cancel restores the snapshot. Mirrors preset editing.
   *  Session-only: never persisted. */
  editingLiveEffectId: string | null
  /** Open a live effect in the editor with a draft session (palette
   *  Edit): snapshots the effect first. Re-editing the same effect
   *  keeps its session (and its snapshot). */
  startEditingLiveEffect: (id: string) => void
  /** End a live-effect edit session, keeping the edits (Update) — the
   *  edits were written live into the effect, as for presets — and
   *  close the editor. */
  saveEditingLiveEffect: () => void
  /** End a live-effect edit session, restoring the snapshotted values
   *  (Cancel), and close the editor. */
  cancelEditingLiveEffect: () => void
  /** Leave the effect editor (and the effects chooser) for Design or
   *  Live — the Cancel path: a template-edit session discards its
   *  working copy, a live-effect draft session restores its snapshot,
   *  an ordinary effect just closes and stays. The Design/Live
   *  navigation calls this (Jake, 21 Nov 2026: clicking Design while
   *  the editor is open must return to Design, not leave the editor
   *  stuck). */
  exitEffectEditor: () => void
  /** Rename a saved effect template (Guide p.174: Control-click → Rename
   *  in the Effects Chooser). */
  renameEffectTemplate: (id: string, name: string) => void
  /** Duplicate a saved effect template. */
  duplicateEffectTemplate: (id: string) => void
  /** Delete a saved effect template (Guide p.175: Control-click → Delete). */
  deleteEffectTemplate: (id: string) => void

  /** Movement paths (Guide ch.10, pp.165-171): stored independently of effects
   *  so they can be reused by any movement effect. */
  addMovementPath: (path: MovementPathDef) => void
  updateMovementPath: (id: string, patch: Partial<MovementPathDef>) => void
  removeMovementPath: (id: string) => void
  duplicateMovementPath: (id: string) => string | null

  addCueList: (name?: string) => string
  updateCueList: (id: string, patch: Partial<CueListDef>) => void
  renameCueList: (id: string, name: string) => void
  removeCueList: (id: string) => void
  /** Renumber (Guide ch.11, p.195): re-number the given steps (or all
   *  steps when none are given) in list order, starting from the first
   *  step's leading number, or 1. Renames the CUEs — a cue shared with
   *  a button or another list is renamed everywhere it is used. */
  renumberCueList: (listId: string, stepIds?: string[]) => void
  /** New Group (Guide ch.11, p.192): an empty named group below the
   *  given step (or at the end). Returns the group's id. */
  addCueListGroup: (listId: string, name: string, afterStepId?: string | null) => string
  /** New Group From Selection (Guide ch.11, p.192): wrap the given
   *  steps in a new named group. Returns the group's id. */
  addCueListGroupFromSelection: (listId: string, stepIds: string[], name: string) => string
  renameCueListGroup: (listId: string, groupId: string, name: string) => void
  /** Delete a group: the group header goes away and its steps stay,
   *  ungrouped, in place — the cues are not deleted. (LightKey's
   *  guide does not say what deleting a group does to its cues; this
   *  is the conservative reading, reported to Jake.) */
  removeCueListGroup: (listId: string, groupId: string) => void
  addCueStep: (listId: string, cueId?: string) => void
  updateCueStep: (listId: string, stepId: string, patch: Partial<CueStepDef>) => void
  removeCueStep: (listId: string, stepId: string) => void
  moveCueStep: (listId: string, stepId: string, direction: -1 | 1) => void
  setActiveCueList: (id: string | null) => void
  goToCue: (listId: string, index: number, fadeMsOverride?: number) => void
  cueNext: () => void
  cuePrev: () => void
  /** Pause or resume cuelist playback (Guide ch.11, p.218). Pausing
   *  holds the current cue lit and stops its hold time; it has no
   *  effect unless the current cue has a hold time. */
  setCuePaused: (paused: boolean) => void
  setManualCrossfade: (value: number) => void
  stepLiveFrame: (frameId: string, direction: -1 | 1) => void
  stopCue: () => void

  setMidiMappings: (mappings: MidiMapping[]) => void
  addMidiMapping: (mapping: MidiMapping) => void
  removeMidiMapping: (id: string) => void
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

// Colour attributes belong to a beam (cell) of a multipart fixture, never
// to the fixture as a whole: a colour write with a beam selected must only
// move that beam. Every other fixture-level attribute (intensity, pan,
// tilt, shutter, strobe, program, speed, …) is a property of the fixture
// itself, so it passes through a beam write instead of being dropped.
const COLOUR_ATTRIBUTE_BASES = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white', 'amber', 'uv', 'lime']
function isBeamColourAttribute(attribute: string) {
  return COLOUR_ATTRIBUTE_BASES.some((base) => attribute === base || (attribute.startsWith(base) && /^\d+$/.test(attribute.slice(base.length))))
}

/**
 * Map a per-beam write onto cue channel keys for one beam. Colour
 * attributes resolve through the beam's properties (beam 1's `red` is the
 * bare `red` channel, beam 2's is `red2`); fixture-level, non-colour
 * attributes (intensity, pan/tilt, shutter, …) pass through under their
 * own name — dropping them silently left e.g. the Dimmer dead whenever a
 * beam was selected (Jake, 20 Nov 2026: colour set, Dimmer full, nothing
 * came on). A colour attribute the selected beam does not own is dropped:
 * writing it would move a different beam.
 */
function beamValuePatch(fixture: FixtureDef, beam: { properties: Record<string, string> } | undefined, values: Record<string, number>): Record<string, number> {
  const patch: Record<string, number> = {}
  const attrs = fixtureAttributes(fixture)
  for (const [attribute, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) continue
    const channel = beam?.properties[attribute]
    if (channel) { patch[channel] = clamp(value); continue }
    if (!isBeamColourAttribute(attribute) && attrs.includes(attribute)) patch[attribute] = clamp(value)
  }
  return patch
}

// Cue auto-names number from the highest existing "Cue N" (never below
// the cue count), so a gap in the numbering does not mint a duplicate
// name — after the 19 Nov orphan run the header field showed "Cue 208",
// and length-based numbering would have started reissuing low numbers
// alongside the orphans. (A deleted cue's number can still be reissued:
// there is no persistent counter yet, and no UI deletes cues today.)
function nextCueNumber(cues: CueDef[]): number {
  let max = cues.length
  for (const cue of cues) {
    const match = /^Cue (\d+)$/.exec(cue.name)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

/** Momentary flash: remembers the look to return to on release. */
let flashState: { patch: Record<number, number>; activeCueId: string | null } | null = null

/** In-place preset editing (LightKey, Guide ch.9): the preset as it was when
 * editing started, plus the active-preset and fixture selection to restore
 * on Cancel. Edits write straight into the preset (undoable), so Cancel
 * restores this snapshot and Save just ends the session. */
let editingPresetSnapshot: { preset: PresetDef; activePresetIds: string[]; selectedFixtureIds: string[] } | null = null
// The live effect's pre-edit values while a palette draft session is
// open (see startEditingLiveEffect): Cancel restores this whole
// object, so fields editing added (e.g. a pattern switch adding
// lengthRange) are removed again rather than left behind by a merge.
let editingLiveEffectSnapshot: EffectDef | null = null

/** In-place cue ad-hoc editing (Guide ch.11, p.201): the cue as it was
 * when editing started, plus the active cue and fixture selection to
 * restore on Cancel. Mirrors the preset-editing snapshot. */
let editingCueAdHocSnapshot: { cue: CueDef; activeCueId: string | null; selectedFixtureIds: string[] } | null = null

/** Merge a per-fixture patch into the manual overrides (a Design write
 * defines the property for the fixture — LightKey Guide ch.8, p.80). */
function mergeManualOverrides(current: Record<string, Record<string, number>>, patch: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const next = { ...current }
  for (const [fixtureId, values] of Object.entries(patch)) next[fixtureId] = { ...next[fixtureId], ...values }
  return next
}

/** Remove exactly the keys a fan's evaluation wrote, from a
 * fixture-values map (a cue's fixtureValues or the manual overrides).
 * The evaluated keys — not the fan's attribute name — so a beam fan
 * (whose keys are the beams' own properties) and a colour fan (whose
 * values land as red/green/blue, or cyan/magenta/yellow on a CMY
 * fixture) scrub precisely what was written. Empty fixture entries
 * are kept, as deleteFan always has. */
function scrubFanValues(
  fixtureValues: Record<string, Record<string, number>>,
  values: Record<string, Record<string, number>>
): Record<string, Record<string, number>> {
  const next = structuredClone(fixtureValues)
  for (const [fixtureId, patch] of Object.entries(values)) {
    if (!next[fixtureId]) continue
    for (const attr of Object.keys(patch)) delete next[fixtureId][attr]
  }
  return next
}

/** Drop session fans whose values no longer exist in the overrides:
 * clearing a fanned property (brush, per-fixture ✕, Clear all)
 * removes the fan with it (Guide p.123: delete fanning and clear
 * the property) — otherwise a fan with no values would sit in the
 * Design panel and re-create them on its next commit. A fan
 * survives while any of its fixtures still holds one of its
 * evaluated attributes. */
function pruneManualFans(
  manualOverrides: Record<string, Record<string, number>>,
  manualFans: FanDef[],
  fixtures: FixtureDef[]
): FanDef[] {
  if (!manualFans.length) return manualFans
  return manualFans.filter((fan) => {
    const values = evaluateFan(fixtures, fan)
    return Object.entries(values).some(([fixtureId, patch]) =>
      Object.keys(patch).some((attr) => manualOverrides[fixtureId]?.[attr] !== undefined))
  })
}

/** Merge the current overrides into an ad-hoc layer (a cue's
 * fixtureValues or a Live button's captured adHocValues) — "Add
 * Overrides" (Guide ch.11, p.202). selectedOnly limits the merge to
 * the fixtures the operator has selected ("Add Overrides for Selected
 * Fixtures", Option held). */
function mergeOverridesIntoAdHoc(existing: Record<string, Record<string, number>>, overrides: Record<string, Record<string, number>>, selectedOnly: boolean, selectedFixtureIds: string[]): Record<string, Record<string, number>> {
  const next = structuredClone(existing)
  for (const [fixtureId, values] of Object.entries(overrides)) {
    if (selectedOnly && !selectedFixtureIds.includes(fixtureId)) continue
    next[fixtureId] = { ...next[fixtureId], ...values }
  }
  return next
}

/** The fixture values a new cue starts with: LightKey's defaults, with
 * any currently overridden properties overlaid (Guide ch.11, p.191 —
 * creating a cue adds the overridden properties to it). */
/**
 * Attributes a preset capture may keep for a fixture: its channel-map
 * attributes, plus 'intensity' for a virtual-dimmer fixture (colour
 * channels, no dimmer channel — the same test as DesignTab's
 * isVirtualDimmer). The Dimmer fader writes an intensity value for
 * such a fixture and the output scales its LEDs by it, so 'intensity'
 * is a real stored attribute for it — filtering it out here silently
 * drops the dimmer from every preset captured on the fixture (Jake,
 * 22 Nov 2026: a 100% dimmer preset held nothing for his Q12BTs, so
 * Red + 100% gave no output on them, in the palette or on a Live pad).
 */
function capturableAttributes(fixture: FixtureDef): Set<string> {
  const attrs = new Set(fixtureAttributes(fixture))
  if (!attrs.has('intensity') && colorChannels([...attrs]).length > 0) attrs.add('intensity')
  return attrs
}

function newCueFixtureValues(fixtures: FixtureDef[], manualOverrides: Record<string, Record<string, number>>): CueDef['fixtureValues'] {
  const fixtureValues: CueDef['fixtureValues'] = {}
  for (const fixture of fixtures) fixtureValues[fixture.id] = { ...defaultFixtureValues(fixture), ...manualOverrides[fixture.id] }
  return fixtureValues
}

/** The cue's ad-hoc layer (LightKey's "Ad hoc properties", Guide ch.11
 * p.191): ONLY the overridden properties. The full default set must NOT
 * be written here — resolveCueValues applies the cue's own values after
 * its presets, so defaults carried in the cue would clobber the presets
 * it references (a drag-created cue would resolve to defaults, not the
 * dragged preset). The output path fills missing attributes with the
 * fixture defaults itself (computeCueChannels zeroMissing), so a
 * preset-less cue still comes out at its defaults. */
function newCueAdHocValues(fixtures: FixtureDef[], manualOverrides: Record<string, Record<string, number>>): CueDef['fixtureValues'] {
  const fixtureValues: CueDef['fixtureValues'] = {}
  for (const fixture of fixtures) {
    const override = manualOverrides[fixture.id]
    if (override && Object.keys(override).length > 0) fixtureValues[fixture.id] = { ...override }
  }
  return fixtureValues
}

/** Build a new cue the LightKey way (Guide ch.11, p.191): the active
 * presets and sequences, plus the overridden fixture properties as ad
 * hoc values. Explicit ids (a palette drag onto a cuelist) replace the
 * active look — the dragged objects are the cue; the ad hoc layer is
 * always the current overrides, in both cases. */
function buildNewCue(state: ShowState, explicit?: { presetIds?: string[]; sequenceIds?: string[] }, name?: string): CueDef {
  const fixtures = state.show?.fixtures ?? []
  return {
    id: crypto.randomUUID(),
    name: name?.trim() || `Cue ${nextCueNumber(state.cues)}`,
    presetIds: explicit
      ? [...new Set(explicit.presetIds ?? [])].filter((id) => state.presets.some((p) => p.id === id))
      : [...state.activePresetIds].filter((id) => state.presets.some((p) => p.id === id)),
    sequenceIds: explicit
      ? [...new Set(explicit.sequenceIds ?? [])].filter((id) => state.show?.sequences?.some((s) => s.id === id))
      : [...state.activeSequenceIds].filter((id) => state.show?.sequences?.some((s) => s.id === id)),
    fixtureValues: newCueAdHocValues(fixtures, state.manualOverrides),
    fadeMs: state.show?.preferences?.defaultFadeMs ?? 1000
  }
}

/**
 * Reference-counted cue deletion (Jake, 27 Nov 2026 — "if a cue is
 * deleted off the canvas... kaboooom its deleted from memory"): a cue
 * exists only on the canvas — a Live button or a cuelist step. Given the
 * collections AFTER a removal, drop every candidate cue that no Live
 * button on any page, no cuelist step, and no clipboard control
 * references any more. The clipboard counts so Cut keeps the cue alive
 * for a paste-back; a cue still referenced anywhere is never deleted.
 * Existing orphans are NOT swept here — this runs only on the removal
 * paths below, going forward (PRBC Default's ~200 orphan cues stay
 * untouched until Jake decides). Returns the swept cue ids alongside
 * the next cue list so callers can clear an active cue that just died.
 */
function sweepUnreferencedCues(
  cues: CueDef[],
  livePages: LivePage[],
  cueLists: CueListDef[],
  candidates: Iterable<string>,
  clipboard?: PageClipboard | null
): { cues: CueDef[]; swept: string[] } {
  const wanted = new Set(candidates)
  if (!wanted.size) return { cues, swept: [] }
  const referenced = new Set<string>()
  for (const page of livePages) for (const control of page.controls) if (control.cueId) referenced.add(control.cueId)
  for (const list of cueLists) for (const step of list.steps) referenced.add(step.cueId)
  for (const control of clipboard?.controls ?? []) if (control.cueId) referenced.add(control.cueId)
  const swept = [...wanted].filter((id) => !referenced.has(id))
  if (!swept.length) return { cues, swept: [] }
  const doomed = new Set(swept)
  return { cues: cues.filter((cue) => !doomed.has(cue.id)), swept }
}

export function nextFreeChannel(fixtures: FixtureDef[]): number {
  return fixtures.reduce((max, f) => Math.max(max, f.channelStart - 1 + f.channels), 0) + 1
}

/**
 * Place a fixture so its instance 0 lands at `position`, carrying any
 * stored per-instance positions along by the same delta — a Count
 * fixture keeps its instances' relative layout when it is placed (e.g.
 * dragged out of Fixture Storage onto the canvas).
 */
function placeFixture(fixture: FixtureDef, position: { x: number; y: number }): FixtureDef {
  const next = { x: Math.max(0, Math.min(800, position.x)), y: Math.max(0, Math.min(340, position.y)) }
  const current = instancePositions(fixture)
  const base = current[0]
  const previewPositions = base
    ? current.map((p) => p ? { x: Math.max(0, Math.min(800, p.x + next.x - base.x)), y: Math.max(0, Math.min(340, p.y + next.y - base.y)) } : null).filter((p): p is { x: number; y: number } => p !== null)
    : undefined
  return { ...fixture, inStorage: false, previewPosition: next, ...(previewPositions?.length ? { previewPositions } : {}) }
}

export function defaultFixtureValues(fixture: FixtureDef): Record<string, number> {
  const values: Record<string, number> = {}
  for (const attr of fixtureAttributes(fixture)) {
    values[attr] = fixture.defaultValues?.[attr] ?? fixtureMode(fixture)?.channels.find((c) => c.attribute === attr)?.defaultValue ?? 0
  }
  return values
}

/**
 * The intensities the pressed Live pads carry, for the base look
 * (Jake, 22 Nov 2026): a Live dimmer pad lifts an active palette
 * preset and raises the default colour, so the base look resolves
 * against them like any other intensity source. Shares the App's
 * live-layer computation (liveOutputLevels + orderedLiveControls +
 * liveIntensityLevels) so the base and the layers never disagree.
 */
function liveLevelsForState(
  state: Pick<ShowState, 'show' | 'cues' | 'activeLiveValues' | 'liveActivationOrder'>
): Record<string, number> {
  const fixtures = state.show?.fixtures ?? []
  const outputLevels = liveOutputLevels(state.show?.livePages, state.activeLiveValues ?? {})
  const controls = orderedLiveControls(state.show?.livePages, outputLevels, state.liveActivationOrder ?? {})
  return liveIntensityLevels({ controls, levels: outputLevels, presets: state.show?.presets ?? [], cues: state.cues ?? [], fixtures })
}

function cuePatch(
  state: Pick<ShowState, 'show' | 'master' | 'manualOverrides' | 'activePresetIds' | 'cues' | 'activeLiveValues' | 'liveActivationOrder'>,
  cue: CueDef
): Record<number, number> {
  // The cue resolves through its preset references first (Piece 8): a
  // preset edit updates every cue that references it, because the values
  // are resolved here at output time, never copied into the cue.
  const fixtures = state.show?.fixtures ?? []
  const resolved = resolveCue(cue, state.show?.presets ?? [], fixtures)
  // The dimmer is a property of the fixture, not of the cue (Jake,
  // 20 Nov 2026): a fixture the cue leaves without an intensity still
  // resolves its colours against the dimmer it is actually at — the
  // Design override, an active preset, or the cue itself. Without
  // this, a dimmer-only override on a fixture the cue never lit stays
  // dark: the cue's own fill scales its default blue by an unset
  // dimmer (0), and the override layer carries no colour to scale.
  // Every fixture gets an entry first, so a fixture the cue never
  // mentions still resolves its defaults against the effective dimmer.
  const values: Record<string, Record<string, number>> = {}
  for (const fixture of fixtures) values[fixture.id] = { ...(resolved.fixtureValues[fixture.id] ?? {}) }
  const levels = effectiveIntensityLevels({
    cueValues: resolved.fixtureValues,
    activePresetIds: state.activePresetIds ?? [],
    presets: state.show?.presets ?? [],
    manualOverrides: state.manualOverrides ?? {},
    liveLevels: liveLevelsForState(state)
  })
  return computeCueChannels(fixtures, { ...resolved, fixtureValues: withEffectiveIntensity(values, levels) }, state.master, true)
}

/**
 * The base look when no cue is active: every fixture at its LightKey
 * default (Guide pp.85, 114 — normally blue, dimmer 0), with the
 * default colour scaled by the dimmer the fixture is actually at, so
 * a dimmer drag on a fresh fixture brings up blue instead of nothing.
 * The dimmer's sources are the cue, an active preset, a Design
 * override — and, since Jake's call of 22 Nov 2026, a pressed Live
 * pad: a dimmer alone, from any of them, brings up the default blue
 * on a virtual-dimmer fixture. This replaces the all-zero patch the
 * no-cue paths used to send — zeros latch the previous look's colours
 * off and the defaults layer in the output composer is masked by the
 * full-frame base, so the default blue never reached the frame any
 * other way (Jake, 20 Nov 2026). Blackout and project-close still
 * send zeros.
 */
function defaultsPatch(
  state: Pick<ShowState, 'show' | 'master' | 'manualOverrides' | 'activePresetIds' | 'activeCueId' | 'cues' | 'activeLiveValues' | 'liveActivationOrder'>
): Record<number, number> {
  const fixtures = state.show?.fixtures ?? []
  const levels = effectiveIntensityLevels({
    cueValues: resolvedActiveCueValues(state.cues ?? [], state.show?.presets ?? [], state.activeCueId ?? null, fixtures),
    activePresetIds: state.activePresetIds ?? [],
    presets: state.show?.presets ?? [],
    manualOverrides: state.manualOverrides ?? {},
    liveLevels: liveLevelsForState(state)
  })
  const values: Record<string, Record<string, number>> = {}
  for (const fixture of fixtures) values[fixture.id] = defaultFixtureValues(fixture)
  return computeCueChannels(fixtures, { id: 'defaults', name: 'Defaults', fadeMs: 0, fixtureValues: withEffectiveIntensity(values, levels) }, state.master, true)
}

/**
 * Output patch for a cue. Blackout cues drive the whole rig to zero, and
 * they must send an explicit zero for every channel: an empty patch would
 * leave the last values latched on the DMX interface.
 */
function cueOutput(
  state: Pick<ShowState, 'show' | 'master' | 'manualOverrides' | 'activePresetIds' | 'cues' | 'activeLiveValues' | 'liveActivationOrder'>,
  cue: CueDef
): Record<number, number> {
  suppressPresetsForCue(Boolean(cue.blackout))
  return cue.blackout ? allZeroPatch() : cuePatch(state, cue)
}

/**
 * Re-send the active cue after a preset it references changed (Piece 8):
 * a preset edit must reach the output immediately, not only when the cue
 * is next activated. `presets` is the post-edit list, because cuePatch
 * resolves the cue through state.show.presets.
 */
function resendActiveCueForPreset(
  state: ShowState,
  presetId: string,
  presets: PresetDef[]
) {
  const cue = state.cues.find((s) => s.id === state.activeCueId)
  if (!cue || !(cue.presetIds ?? []).includes(presetId) || state.blackout) return
  // A live edit, not a transition: re-assert without a fade time, so
  // it reaches the output at once when idle and retargets a fade in
  // flight instead of snapping it (Jake, 24 Nov 2026).
  reassertBase(cueOutput({ ...state, show: state.show ? { ...state.show, presets } : null }, cue))
}

/** Merge a patch into the persisted show, and optionally into top-level state. */
function persistState(
  state: ShowState,
  showPatch: Partial<ShowDef>,
  statePatch: Partial<ShowState> = {}
): Partial<ShowState> {
  if (showPatch.fixtures && !showPatch.fixtureGroups) showPatch = { ...showPatch, fixtureGroups: syncFixtureGroups(state.show?.fixtureGroups ?? [], showPatch.fixtures) }
  if (showPatch.presets && !showPatch.presetGroups) showPatch = { ...showPatch, presetGroups: syncPresetGroups(state.show?.presetGroups ?? [], showPatch.presets) }
  return {
    ...statePatch,
    ...(state.show && JSON.stringify({ ...state.show, ...showPatch }) !== JSON.stringify(state.show) ? {
      undoStack: state.historyGrouping && state.historyGroupRecorded ? state.undoStack : [...state.undoStack, structuredClone(state.show)].slice(-200),
      redoStack: [],
      historyGroupRecorded: state.historyGrouping
    } : {}),
    show: state.show ? { ...state.show, ...showPatch, updatedAt: Date.now() } : null
  }
}

function activeLivePage(state: ShowState): LivePage | undefined {
  return state.show?.livePages?.find((page) => page.id === state.activeLivePageId) ?? state.show?.livePages?.[0]
}

/** Fade time for a Live-driven base change with no explicit time of
 *  its own (Jake, 24 Nov 2026): the active Live page's own fade
 *  where set, else the global Default fade. Used by preset toggles
 *  and Live toggle presses — the base lift they cause (including the
 *  default blue on a virtual-dimmer fixture, whose brightness only
 *  the base carries) fades over the page's time, not the global.
 *  Deliberately NOT used for fader drags, flash presses or Design
 *  edits, which must stay immediate. */
function liveTransitionFadeMs(state: ShowState): number {
  return resolveFadeMs({
    pageFadeMs: activeLivePageFadeMs(state.show?.livePages, state.activeLivePageId),
    defaultFadeMs: state.show?.preferences?.defaultFadeMs
  })
}

function saveLivePages(state: ShowState, livePages: LivePage[]): Partial<ShowState> {
  return {
    ...persistState(state, { livePages }),
    pageActiveValues: prunePageValues(state.pageActiveValues, livePages.map((page) => page.id))
  }
}

const productionDefaultShow: ShowDef = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'demo-1',
  name: 'Demo Show',
  description: 'Starter worship set',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  fixtures: [
    { id: 'f1', name: 'Warm Wash Front', type: 'par', channelStart: 1, channels: 4, group: 'Front' },
    { id: 'f2', name: 'Blue Fill Back', type: 'led-wash', channelStart: 5, channels: 7, group: 'Back' },
    { id: 'f3', name: 'Center Moving Head', type: 'moving-head', channelStart: 12, channels: 8, group: 'Center' }
  ],
  cues: [
    {
      id: 's1',
      name: 'Warm Welcome',
      presetIds: [], sequenceIds: [],
      fixtureValues: {
        f1: { intensity: 220, red: 255, green: 160, blue: 80 },
        f2: { intensity: 80, red: 30, green: 80, blue: 255, white: 0, amber: 0, uv: 0 },
        f3: { intensity: 0, pan: 128, tilt: 128, red: 0, green: 0, blue: 0, gobo: 0, strobe: 0 }
      },
      fadeMs: 1200
    },
    {
      id: 's2',
      name: 'Sermon Focus',
      presetIds: [], sequenceIds: [],
      fixtureValues: {
        f1: { intensity: 180, red: 255, green: 220, blue: 180 },
        f2: { intensity: 120, red: 80, green: 160, blue: 255, white: 0, amber: 0, uv: 0 },
        f3: {
          intensity: 200,
          pan: 128,
          tilt: 96,
          red: 255,
          green: 255,
          blue: 255,
          gobo: 0,
          strobe: 0
        }
      },
      fadeMs: 800
    },
    {
      id: 's3',
      name: 'Communion Glow',
      presetIds: [], sequenceIds: [],
      fixtureValues: {
        f1: { intensity: 140, red: 200, green: 80, blue: 40 },
        f2: { intensity: 160, red: 120, green: 40, blue: 90, white: 0, amber: 0, uv: 0 },
        f3: { intensity: 120, pan: 128, tilt: 160, red: 255, green: 120, blue: 60, gobo: 0, strobe: 0 }
      },
      fadeMs: 2000
    }
  ],
  automations: [],
  effects: [],
  cueLists: [
    {
      id: 'c1',
      name: 'Sunday Set',
      steps: [
        { id: 'cs1', cueId: 's1', fadeMs: 1500, holdMs: 0 },
        { id: 'cs2', cueId: 's2', fadeMs: 1000, holdMs: 0 },
        { id: 'cs3', cueId: 's3', fadeMs: 2000, holdMs: 0 }
      ],
      loop: false
    }
  ],
  midiMappings: [],
  masterIntensity: 255
}

const showBuddyFixtures: FixtureDef[] = [
  {
    id: 'pan-4x1x30',
    name: 'PAN 4X1X30',
    type: 'pixel-bar-17ch',
    channelStart: 1,
    channels: 17,
    group: 'Stage'
  },
  { id: 'dimmer-1', name: 'Dimmer 1', type: 'dimmer', channelStart: 18, channels: 1 },
  { id: 'dimmer-2', name: 'Dimmer 2', type: 'dimmer', channelStart: 19, channels: 1 },
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `simger-q12bt-${index + 1}`,
    name: `Simger Q12BT Channel ${index + 1}`,
    type: 'rgba-4ch' as const,
    channelStart: 20 + index * 4,
    channels: 4,
    group: 'Front'
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    id: `corepar-q120-${index + 1}`,
    name: `COREpar Q120 ILS ${index + 1}`,
    type: 'rgbw-4ch' as const,
    channelStart: 36 + index * 4,
    channels: 4,
    group: 'Back'
  }))
]

interface TemplateLook {
  red: number
  green: number
  blue: number
  white: number
  amber: number
  intensity: number
}

function showBuddyCueValues(look: TemplateLook): Record<string, Record<string, number>> {
  const values: Record<string, Record<string, number>> = {
    'pan-4x1x30': {
      red: look.red,
      green: look.green,
      blue: look.blue,
      red2: look.red,
      green2: look.green,
      blue2: look.blue,
      red3: look.red,
      green3: look.green,
      blue3: look.blue,
      red4: look.red,
      green4: look.green,
      blue4: look.blue,
      intensity: look.intensity,
      strobe: 0,
      function: 0,
      speed: 0,
      listType: 0
    },
    'dimmer-1': { intensity: look.intensity },
    'dimmer-2': { intensity: look.intensity }
  }

  for (let index = 1; index <= 4; index++) {
    // Virtual-dimmer fixtures (no dimmer channel): the look's intensity
    // must be stored explicitly — an unset virtual dimmer now defaults
    // to 0 (dark), so without it these fixtures would go dark.
    values[`simger-q12bt-${index}`] = {
      intensity: look.intensity,
      red: look.red,
      green: look.green,
      blue: look.blue,
      amber: look.amber
    }
    values[`corepar-q120-${index}`] = {
      intensity: look.intensity,
      red: look.red,
      green: look.green,
      blue: look.blue,
      white: look.white
    }
  }

  return values
}

const developmentDefaultShow: ShowDef = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'showbuddyactive-demo',
  name: 'ShowBuddyActive Demo',
  description: 'Development patch based on the supplied image; inferred addresses 1–51',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  fixtures: showBuddyFixtures,
  cues: [
    {
      id: 's1',
      name: 'Warm Welcome',
      presetIds: [], sequenceIds: [],
      fixtureValues: showBuddyCueValues({
        red: 220,
        green: 110,
        blue: 30,
        white: 24,
        amber: 36,
        intensity: 128
      }),
      fadeMs: 1200
    },
    {
      id: 's2',
      name: 'Sermon Focus',
      presetIds: [], sequenceIds: [],
      fixtureValues: showBuddyCueValues({
        red: 50,
        green: 110,
        blue: 220,
        white: 110,
        amber: 0,
        intensity: 150
      }),
      fadeMs: 800
    },
    {
      id: 's3',
      name: 'Communion Glow',
      presetIds: [], sequenceIds: [],
      fixtureValues: showBuddyCueValues({
        red: 180,
        green: 50,
        blue: 20,
        white: 12,
        amber: 160,
        intensity: 100
      }),
      fadeMs: 2000
    }
  ],
  automations: [],
  effects: [],
  cueLists: [
    {
      id: 'c1',
      name: 'Sunday Set',
      steps: [
        { id: 'cs1', cueId: 's1', fadeMs: 1500, holdMs: 0 },
        { id: 'cs2', cueId: 's2', fadeMs: 1000, holdMs: 0 },
        { id: 'cs3', cueId: 's3', fadeMs: 2000, holdMs: 0 }
      ],
      loop: false
    }
  ],
  midiMappings: [],
  masterIntensity: 255
}

const defaultShow = import.meta.env.DEV ? developmentDefaultShow : productionDefaultShow
export { defaultShow }

let sessionPasscode = ''

/** Write a per-fixture colour patch into the active cue (creating one if
    needed). Shared by setSelectedColor, setSelectedBaseColor and
    loadColorDefault. */
function writeColourToActiveCue(get: () => ShowState, patch: Record<string, Record<string, number>>) {
  // While a cue's ad-hoc layer is being edited, the wheel writes to that
  // cue even if the operator switched the active cue mid-edit.
  const targetId = get().editingCueAdHocId ?? get().activeCueId
  if (!targetId) get().ensureActiveCue()
  const cue = get().cues.find((s) => s.id === (get().editingCueAdHocId ?? get().activeCueId))
  if (!cue) return
  const fixtureValues = { ...cue.fixtureValues }
  for (const [id, values] of Object.entries(patch)) fixtureValues[id] = { ...fixtureValues[id], ...values }
  get().updateCue(cue.id, { fixtureValues })
}

export const useShowStore = create<ShowState>((set, get) => {
const actions: ShowState = {
  locked: false,
  propertyClipboard: null,
  effectClipboard: null,
  editingEffectId: null,
  setEditingEffectId: (id) => {
    // The editor is transient (Jake, 22 Nov 2026): opening a different
    // effect — or closing the editor — ends a template-edit session
    // first, Cancel semantics (the working copy is discarded, the
    // saved template untouched). Without this, switching effects
    // mid-template-edit would leave the session bound to the old
    // template while the editor showed another effect — and Update
    // would write the wrong effect's settings into it.
    // Opening an effect also closes any other editor (one editor at a
    // time, always): a preset or cue ad-hoc edit is saved — the
    // existing navigate-away convention — and another live-effect
    // draft session is saved before it is replaced. Closing the
    // editor (id null) touches no other session.
    const state = get()
    if (state.editingEffectTemplateId && id !== state.editingEffectId) state.cancelEditingEffectTemplate()
    if (id) {
      const fresh = get()
      if (fresh.editingLiveEffectId && fresh.editingLiveEffectId !== id) fresh.saveEditingLiveEffect()
      if (get().editingPresetId) get().saveEditingPreset()
      if (get().editingCueAdHocId) get().saveEditingCueAdHoc()
    }
    // Opening the editor is another panel: a chooser preview stops.
    set({ editingEffectId: id, ...(id ? { previewEffect: null, previewEffectTemplateId: null } : {}) })
  },
  editingEffectTemplateId: null,
  effectChooserAttribute: null,
  previewEffect: null,
  previewEffectTemplateId: null,
  setPreviewEffect: (effect, templateId = null) => set({ previewEffect: effect, previewEffectTemplateId: effect ? templateId : null }),
  setEffectChooserAttribute: (attribute) => {
    // Opening the chooser is starting work elsewhere, so it exits the
    // editor first (Cancel semantics for a template session) — the
    // chooser and the editor are mutually exclusive views, and leaving
    // the editor open would hide the chooser behind it. Closing the
    // chooser stops any template preview running from it.
    if (attribute) get().exitEffectEditor()
    set({ effectChooserAttribute: attribute, ...(attribute ? {} : { previewEffect: null, previewEffectTemplateId: null }) })
  },
  selectedBeams: [],
  stageClipboard: [],
  lockApp: (passcode = '') => { if (get().locked) return; sessionPasscode = passcode; set({ locked: true }) },
  unlockApp: (passcode = '') => { if (passcode !== sessionPasscode) return false; sessionPasscode = ''; set({ locked: false }); return true },
  undoStack: [], redoStack: [], historyGrouping: false, historyGroupRecorded: false,
  beginHistoryGroup: () => set({ historyGrouping: true, historyGroupRecorded: false }),
  endHistoryGroup: () => set({ historyGrouping: false, historyGroupRecorded: false }),
  undo: () => {
    const state = get(), previous = state.undoStack.at(-1)
    if (!previous || !state.show) return
    const next = structuredClone(previous)
    // Restoring an older cue list can drop the cue the active id points
    // at — a dangling id makes every later wheel write silently drop
    // (Jake, 20 Nov 2026), so the id is cleared unless the cue survives.
    const activeCueId = next.cues.some((item) => item.id === state.activeCueId) ? state.activeCueId : null
    set({ show: next, cues: next.cues, presets: next.presets ?? [], effects: next.effects ?? [], automations: next.automations, cueLists: next.cueLists ?? [], midiMappings: next.midiMappings ?? [], master: next.masterIntensity ?? 255, bpm: next.bpm ?? 120, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, structuredClone(state.show)].slice(-200), historyGrouping: false, historyGroupRecorded: false, selectedPageObjects: [], activeCueId })
    const cue = next.cues.find((item) => item.id === activeCueId)
    if (!state.blackout) sendImmediate(cue ? cueOutput(get(), cue) : defaultsPatch(get()))
  },
  redo: () => {
    const state = get(), following = state.redoStack.at(-1)
    if (!following || !state.show) return
    const next = structuredClone(following)
    const activeCueId = next.cues.some((item) => item.id === state.activeCueId) ? state.activeCueId : null
    set({ show: next, cues: next.cues, presets: next.presets ?? [], effects: next.effects ?? [], automations: next.automations, cueLists: next.cueLists ?? [], midiMappings: next.midiMappings ?? [], master: next.masterIntensity ?? 255, bpm: next.bpm ?? 120, undoStack: [...state.undoStack, structuredClone(state.show)].slice(-200), redoStack: state.redoStack.slice(0, -1), historyGrouping: false, historyGroupRecorded: false, selectedPageObjects: [], activeCueId })
    const cue = next.cues.find((item) => item.id === activeCueId)
    if (!state.blackout) sendImmediate(cue ? cueOutput(get(), cue) : defaultsPatch(get()))
  },
  show: defaultShow,
  cues: defaultShow.cues,
  presets: defaultShow.presets ?? [],
  activeSequenceIds: [],
  activePresetIds: [],
  activeLiveValues: {},
  liveActivationOrder: {},
  liveActivationCounter: 0,
  activeLivePageId: null,
  pageActiveValues: {},
  liveEditing: false,
  liveAlignmentOff: false,
  previewEditing: false,
  selectedPreviewTrussId: null,
  selectedLayoutTrussIds: [],
  selectedStageObjectId: null,
  editingPresetId: null,
  editingCueAdHocId: null,
  showOverrideLabels: false,
  previewPresetId: null,
  contentsPreview: null,
  paletteReveal: null,
  selectedPageObjects: [],
  pageClipboard: null,
  manualOverrides: {},
  manualFans: [],
  oflProfiles: [],
  oflHealRevision: 0,
  automations: defaultShow.automations,
  effects: defaultShow.effects ?? [],
  cueLists: defaultShow.cueLists ?? [],
  midiMappings: defaultShow.midiMappings ?? [],
  master: defaultShow.masterIntensity ?? 255,
  blackout: false,
  blind: false,
  freeze: false,
  highlightMode: false,
  setupWizardStep: null,
  welcomeOpen: true,
  newProjectDialogOpen: false,
  newProjectTemplate: null,
  bpm: 120,
  isPlaying: false,
  activeCueId: null,
  selectedFixtureIds: [],
  newFixtureIds: [],
  activeCueListId: defaultShow.cueLists?.[0]?.id ?? null,
  activeCueIndex: -1,
  cuePlaying: false,
  cuePaused: false,
  cueRevision: 0,
  manualCrossfade: 1,
  manualCrossfadeAnchor: 1,

  setOflProfiles: (profiles) => {
    const state = get()
    if (!state.show) { set({ oflProfiles: profiles }); return }
    // A show opened before the library arrived heals the moment it lands
    // (Jake, 20 Nov 2026, image-18): re-run the migration with the OFL
    // profiles now known. Only the fixtures can change here — the show
    // was already migrated at load — so nothing else is re-applied, and
    // when nothing healed the show object is left untouched. The App's
    // output effects all depend on show.fixtures, so a healed show
    // re-sends its defaults to the hardware through the normal path.
    const healed = migrateShow(state.show, profiles)
    if (JSON.stringify(healed.fixtures) === JSON.stringify(state.show.fixtures)) { set({ oflProfiles: profiles }); return }
    // The heal is load-time normalisation, not a user edit (Jake,
    // 23 Nov 2026 — the quit hang): the startup heal used to mark the
    // untouched demo "Unsaved" and the autosave then silently rewrote
    // it, so a red-dot close or opening a recent prompted for changes
    // nobody made. Apply the healed fixtures without persistState — no
    // updatedAt bump, no undo entry — and bump oflHealRevision so
    // ProjectBar re-bases the saved snapshot onto the healed fixtures.
    // The healed fixtures still reach disk with the next real save;
    // until then the heal re-applies idempotently on the next load.
    set({ oflProfiles: profiles, oflHealRevision: state.oflHealRevision + 1, show: { ...state.show, fixtures: healed.fixtures } })
  },

  setShow: (show) => {
    if (show) show = migrateShow(show, get().oflProfiles)
    // Loading a different show must not leave the previous show's look
    // latched on the outputs.
    flashState = null
    editingCueAdHocSnapshot = null
    configureSequences([])
    configureLocateOutput({})
    suppressPresetsForCue(false)
    configurePresetOutput({})
    configureLiveOutput({})
    configureOverrideOutput({})
    setEffectBlackout(false)
    setBlindOutput(false)
    setFreezeOutput(false, 0)
    setHighlightOutput(false, [])
    sendImmediate(allZeroPatch())
    // Startup restore (Guide ch.11, p.176): only the cues on VISIBLE
    // pages have an effect on fixtures — so a restore only brings back
    // the restored page's lit buttons, never buttons lit on a hidden
    // page (those used to come back driving the rig with nothing
    // visibly lit on the page in front of the operator — Jake, 27 Nov
    // 2026, "Full On keeps activating with nothing selected"). The
    // active cue comes back only when a lit button on that visible page
    // points at it; a cue with no lit control on the visible page (an
    // orphan, or one left over from a cuelist that is not playing on
    // load) stays off.
    const restoring = show?.startup?.mode === 'restore'
    const restoredPageId = restoring && show?.livePages?.some((p) => p.id === show?.startup?.pageId) ? show?.startup?.pageId ?? null : show?.livePages?.[0]?.id ?? null
    const restoredPage = show?.livePages?.find((p) => p.id === restoredPageId)
    const restoredLiveValues: Record<string, number> = restoring
      ? Object.fromEntries(Object.entries(show?.startup?.liveValues ?? {}).filter(([id, value]) => Number.isFinite(value) && restoredPage?.controls.some((c) => c.id === id)).map(([id, value]) => [id, clamp(value)]))
      : {}
    const restoredCueId = restoring && show?.cues.some((s) => s.id === show?.startup?.cueId) && Object.keys(restoredLiveValues).some((id) => restoredLiveValues[id] > 0 && restoredPage?.controls.find((c) => c.id === id)?.cueId === show?.startup?.cueId)
      ? show?.startup?.cueId ?? null
      : null
    set({
      undoStack: [], redoStack: [], historyGrouping: false, historyGroupRecorded: false,
      show,
      activeSequenceIds: [],
      cues: show?.cues ?? [],
      presets: show?.presets ?? [],
      activePresetIds: show?.startup?.mode === 'restore' ? (show.startup.presetIds ?? []).filter((id) => show.presets?.some((p) => p.id === id)) : [],
      activeLiveValues: restoredLiveValues,
      liveActivationOrder: {},
      liveActivationCounter: 0,
      activeLivePageId: restoredPageId,
      pageActiveValues: {},
      liveEditing: false,
      liveAlignmentOff: false,
      previewEditing: false,
      selectedPreviewTrussId: null,
      selectedLayoutTrussIds: [],
      selectedStageObjectId: null,
      selectedPageObjects: [],
      pageClipboard: null,
      manualOverrides: {},
      manualFans: [],
      editingCueAdHocId: null,
      showOverrideLabels: false,
      previewPresetId: null,
      contentsPreview: null,
      paletteReveal: null,
      previewEffect: null,
      previewEffectTemplateId: null,
      automations: show?.automations ?? [],
      effects: show?.effects ?? [],
      effectClipboard: null,
      editingEffectId: null,
      editingEffectTemplateId: null,
      effectChooserAttribute: null,
      cueLists: show?.cueLists ?? [],
      midiMappings: show?.midiMappings ?? [],
      master: show?.masterIntensity ?? 255,
      blackout: false,
      blind: false,
      freeze: false,
      highlightMode: false,
      setupWizardStep: null,
      bpm: show?.bpm ?? 120,
      activeCueId: restoredCueId,
      selectedFixtureIds: [],
      selectedBeams: [],
      newFixtureIds: [],
      activeCueListId: show?.cueLists?.[0]?.id ?? null,
      activeCueIndex: -1,
      cuePlaying: false,
      cueRevision: get().cueRevision + 1,
      manualCrossfade: 1,
      manualCrossfadeAnchor: 1
    })
    const restored = get().cues.find((cue) => cue.id === get().activeCueId)
    if (restored) sendImmediate(cueOutput(get(), restored))
    else if (show) sendImmediate(defaultsPatch(get()))
    // "Activate at startup" (Guide ch.11, p.204): cue buttons on the
    // visible page flagged for startup activate when a project opens.
    // Ignored when the startup mode restores the last state, as the guide
    // requires. setLiveValue applies the usual exclusivity and
    // touching-group rules, so two flagged cues in one exclusive frame
    // still end with one lit.
    if (show && show.startup?.mode !== 'restore') {
      const page = show.livePages?.find((p) => p.id === get().activeLivePageId) ?? show.livePages?.[0]
      for (const control of page?.controls ?? []) if (control.activateAtStartup) get().setLiveValue(control.id, 255)
    }
  },
  setStartupMode: (mode) => set((state) => persistState(state, { startup: { ...state.show?.startup, mode } })),
  showForSave: () => {
    const state = get()
    if (!state.show || state.show.startup?.mode !== 'restore') return state.show
    return { ...state.show, startup: { mode: 'restore', presetIds: [...state.activePresetIds], liveValues: Object.fromEntries(Object.entries(state.activeLiveValues).filter(([, value]) => value > 0)), pageId: state.activeLivePageId, cueId: state.activeCueId } }
  },
  setLivePages: (livePages) => set((state) => saveLivePages(state, livePages)),
  setControlCue: (controlId, cueId) => {
    const state = get()
    const page = activeLivePage(state)
    const control = page?.controls.find((c) => c.id === controlId)
    if (!page || !control || control.cueId === cueId) return
    const oldId = control.cueId
    const nextPages = state.show!.livePages!.map((item) =>
      item.id === page.id
        ? { ...item, controls: item.controls.map((c) => c.id === controlId ? { ...c, cueId } : c) }
        : item
    )
    // Unlinking a button's cue (Jake, 27 Nov 2026): the old cue is
    // deleted from memory when nothing else references it.
    const { cues, swept } = sweepUnreferencedCues(state.cues, nextPages, state.cueLists, oldId ? [oldId] : [], state.pageClipboard)
    const activeCleared = swept.includes(state.activeCueId ?? '')
    set((s) => persistState(s, { livePages: nextPages, cues }, { cues, ...(activeCleared ? { activeCueId: null } : {}) }))
    if (activeCleared) get().refreshBaseOutput()
  },
  dropOnLivePage: (payload, target, split) => set((state) => {
    const page = activeLivePage(state)
    if (!page || !state.show) return state
    // Dropping onto a button that carries a cue adds to the CUE (Video 2:
    // dragging a preset onto an existing button adds it to that button's
    // queue — the Get Info list shows it and it travels with the cue).
    // A standalone button takes it into its own lists, as before.
    if (target.kind === 'cue') {
      const control = page.controls.find((item) => item.id === target.cueId)
      if (control?.cueId) {
        const clean = normalizeDropPayload(payload)
        if (clean.ndiAmbience || clean.effectIds.length || (!clean.presetIds.length && !clean.sequenceIds.length)) return state
        const cues = state.cues.map((item) => item.id === control.cueId ? { ...item, presetIds: [...new Set([...(item.presetIds ?? []), ...clean.presetIds])], sequenceIds: [...new Set([...(item.sequenceIds ?? []), ...clean.sequenceIds])] } : item)
        return { ...persistState(state, { cues }, { cues }), selectedPageObjects: [{ type: 'cue' as const, id: control.id }] }
      }
      // A cuelist step addresses its cue definition directly by cue id
      // (the step inspector's drop, Jake 27 Nov 2026 — cuelist widget
      // replication): a step has no button, so there is no control to
      // resolve through, and the drop above silently did nothing because
      // no control carries the cue's id (found by the real-app probe).
      // The selection is left alone — the widget stays selected and the
      // inspector stays open.
      const cue = state.cues.find((item) => item.id === target.cueId)
      if (cue) {
        const clean = normalizeDropPayload(payload)
        if (clean.ndiAmbience || clean.effectIds.length || (!clean.presetIds.length && !clean.sequenceIds.length)) return state
        const cues = state.cues.map((item) => item.id === cue.id ? { ...item, presetIds: [...new Set([...(item.presetIds ?? []), ...clean.presetIds])], sequenceIds: [...new Set([...(item.sequenceIds ?? []), ...clean.sequenceIds])] } : item)
        return { ...persistState(state, { cues }, { cues }) }
      }
    }
    let n = 0
    const { page: next, refs } = applyLiveDrop(page, payload, target, () => `page-object-${Date.now()}-${++n}`, page.defaultStyles, split)
    if (!refs.length) return state
    return {
      ...saveLivePages(state, state.show.livePages!.map((item) => item.id === page.id ? next : item)),
      selectedPageObjects: refs
    }
  }),
  updateProject: (patch) => set((state) => persistState(state, patch)),
  updatePreferences: (patch) => set((state) => persistState(state, { preferences: { defaultFadeMs: 1000, pageFadeMs: 500, theme: 'dark', dmxProtocol: 'open-dmx-usb', ...state.show?.preferences, ...patch } })),
  setLiveValue: (id, value) => {
    set((state) => {
      const level = clamp(value)
      // Always active (Guide ch.11, p.204): a toggle button attached to
      // others keeps one of the group lit — turning off the only lit
      // button in its group is refused. Switching still works: the
      // exclusive / touching release below deletes the old button's
      // value directly, never through this guard.
      if (level === 0) {
        for (const page of state.show?.livePages ?? []) {
          const control = page.controls.find((cue) => cue.id === id)
          if (!control || !isLatchingControl(control) || !control.alwaysActive) continue
          if (!((state.activeLiveValues[id] ?? 0) > 0)) continue
          const attachedIds = page.controls.filter((other) => other.id !== id && (other.attachedTo === id || control.attachedTo === other.id)).map((other) => other.id)
          const siblings = [...new Set([...touchingGroupSiblings(page, id), ...attachedIds])]
          if (siblings.length && !siblings.some((sibling) => (state.activeLiveValues[sibling] ?? 0) > 0)) return state
        }
      }
      const activeLiveValues = { ...state.activeLiveValues, [id]: level }
      // Activating a cue in an exclusive frame releases the frame's other cues.
      if (level > 0) for (const page of state.show?.livePages ?? []) {
        if (!page.controls.some((cue) => cue.id === id)) continue
        if (page.controls.find((cue) => cue.id === id)?.appearance?.releaseOthers) for (const cue of page.controls) if (cue.id !== id) delete activeLiveValues[cue.id]
        for (const sibling of exclusiveSiblings(page, id)) delete activeLiveValues[sibling]
        // Activating a cue in a touching-button group releases the group's
        // other cues (Guide ch.11, pp.183–184 "Attach buttons": only one
        // attached button can be active at a time).
        for (const sibling of touchingGroupSiblings(page, id)) delete activeLiveValues[sibling]
      }
      const liveActivationCounter = level > 0 ? state.liveActivationCounter + 1 : state.liveActivationCounter
      const liveActivationOrder = level > 0 ? { ...state.liveActivationOrder, [id]: liveActivationCounter } : state.liveActivationOrder
      return { activeLiveValues, liveActivationOrder, liveActivationCounter }
    })
    // A Live pad changes the dimmer the fixtures are actually at, so
    // the base look must re-resolve against it (Jake, 22 Nov 2026):
    // a pressed Full On pad lifts an active palette preset and raises
    // the default blue, and releasing it drops both again. A latching
    // push-button press is a transition, so its base lift fades over
    // the active Live page's fade where set, else the global Default
    // fade (Jake, 24 Nov 2026). A fader drag or flash press stays
    // immediate — it must not start a fade (livePageFadeWiring.test.tsx).
    const control = get().show?.livePages?.flatMap((page) => page.controls).find((item) => item.id === id)
    get().refreshBaseOutput(control && isLatchingControl(control) ? liveTransitionFadeMs(get()) : undefined)
  },
  getLiveOutputLevels: () => {
    const state = get()
    return liveOutputLevels(state.show?.livePages, state.activeLiveValues)
  },
  clearLiveValues: () => set((state) => {
    const pageActiveValues = { ...state.pageActiveValues }
    if (state.activeLivePageId) delete pageActiveValues[state.activeLivePageId]
    return { activeLiveValues: {}, pageActiveValues }
  }),
  selectLivePage: (id) => set((state) => ({
    ...switchLivePage(
      { activeLivePageId: state.activeLivePageId, activeLiveValues: state.activeLiveValues, pageActiveValues: state.pageActiveValues },
      id,
      state.show?.deactivateOnPageSwitch === true
    ),
    selectedPageObjects: []
  })),
  setPageSwitchMode: (deactivateOnSwitch) => set((state) => persistState(state, { deactivateOnPageSwitch: deactivateOnSwitch })),

  setPageObjectSelection: (refs) => set({ selectedPageObjects: refs }),
  setLiveEditing: (editing) => set({ liveEditing: editing }),
  setLiveAlignmentOff: (off) => set({ liveAlignmentOff: off }),
  setPreviewEditing: (editing) => set({ previewEditing: editing }),
  setSelectedPreviewTrussId: (value) => set({ selectedPreviewTrussId: value }),
  setSelectedLayoutTrussIds: (value) => set({ selectedLayoutTrussIds: value }),
  setSelectedStageObjectId: (value) => set({ selectedStageObjectId: value }),
  togglePageObjectSelection: (ref) => set((state) => {
    const exists = state.selectedPageObjects.some((item) => item.type === ref.type && item.id === ref.id)
    return {
      selectedPageObjects: exists
        ? state.selectedPageObjects.filter((item) => !(item.type === ref.type && item.id === ref.id))
        : [...state.selectedPageObjects, ref]
    }
  }),
  selectPageObjectsInRect: (rect) => set((state) => {
    const page = activeLivePage(state)
    return { selectedPageObjects: page ? objectsInRect(page, rect) : [] }
  }),
  clearPageObjectSelection: () => set({ selectedPageObjects: [] }),

  moveSelectedPageObjects: (dx, dy) => set((state) => {
    const page = activeLivePage(state)
    if (!page || !state.selectedPageObjects.length) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? moveObjects(page, state.selectedPageObjects, dx, dy) : item))
  }),
  resizePageObject: (ref, width, height) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? resizeObject(page, ref, width, height) : item))
  }),
  resizePageObjectTo: (ref, x, y, width, height) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? resizeObjectTo(page, ref, x, y, width, height) : item))
  }),
  renamePageObject: (ref, name) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? renameObject(page, ref, name) : item))
  }),
  attachPageObject: (ref, targetId) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? setAttachment(page, ref, targetId) : item))
  }),
  setPageObjectStyle: (ref, patch) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? setObjectStyle(page, ref, patch) : item))
  }),
  configureFrame: (frameId, patch) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? setFrameConfig(page, frameId, patch) : item))
  }),
  editCueContents: (controlId, command) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? applyCueContents(control, command) : control) } : item))
  }),
  editCueDefContents: (cueId, command) => set((state) => {
    if (!state.cues.some((item) => item.id === cueId)) return state
    const cues = state.cues.map((item) => item.id === cueId ? applyCueDefContents(item, command) : item)
    return persistState(state, { cues }, { cues })
  }),
  promoteAdHocToPreset: (source) => {
    let created: string | null = null
    set((state) => {
      const cue = 'cueId' in source ? state.cues.find((item) => item.id === source.cueId) : undefined
      const page = activeLivePage(state)
      const control = 'controlId' in source ? page?.controls.find((item) => item.id === source.controlId) : undefined
      const values = cue?.fixtureValues ?? control?.adHocValues ?? {}
      if (!Object.keys(values).length) return state
      // A captured preset carries the whole base colour in the file
      // itself, exactly like capturePresetFromLook — so the promoted
      // preset means the same look everywhere it is applied.
      const preset: PresetDef = { id: crypto.randomUUID(), name: uniquePresetName(`${cue?.name ?? control?.name ?? 'Ad hoc'} ad hoc`, state.presets.map((p) => p.name)), category: derivePresetCategory(values), fixtureValues: completePresetBaseColour(values, state.show?.fixtures ?? []) }
      created = preset.id
      const presets = [...state.presets, preset]
      if (cue) {
        const cues = state.cues.map((item) => item.id === cue.id ? { ...item, presetIds: [...new Set([...(item.presetIds ?? []), preset.id])], fixtureValues: {} } : item)
        return persistState(state, { presets, cues }, { presets, cues })
      }
      if (!page || !control) return state
      const nextPage = { ...page, controls: page.controls.map((item) => item.id === control.id ? { ...item, presetIds: [...new Set([...item.presetIds, preset.id])], adHocValues: {} } : item) }
      const livePages = state.show!.livePages!.map((item) => item.id === page.id ? nextPage : item)
      return persistState(state, { presets, livePages }, { presets })
    })
    return created
  },
  configureFramePrevNext: (frameId, mode) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    const frame = page.annotations?.find((a) => a.id === frameId && a.type === 'frame')
    if (!frame) return state
    const members = frameMembers(page, frameId)
    const wantPrevious = mode === 'previous' || mode === 'both'
    const wantNext = mode === 'next' || mode === 'both'
    // Drop the step buttons that are no longer wanted; keep the ones
    // that are (so their position survives a re-select).
    let controls = page.controls.filter((c) => !(members.includes(c.id) && c.frameStep && ((c.frameStep === 'previous' && !wantPrevious) || (c.frameStep === 'next' && !wantNext))))
    const stepY = frame.y + frame.height - 32
    if (wantPrevious && !controls.some((c) => members.includes(c.id) && c.frameStep === 'previous')) controls = [...controls, newCueObject(crypto.randomUUID(), frame.x + 8, stepY, page.defaultStyles, { name: '‹ Previous', type: 'push', behavior: 'flash', frameStep: 'previous', width: 64, height: 24 })]
    if (wantNext && !controls.some((c) => members.includes(c.id) && c.frameStep === 'next')) controls = [...controls, newCueObject(crypto.randomUUID(), frame.x + frame.width - 72, stepY, page.defaultStyles, { name: 'Next ›', type: 'push', behavior: 'flash', frameStep: 'next', width: 64, height: 24 })]
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...page, controls } : item))
  }),
  removeFromFrame: (controlId) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    const control = page.controls.find((c) => c.id === controlId)
    if (!control) return state
    const frameId = frameForCue(page, controlId)
    if (!frameId) return state
    const frame = (page.annotations ?? []).find((a) => a.id === frameId)
    if (!frame) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...page, controls: page.controls.map((c) => c.id === controlId ? { ...c, y: frame.y + frame.height + 10 } : c) } : item))
  }),
  deactivateCompletedSequences: () => {
    const ids = completedSequenceIds()
    if (!ids.length) return
    const state = get()
    for (const page of state.show?.livePages ?? []) for (const control of page.controls) {
      if (!((state.activeLiveValues[control.id] ?? 0) > 0)) continue
      const cue = control.cueId ? state.cues.find((item) => item.id === control.cueId) : undefined
      if ([...(cue?.sequenceIds ?? []), ...(control.sequenceIds ?? [])].some((id) => ids.includes(id))) get().setLiveValue(control.id, 0)
    }
    const activeCue = state.cues.find((item) => item.id === state.activeCueId)
    if (activeCue && (activeCue.sequenceIds ?? []).some((id) => ids.includes(id))) get().deactivateCue()
    if (state.activeSequenceIds.some((id) => ids.includes(id))) set((current) => ({ activeSequenceIds: current.activeSequenceIds.filter((id) => !ids.includes(id)) }))
  },
  configureCueTiming: (controlId, patch) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, timing: { fadeInMs: 0, fadeOutMs: 0, delayMs: 0, curve: 'linear', ...control.timing, ...patch } } : control) } : item))
  }),
  configureCueAppearance: (controlId, patch) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, appearance: { color: '#47235a', releaseOthers: false, ...control.appearance, ...patch } } : control) } : item))
  }),
  configureControlType: (controlId, type) => {
    get().setLiveValue(controlId, 0)
    set((state) => {
      const page = activeLivePage(state)
      if (!page) return state
      // A control's shape follows its type (Jake's LightKey screenshots,
      // 27 Nov 2026 — faders are tall narrow tracks, or the same track
      // turned sideways; a Push Button is 120x40). Switching type
      // resizes to the type's default; the 8-handle resize can change
      // it after.
      const size = type === 'faderVertical' ? LIVE_FADER_VERTICAL_SIZE : type === 'faderHorizontal' ? LIVE_FADER_HORIZONTAL_SIZE : LIVE_CUE_SIZE
      return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, type, width: size.width, height: size.height } : control) } : item))
    })
  },
  configureControlBehavior: (controlId, behavior) => {
    get().setLiveValue(controlId, 0)
    set((state) => {
      const page = activeLivePage(state)
      if (!page) return state
      return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, behavior } : control) } : item))
    })
  },
  toggleCueModifier: (controlId, modifier) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => {
      if (control.id !== controlId) return control
      const selected = control.selectedModifiers ?? []
      return { ...control, selectedModifiers: selected.includes(modifier) ? selected.filter((key) => key !== modifier) : [...selected, modifier] }
    }) } : item))
  }),
  configureCueModifiers: (controlId, patch) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    const clampModifier = (value: number) => Math.max(0, Math.min(200, Number.isFinite(value) ? value : 100))
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, modifiers: Object.fromEntries(Object.entries({ intensity: 100, speed: 100, size: 100, ...control.modifiers, ...patch }).map(([key, value]) => [key, clampModifier(value)])) as NonNullable<LiveControl['modifiers']> } : control) } : item))
  }),
  configureFaderControls: (controlId, controls) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, faderControls: controls } : control) } : item))
  }),
  configureSpeedModifierOptions: (controlId, options) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, speedModifierOptions: options } : control) } : item))
  }),
  configureCuePriority: (controlId, priority) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, priority: Number.isFinite(priority) ? Math.round(priority) : 0 } : control) } : item))
  }),
  configureCueFrameStep: (controlId, action) => set((state) => {
    const page = activeLivePage(state)
    if (!page) return state
    return saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? { ...item, controls: item.controls.map((control) => control.id === controlId ? { ...control, frameStep: action } : control) } : item))
  }),
  editCueListCommand: (listId, command) => {
    const state = get()
    const list = state.cueLists.find((l) => l.id === listId)
    // 'remove' drops a step; 'rename-step' re-points one — either way the
    // OLD cue may have just lost its last reference (Jake, 27 Nov 2026:
    // removing a cue from a cuelist deletes it from memory when nothing
    // else references it).
    const oldStep = command.type === 'remove' || command.type === 'rename-step'
      ? list?.steps.find((step) => step.id === command.id)
      : undefined
    const nextLists = state.cueLists.map((item) => item.id === listId ? applyCueListCommand(item, command) : item)
    const { cues, swept } = sweepUnreferencedCues(state.cues, state.show?.livePages ?? [], nextLists, oldStep ? [oldStep.cueId] : [], state.pageClipboard)
    const activeCleared = swept.includes(state.activeCueId ?? '')
    set((s) => persistState(s, { cueLists: nextLists, cues }, { cueLists: nextLists, cues, ...(activeCleared ? { activeCueId: null } : {}) }))
    if (activeCleared) get().refreshBaseOutput()
  },
  deleteSelectedPageObjects: () => {
    let activeCleared = false
    set((state) => {
      const page = activeLivePage(state)
      if (!page || !state.selectedPageObjects.length) return state
      const deletedIds = new Set(state.selectedPageObjects.filter((ref) => ref.type === 'cue').map((ref) => ref.id))
      const activeLiveValues = Object.fromEntries(Object.entries(state.activeLiveValues).filter(([id]) => !deletedIds.has(id)))
      const pageActiveValues = Object.fromEntries(Object.entries(state.pageActiveValues).map(([pageId, values]) =>
        [pageId, Object.fromEntries(Object.entries(values).filter(([id]) => !deletedIds.has(id)))]
      ))
      const nextPages = state.show!.livePages!.map((item) => item.id === page.id ? deleteObjects(page, state.selectedPageObjects) : item)
      // Deleting a cue button off the canvas (Jake, 27 Nov 2026): its cue
      // is deleted from memory when nothing else references it. One
      // persistState so the undo entry covers both the button and the cue.
      const deletedCueIds = page.controls.filter((c) => deletedIds.has(c.id)).map((c) => c.cueId).filter((id): id is string => Boolean(id))
      // Deleting a cuelist WIDGET (Jake, 27 Nov 2026 — the widget-scoped
      // lifecycle): when no widget on any page shows the list any more,
      // the list itself goes with it, and its step cues are swept like
      // a deleted button's cue. Cut is the exception: the clipboard
      // holds the widget, so the list stays alive for Paste.
      const deletedWidgetIds = new Set(state.selectedPageObjects.filter((ref) => ref.type === 'list').map((ref) => ref.id))
      const deletedListIds = page.cueListWidgets?.filter((w) => deletedWidgetIds.has(w.id)).map((w) => w.cueListId) ?? []
      const stillReferenced = new Set<string>([
        ...nextPages.flatMap((p) => p.cueListWidgets?.map((w) => w.cueListId) ?? []),
        ...(state.pageClipboard?.widgets ?? []).map((w) => w.cueListId)
      ])
      const removedLists = state.cueLists.filter((l) => deletedListIds.includes(l.id) && !stillReferenced.has(l.id))
      const nextLists = state.cueLists.filter((l) => !removedLists.some((r) => r.id === l.id))
      const removedStepCueIds = removedLists.flatMap((l) => l.steps.map((step) => step.cueId))
      const { cues, swept } = sweepUnreferencedCues(state.cues, nextPages, nextLists, [...deletedCueIds, ...removedStepCueIds], state.pageClipboard)
      activeCleared = swept.includes(state.activeCueId ?? '')
      const activeListRemoved = removedLists.some((l) => l.id === state.activeCueListId)
      return {
        ...persistState(state, { livePages: nextPages, cues, cueLists: nextLists }, {
          cues,
          cueLists: nextLists,
          ...(activeCleared ? { activeCueId: null } : {}),
          ...(activeListRemoved ? { activeCueListId: nextLists[0]?.id ?? null, activeCueIndex: -1, cuePlaying: false, cuePaused: false } : {})
        }),
        activeLiveValues,
        pageActiveValues,
        selectedPageObjects: []
      }
    })
    if (activeCleared) get().refreshBaseOutput()
  },
  duplicateSelectedPageObjects: () => set((state) => {
    const page = activeLivePage(state)
    if (!page || !state.selectedPageObjects.length) return state
    let n = 0
    const { page: next, refs } = duplicateObjects(page, state.selectedPageObjects, () => `page-object-${Date.now()}-${++n}`)
    return {
      ...saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? next : item)),
      selectedPageObjects: refs
    }
  }),
  copySelectedPageObjects: () => set((state) => {
    const page = activeLivePage(state)
    return { pageClipboard: page ? copyObjects(page, state.selectedPageObjects) : null }
  }),
  pastePageObjects: (dx, dy) => set((state) => {
    const page = activeLivePage(state)
    if (!page || isClipboardEmpty(state.pageClipboard)) return state
    let n = 0
    const { page: next, refs } = pasteObjects(page, state.pageClipboard!, () => `page-object-${Date.now()}-${++n}`, dx, dy)
    return {
      ...saveLivePages(state, state.show!.livePages!.map((item) => item.id === page.id ? next : item)),
      selectedPageObjects: refs
    }
  }),

  setManualOverrides: (values) => set((state) => {
    const manualOverrides = { ...state.manualOverrides }
    for (const id of state.selectedFixtureIds) {
      const fixture = state.show?.fixtures.find((item) => item.id === id)
      if (!fixture) continue
      const valid = fixtureAttributes(fixture)
      const entries = Object.entries(values).filter(([key, value]) => valid.includes(key) && Number.isFinite(value)).map(([key, value]) => [key, clamp(value)])
      if (entries.length) manualOverrides[id] = { ...manualOverrides[id], ...Object.fromEntries(entries) }
    }
    return { manualOverrides }
  }),
  // Jake, 22 Nov 2026 (correction of the batch-6 call): Clear
  // Overrides clears only the manual Design overrides — a palette
  // preset that is switched on stays on, and is released by clicking
  // it again. This is LightKey's behaviour too (guide ch.8, p.80:
  // the brush clears overridden fixture properties only). The base
  // is re-sent by the App effect, which runs on every
  // manualOverrides change, so no refresh is needed here.
  clearManualOverrides: () => set({ manualOverrides: {}, manualFans: [] }),
  releaseManualOverrides: (fixtureIds, property) => set((state) => {
    const manualOverrides = releaseOverrides(state.manualOverrides, fixtureIds, property)
    return { manualOverrides, manualFans: pruneManualFans(manualOverrides, state.manualFans, state.show?.fixtures ?? []) }
  }),
  copyFixtureProperties: (property) => {
    const state = get(), fixture = state.show?.fixtures.find((f) => f.id === state.selectedFixtureIds[0])
    if (!fixture) return
    const activeCue = state.cues.find((s) => s.id === state.activeCueId)
    const values = { ...(activeCue ? resolveCueValues(activeCue, state.presets, state.show?.fixtures ?? []) : {})[fixture.id] }
    for (const id of state.activePresetIds) Object.assign(values, state.presets.find((p) => p.id === id)?.fixtureValues[fixture.id])
    Object.assign(values, state.manualOverrides[fixture.id])
    set({ propertyClipboard: { fixture: structuredClone(fixture), values: property && property in values ? { [property]: values[property] } : values, property } })
  },
  pasteFixtureProperties: (manual) => {
    const state = get(), clipboard = state.propertyClipboard
    if (!clipboard) return
    const patch = Object.fromEntries((state.show?.fixtures ?? []).filter((f) => state.selectedFixtureIds.includes(f.id)).map((f) => [f.id, clipboard.property && fixtureAttributes(f).includes(clipboard.property) ? { [clipboard.property]: clipboard.values[clipboard.property] } : mapCopiedProperties(clipboard.fixture, clipboard.values, f)]))
    // No explicit target: a Design paste defines overrides — unless a
    // cue's ad-hoc layer is being edited, when it pastes into the cue.
    const toOverrides = manual ?? !state.editingCueAdHocId
    if (toOverrides) { set({ manualOverrides: mergeManualOverrides(state.manualOverrides, patch) }); return }
    const targetId = state.editingCueAdHocId ?? state.activeCueId
    if (!targetId) get().ensureActiveCue()
    const cue = get().cues.find((s) => s.id === (get().editingCueAdHocId ?? get().activeCueId))
    if (!cue) return
    const fixtureValues = { ...cue.fixtureValues }
    for (const [id, values] of Object.entries(patch)) fixtureValues[id] = { ...fixtureValues[id], ...values }
    get().updateCue(cue.id, { fixtureValues })
  },
  saveFan: (fan) => {
    const state = get()
    if (!state.show) return
    const values = evaluateFan(state.show.fixtures, fan)
    // A Design fan defines the property for the fixture (Guide ch.8,
    // p.80) — like every other Design write it lands in the manual
    // overrides, never in a cue, so no cue is minted for a fan (Jake,
    // 26 Nov 2026: fanned values were invisible to the Overrides
    // brush). The fan definition lives in the session-only manualFans
    // list, so it stays re-editable from the Design panel. Only when
    // a cue's ad-hoc layer is being edited does the fan belong to
    // that cue. A fan id lives in exactly one place: committing a fan
    // whose id lives in the other place MOVES it, with its values, so
    // clearing the overrides later cannot resurrect the cue's copy
    // (or the other way round).
    if (!state.editingCueAdHocId) {
      const cue = state.cues.find((s) => (s.fans ?? []).some((f) => f.id === fan.id))
      if (cue) get().updateCue(cue.id, { fans: (cue.fans ?? []).filter((f) => f.id !== fan.id), fixtureValues: scrubFanValues(cue.fixtureValues, values) })
      const next = get()
      set({ manualOverrides: mergeManualOverrides(next.manualOverrides, values), manualFans: [...next.manualFans.filter((f) => f.id !== fan.id), structuredClone(fan)] })
      return
    }
    const cue = state.cues.find((s) => s.id === state.activeCueId)
    if (!cue) return
    const manualFans = state.manualFans.filter((f) => f.id !== fan.id)
    const manualOverrides = manualFans.length === state.manualFans.length
      ? state.manualOverrides
      : Object.fromEntries(Object.entries(scrubFanValues(state.manualOverrides, values)).filter(([, patch]) => Object.keys(patch).length))
    if (manualFans.length !== state.manualFans.length) set({ manualFans, manualOverrides })
    const fixtureValues = structuredClone(cue.fixtureValues)
    for (const [id, patch] of Object.entries(values)) fixtureValues[id] = { ...fixtureValues[id], ...patch }
    get().updateCue(cue.id, { fixtureValues, fans: [...(cue.fans ?? []).filter((f) => f.id !== fan.id), structuredClone(fan)] })
  },
  deleteFan: (id, keepValues) => {
    const state = get()
    if (!state.show) return
    // A session fan: drop it from the manual fans; unless its values
    // are kept, release exactly the keys it wrote from the overrides
    // (Guide p.123) — empty fixture entries are dropped, or the
    // Overrides brush would show with nothing to clear — and prune
    // any other fan left valueless by that.
    const manualFan = state.manualFans.find((f) => f.id === id)
    if (manualFan) {
      if (keepValues) { set({ manualFans: state.manualFans.filter((f) => f.id !== id) }); return }
      const scrubbed = scrubFanValues(state.manualOverrides, evaluateFan(state.show.fixtures, manualFan))
      const manualOverrides = Object.fromEntries(Object.entries(scrubbed).filter(([, patch]) => Object.keys(patch).length))
      set({ manualOverrides, manualFans: pruneManualFans(manualOverrides, state.manualFans.filter((f) => f.id !== id), state.show.fixtures) })
      return
    }
    const cue = state.cues.find((s) => s.id === state.activeCueId), fan = cue?.fans?.find((f) => f.id === id)
    if (!cue || !fan) return
    const fixtureValues = keepValues ? cue.fixtureValues : scrubFanValues(cue.fixtureValues, evaluateFan(state.show.fixtures, fan))
    get().updateCue(cue.id, { fans: cue.fans?.filter((f) => f.id !== id), fixtureValues })
  },
  setSelectedColor: (color, manual = false) => {
    const state = get(), patch: Record<string, Record<string, number>> = {}
    for (const id of state.selectedFixtureIds) { const f = state.show?.fixtures.find((f) => f.id === id); if (f) patch[id] = f.type === 'dimmer' ? { ...color } : mixColor(color, fixtureAttributes(f)) }
    if (manual) { set({ manualOverrides: Object.fromEntries([...new Set([...Object.keys(state.manualOverrides), ...Object.keys(patch)])].map((id) => [id, { ...state.manualOverrides[id], ...patch[id] }])) }); return }
    writeColourToActiveCue(get, patch)
  },
  setSelectedBaseColor: (color, manual = false) => {
    const state = get(), patch: Record<string, Record<string, number>> = {}
    for (const id of state.selectedFixtureIds) { const f = state.show?.fixtures.find((f) => f.id === id); if (f) patch[id] = f.type === 'dimmer' ? { ...color } : baseColorChannels(color, fixtureAttributes(f)) }
    if (manual) { set({ manualOverrides: Object.fromEntries([...new Set([...Object.keys(state.manualOverrides), ...Object.keys(patch)])].map((id) => [id, { ...state.manualOverrides[id], ...patch[id] }])) }); return }
    writeColourToActiveCue(get, patch)
  },
  setColorDefault: () => {
    const state = get()
    const fixtures = (state.show?.fixtures ?? []).filter((f) => state.selectedFixtureIds.includes(f.id))
    if (!fixtures.length) return
    const activeCue = state.cues.find((c) => c.id === state.activeCueId)
    const cueValues = activeCue ? resolveCueValues(activeCue, state.presets, state.show?.fixtures ?? []) : {}
    get().beginHistoryGroup()
    for (const fixture of fixtures) {
      const channels = colorChannels(fixtureAttributes(fixture))
      if (!channels.length) continue
      const defaults = defaultFixtureValues(fixture)
      const colour: Record<string, number> = {}
      for (const attr of channels) colour[attr] = cueValues[fixture.id]?.[attr] ?? defaults[attr] ?? 0
      get().updateFixture(fixture.id, { defaultValues: { ...fixture.defaultValues, ...colour } })
    }
    get().endHistoryGroup()
  },
  loadColorDefault: () => {
    const state = get()
    const fixtures = (state.show?.fixtures ?? []).filter((f) => state.selectedFixtureIds.includes(f.id))
    const patch: Record<string, Record<string, number>> = {}
    for (const fixture of fixtures) {
      const channels = colorChannels(fixtureAttributes(fixture))
      if (!channels.length) continue
      const defaults = defaultFixtureValues(fixture)
      const colour: Record<string, number> = {}
      for (const attr of channels) colour[attr] = defaults[attr] ?? 0
      patch[fixture.id] = colour
    }
    if (!Object.keys(patch).length) return
    if (state.editingPresetId) {
      // Load the defaults into the preset being edited, not the cue.
      const preset = state.presets.find((p) => p.id === state.editingPresetId)
      if (!preset) return
      const fixtureValues = structuredClone(preset.fixtureValues)
      for (const [id, values] of Object.entries(patch)) fixtureValues[id] = { ...fixtureValues[id], ...values }
      get().updatePresetContents(preset.id, fixtureValues)
      return
    }
    if (state.editingCueAdHocId) { writeColourToActiveCue(get, patch); return }
    set({ manualOverrides: mergeManualOverrides(state.manualOverrides, patch) })
  },
  resetColorDefault: () => {
    const state = get()
    const fixtures = (state.show?.fixtures ?? []).filter((f) => state.selectedFixtureIds.includes(f.id))
    if (!fixtures.length) return
    get().beginHistoryGroup()
    for (const fixture of fixtures) {
      const channels = colorChannels(fixtureAttributes(fixture))
      if (!channels.length || !channels.some((a) => fixture.defaultValues?.[a] !== undefined)) continue
      const next = { ...fixture.defaultValues }
      for (const attr of channels) delete next[attr]
      get().updateFixture(fixture.id, { defaultValues: next })
    }
    get().endHistoryGroup()
  },
  addColorFavorite: (hex) => {
    const favorite = normalizeColorFavorite(hex)
    if (!favorite) return
    set((state) => {
      const colorFavorites = state.show?.colorFavorites ?? []
      if (colorFavorites.includes(favorite)) return state
      return persistState(state, { colorFavorites: [...colorFavorites, favorite] })
    })
  },
  removeColorFavorite: (hex) => {
    const favorite = normalizeColorFavorite(hex)
    if (!favorite) return
    set((state) => {
      const colorFavorites = state.show?.colorFavorites ?? []
      if (!colorFavorites.includes(favorite)) return state
      return persistState(state, { colorFavorites: colorFavorites.filter((c) => c !== favorite) })
    })
  },
  locateFixtures: (ids) => { const state = get(); if (!state.blackout) configureLocateOutput(locateFixturePatch(state.show?.fixtures ?? [], ids, state.master)) },
  setBpm: (bpm) =>
    set((state) => {
      const next = Number.isFinite(bpm) ? Math.max(30, Math.min(240, Math.round(bpm))) : 120
      return persistState(state, { bpm: next }, { bpm: next })
    }),
  setAudioPath: (audioPath) =>
    set((state) => persistState(state, { audioPath: audioPath ?? undefined })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setMaster: (value) =>
    set((state) => {
      const master = clamp(value)
      if (!state.blackout) {
        const active = state.cues.find((s) => s.id === state.activeCueId)
        if (active) sendImmediate(cueOutput({ ...state, master }, active))
        else if (get().isPlaying) {
          // Automation loop reads master from the store on its next frame.
        }
      }
      return persistState(state, { masterIntensity: master }, { master })
    }),

  setBlackout: (active) =>
    set((state) => {
      if (active) {
        flashState = null
        setEffectBlackout(true)
        sendImmediate(allZeroPatch())
      } else {
        setEffectBlackout(false)
        const activeCue = state.cues.find((s) => s.id === state.activeCueId)
        if (activeCue) sendImmediate(cueOutput(state, activeCue))
        else if (state.show) sendImmediate(defaultsPatch(state))
      }
      return { blackout: active }
    }),

  toggleBlackout: () => get().setBlackout(!get().blackout),
  setBlind: (active) => { setBlindOutput(active); set({ blind: active }) },
  toggleBlind: () => get().setBlind(!get().blind),
  setFreeze: (active) => { setFreezeOutput(active); set({ freeze: active }) },
  toggleFreeze: () => get().setFreeze(!get().freeze),
  // Turning Highlight Mode off re-sends the unmodified look through the
  // output module, so the rig returns to exactly what it was doing —
  // nothing in the show was ever changed.
  setHighlightMode: (active) => { setHighlightOutput(active, active ? get().selectedFixtureIds : []); set({ highlightMode: active }) },
  toggleHighlightMode: () => get().setHighlightMode(!get().highlightMode),
  setSetupWizardStep: (step) => set({ setupWizardStep: step }),
  startSetupWizard: () => set({ setupWizardStep: 'dmx', welcomeOpen: false }),
  exitSetupWizard: () => set({ setupWizardStep: null }),
  setWelcomeOpen: (open) => set({ welcomeOpen: open }),
  setNewProjectDialogOpen: (open) => set({ newProjectDialogOpen: open }),
  setNewProjectTemplate: (template) => set({ newProjectTemplate: template }),
  groupSelection: () => {
    const state = get()
    if (state.selectedFixtureIds.length === 0) return
    const names = [...(state.show?.fixtureGroups ?? []).map((g) => g.name), ...(state.show?.fixtures ?? []).map((f) => f.group ?? '')]
    get().groupSelectedFixtures(nextGroupName(names))
  },
  createGroupsForMe: () => {
    const state = get()
    if (!state.show || state.show.fixtures.length === 0) return
    // The video's auto-grouping (06:30) "just put everything together" —
    // one group holding every fixture. Replicated, not improved.
    state.selectFixtures(state.show.fixtures.map((f) => f.id))
    get().groupSelectedFixtures('All Fixtures')
  },
  finishSetupWizard: () => {
    const state = get()
    if (state.setupWizardStep === null) return
    if (state.show && state.presets.length === 0) {
      // Go! used to mint a "Home" cue and activate it, so the rig came
      // on full (LightKey video 09:30). Jake, 26 Nov 2026: new projects
      // start with ZERO cues — instead the first preset, "Full", carries
      // the Home cue's values (dimmer full, pan/tilt at home, colour
      // unset so the default colour applies) and starts ACTIVE in the
      // palette, so the rig still comes on full at the start and he turns
      // it off by clicking "Full" in the palette. No cue is created or
      // activated here any more.
      const fixtureValues: PresetDef['fixtureValues'] = {}
      for (const fixture of state.show.fixtures) {
        const values = homeFixtureValues(fixture)
        if (Object.keys(values).length) fixtureValues[fixture.id] = values
      }
      if (Object.keys(fixtureValues).length) {
        const preset: PresetDef = { id: crypto.randomUUID(), name: 'Full', category: derivePresetCategory(fixtureValues), fixtureValues }
        set((s) => persistState(s, { presets: [...s.presets, preset] }, { presets: [...s.presets, preset] }))
        get().setActivePresets([preset.id])
      }
    }
    set({ setupWizardStep: null })
  },

  selectFixture: (id, additive = false) => {
    set((state) => {
      if (!state.show?.fixtures.some((fixture) => fixture.id === id)) return state
      const selectedFixtureIds = additive
        ? state.selectedFixtureIds.includes(id)
          ? state.selectedFixtureIds
          : [...state.selectedFixtureIds, id]
        : [id]
      return { selectedFixtureIds, selectedBeams: [] }
    })
    // While Highlight Mode is on, the highlight follows the selection:
    // selecting another fixture lights that one instead.
    const state = get()
    if (state.highlightMode) setHighlightOutput(true, state.selectedFixtureIds)
  },

  selectFixtures: (ids) => {
    set((state) => {
      const validIds = new Set(state.show?.fixtures.map((fixture) => fixture.id) ?? [])
      return { selectedFixtureIds: [...new Set(ids)].filter((id) => validIds.has(id)), selectedBeams: [] }
    })
    const state = get()
    if (state.highlightMode) setHighlightOutput(true, state.selectedFixtureIds)
  },
  selectFixtureBeam: (fixtureId, beamId, additive = false) => set((state) => {
    const fixture = state.show?.fixtures.find((f) => f.id === fixtureId)
    if (!fixture || !fixtureMode(fixture)?.beams?.some((b) => b.id === beamId)) return state
    const selectedBeams = additive ? [...state.selectedBeams.filter((b) => b.fixtureId !== fixtureId || b.beamId !== beamId), { fixtureId, beamId }] : [{ fixtureId, beamId }]
    return { selectedBeams, selectedFixtureIds: [...new Set(selectedBeams.map((b) => b.fixtureId))] }
  }),
  updateSelectedBeamValues: (values, manual = false) => {
    const state = get(), patch: Record<string, Record<string, number>> = {}
    for (const selected of state.selectedBeams) {
      const fixture = state.show?.fixtures.find((f) => f.id === selected.fixtureId), beam = fixture && fixtureMode(fixture)?.beams?.find((b) => b.id === selected.beamId)
      if (!fixture || !beam) continue
      const beamPatch = beamValuePatch(fixture, beam, values)
      if (Object.keys(beamPatch).length) patch[selected.fixtureId] = { ...patch[selected.fixtureId], ...beamPatch }
    }
    if (manual) { set({ manualOverrides: mergeManualOverrides(state.manualOverrides, patch) }); return }
    const targetId = state.editingCueAdHocId ?? state.activeCueId
    if (!targetId) get().ensureActiveCue()
    const cue = get().cues.find((s) => s.id === (get().editingCueAdHocId ?? get().activeCueId))
    if (!cue) return
    const fixtureValues = { ...cue.fixtureValues }
    for (const [id, attributes] of Object.entries(patch)) fixtureValues[id] = { ...fixtureValues[id], ...attributes }
    get().updateCue(cue.id, { fixtureValues })
  },

  updateBeamValues: (fixtureId, beamId, values, manual = false) => {
    const state = get()
    const fixture = state.show?.fixtures.find((f) => f.id === fixtureId), beam = fixture && fixtureMode(fixture)?.beams?.find((b) => b.id === beamId)
    if (!fixture || !beam) return
    const patch = beamValuePatch(fixture, beam, values)
    if (!Object.keys(patch).length) return
    if (manual) { set({ manualOverrides: mergeManualOverrides(state.manualOverrides, { [fixtureId]: patch }) }); return }
    const targetId = state.editingCueAdHocId ?? state.activeCueId
    if (!targetId) get().ensureActiveCue()
    const cue = get().cues.find((s) => s.id === (get().editingCueAdHocId ?? get().activeCueId))
    if (!cue) return
    get().updateCue(cue.id, { fixtureValues: { ...cue.fixtureValues, [fixtureId]: { ...cue.fixtureValues[fixtureId], ...patch } } })
  },

  groupSelectedFixtures: (name) => set((state) => {
    if (!state.show || !name.trim() || state.selectedFixtureIds.length === 0) return state
    const selected = new Set(state.selectedFixtureIds)
    const fixtures = state.show.fixtures.map((fixture) => selected.has(fixture.id) ? { ...fixture, group: name.trim() } : fixture)
    // Repair the group records to match the fields (moveFixturesToGroup):
    // the migration's 'Ungrouped' record would otherwise keep claiming
    // these fixtures and the new group would never appear. Passing
    // fixtureGroups explicitly also skips persistState's sync, which
    // would re-derive from the stale records.
    return persistState(state, { fixtures, fixtureGroups: moveFixturesToGroup(state.show.fixtureGroups ?? [], [...selected], name.trim()) })
  }),
  createFixtureGroup: (name, parentId = null) => {
    if (!name.trim()) return ''
    const id = crypto.randomUUID(), state = get()
    if (parentId && !state.show?.fixtureGroups?.some((g) => g.id === parentId)) return ''
    set(persistState(state, { fixtureGroups: [...(state.show?.fixtureGroups ?? []), { id, name: name.trim(), parentId, fixtureIds: [...state.selectedFixtureIds] }] }))
    return id
  },
  renameFixtureGroup: (id, name) => set((state) => !name.trim() ? state : persistState(state, { fixtureGroups: (state.show?.fixtureGroups ?? []).map((g) => g.id === id ? { ...g, name: name.trim() } : g) })),
  parentFixtureGroup: (id, parentId) => set((state) => canParentGroup(state.show?.fixtureGroups ?? [], id, parentId) ? persistState(state, { fixtureGroups: (state.show?.fixtureGroups ?? []).map((g) => g.id === id ? { ...g, parentId } : g) }) : state),
  moveFixtureGroup: (id, direction) => set((state) => {
    const groups = [...(state.show?.fixtureGroups ?? [])], index = groups.findIndex((g) => g.id === id)
    if (index < 0) return state
    const siblings = groups.map((g, i) => ({ g, i })).filter(({ g }) => g.parentId === groups[index].parentId), at = siblings.findIndex(({ g }) => g.id === id), swap = siblings[at + direction]?.i
    if (swap === undefined) return state
    ;[groups[index], groups[swap]] = [groups[swap], groups[index]]
    return persistState(state, { fixtureGroups: groups })
  }),
  removeFixtureGroup: (id) => set((state) => {
    const group = state.show?.fixtureGroups?.find((g) => g.id === id)
    const groups = (state.show?.fixtureGroups ?? []).filter((g) => g.id !== id).map((g) => g.parentId === id ? { ...g, parentId: group?.parentId } : g)
    const fixtures = (state.show?.fixtures ?? []).map((f) => group?.fixtureIds.includes(f.id) && !groups.some((g) => g.fixtureIds.includes(f.id)) ? { ...f, group: 'Ungrouped' } : f)
    return persistState(state, { fixtures, fixtureGroups: syncFixtureGroups(groups, fixtures) })
  }),
  // Ungroup (Guide p.64): the same dissolve as removeFixtureGroup, but
  // for every group containing a selected fixture, in one set. A
  // surviving child of a dissolved group is reparented to the nearest
  // surviving ancestor (or none) — removeFixtureGroup's single-group
  // reparent would strand it if its new parent is dissolved too.
  ungroupSelectedFixtures: () => set((state) => {
    if (!state.show || state.selectedFixtureIds.length === 0) return state
    const selected = new Set(state.selectedFixtureIds)
    const affected = (state.show.fixtureGroups ?? []).filter((g) => g.name !== 'Ungrouped' && g.fixtureIds.some((id) => selected.has(id)))
    if (affected.length === 0) return state
    const affectedIds = new Set(affected.map((g) => g.id))
    const groups = (state.show.fixtureGroups ?? []).filter((g) => !affectedIds.has(g.id)).map((g) => {
      if (!g.parentId || !affectedIds.has(g.parentId)) return g
      let parentId: string | null = affected.find((a) => a.id === g.parentId)?.parentId ?? null
      while (parentId && affectedIds.has(parentId)) parentId = affected.find((a) => a.id === parentId)?.parentId ?? null
      return { ...g, parentId }
    })
    const fixtures = (state.show?.fixtures ?? []).map((f) => affected.some((g) => g.fixtureIds.includes(f.id)) && !groups.some((g) => g.name !== 'Ungrouped' && g.fixtureIds.includes(f.id)) ? { ...f, group: 'Ungrouped' } : f)
    return persistState(state, { fixtures, fixtureGroups: syncFixtureGroups(groups, fixtures) })
  }),

  refreshBaseOutput: (fadeMs?: number) => {
    const state = get()
    if (!state.show || state.blackout) return
    const active = state.cues.find((cue) => cue.id === state.activeCueId)
    // Fade-aware (Jake, 24 Nov 2026): this used to sendImmediate, which
    // cancelled any in-flight base fade — so a cue recall snapped the
    // instant it started, because the manual-overrides effect calls
    // this on every cue activation. reassertBase leaves a fade alone
    // when it is already heading to this target, retargets it when the
    // look moved, and only sends immediately when nothing is fading
    // and the caller passed no fade time (a dimmer drag must still
    // show light at once, and fader drags/flash presses must not
    // start a fade). Callers that ARE a transition pass their fade
    // time — preset toggles and Live toggle presses pass the active
    // Live page's fade where set, else the global Default fade.
    reassertBase(active ? cueOutput(state, active) : defaultsPatch(state), fadeMs)
  },

  activateCue: (id) =>
    set((state) => {
      const cue = state.cues.find((s) => s.id === id)
      if (!cue) return state
      // Fade time (Jake, 24 Nov 2026): the cue's own fadeMs where set,
      // the global Default fade otherwise — a cue with no explicit
      // time fades over the global setting, it never snaps.
      if (!state.blackout) sendChannels(cueOutput(state, cue), resolveFadeMs({ explicitFadeMs: cue.fadeMs, defaultFadeMs: state.show?.preferences?.defaultFadeMs }))
      return {
        activeCueId: id,
        cuePlaying: false
      }
    }),

  deactivateCue: () =>
    set((state) => {
      if (!state.activeCueId) return state
      const cue = state.cues.find((s) => s.id === state.activeCueId)
      // Fade time mirrors activation (Jake, 24 Nov 2026): the cue's own
      // fadeMs where set, the global Default fade otherwise — the rig
      // fades out over the same time it faded in. The base look is
      // computed with the cue already cleared, so its values cannot
      // leak back in; active presets, overrides and Live values still
      // apply, as in refreshBaseOutput.
      if (!state.blackout) reassertBase(defaultsPatch({ ...state, activeCueId: null }), resolveFadeMs({ explicitFadeMs: cue?.fadeMs, defaultFadeMs: state.show?.preferences?.defaultFadeMs }))
      return {
        activeCueId: null,
        // A cue list playing this cue stops with it. The list position
        // (activeCueListId/activeCueIndex) is kept, so Go resumes from
        // the current step with cueNext.
        cuePlaying: false,
        cuePaused: false
      }
    }),

  flashCue: (id) =>
    set((state) => {
      const cue = state.cues.find((s) => s.id === id)
      if (!cue || state.blackout) return state
      // Nest only the first press; repeated presses shouldn't overwrite the look
      // we're flashing from.
      if (!flashState) {
        flashState = { patch: getCurrentPatch(), activeCueId: state.activeCueId }
      }
      sendImmediate(cueOutput(state, cue))
      return { activeCueId: id, cuePlaying: false }
    }),

  endFlash: () =>
    set((state) => {
      if (!flashState) return state
      const { patch, activeCueId } = flashState
      flashState = null
      suppressPresetsForCue(Boolean(state.cues.find((cue) => cue.id === activeCueId)?.blackout))
      if (!state.blackout) sendImmediate(patch)
      return { activeCueId }
    }),

  capturePreset: (name, category) => set((state) => {
    const cue = state.cues.find((item) => item.id === state.activeCueId)
    if (!cue || !state.show || !name.trim() || state.selectedFixtureIds.length === 0) return state
    const fixtureValues: PresetDef['fixtureValues'] = {}
    for (const fixture of state.show.fixtures) {
      if (!state.selectedFixtureIds.includes(fixture.id)) continue
      const supported = capturableAttributes(fixture)
      const source = resolveCueValues(cue, state.presets, state.show?.fixtures ?? [])[fixture.id] ?? {}
      // The category test is the shared one (presetProperties): its
      // colour match covers every beam ("red 2" and "red2" alike, any
      // pod), so a colour preset captured from a multipart look keeps
      // every cell, not just beam 1 (Jake, 19 Nov 2026).
      const entries = Object.entries(source).filter(([attribute, value]) => supported.has(attribute) && Number.isFinite(value) && matchesPresetCategory(attribute, category))
      if (entries.length) fixtureValues[fixture.id] = Object.fromEntries(entries)
    }
    if (!Object.keys(fixtureValues).length) return state
    const preset: PresetDef = { id: crypto.randomUUID(), name: name.trim(), category, fixtureValues }
    const presets = [...state.presets, preset]
    return persistState(state, { presets }, { presets })
  }),
  capturePresetFromLook: (snapshot, groupId = null) => {
    let created: { id: string; name: string } | null = null
    set((state) => {
      if (!state.show || state.selectedFixtureIds.length === 0) return state
      const fixtures = state.show.fixtures
      const cue = state.activeCueId ? state.cues.find((item) => item.id === state.activeCueId) : undefined
      const cueValues = cue ? resolveCueValues(cue, state.presets, fixtures) : {}
      const fixtureValues: PresetDef['fixtureValues'] = {}
      for (const fixture of fixtures) {
        if (!state.selectedFixtureIds.includes(fixture.id)) continue
        const supported = capturableAttributes(fixture)
        // Plain (Jake, 22 Nov 2026): whatever was touched in Design —
        // the manual overrides only, so an untouched property is not
        // saved. Snapshot: the combined current look — the active cue,
        // then any applied presets, then the overrides on top (a blue
        // preset plus a 90% dimmer override snapshots as both).
        const source: Record<string, number> = {}
        if (snapshot) {
          Object.assign(source, cueValues[fixture.id] ?? {})
          for (const activeId of state.activePresetIds) Object.assign(source, state.presets.find((p) => p.id === activeId)?.fixtureValues[fixture.id])
        }
        Object.assign(source, state.manualOverrides[fixture.id])
        const entries = Object.entries(source).filter(([attribute, value]) => supported.has(attribute) && Number.isFinite(value))
        if (entries.length) fixtureValues[fixture.id] = Object.fromEntries(entries)
      }
      if (!Object.keys(fixtureValues).length) return state
      // Jake, 22 Nov 2026: a newly captured preset carries the whole
      // base colour in the file itself — a red capture writes the other
      // colour values as zero, so the preset means red everywhere it is
      // applied (palette, Live pad, cue) instead of relying on each
      // layer to complete it. White / Amber / UV / Lime are never
      // filled and never trigger the fill (separate LEDs, Guide p.85),
      // and a dimmer-only capture is untouched.
      const completed = completePresetBaseColour(fixtureValues, fixtures)
      const name = uniquePresetName(autoPresetName(completed, state.selectedFixtureIds) ?? 'Preset', state.presets.map((p) => p.name))
      const preset: PresetDef = { id: crypto.randomUUID(), name, category: derivePresetCategory(completed), fixtureValues: completed }
      created = { id: preset.id, name }
      const presets = [...state.presets, preset]
      const presetGroups = groupId && state.show?.presetGroups?.some((g) => g.id === groupId)
        ? state.show.presetGroups.map((g) => g.id === groupId ? { ...g, presetIds: [...g.presetIds, preset.id] } : g)
        : undefined
      return persistState(state, { presets, ...(presetGroups ? { presetGroups } : {}) }, { presets })
    })
    return created
  },
  convertCuesToPresets: () => {
    const state = get()
    const existing = new Set(state.presets.map((p) => p.id))
    const converted = cuesToPresets(state.cues, state.show?.fixtures ?? []).filter((p) => !existing.has(p.id))
    if (!converted.length) return 0
    set((current) => {
      const presets = [...current.presets, ...converted]
      return persistState(current, { presets }, { presets })
    })
    return converted.length
  },
  togglePreset: (id) => {
    set((state) => {
      if (!state.presets.some((preset) => preset.id === id)) return state
      const activePresetIds = activateGroupedPreset(state.activePresetIds, id, state.show?.presetGroups ?? [])
      return { activePresetIds }
    })
    // The base look resolves its colours against the dimmer the
    // fixtures are actually at: a dimmer preset toggled on must raise
    // the default blue, and toggled off must drop it again (Jake,
    // 22 Nov 2026). A preset carries no fade time of its own, so the
    // change fades over the active Live page's fade where set, else
    // the global Default fade (Jake, 24 Nov 2026).
    get().refreshBaseOutput(liveTransitionFadeMs(get()))
  },
  setActivePresets: (ids) => {
    set((state) => {
      const valid = new Set(state.presets.map((preset) => preset.id))
      return { activePresetIds: ids.filter((id) => valid.has(id)) }
    })
    get().refreshBaseOutput(liveTransitionFadeMs(get()))
  },
  setActiveEffects: (ids) => {
    set((state) => {
      const valid = new Set(state.effects.map((effect) => effect.id))
      const wanted = new Set(ids.filter((id) => valid.has(id)))
      const effects = state.effects.map((effect) => ({ ...effect, enabled: wanted.has(effect.id) }))
      return persistState(state, { effects }, { effects })
    })
  },
  toggleSequence: (id) => set((state) => state.show?.sequences?.some((s) => s.id === id) ? { activeSequenceIds: state.activeSequenceIds.includes(id) ? state.activeSequenceIds.filter((item) => item !== id) : [...state.activeSequenceIds, id] } : state),
  stopSequences: () => set({ activeSequenceIds: [] }),
  clearPresets: () => {
    set({ activePresetIds: [] })
    get().refreshBaseOutput(liveTransitionFadeMs(get()))
  },
  createSequence: (name) => set((state) => {
    if (!name.trim()) return state
    const activeCue = state.cues.find((s) => s.id === state.activeCueId)
    const values = structuredClone(activeCue ? resolveCueValues(activeCue, state.presets, state.show?.fixtures ?? []) : {})
    for (const [id, patch] of Object.entries(state.manualOverrides)) values[id] = { ...values[id], ...patch }
    const sequence: SequenceDef = { id: crypto.randomUUID(), name: name.trim(), order: 'forward', loop: false, timing: 'manual', stepsPerBeat: 1, steps: [{ id: crypto.randomUUID(), name: 'Step 1', fixtureValues: values, presetIds: [], fadeMs: 1000, holdMs: 0 }] }
    return persistState(state, { sequences: [...(state.show?.sequences ?? []), sequence] })
  }),
  updateSequence: (id, patch) => set((state) => persistState(state, { sequences: (state.show?.sequences ?? []).map((s) => s.id === id ? { ...s, ...structuredClone(patch), id } : s) })),
  addSequenceStep: (id) => {
    const state = get(), sequence = state.show?.sequences?.find((s) => s.id === id)
    if (!sequence) return
    const activeCue = state.cues.find((s) => s.id === state.activeCueId)
    const fixtureValues = structuredClone(activeCue ? resolveCueValues(activeCue, state.presets, state.show?.fixtures ?? []) : {})
    for (const [fixtureId, patch] of Object.entries(state.manualOverrides)) fixtureValues[fixtureId] = { ...fixtureValues[fixtureId], ...patch }
    get().updateSequence(id, { steps: [...sequence.steps, { id: crypto.randomUUID(), name: `Step ${sequence.steps.length + 1}`, fixtureValues, presetIds: [], fadeMs: 0, holdMs: 1000 }] })
  },
  removeSequenceStep: (id, stepId) => { const sequence = get().show?.sequences?.find((s) => s.id === id); if (sequence) get().updateSequence(id, { steps: sequence.steps.filter((s) => s.id !== stepId) }) },
  duplicateSequenceStep: (id, stepId) => {
    const sequence = get().show?.sequences?.find((s) => s.id === id), index = sequence?.steps.findIndex((s) => s.id === stepId) ?? -1
    if (!sequence || index < 0) return
    const steps = [...sequence.steps]; steps.splice(index + 1, 0, { ...structuredClone(steps[index]), id: crypto.randomUUID(), name: `${steps[index].name} copy` }); get().updateSequence(id, { steps })
  },
  moveSequenceStep: (id, stepId, toIndex) => {
    const sequence = get().show?.sequences?.find((s) => s.id === id), index = sequence?.steps.findIndex((s) => s.id === stepId) ?? -1
    if (!sequence || index < 0) return
    const steps = [...sequence.steps], [step] = steps.splice(index, 1); steps.splice(Math.max(0, Math.min(steps.length, toIndex)), 0, step); get().updateSequence(id, { steps })
  },
  reorderSequenceSteps: (id, order, seed = Date.now()) => { const sequence = get().show?.sequences?.find((s) => s.id === id); if (sequence) get().updateSequence(id, { steps: sequenceOrder(sequence.steps.length, order, seed).map((index) => sequence.steps[index]) }) },
  deleteSequence: (id) => set((state) => {
    // A Live button or a cue that keeps pointing at a deleted sequence
    // lights up and drives nothing (Jake, 26 Nov 2026 — the same stale
    // reference that broke his "Full On" Live button after its preset
    // was deleted and re-captured). Strip the id everywhere it is
    // referenced; migrateShow heals shows that were already broken.
    const strip = (ids?: string[]) => (ids ?? []).filter((item) => item !== id)
    const livePages = (state.show?.livePages ?? []).map((page) => ({
      ...page,
      controls: page.controls.map((control) => ({ ...control, sequenceIds: strip(control.sequenceIds) }))
    }))
    const cues = state.cues.map((cue) => ({ ...cue, sequenceIds: strip(cue.sequenceIds) }))
    return persistState(state, { sequences: state.show?.sequences?.filter((s) => s.id !== id), presetGroups: state.show?.presetGroups?.map((g) => ({ ...g, sequenceIds: g.sequenceIds?.filter((item) => item !== id) })), livePages, cues }, { cues })
  }),
  duplicateSequence: (id) => set((state) => {
    const source = state.show?.sequences?.find((s) => s.id === id)
    if (!source) return state
    const copy: SequenceDef = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} copy`, steps: source.steps.map((step) => ({ ...structuredClone(step), id: crypto.randomUUID() })) }
    return persistState(state, { sequences: [...(state.show?.sequences ?? []), copy] })
  }),
  updateSequenceStep: (id, stepId, patch) => set((state) => persistState(state, { sequences: (state.show?.sequences ?? []).map((s) => s.id === id ? { ...s, steps: s.steps.map((step) => step.id === stepId ? { ...step, ...structuredClone(patch), id: stepId } : step) } : s) })),
  createPresetGroup: (name, parentId = null) => set((state) => {
    const groups = state.show?.presetGroups ?? []
    if (!name.trim() || (parentId && !groups.some((g) => g.id === parentId))) return state
    return persistState(state, { presetGroups: [...groups, { id: crypto.randomUUID(), name: name.trim(), parentId, exclusive: false, presetIds: [], sequenceIds: [] }] })
  }),
  // Sequences live in the same combined palette tree as presets (LightKey,
  // 18 Nov 2026), so they need the same group membership presets have.
  // groupId null ungroups the sequence. Mirrors assignPresetGroup.
  assignSequenceGroup: (sequenceId, groupId) => set((state) => {
    if (!state.show?.sequences?.some((s) => s.id === sequenceId)) return state
    if (groupId && !state.show?.presetGroups?.some((g) => g.id === groupId)) return state
    return persistState(state, { presetGroups: (state.show.presetGroups ?? []).map((g) => ({ ...g, sequenceIds: [...(g.sequenceIds ?? []).filter((id) => id !== sequenceId), ...(g.id === groupId ? [sequenceId] : [])] })) })
  }),
  // LightKey palette context menu: Duplicate. The copy keeps the category
  // and values and lands in every group the original was in.
  duplicatePreset: (id) => set((state) => {
    const source = state.presets.find((p) => p.id === id)
    if (!source) return state
    const copy: PresetDef = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} copy` }
    const presets = [...state.presets, copy]
    const presetGroups = state.show?.presetGroups?.map((g) => g.presetIds.includes(id) ? { ...g, presetIds: [...g.presetIds, copy.id] } : g)
    return persistState(state, { presets, presetGroups }, { presets })
  }),
  updatePresetGroup: (id, patch) => set((state) => {
    const groups = state.show?.presetGroups ?? []
    if (patch.parentId !== undefined && !canParentGroup(groups, id, patch.parentId)) return state
    return persistState(state, { presetGroups: groups.map((g) => g.id === id ? { ...g, ...patch, id, name: patch.name?.trim() || g.name } : g) })
  }),
  assignPresetGroup: (presetId, groupId) => set((state) => {
    if (!state.presets.some((p) => p.id === presetId) || !state.show?.presetGroups?.some((g) => g.id === groupId)) return state
    return persistState(state, { presetGroups: state.show.presetGroups.map((g) => ({ ...g, presetIds: [...g.presetIds.filter((id) => id !== presetId), ...(g.id === groupId ? [presetId] : [])] })) })
  }),
  deletePresetGroup: (id) => set((state) => {
    const groups = state.show?.presetGroups ?? [], removed = groups.find((g) => g.id === id)
    if (!removed) return state
    const remaining = groups.filter((g) => g.id !== id).map((g) => ({ ...g, parentId: g.parentId === id ? removed.parentId : g.parentId, presetIds: g.id === removed.parentId ? [...g.presetIds, ...removed.presetIds] : g.presetIds }))
    return persistState(state, { presetGroups: syncPresetGroups(remaining, state.presets) })
  }),
  applyPresetsToOverrides: (ids, selectedOnly = false) => set((state) => {
    const manualOverrides = structuredClone(state.manualOverrides)
    // A preset's colour is the fixture's colour (Jake, 19 Nov 2026):
    // applying it fans the bare colour out to every beam, like every
    // other preset-application path.
    const fixtures = state.show?.fixtures ?? []
    for (const id of ids) for (const [fixtureId, values] of Object.entries(fanPresetFixtureValues(state.presets.find((p) => p.id === id)?.fixtureValues ?? {}, fixtures))) {
      if (selectedOnly && !state.selectedFixtureIds.includes(fixtureId)) continue
      manualOverrides[fixtureId] = { ...manualOverrides[fixtureId], ...values }
    }
    return { manualOverrides }
  }),
  addOverridesToPresets: (ids, selectedOnly = false) => set((state) => {
    const presets = state.presets.map((preset) => {
      if (!ids.includes(preset.id)) return preset
      const fixtureValues = structuredClone(preset.fixtureValues)
      for (const [fixtureId, values] of Object.entries(state.manualOverrides)) {
        if (selectedOnly && !state.selectedFixtureIds.includes(fixtureId)) continue
        fixtureValues[fixtureId] = { ...fixtureValues[fixtureId], ...values }
      }
      return { ...preset, fixtureValues }
    })
    return persistState(state, { presets }, { presets })
  }),
  updatePresetContents: (id, values) => {
    set((state) => {
      const presets = state.presets.map((preset) => preset.id === id ? { ...preset, fixtureValues: structuredClone(values) } : preset)
      resendActiveCueForPreset(state, id, presets)
      return persistState(state, { presets }, { presets })
    })
    // A preset's intensity may have changed while it is active, so
    // the base look must re-resolve (same staleness as togglePreset).
    get().refreshBaseOutput()
  },
  // In-place preset editing, LightKey style (Guide ch.9, and Jake's
  // 18 Nov screenshot 4): the preset opens in Design with its fixtures
  // selected and the preset itself active, so the preview shows the look
  // being edited. Design writes straight into the preset (undoable, and
  // clamped to 0–255 like every other value write), so Save just ends the
  // session and Cancel restores the snapshot taken here.
  startEditingPreset: (id) => {
    const state = get(), preset = state.presets.find((p) => p.id === id)
    if (!preset) return
    // One editor at a time (Jake, 22 Nov 2026): starting a preset edit
    // closes the effect editor first — Cancel semantics for a template
    // or live-effect draft session (the working copy / snapshot is
    // discarded), so the editor never stays stuck behind Design.
    if (state.editingEffectId) state.exitEffectEditor()
    if (state.editingPresetId && state.editingPresetId !== id) state.saveEditingPreset()
    if (state.editingCueAdHocId) state.saveEditingCueAdHoc()
    editingPresetSnapshot = { preset: structuredClone(preset), activePresetIds: [...state.activePresetIds], selectedFixtureIds: [...state.selectedFixtureIds] }
    const fixtureIds = Object.keys(preset.fixtureValues).filter((fixtureId) => state.show?.fixtures.some((f) => f.id === fixtureId))
    if (fixtureIds.length) state.selectFixtures(fixtureIds)
    if (!state.activePresetIds.includes(id)) state.togglePreset(id)
    set({ editingPresetId: id })
  },
  saveEditingPreset: () => {
    if (!get().editingPresetId) return
    editingPresetSnapshot = null
    set({ editingPresetId: null })
  },
  cancelEditingPreset: () => {
    const state = get(), snapshot = editingPresetSnapshot
    if (!state.editingPresetId || !snapshot) return
    editingPresetSnapshot = null
    get().updatePresetContents(snapshot.preset.id, snapshot.preset.fixtureValues)
    set({ editingPresetId: null, activePresetIds: snapshot.activePresetIds, selectedFixtureIds: snapshot.selectedFixtureIds })
  },
  startEditingCueAdHoc: (id) => {
    const state = get(), cue = state.cues.find((c) => c.id === id)
    if (!cue) return
    // One editor at a time (Jake, 22 Nov 2026): as for presets above.
    if (state.editingEffectId) state.exitEffectEditor()
    if (state.editingCueAdHocId && state.editingCueAdHocId !== id) state.saveEditingCueAdHoc()
    if (state.editingPresetId) state.saveEditingPreset()
    editingCueAdHocSnapshot = { cue: structuredClone(cue), activeCueId: state.activeCueId, selectedFixtureIds: [...state.selectedFixtureIds] }
    const fixtureIds = Object.keys(cue.fixtureValues).filter((fixtureId) => state.show?.fixtures.some((f) => f.id === fixtureId))
    if (fixtureIds.length) state.selectFixtures(fixtureIds)
    // The cue must be active while its ad-hoc layer is edited: Design
    // reads and writes resolve through the active cue.
    get().activateCue(id)
    set({ editingCueAdHocId: id })
  },
  saveEditingCueAdHoc: () => {
    if (!get().editingCueAdHocId) return
    editingCueAdHocSnapshot = null
    set({ editingCueAdHocId: null })
  },
  cancelEditingCueAdHoc: () => {
    const state = get(), snapshot = editingCueAdHocSnapshot
    if (!state.editingCueAdHocId || !snapshot) return
    editingCueAdHocSnapshot = null
    get().updateCue(snapshot.cue.id, { fixtureValues: snapshot.cue.fixtureValues })
    set({ editingCueAdHocId: null, selectedFixtureIds: snapshot.selectedFixtureIds })
    // Back to the cue that was active before the edit started.
    if (snapshot.activeCueId) get().activateCue(snapshot.activeCueId)
  },
  addOverridesToCues: (ids, selectedOnly = false) => {
    const state = get()
    const targets = ids ?? addOverridesTargetIds(state)
    if (!targets.length || !Object.keys(state.manualOverrides).length) return
    const targetSet = new Set(targets)
    const cues = state.cues.map((cue) => targetSet.has(cue.id) ? { ...cue, fixtureValues: mergeOverridesIntoAdHoc(cue.fixtureValues, state.manualOverrides, selectedOnly, state.selectedFixtureIds) } : cue)
    const livePages = (state.show?.livePages ?? []).map((page) => ({
      ...page,
      controls: page.controls.map((control) => targetSet.has(control.id) ? { ...control, adHocValues: mergeOverridesIntoAdHoc(control.adHocValues ?? {}, state.manualOverrides, selectedOnly, state.selectedFixtureIds) } : control)
    }))
    set(persistState(state, { cues, livePages }, { cues }))
  },
  setShowOverrideLabels: (visible) => set({ showOverrideLabels: visible }),
  toggleOverrideLabels: () => set((state) => ({ showOverrideLabels: !state.showOverrideLabels })),
  setPreviewPresetId: (id) => set({ previewPresetId: id }),
  setContentsPreview: (preview) => set({ contentsPreview: preview }),
  setPaletteReveal: (kind, id) => set((state) => ({ paletteReveal: { kind, id, nonce: (state.paletteReveal?.nonce ?? 0) + 1 } })),
  updateEditingPresetValues: (values, beams) => set((state) => {
    const preset = state.presets.find((p) => p.id === state.editingPresetId)
    if (!preset) return state
    const fixtureValues = structuredClone(preset.fixtureValues)
    const write = (fixtureId: string, patch: Record<string, number>) => {
      if (Object.keys(patch).length) fixtureValues[fixtureId] = { ...fixtureValues[fixtureId], ...patch }
    }
    // An explicit beam list (beam 1's sliders) targets those beams even
    // when they are not the current selection; otherwise the selected
    // beams, if any, decide the mapping.
    const targetBeams = beams ?? state.selectedBeams
    if (targetBeams.length) {
      // Beam values arrive keyed by beam property; map them to channel
      // attributes the same way updateSelectedBeamValues does.
      for (const selected of targetBeams) {
        const fixture = state.show?.fixtures.find((f) => f.id === selected.fixtureId)
        const beam = fixture && fixtureMode(fixture)?.beams?.find((b) => b.id === selected.beamId)
        if (!fixture || !beam) continue
        write(selected.fixtureId, beamValuePatch(fixture, beam, values))
      }
    } else {
      const patch = Object.fromEntries(Object.entries(values).filter(([, value]) => Number.isFinite(value)).map(([key, value]) => [key, clamp(value)]))
      // A whole-fixture colour write fans out to every beam (Jake,
      // 19 Nov 2026): the wheel's bare RGB, and the White / Amber /
      // UV sliders, land on every cell of a multipart fixture, not
      // just beam 1. Per-beam writes never reach this branch — with
      // beams selected the beam-properties path above handles them.
      for (const id of state.selectedFixtureIds) {
        const fixture = state.show?.fixtures.find((f) => f.id === id)
        write(id, fixture ? fanColourToBeams(fixture, patch) : patch)
      }
    }
    const presets = state.presets.map((p) => p.id === preset.id ? { ...p, fixtureValues } : p)
    resendActiveCueForPreset(state, preset.id, presets)
    return persistState(state, { presets }, { presets })
  }),
  applyPaletteDrop: (drag, targetGroupId, before = null) => set((state) => {
    const next = resolvePaletteDrop(drag, targetGroupId, state.show?.presetGroups ?? [], before)
    if (!next) return state
    return persistState(state, { presetGroups: next })
  }),
  updatePresetFromCurrent: (id) => {
    const state = get(), preset = state.presets.find((p) => p.id === id)
    if (!preset || !state.show) return
    const fixtureValues = structuredClone(preset.fixtureValues)
    for (const fixture of state.show.fixtures.filter((f) => state.selectedFixtureIds.includes(f.id))) {
      const activeCue = state.cues.find((s) => s.id === state.activeCueId)
      const values = { ...(activeCue ? resolveCueValues(activeCue, state.presets, state.show?.fixtures ?? []) : {})[fixture.id] }
      for (const activeId of state.activePresetIds) Object.assign(values, state.presets.find((p) => p.id === activeId)?.fixtureValues[fixture.id])
      Object.assign(values, state.manualOverrides[fixture.id])
      const allowed = fixtureAttributes(fixture)
      const patch = Object.fromEntries(Object.entries(values).filter(([attribute]) => allowed.includes(attribute) && matchesPresetCategory(attribute, preset.category)))
      if (Object.keys(patch).length) fixtureValues[fixture.id] = { ...fixtureValues[fixture.id], ...patch }
    }
    get().updatePresetContents(id, fixtureValues)
  },
  removePresetProperty: (id, fixtureId, attribute) => {
    const preset = get().presets.find((p) => p.id === id)
    if (!preset) return
    const values = structuredClone(preset.fixtureValues)
    if (attribute && values[fixtureId]) { delete values[fixtureId][attribute]; if (!Object.keys(values[fixtureId]).length) delete values[fixtureId] }
    else delete values[fixtureId]
    get().updatePresetContents(id, values)
  },
  renamePreset: (id, name) => set((state) => {
    if (!name.trim()) return state
    const presets = state.presets.map((preset) => preset.id === id ? { ...preset, name: name.trim() } : preset)
    return persistState(state, { presets }, { presets })
  }),
  deletePreset: (id) => {
    set((state) => {
      const presets = state.presets.filter((preset) => preset.id !== id)
      resendActiveCueForPreset(state, id, presets)
      // This is the bug Jake hit on 26 Nov 2026: a Live button whose
      // preset was deleted and re-captured kept the old id, lit up when
      // pressed, and drove nothing. Strip the id from every reference —
      // Live buttons, cues and sequence steps — so nothing can point at
      // a preset that no longer exists; migrateShow heals shows that
      // were already broken.
      const strip = (ids?: string[]) => (ids ?? []).filter((item) => item !== id)
      const livePages = (state.show?.livePages ?? []).map((page) => ({
        ...page,
        controls: page.controls.map((control) => ({ ...control, presetIds: strip(control.presetIds) }))
      }))
      const cues = state.cues.map((cue) => ({ ...cue, presetIds: strip(cue.presetIds) }))
      const sequences = (state.show?.sequences ?? []).map((sequence) => ({
        ...sequence,
        steps: sequence.steps.map((step) => ({ ...step, presetIds: strip(step.presetIds) }))
      }))
      return persistState(state, { presets, livePages, cues, sequences }, { presets, cues, activePresetIds: state.activePresetIds.filter((item) => item !== id), editingPresetId: state.editingPresetId === id ? null : state.editingPresetId, previewPresetId: state.previewPresetId === id ? null : state.previewPresetId })
    })
    get().refreshBaseOutput()
  },

  addCue: (ids, name) => {
    let newCue: CueDef | undefined
    set((state) => {
      newCue = buildNewCue(state, ids, name)
      const cues = [...state.cues, newCue]
      return persistState(state, { cues }, { cues })
    })
    return newCue!
  },

  addCueToList: (listId, ids, name) => {
    let cueId = ''
    set((state) => {
      const list = state.cueLists.find((item) => item.id === listId)
      if (!list) return state
      const cue = buildNewCue(state, ids, name)
      cueId = cue.id
      const step: CueStepDef = { id: crypto.randomUUID(), cueId: cue.id, fadeMs: cue.fadeMs, holdMs: 0 }
      const cues = [...state.cues, cue]
      const cueLists = state.cueLists.map((item) => item.id === listId ? { ...item, steps: [...item.steps, step] } : item)
      return persistState(state, { cues, cueLists }, { cues, cueLists })
    })
    return cueId
  },

  addCueToListAt: (listId, index, ids, name) => {
    let cueId = ''
    set((state) => {
      const list = state.cueLists.find((item) => item.id === listId)
      if (!list) return state
      const cueName = name ?? nextListCueName(list, state.cues)
      const cue = buildNewCue(state, ids, cueName)
      cueId = cue.id
      // LightKey's new-cue fade is 00:00.5 (Jake's screenshots show
      // both new steps at 00:00.5) — the cue and the step both carry
      // it, so the inspector's Timing and the widget's Fade column
      // agree. The global default fade (1000ms) is untouched: it is
      // the button default, not the cuelist default.
      cue.fadeMs = 500
      const step: CueStepDef = { id: crypto.randomUUID(), cueId: cue.id, fadeMs: 500, holdMs: 0 }
      const at = index === undefined ? list.steps.length : Math.max(0, Math.min(index, list.steps.length))
      const steps = [...list.steps]
      steps.splice(at, 0, step)
      const cues = [...state.cues, cue]
      const cueLists = state.cueLists.map((item) => item.id === listId ? { ...item, steps } : item)
      return persistState(state, { cues, cueLists }, { cues, cueLists })
    })
    return cueId
  },

  // A write with no active cue must land somewhere: create the cue the
  // way addCue does, but activate it in the same update — the model
  // updateSelectedFixtures uses (it builds the cue inline and sets
  // activeCueId together). Calling addCue() here would repeat the old
  // bug: the cue would exist but stay inactive and the write would be
  // dropped by the lookup that follows. A truthy id is not enough: undo
  // / redo can restore a cue list that no longer contains the active cue,
  // leaving a dangling id that every writer would then silently drop
  // (Jake, 20 Nov 2026) — so the cue must exist, not just the id.
  ensureActiveCue: () => {
    if (get().activeCueId && get().cues.some((s) => s.id === get().activeCueId)) return
    set((state) => {
      if (state.activeCueId && state.cues.some((s) => s.id === state.activeCueId)) return state
      const fixtures = state.show?.fixtures ?? []
      const newCue: CueDef = {
        id: crypto.randomUUID(),
        name: `Cue ${nextCueNumber(state.cues)}`,
        presetIds: [],
        sequenceIds: [],
        fixtureValues: newCueFixtureValues(fixtures, state.manualOverrides),
        fadeMs: state.show?.preferences?.defaultFadeMs ?? 1000
      }
      const cues = [...state.cues, newCue]
      return persistState(state, { cues }, { cues, activeCueId: newCue.id, cuePlaying: false })
    })
  },

  duplicateCue: (id) =>
    set((state) => {
      const index = state.cues.findIndex((s) => s.id === id)
      const source = state.cues[index]
      if (!source) return state
      const copy: CueDef = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} Copy`,
        presetIds: [...(source.presetIds ?? [])],
        sequenceIds: [...(source.sequenceIds ?? [])],
        fixtureValues: structuredClone(source.fixtureValues),
        fadeMs: source.fadeMs
      }
      const cues = [...state.cues]
      cues.splice(index + 1, 0, copy)
      return persistState(state, { cues }, { cues })
    }),

  updateCue: (id, patch) =>
    set((state) => {
      const cues = state.cues.map((s) => (s.id === id ? { ...s, ...patch } : s))
      const updated = cues.find((s) => s.id === id)
      if (updated && state.activeCueId === id && !state.blackout) {
        // A live edit retargets a fade in flight instead of snapping
        // it, and stays immediate when nothing is fading.
        reassertBase(cueOutput(state, updated))
      }
      return persistState(state, { cues }, { cues })
    }),

  updateSelectedFixtures: (values, manual = false) =>
    set((state) => {
      const targetId = state.editingCueAdHocId ?? state.activeCueId
      const existingCue = state.cues.find((cue) => cue.id === targetId)
      const selectedFixtureIds = state.selectedFixtureIds.filter((id) =>
        state.show?.fixtures.some((fixture) => fixture.id === id)
      )
      if (!state.show || selectedFixtureIds.length === 0) return state

      const patch: Record<string, number> = {}
      for (const [attribute, value] of Object.entries(values)) {
        if (Number.isFinite(value)) patch[attribute] = clamp(value)
      }
      if (Object.keys(patch).length === 0) return state

      // A Design write defines the property for the fixture (LightKey
      // Guide ch.8, p.80) — it lands in the manual overrides, never in
      // a cue, so no cue is minted for a live tweak.
      if (manual) {
        const patchByFixture: Record<string, Record<string, number>> = {}
        for (const fixtureId of selectedFixtureIds) {
          const fixture = state.show.fixtures.find((f) => f.id === fixtureId)
          patchByFixture[fixtureId] = fixture ? fanColourToBeams(fixture, patch) : patch
        }
        return { manualOverrides: mergeManualOverrides(state.manualOverrides, patchByFixture) }
      }

      const activeCue: CueDef = existingCue ?? {
        id: crypto.randomUUID(), name: `Cue ${nextCueNumber(state.cues)}`, fadeMs: 1000,
        presetIds: [], sequenceIds: [],
        fixtureValues: newCueFixtureValues(state.show.fixtures, state.manualOverrides)
      }
      const selected = new Set(selectedFixtureIds)
      const sourceCues = existingCue ? state.cues : [...state.cues, activeCue]
      const cues = sourceCues.map((cue) => {
        if (cue.id !== activeCue.id) return cue
        const fixtureValues = { ...cue.fixtureValues }
        for (const fixtureId of selected) {
          // A whole-fixture colour write fans out to every beam
          // (Jake, 19 Nov 2026): the White / Amber / UV sliders, and
          // any other bare colour write, land on every cell of a
          // multipart fixture, not just beam 1. Per-beam writes never
          // reach here — with beams selected DesignTab routes them
          // through updateSelectedBeamValues instead.
          const fixture = state.show?.fixtures.find((f) => f.id === fixtureId)
          fixtureValues[fixtureId] = { ...(fixtureValues[fixtureId] ?? {}), ...(fixture ? fanColourToBeams(fixture, patch) : patch) }
        }
        return { ...cue, fixtureValues }
      })
      const updatedCue = cues.find((cue) => cue.id === activeCue.id)
      if (updatedCue && !state.blackout) reassertBase(cueOutput(state, updatedCue))
      return persistState(state, { cues }, { cues, activeCueId: activeCue.id, cuePlaying: false })
    }),

  deleteCue: (id) => {
    const wasActive = get().activeCueId === id
    set((state) => {
      const cues = state.cues.filter((s) => s.id !== id)
      const cueLists = state.cueLists.map((list) => ({
        ...list,
        steps: list.steps.filter((step) => step.cueId !== id)
      }))
      // Same stale-reference class as deletePreset (Jake, 26 Nov 2026):
      // a Live button bound to the deleted cue would keep its name, light
      // up, and drive nothing. Unbind it; migrateShow heals old shows.
      const livePages = (state.show?.livePages ?? []).map((page) => ({
        ...page,
        controls: page.controls.map((control) => control.cueId === id ? { ...control, cueId: undefined } : control)
      }))
      return persistState(
        state,
        { cues, cueLists, livePages },
        {
          cues,
          cueLists,
          activeCueId: state.activeCueId === id ? null : state.activeCueId
        }
      )
    })
    // The rig returns to the defaults look, not to zeros (Jake,
    // 20 Nov 2026 — a deleted cue must not black the rig out when the
    // dimmer is up). Sent after the set so the deleted cue is gone
    // from the levels the defaults resolve against.
    if (wasActive) get().refreshBaseOutput()
  },

  addFixture: (preset, name, group) =>
    set((state) => {
      const fixtures = state.show?.fixtures ?? []
      const fixture: FixtureDef = {
        id: crypto.randomUUID(),
        name: name?.trim() || preset.name,
        shortName: proposeShortName(fixtures.map((f) => f.shortName).filter((s): s is string => Boolean(s)), preset.type),
        inStorage: true,
        type: preset.type,
        channelStart: nextFreeChannel(fixtures),
        channels: preset.channels,
        group: group?.trim() || 'Ungrouped'
      }
      const nextFixtures = [...fixtures, fixture]
      const cues = state.cues.map((cue) => ({
        ...cue,
        fixtureValues: { ...cue.fixtureValues, [fixture.id]: defaultFixtureValues(fixture) }
      }))
      return persistState(state, { fixtures: nextFixtures, cues }, { cues })
    }),

  addProfileFixtures: (profile, options) => set((state) => {
    const existing = state.show?.fixtures ?? []
    const allocated = allocateFixtures(existing, profile, options)
    // LightKey (video 3:15–3:25, Guide p.31): patched fixtures appear on
    // the Preview in rows, not only in Fixture Storage — so they land on
    // the canvas here, at the landing positions, and the Preview animates
    // them in (see newFixtureIds). Fixture Storage stays for fixtures
    // removed from the canvas.
    const landing = landingPositions(existing, allocated)
    const placed = allocated.map((fixture) => {
      const positions = landing[fixture.id] ?? []
      return { ...fixture, inStorage: false, ...(positions[0] ? { previewPosition: positions[0] } : {}), ...(positions.length ? { previewPositions: positions } : {}) }
    })
    const cues = state.cues.map((cue) => ({ ...cue, fixtureValues: { ...cue.fixtureValues, ...Object.fromEntries(placed.map((fixture) => [fixture.id, defaultFixtureValues(fixture)])) } }))
    return persistState(state, { fixtures: [...existing, ...placed], cues }, { cues, newFixtureIds: placed.map((fixture) => fixture.id) })
  }),
  clearNewFixtureIds: () => set({ newFixtureIds: [] }),
  saveFixtureProfile: (profile) => set((state) => {
    const errors = validateProfile(profile)
    if (errors.length) throw new Error(errors.join('; '))
    if (BUILTIN_PROFILES.some((p) => p.id === profile.id)) throw new Error('Duplicate built-in profiles before editing')
    // Everything the editor saves is the user's own fixture — a build of
    // their own, an import, or an edited copy of a base record — so it is
    // tagged custom: it lists under User Fixtures, and an OFL zip upload
    // (which only ever touches the library database) never updates it.
    const fixtureProfiles = [...(state.show?.fixtureProfiles ?? []).filter((p) => p.id !== profile.id), structuredClone({ ...profile, custom: true })]
    return persistState(state, { fixtureProfiles })
  }),
  deleteFixtureProfile: (id) => set((state) => persistState(state, { fixtureProfiles: (state.show?.fixtureProfiles ?? []).filter((p) => p.id !== id) })),
  duplicateFixture: (id) => set((state) => {
    const original = state.show?.fixtures.find((f) => f.id === id)
    if (!original) return state
    const copy: FixtureDef = { ...structuredClone(original), id: crypto.randomUUID(), name: `${original.name} copy`, shortName: proposeShortName(state.show!.fixtures.map((f) => f.shortName).filter((s): s is string => Boolean(s)), original.type), channelStart: nextFreeChannel(state.show!.fixtures), inStorage: true }
    // The copy sits in Fixture Storage until placed: drop the original's
    // canvas positions, or its instances would land on top of the
    // original's when it is dragged out of storage.
    delete copy.previewPosition
    delete copy.previewPositions
    if (copy.channelStart + copy.channels - 1 > 512) throw new Error('No free channels for the duplicate')
    const cues = state.cues.map((s) => ({ ...s, fixtureValues: { ...s.fixtureValues, ...(s.fixtureValues[id] ? { [copy.id]: { ...s.fixtureValues[id] } } : {}) } }))
    const presets = state.presets.map((p) => ({ ...p, fixtureValues: { ...p.fixtureValues, ...(p.fixtureValues[id] ? { [copy.id]: { ...p.fixtureValues[id] } } : {}) } }))
    return persistState(state, { fixtures: [...state.show!.fixtures, copy], cues, presets }, { cues, presets })
  }),
  reassignFixtureProfile: (id, profile, modeId) => {
    const mode = profile.modes.find((m) => m.id === modeId) ?? profile.modes[0]
    const fixture = get().show?.fixtures.find((f) => f.id === id)
    if (!mode || !fixture || !mode.channels.length) return
    const channels = Math.max(...mode.channels.map((c) => c.number)) + 1
    if (fixture.channelStart + channels - 1 > 512) throw new Error('The selected mode exceeds the universe')
    get().updateFixture(id, { profile: structuredClone(profile), profileId: profile.id, modeId: mode.id, type: profile.legacyType, channels })
  },

  updateFixture: (id, patch) =>
    set((state) => {
      const fixtures = (state.show?.fixtures ?? []).map((f) => {
        if (f.id !== id) return f
        const start = patch.channelStart ?? f.channelStart
        const count = patch.channels ?? f.channels
        return {
          ...f,
          ...patch,
          channelStart: Number.isFinite(start) ? Math.max(1, Math.round(start)) : f.channelStart,
          channels: Number.isFinite(count) ? Math.max(1, Math.round(count)) : f.channels
        }
      })
      const active = state.cues.find((s) => s.id === state.activeCueId)
      if (active && !state.blackout) {
        reassertBase(cueOutput({ ...state, show: state.show ? { ...state.show, fixtures } : null }, active))
      }
      return persistState(state, { fixtures })
    }),

  setFixturePosition: (id, position) =>
    set((state) => {
      if (!state.show || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return state
      const fixtures = state.show.fixtures.map((fixture) => fixture.id === id ? placeFixture(fixture, position) : fixture)
      return persistState(state, { fixtures })
    }),

  setFixturePositions: (positions) => set((state) => {
    if (!state.show) return state
    const fixtures = state.show.fixtures.map((fixture) => {
      const p = positions[fixture.id]
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? placeFixture(fixture, p) : fixture
    })
    return persistState(state, { fixtures })
  }),
  setFixtureInstancePositions: (positions) => set((state) => {
    if (!state.show) return state
    const fixtures = state.show.fixtures.map((fixture) => {
      const count = fixture.count ?? 1
      const current = instancePositions(fixture)
      let changed = false
      const next = current.map((pos, i) => {
        const p = positions[`${fixture.id}:${i}`]
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return pos
        changed = true
        return { x: Math.max(0, Math.min(800, p.x)), y: Math.max(0, Math.min(340, p.y)) }
      })
      if (!changed) return fixture
      // previewPositions stays a dense array: gaps (only possible on a
      // partial programmatic write — the Preview always commits complete
      // instance sets) fall back to the first placed instance.
      const first = next.find((p) => p !== null) ?? { x: 400, y: 170 }
      const previewPositions = next.map((p) => p ?? first)
      return { ...fixture, ...(previewPositions[0] ? { previewPosition: previewPositions[0] } : {}), previewPositions }
    })
    return persistState(state, { fixtures })
  }),
  setPreviewTrusses: (previewTrusses) => set((state) => {
    const original = state.show?.stageObjects ?? []
    const byId = new Map(previewTrusses.map((truss) => [truss.id, truss]))
    const stageObjects: StageObject[] = original.filter((object) => object.kind !== 'truss' || byId.has(object.id)).map((object) => object.kind === 'truss' ? { ...object, ...byId.get(object.id)!, trussShape: byId.get(object.id)!.shape } : object)
    for (const truss of previewTrusses) if (!stageObjects.some((o) => o.id === truss.id)) stageObjects.push({ ...truss, kind: 'truss', trussShape: truss.shape })
    return persistState(state, { previewTrusses, stageObjects })
  }),
  setStageObjects: (stageObjects) => set((state) => persistState(state, { stageObjects, previewTrusses: stageObjects.filter((o) => o.kind === 'truss').map((o) => ({ ...o, shape: o.trussShape ?? 'straight' })) })),
  addStageObject: (object) => get().setStageObjects([...(get().show?.stageObjects ?? []), object]),
  updateStageObject: (id, patch) => get().setStageObjects((get().show?.stageObjects ?? []).map((o) => o.id === id ? { ...o, ...sanitizeStageObjectPatch(patch), id: o.id } : o)),
  removeStageObjects: (ids) => get().setStageObjects((get().show?.stageObjects ?? []).filter((o) => !ids.includes(o.id))),
  copyStageObjects: (ids) => set({ stageClipboard: structuredClone((get().show?.stageObjects ?? []).filter((o) => ids.includes(o.id))) }),
  pasteStageObjects: () => {
    const objects = get().stageClipboard.map((o) => ({ ...structuredClone(o), id: crypto.randomUUID(), x: o.x + 20, y: o.y + 20 }))
    get().setStageObjects([...(get().show?.stageObjects ?? []), ...objects]); set({ stageClipboard: structuredClone(objects) }); return objects.map((o) => o.id)
  },
  duplicateStageObjects: (ids) => {
    const objects = (get().show?.stageObjects ?? []).filter((o) => ids.includes(o.id)).map((o) => ({ ...structuredClone(o), id: crypto.randomUUID(), x: o.x + 20, y: o.y + 20 }))
    get().setStageObjects([...(get().show?.stageObjects ?? []), ...objects]); return objects.map((o) => o.id)
  },
  flipStageObjects: (ids, axis) => get().setStageObjects((get().show?.stageObjects ?? []).map((o) => ids.includes(o.id) ? { ...o, [axis === 'x' ? 'flipX' : 'flipY']: !(axis === 'x' ? o.flipX : o.flipY) } : o)),
  orderStageObjects: (ids, side) => {
    const objects = get().show?.stageObjects ?? [], selected = objects.filter((o) => ids.includes(o.id)), others = objects.filter((o) => !ids.includes(o.id))
    if (side === 'front') { get().setStageObjects([...others, ...selected]); return }
    if (side === 'back') { get().setStageObjects([...selected, ...others]); return }
    // One step (Layout > Order > Bring Forward / Send Backward): each
    // selected object swaps with the next unselected one in that
    // direction, so a multi-selection keeps its relative order.
    const moved = [...objects]
    if (side === 'forward') { for (let i = moved.length - 2; i >= 0; i--) if (ids.includes(moved[i].id) && !ids.includes(moved[i + 1].id)) { const tmp = moved[i]; moved[i] = moved[i + 1]; moved[i + 1] = tmp } }
    else { for (let i = 1; i < moved.length; i++) if (ids.includes(moved[i].id) && !ids.includes(moved[i - 1].id)) { const tmp = moved[i]; moved[i] = moved[i - 1]; moved[i - 1] = tmp } }
    get().setStageObjects(moved)
  },

  removeFixture: (id) =>
    set((state) => {
      const removed = (state.show?.fixtures ?? []).find((f) => f.id === id)
      const fixtures = (state.show?.fixtures ?? []).filter((f) => f.id !== id)
      const cues = state.cues.map((cue) => {
        const fixtureValues = { ...cue.fixtureValues }
        delete fixtureValues[id]
        return { ...cue, fixtureValues }
      })
      const automations = state.automations.filter((a) => a.fixtureId !== id)
      const effects = state.effects.map((effect) => ({
        ...effect,
        fixtureIds: effect.fixtureIds.filter((fixtureId) => fixtureId !== id)
      }))
      const active = cues.find((s) => s.id === state.activeCueId)
      if (!state.blackout) {
        const patch = active
          ? cueOutput(
              { ...state, show: state.show ? { ...state.show, fixtures } : null },
              active
            )
          : {}
        // The removed fixture's channels are no longer part of the patch, so
        // they would stay latched at their last values. Zero them explicitly.
        if (removed) {
          for (let offset = 0; offset < removed.channels; offset++) {
            patch[removed.channelStart + offset] = 0
          }
        }
        reassertBase(patch)
      }
      const presets = state.presets.map((preset) => { const fixtureValues = { ...preset.fixtureValues }; delete fixtureValues[id]; return { ...preset, fixtureValues } })
      const livePages = state.show?.livePages?.map((page) => ({ ...page, controls: page.controls.map((control) => { const adHocValues = { ...control.adHocValues }; delete adHocValues[id]; return { ...control, adHocValues } }) }))
      return persistState(
        state,
        { fixtures, cues, automations, effects, presets, livePages },
        {
          cues,
          presets,
          automations,
          effects,
          selectedFixtureIds: state.selectedFixtureIds.filter((fixtureId) => fixtureId !== id)
        }
      )
    }),

  addAutomation: (automation) =>
    set((state) =>
      persistState(
        state,
        { automations: [...state.automations, automation] },
        { automations: [...state.automations, automation] }
      )
    ),

  updateAutomation: (id, patch) =>
    set((state) => {
      const automations = state.automations.map((a) => (a.id === id ? { ...a, ...patch } : a))
      return persistState(state, { automations }, { automations })
    }),

  removeAutomation: (id) =>
    set((state) => {
      const automations = state.automations.filter((a) => a.id !== id)
      return persistState(state, { automations }, { automations })
    }),

  addEffect: (effect) =>
    set((state) => {
      const effects = [...state.effects, effect]
      return persistState(state, { effects }, { effects })
    }),

  updateEffect: (id, patch) =>
    set((state) => {
      const effects = state.effects.map((effect) =>
        effect.id === id ? { ...effect, ...patch } : effect
      )
      return persistState(state, { effects }, { effects })
    }),

  removeEffect: (id) => {
    // Deleting the effect being edited closes the editor (a template
    // working copy's session ends with it; the saved template is
    // untouched) — otherwise the bottom panel would sit blank with a
    // dangling editor id. A live-effect draft session ends with it
    // too; its snapshot is dropped (there is nothing to restore to).
    const state = get()
    if (state.editingEffectId === id) set({ editingEffectId: null, editingEffectTemplateId: null, editingLiveEffectId: null })
    if (state.editingLiveEffectId === id) editingLiveEffectSnapshot = null
    set((s) => {
      const effects = s.effects.filter((effect) => effect.id !== id)
      // Same stale-reference class as deletePreset/deleteSequence/deleteCue
      // (Jake, 26 Nov 2026): a Live button bound to the deleted effect
      // would keep its name, light up, and drive nothing. Strip the id
      // from every Live button; migrateShow heals shows already broken.
      // deleteEffectAndKeepValues funnels through here, so it is covered.
      const strip = (ids?: string[]) => (ids ?? []).filter((item) => item !== id)
      const livePages = (s.show?.livePages ?? []).map((page) => ({
        ...page,
        controls: page.controls.map((control) => ({ ...control, effectIds: strip(control.effectIds) }))
      }))
      return persistState(s, { effects, livePages }, { effects })
    })
  },

  copyEffect: (id) => {
    const effect = get().effects.find((item) => item.id === id)
    if (effect) set({ effectClipboard: structuredClone(effect) })
  },

  pasteEffect: () => {
    const source = get().effectClipboard
    if (!source) return null
    const effect = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} copy` }
    get().addEffect(effect)
    return effect.id
  },

  saveEffectTemplate: (id, includeFixtureOrder = true) => {
    const state = get(), effect = state.effects.find((item) => item.id === id)
    if (!effect || !state.show) return
    const template = { ...structuredClone(effect), id: crypto.randomUUID() }
    if (!includeFixtureOrder) {
      // Guide p.174: "Include fixture order" — without it the template
      // keeps only the effect itself, not how it runs across fixtures.
      delete template.fixtureOrder
      delete template.customFixtureOrder
      delete template.fixtureOrderOrigin
      delete template.fixtureGrouping
      delete template.fixtureRepeat
      delete template.considerSpacing
      delete template.pixelMode
      delete template.customDirectionAngle
    }
    const effectTemplates = [...(state.show.effectTemplates ?? []), template]
    set(persistState(state, { effectTemplates }))
  },

  applyEffectTemplate: (id) => {
    const template = get().show?.effectTemplates?.find((item) => item.id === id)
    if (!template) return null
    const effect = { ...structuredClone(template), id: crypto.randomUUID() }
    get().addEffect(effect)
    return effect.id
  },

  startEditingEffectTemplate: (id) => {
    // One editor at a time: a preset/ad-hoc edit is saved and a
    // live-effect draft session is saved before the template session
    // opens (setEditingEffectId below would cancel a template session,
    // which is not what opening one wants — so the other editors are
    // closed here, directly).
    const state = get()
    if (state.editingPresetId) state.saveEditingPreset()
    if (state.editingCueAdHocId) state.saveEditingCueAdHoc()
    if (state.editingLiveEffectId) state.saveEditingLiveEffect()
    const newId = get().applyEffectTemplate(id)
    if (!newId) return null
    set({ editingEffectTemplateId: id, editingEffectId: newId })
    return newId
  },

  updateEffectTemplate: () => {
    const state = get()
    const templateId = state.editingEffectTemplateId
    const effect = state.effects.find((item) => item.id === state.editingEffectId)
    if (!templateId || !effect || !state.show) return
    const template = (state.show.effectTemplates ?? []).find((item) => item.id === templateId)
    if (!template) return
    // The name lives in the palette (the editor has no rename control),
    // so the stored name is kept — only the effect's settings are
    // written back to the preset. Update saves AND exits the editor
    // (Jake, 22 Nov 2026): the live effect stays as an ordinary
    // effect, but the editor closes and its tab leaves the pill bar.
    const effectTemplates = (state.show.effectTemplates ?? []).map((item) =>
      item.id === templateId ? { ...structuredClone(effect), id: templateId, name: template.name } : item)
    set(persistState(state, { effectTemplates }))
    set({ editingEffectTemplateId: null, editingEffectId: null })
  },

  cancelEditingEffectTemplate: () => {
    const state = get()
    if (!state.editingEffectTemplateId) return
    const workingId = state.editingEffectId
    set({ editingEffectTemplateId: null, editingEffectId: null })
    if (workingId) get().removeEffect(workingId)
  },

  editingLiveEffectId: null,
  startEditingLiveEffect: (id) => {
    const state = get()
    const effect = state.effects.find((item) => item.id === id)
    if (!effect) return
    // A template working copy already has its own draft session — the
    // working copy is a live effect in the palette while it is being
    // edited, so Edit on that row keeps the template session instead
    // of opening a second one bound to the same effect.
    if (state.editingEffectTemplateId && id === state.editingEffectId) {
      get().setEditingEffectId(id)
      return
    }
    // setEditingEffectId ends any other editor first (a template
    // session is cancelled, a preset/ad-hoc edit and another live
    // session are saved), so one editor is open at a time.
    get().setEditingEffectId(id)
    // Re-editing the same effect keeps its session (and its snapshot):
    // re-snapshotting would bake the unconfirmed edits into the
    // "original" Cancel restores.
    if (get().editingLiveEffectId !== id) {
      editingLiveEffectSnapshot = structuredClone(effect)
      set({ editingLiveEffectId: id })
    }
  },
  saveEditingLiveEffect: () => {
    // Update: the edits were written live into the effect while it
    // was open (as for presets), so saving just ends the session and
    // closes the editor.
    if (!get().editingLiveEffectId) return
    editingLiveEffectSnapshot = null
    set({ editingLiveEffectId: null, editingEffectId: null })
  },
  cancelEditingLiveEffect: () => {
    const state = get(), snapshot = editingLiveEffectSnapshot
    if (!state.editingLiveEffectId || !snapshot || snapshot.id !== state.editingLiveEffectId) return
    editingLiveEffectSnapshot = null
    // Full replace, not a patch merge: editing may have added fields
    // (switching patterns adds lengthRange, for example) that a merge
    // would leave behind.
    const effects = state.effects.map((effect) => effect.id === snapshot.id ? structuredClone(snapshot) : effect)
    set(persistState(state, { effects }, { effects }))
    set({ editingLiveEffectId: null, editingEffectId: null })
  },

  exitEffectEditor: () => {
    const state = get()
    if (state.editingEffectTemplateId) state.cancelEditingEffectTemplate()
    else if (state.editingLiveEffectId) state.cancelEditingLiveEffect()
    else if (state.editingEffectId) set({ editingEffectId: null })
    if (state.effectChooserAttribute) set({ effectChooserAttribute: null, previewEffect: null, previewEffectTemplateId: null })
  },

  renameEffectTemplate: (id, name) => set((state) => {
    if (!state.show || !name.trim()) return state
    const effectTemplates = (state.show.effectTemplates ?? []).map((item) => item.id === id ? { ...item, name: name.trim() } : item)
    return persistState(state, { effectTemplates })
  }),

  duplicateEffectTemplate: (id) => set((state) => {
    const source = state.show?.effectTemplates?.find((item) => item.id === id)
    if (!source || !state.show) return state
    const copy: EffectDef = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} copy` }
    return persistState(state, { effectTemplates: [...(state.show.effectTemplates ?? []), copy] })
  }),

  deleteEffectTemplate: (id) => set((state) => {
    if (!state.show) return state
    const effectTemplates = (state.show.effectTemplates ?? []).filter((item) => item.id !== id)
    return persistState(state, { effectTemplates })
  }),

  duplicateEffect: (id) => {
    const source = get().effects.find((item) => item.id === id)
    if (!source) return null
    const effect = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} copy` }
    get().addEffect(effect)
    return effect.id
  },

  deleteEffectAndKeepValues: (id) => {
    const state = get()
    const effect = state.effects.find((item) => item.id === id)
    if (!effect || !state.show) return
    // Bake the effect's current values into the owning cue/preset (Guide p.152),
    // or the active cue when the effect is global, so the look stays put.
    const fixtures = state.show.fixtures ?? []
    const patch = computeEffectPatch(
      fixtures,
      [effect],
      getEffectTime(),
      state.bpm,
      state.master,
      { movementPaths: state.show.movementPaths ?? [] }
    )
    const baked: Record<string, Record<string, number>> = {}
    for (const [channelKey, value] of Object.entries(patch)) {
      const channel = Number(channelKey)
      const fixture = fixtures.find((f) => channel >= f.channelStart && channel < f.channelStart + f.channels)
      if (!fixture) continue
      const attribute = Object.entries(fixtureChannelMap(fixture)).find(
        ([, offset]) => fixture.channelStart + offset === channel
      )?.[0]
      if (!attribute) continue
      if (!baked[fixture.id]) baked[fixture.id] = {}
      baked[fixture.id][attribute] = value
    }
    if (Object.keys(baked).length > 0) {
      const owner = effect.owner
      if (owner?.type === 'preset') {
        const preset = state.show.presets?.find((p) => p.id === owner.id)
        if (preset) {
          const fixtureValues = { ...preset.fixtureValues }
          for (const [fixtureId, values] of Object.entries(baked)) {
            fixtureValues[fixtureId] = { ...fixtureValues[fixtureId], ...values }
          }
          get().updatePresetContents(preset.id, fixtureValues)
        }
      } else {
        const cueId = owner?.type === 'cue' ? owner.id : state.activeCueId
        const cue = cueId ? state.cues.find((c) => c.id === cueId) : undefined
        if (cue) {
          const fixtureValues = { ...cue.fixtureValues }
          for (const [fixtureId, values] of Object.entries(baked)) {
            fixtureValues[fixtureId] = { ...fixtureValues[fixtureId], ...values }
          }
          get().updateCue(cue.id, { fixtureValues })
        }
      }
    }
    get().removeEffect(id)
    if (state.editingEffectId === id) set({ editingEffectId: null })
  },

  addMovementPath: (path) =>
    set((state) => {
      const movementPaths = [...(state.show?.movementPaths ?? []), path]
      return persistState(state, { movementPaths }, {})
    }),

  updateMovementPath: (id, patch) =>
    set((state) => {
      const movementPaths = (state.show?.movementPaths ?? []).map((path) =>
        path.id === id ? { ...path, ...patch } : path
      )
      return persistState(state, { movementPaths }, {})
    }),

  removeMovementPath: (id) =>
    set((state) => {
      const movementPaths = (state.show?.movementPaths ?? []).filter((path) => path.id !== id)
      return persistState(state, { movementPaths }, {})
    }),

  duplicateMovementPath: (id) => {
    const source = get().show?.movementPaths?.find((path) => path.id === id)
    if (!source) return null
    const path = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} copy` }
    get().addMovementPath(path)
    return path.id
  },

  addCueList: (name) => {
    // Returns the new list's id, so the caller can place a widget for it
    // (Live Edit's "Insert Cuelist" inserts the list and its widget in one
    // go — there was no UI to create a cue list at all before, so a fresh
    // project could never get a cuelist).
    const id = crypto.randomUUID()
    set((state) => {
      const list: CueListDef = {
        id,
        name: name?.trim() || `Cue List ${state.cueLists.length + 1}`,
        steps: [],
        loop: false
      }
      const cueLists = [...state.cueLists, list]
      return persistState(
        state,
        { cueLists },
        { cueLists, activeCueListId: list.id, activeCueIndex: -1, cuePlaying: false }
      )
    })
    return id
  },

  updateCueList: (id, patch) =>
    set((state) => {
      const cueLists = state.cueLists.map((l) => (l.id === id ? { ...l, ...patch } : l))
      return persistState(state, { cueLists }, { cueLists })
    }),

  renameCueList: (id, name) =>
    set((state) => {
      const cueLists = state.cueLists.map((l) => (l.id === id ? { ...l, name } : l))
      return persistState(state, { cueLists }, { cueLists })
    }),

  removeCueList: (id) => {
    let activeCleared = false
    set((state) => {
      const removed = state.cueLists.find((l) => l.id === id)
      const cueLists = state.cueLists.filter((l) => l.id !== id)
      // Deleting a cuelist (Jake, 27 Nov 2026): every step cue that
      // nothing else references is deleted from memory with it.
      const { cues, swept } = sweepUnreferencedCues(state.cues, state.show?.livePages ?? [], cueLists, removed?.steps.map((step) => step.cueId) ?? [], state.pageClipboard)
      activeCleared = swept.includes(state.activeCueId ?? '')
      return persistState(
        state,
        { cueLists, cues },
        {
          cueLists,
          cues,
          activeCueListId:
            state.activeCueListId === id ? (cueLists[0]?.id ?? null) : state.activeCueListId,
          activeCueIndex: state.activeCueListId === id ? -1 : state.activeCueIndex,
          cuePlaying: state.activeCueListId === id ? false : state.cuePlaying,
          ...(activeCleared ? { activeCueId: null } : {})
        }
      )
    })
    if (activeCleared) get().refreshBaseOutput()
  },

  renumberCueList: (listId, stepIds) =>
    set((state) => {
      const list = state.cueLists.find((l) => l.id === listId)
      if (!list) return state
      const targets = stepIds ? list.steps.filter((step) => stepIds.includes(step.id)) : list.steps
      const renamed = renumberCueNames(targets, state.cues)
      if (!renamed.length) return state
      const names = new Map(renamed.map((item) => [item.cueId, item.name]))
      const cues = state.cues.map((cue) => names.has(cue.id) ? { ...cue, name: names.get(cue.id)! } : cue)
      return persistState(state, { cues }, { cues })
    }),

  addCueListGroup: (listId, name, afterStepId) => {
    let groupId = ''
    set((state) => {
      const list = state.cueLists.find((l) => l.id === listId)
      if (!list) return state
      const { groups, group } = buildCueListGroup(list, name, () => crypto.randomUUID(), afterStepId)
      groupId = group.id
      const cueLists = state.cueLists.map((l) => l.id === listId ? { ...l, groups } : l)
      return persistState(state, { cueLists }, { cueLists })
    })
    return groupId
  },

  addCueListGroupFromSelection: (listId, stepIds, name) => {
    let groupId = ''
    set((state) => {
      const list = state.cueLists.find((l) => l.id === listId)
      if (!list) return state
      const { groups, group } = buildCueListGroup(list, name, () => crypto.randomUUID())
      groupId = group.id
      const cueLists = state.cueLists.map((l) => l.id === listId
        ? { ...l, groups, steps: l.steps.map((step) => stepIds.includes(step.id) ? { ...step, groupId: group.id } : step) }
        : l)
      return persistState(state, { cueLists }, { cueLists })
    })
    return groupId
  },

  renameCueListGroup: (listId, groupId, name) =>
    set((state) => {
      const cueLists = state.cueLists.map((l) => l.id === listId
        ? { ...l, groups: (l.groups ?? []).map((g) => g.id === groupId ? { ...g, name } : g) }
        : l)
      return persistState(state, { cueLists }, { cueLists })
    }),

  removeCueListGroup: (listId, groupId) =>
    set((state) => {
      const cueLists = state.cueLists.map((l) => l.id === listId
        ? {
            ...l,
            groups: (l.groups ?? []).filter((g) => g.id !== groupId),
            steps: l.steps.map((step) => step.groupId === groupId ? { ...step, groupId: undefined } : step)
          }
        : l)
      return persistState(state, { cueLists }, { cueLists })
    }),

  addCueStep: (listId, cueId) =>
    set((state) => {
      const cue = cueId ?? state.cues[0]?.id
      if (!cue) return state
      const cueLists = state.cueLists.map((list) => {
        if (list.id !== listId) return list
        const step: CueStepDef = {
          id: crypto.randomUUID(),
          cueId: cue,
          fadeMs: state.cues.find((s) => s.id === cue)?.fadeMs ?? 1000,
          holdMs: 0
        }
        return { ...list, steps: [...list.steps, step] }
      })
      return persistState(state, { cueLists }, { cueLists })
    }),

  updateCueStep: (listId, stepId, patch) =>
    set((state) => {
      const cueLists = state.cueLists.map((list) =>
        list.id === listId
          ? {
              ...list,
              steps: list.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
            }
          : list
      )
      return persistState(state, { cueLists }, { cueLists })
    }),

  removeCueStep: (listId, stepId) => {
    let activeCleared = false
    set((state) => {
      const list = state.cueLists.find((l) => l.id === listId)
      const step = list?.steps.find((s) => s.id === stepId)
      const cueLists = state.cueLists.map((item) =>
        item.id === listId
          ? { ...item, steps: item.steps.filter((s) => s.id !== stepId) }
          : item
      )
      // Removing a cue from a cuelist (Jake, 27 Nov 2026): the cue is
      // deleted from memory when nothing else references it.
      const { cues, swept } = sweepUnreferencedCues(state.cues, state.show?.livePages ?? [], cueLists, step ? [step.cueId] : [], state.pageClipboard)
      activeCleared = swept.includes(state.activeCueId ?? '')
      return persistState(state, { cueLists, cues }, { cueLists, cues, ...(activeCleared ? { activeCueId: null } : {}) })
    })
    if (activeCleared) get().refreshBaseOutput()
  },

  moveCueStep: (listId, stepId, direction) =>
    set((state) => {
      const cueLists = state.cueLists.map((list) => {
        if (list.id !== listId) return list
        const index = list.steps.findIndex((s) => s.id === stepId)
        const swap = index + direction
        if (index < 0 || swap < 0 || swap >= list.steps.length) return list
        const steps = [...list.steps]
        ;[steps[index], steps[swap]] = [steps[swap], steps[index]]
        return { ...list, steps }
      })
      return persistState(state, { cueLists }, { cueLists })
    }),

  setActiveCueList: (id) => set({ activeCueListId: id, activeCueIndex: -1, cuePlaying: false }),

  goToCue: (listId, index, fadeMsOverride) =>
    set((state) => {
      const list = state.cueLists.find((l) => l.id === listId)
      if (!list) return state
      const step = list.steps[index]
      const cue = step ? state.cues.find((s) => s.id === step.cueId) : undefined
      if (!step || !cue) return state
      // Activate (Guide ch.11, p.219) jumps instantly — fade 0.
      // Activate With Fade fades according to the previous cue's fade
      // time: the caller passes the cue being left's fadeMs.
      const fadeMs = fadeMsOverride ?? step.fadeMs
      if (!state.blackout) sendChannels(cueOutput(state, cue), resolveFadeMs({ explicitFadeMs: fadeMs, defaultFadeMs: state.show?.preferences?.defaultFadeMs }))
      return {
        activeCueListId: listId,
        activeCueIndex: index,
        activeCueId: cue.id,
        cuePlaying: true,
        cuePaused: false,
        cueRevision: state.cueRevision + 1,
        // The jump lands the slider where it is: the jumped-to cue is now
        // the current cue at whatever end the slider rests on, so a drag
        // in either direction starts a crossfade from it.
        manualCrossfadeAnchor: state.manualCrossfade
      }
    }),

  cueNext: () =>
    set((state) => {
      const list = state.cueLists.find((l) => l.id === state.activeCueListId)
      if (!list || list.steps.length === 0) return state
      // An unchecked cue is skipped (Guide ch.11, p.218); past the
      // last enabled step the list stops (or wraps when it loops).
      const next = nextEnabledIndex(list, state.activeCueIndex, 1)
      if (next < 0) return { ...state, cuePlaying: false, cuePaused: false }
      const step = list.steps[next]
      const cue = state.cues.find((s) => s.id === step.cueId)
      if (!cue) return { ...state, cuePlaying: false, cuePaused: false }
      if (!state.blackout) sendChannels(cueOutput(state, cue), resolveFadeMs({ explicitFadeMs: step.fadeMs, defaultFadeMs: state.show?.preferences?.defaultFadeMs }))
      return {
        activeCueIndex: next,
        activeCueId: cue.id,
        cuePlaying: true,
        cuePaused: false,
        cueRevision: state.cueRevision + 1,
        manualCrossfadeAnchor: state.manualCrossfade
      }
    }),

  cuePrev: () =>
    set((state) => {
      const list = state.cueLists.find((l) => l.id === state.activeCueListId)
      if (!list || list.steps.length === 0) return state
      const prev = nextEnabledIndex(list, state.activeCueIndex, -1)
      if (prev < 0) return state
      const step = list.steps[prev]
      const cue = state.cues.find((s) => s.id === step.cueId)
      if (!cue) return state
      if (!state.blackout) sendChannels(cueOutput(state, cue), resolveFadeMs({ explicitFadeMs: step.fadeMs, defaultFadeMs: state.show?.preferences?.defaultFadeMs }))
      return {
        activeCueIndex: prev,
        activeCueId: cue.id,
        cuePlaying: true,
        cuePaused: false,
        cueRevision: state.cueRevision + 1,
        manualCrossfadeAnchor: state.manualCrossfade
      }
    }),

  setCuePaused: (paused) => set({ cuePaused: paused }),

  stopCue: () => {
    const state = get()
    // LightKey p.218: Stop deactivates the cues in the cuelist — it is an
    // off switch, not just a playback pause. The old stopCue only cleared
    // cuePlaying and left the active cue's values driving the rig, so
    // Stop looked broken: the lights stayed on. While a list is playing,
    // the active cue IS the list's current cue (goToCue sets both
    // together), so deactivating it is deactivating the list's cue; the
    // list position is kept, so Go resumes from the current step.
    if (state.cuePlaying && state.activeCueId) get().deactivateCue()
    else set({ cuePlaying: false, cuePaused: false })
  },
  /**
   * Manual crossfade (8.8a, LightKey Guide ch.11, pp.193, 219): dragging
   * the Xfade slider blends live output between the current cue and the
   * next cue in the active cuelist, ignoring the cue's fade time — the
   * blend is sent immediately (which also cancels any in-flight timed
   * fade), and reaching the opposite end completes the crossfade: the
   * next cue becomes current, the hold clock reschedules for it via
   * `cueRevision`, and the slider rests at that end ready for the next
   * drag back the other way. With no active cue or no next cue the
   * position is still stored (and clamped, with no undo history), but
   * nothing is sent.
   */
  setManualCrossfade: (value) =>
    set((state) => {
      const position = Math.max(0, Math.min(1, value))
      const list = state.cueLists.find((l) => l.id === state.activeCueListId)
      const nextIndex = list ? manualCrossfadeNextIndex(list, state.activeCueIndex) : -1
      if (!list || nextIndex < 0 || state.activeCueIndex < 0) return { manualCrossfade: position }
      const current = state.cues.find((s) => s.id === list.steps[state.activeCueIndex]?.cueId)
      const next = state.cues.find((s) => s.id === list.steps[nextIndex]?.cueId)
      if (!current || !next) return { manualCrossfade: position }
      const progress = manualCrossfadeProgress(state.manualCrossfadeAnchor, position)
      if (!state.blackout) {
        // The blended patch's own max would dip mid-crossfade (the
        // same red→blue purple dip as a cue fade), so the dimmer is
        // lerped between the two cues' endpoint brightnesses instead.
        const fromPatch = cueOutput(state, current)
        const toPatch = cueOutput(state, next)
        const fixtures = state.show?.fixtures ?? []
        sendImmediate(
          manualCrossfade(fromPatch, toPatch, progress),
          lerpLevels(patchBrightness(fromPatch, fixtures), patchBrightness(toPatch, fixtures), progress)
        )
      }
      if (progress >= 1) {
        return {
          manualCrossfade: position,
          manualCrossfadeAnchor: position,
          activeCueIndex: nextIndex,
          activeCueId: next.id,
          cueRevision: state.cueRevision + 1
        }
      }
      return { manualCrossfade: position }
    }),
  stepLiveFrame: (frameId, direction) => set((state) => {
    const page = activeLivePage(state)
    return page ? { activeLiveValues: stepFrame(page, frameId, state.activeLiveValues, direction) } : state
  }),

  setMidiMappings: (mappings) =>
    set((state) => persistState(state, { midiMappings: mappings }, { midiMappings: mappings })),
  addMidiMapping: (mapping) =>
    set((state) => {
      const midiMappings = [...state.midiMappings, mapping]
      return persistState(state, { midiMappings }, { midiMappings })
    }),
  removeMidiMapping: (id) =>
    set((state) => {
      const midiMappings = state.midiMappings.filter((m) => m.id !== id)
      return persistState(state, { midiMappings }, { midiMappings })
    })
 }
  const editingCommands = ['addSequenceStep', 'removeSequenceStep', 'duplicateSequenceStep', 'moveSequenceStep', 'reorderSequenceSteps', 'createSequence', 'updateSequence', 'deleteSequence', 'duplicateSequence', 'updateSequenceStep', 'createPresetGroup', 'updatePresetGroup', 'assignPresetGroup', 'assignSequenceGroup', 'duplicatePreset', 'deletePresetGroup', 'applyPaletteDrop', 'updateEditingPresetValues', 'applyPresetsToOverrides', 'addOverridesToPresets', 'addOverridesToCues', 'startEditingCueAdHoc', 'saveEditingCueAdHoc', 'cancelEditingCueAdHoc', 'updatePresetContents', 'updatePresetFromCurrent', 'removePresetProperty', 'saveFan', 'deleteFan', 'pasteFixtureProperties', 'setSelectedColor', 'setSelectedBaseColor', 'setColorDefault', 'loadColorDefault', 'resetColorDefault', 'addColorFavorite', 'removeColorFavorite', 'updateSelectedBeamValues', 'updateBeamValues', 'createFixtureGroup', 'renameFixtureGroup', 'parentFixtureGroup', 'moveFixtureGroup', 'removeFixtureGroup', 'ungroupSelectedFixtures', 'saveFixtureProfile', 'deleteFixtureProfile', 'reassignFixtureProfile', 'duplicateFixture', 'addProfileFixtures', 'locateFixtures', 'pasteStageObjects', 'duplicateStageObjects', 'flipStageObjects', 'orderStageObjects', 'setStageObjects', 'addStageObject', 'updateStageObject', 'removeStageObjects', 'setShow', 'setLivePages', 'dropOnLivePage', 'moveSelectedPageObjects', 'resizePageObject', 'renamePageObject', 'attachPageObject', 'setPageObjectStyle', 'configureFrame', 'deleteSelectedPageObjects', 'duplicateSelectedPageObjects', 'pastePageObjects', 'updateProject', 'setStartupMode', 'setAudioPath', 'setIsPlaying', 'groupSelectedFixtures', 'groupSelection', 'createGroupsForMe', 'finishSetupWizard', 'updateSelectedFixtures', 'setManualOverrides', 'capturePreset', 'capturePresetFromLook', 'convertCuesToPresets', 'renamePreset', 'deletePreset', 'addCue', 'addCueToList', 'duplicateCue', 'updateCue', 'deleteCue', 'addFixture', 'updateFixture', 'setFixturePosition', 'setFixturePositions', 'setFixtureInstancePositions', 'setPreviewTrusses', 'removeFixture', 'addAutomation', 'updateAutomation', 'removeAutomation', 'addEffect', 'updateEffect', 'removeEffect', 'pasteEffect', 'saveEffectTemplate', 'applyEffectTemplate', 'updateEffectTemplate', 'saveEditingLiveEffect', 'renameEffectTemplate', 'duplicateEffectTemplate', 'deleteEffectTemplate', 'addCueList', 'updateCueList', 'renameCueList', 'removeCueList', 'addCueStep', 'updateCueStep', 'removeCueStep', 'moveCueStep', 'setMidiMappings', 'addMidiMapping', 'removeMidiMapping', 'undo', 'redo'] as const
  const mutable = actions as unknown as Record<string, unknown>
  const guardedEditingCommands = [...editingCommands, 'editCueContents', 'configureCueTiming', 'configureCueAppearance', 'configureCueModifiers', 'configureFaderControls', 'configureSpeedModifierOptions', 'configureCuePriority', 'configureCueFrameStep', 'editCueListCommand'] as const
  for (const command of guardedEditingCommands) {
    const action = mutable[command] as (...args: unknown[]) => unknown
    mutable[command] = (...args: unknown[]) => { if (!get().locked) return action(...args) }
  }
  return actions
})
