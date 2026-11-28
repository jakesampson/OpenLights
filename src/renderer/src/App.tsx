import { useEffect, useMemo, useRef, useState } from 'react'
import { useShowStore, resolveActiveCue, collectInlineCues, findInlineCue } from './stores/showStore'
import { AutomationPanel } from './components/AutomationPanel'
import { MidiPanel } from './components/MidiPanel'
import { NdiAmbiencePanel } from './components/NdiAmbiencePanel'
import { PatchPanel } from './components/PatchPanel'
import { ProjectBar } from './components/ProjectBar'
import { isLiveWindow, startLiveWindowBridge } from './lib/liveWindowBridge'
import { WorkspaceToolbar } from './components/WorkspaceToolbar'
import { ProjectSearch } from './components/ProjectSearch'
import { SHORTCUTS, buildShortcutsList, matchShortcut } from './lib/shortcuts'
import { LiveTab } from './components/LiveTab'
import { LiveWorkspace } from './components/LiveWorkspace'
import { MasterFader } from './components/MasterFader'
import { PanelDivider } from './components/PanelDivider'
import { clampPanelSizes, loadPanelSizes, savePanelSizes, type PanelSizes } from './lib/panelSizes'
import { StagePreview } from './components/StagePreview'
import { PreviewEditPanel, FixtureStorageTray } from './components/PreviewEditPanel'
import { previewSpacePan } from './lib/previewSpacePan'
import { GroupsPresetsPanel } from './components/GroupsPresetsPanel'
import { DmxAutoConnect } from './components/DmxConnection'
import { SettingsDialog, type SettingsTabId } from './components/SettingsDialog'
import { ViewSwitch } from './components/ViewSwitch'
import { BottomPlayback } from './components/BottomPlayback'
import { configureSequences, configureEffects, configurePresetOutput, configureLiveOutput, configureOverrideOutput } from './lib/output'
import { computeCueChannels } from './lib/automationRuntime'
import { resolveCue, resolveCueValues, fanPresetFixtureValues } from '@shared/cueResolution'
import { effectiveIntensityLevels, liveIntensityLevels, withEffectiveIntensity, type FixtureValuePatch } from './lib/effectiveIntensity'
import { completePresetBaseColour } from './lib/presetColor'
import { startCuePlaybackClock } from './lib/cuePlaybackClock'
import { adaptiveBackgroundHue } from './lib/adaptiveBackground'
import { liveFadeMs, liveOutputLevels } from './lib/liveFrames'
import { isFaderControl, isLatchingControl } from './lib/liveControlBehavior'
import { faderControlsValue, splitFaderValues } from './lib/liveFaderControls'
import { activeCueSequenceIds, activeLiveEffectIds } from './lib/liveDrops'
import { orderedLiveControls } from './lib/cuePriority'
import { configureAmbienceFixtures } from './lib/ndiAmbience'
import { ensureNdiSession, getNdiSessionState, initNdiSession, setSessionActive, useNdiSession } from './lib/ndiSession'
import { findNdiScreen } from '@shared/ndiAmbience'
import { activeOwnedEffects } from './lib/effectOwnership'
import { dimmerEffectOwnedChannels, liveBaseValues, stripOwnedDimmerChannels } from './lib/effectDimmerOwnership'
import { ContextMenu } from './components/ContextMenu'
import { OverridesField } from './components/OverridesField'
import { editAdHocTarget } from './lib/liveOverrideTargets'
import { calculateTapTempo } from './lib/tapTempo'
import { SetupWizard } from './components/SetupWizard'
import { WelcomeScreen } from './components/WelcomeScreen'
import { NewProjectDialog } from './components/NewProjectDialog'
import { WizardDmxStep } from './components/WizardDmxStep'
import { WizardDoneStep } from './components/WizardDoneStep'
import type { FixtureProfile } from '@shared/types'

type Tab = 'Design' | 'Live'
type ToolPanel = 'Patch' | 'Automation' | 'MIDI' | 'NDI Ambience'

export default function App() {
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent)
  const {
    show,
    cueLists,
    activeCueRef,
    effects,
    previewEffect,
    presets,
    activePresetIds,
    activeSequenceIds,
    activeLiveValues,
    liveActivationOrder,
    activeLivePageId,
    manualOverrides,
    bpm,
    master,
    setMaster,
    setBpm,
    blackout,
    blind,
    freeze,
    locked,
    liveEditing,
    liveAlignmentOff,
    previewEditing,
    setPreviewEditing,
    editingPresetId,
    saveEditingPreset,
    cancelEditingPreset,
    editingEffectId,
    editingEffectTemplateId,
    editingLiveEffectId,
    effectChooserAttribute,
    updateEffectTemplate,
    cancelEditingEffectTemplate,
    saveEditingLiveEffect,
    cancelEditingLiveEffect,
    editingCueAdHocId,
    saveEditingCueAdHoc,
    cancelEditingCueAdHoc,
    toggleBlackout,
    activateCue,
    refreshBaseOutput,
    cueNext,
    cuePrev,
    stopCue
  } = useShowStore()
  // The dimmer is a property of the fixture, not of one layer (Jake,
  // 20 Nov 2026): the colour a look carries resolves against the
  // dimmer the fixture is actually at — the active cue, an active
  // preset, or the Design overrides — so a dimmer drag brings up blue
  // without the wheel being touched. Since Jake's call of 22 Nov 2026
  // the pressed Live pads count too: a Live dimmer pad lifts an
  // active palette preset, and a dimmer alone raises the default
  // colour. Sequences are deliberately not sources (see
  // effectiveIntensity.ts).
  const liveLevels = useMemo(() => {
    const outputLevels = liveOutputLevels(show?.livePages, activeLiveValues)
    const controls = orderedLiveControls(show?.livePages, outputLevels, liveActivationOrder)
    return liveIntensityLevels({ controls, levels: outputLevels, presets, fixtures: show?.fixtures ?? [] })
  }, [show?.livePages, activeLiveValues, liveActivationOrder, presets, show?.fixtures])
  const effectiveLevels = useMemo(() => {
    const activeCue = resolveActiveCue({ show, cueLists, activeCueRef })
    return effectiveIntensityLevels({
      cueValues: activeCue ? resolveCueValues(activeCue, presets, show?.fixtures ?? []) : {},
      activePresetIds,
      presets,
      manualOverrides,
      liveLevels
    })
  }, [show, cueLists, activeCueRef, presets, activePresetIds, manualOverrides, show?.fixtures, liveLevels])
  /** The base look in attribute space (the active cue's resolved values,
   *  then manually activated presets, then Design overrides — later
   *  wins): the effect runtime's colour source for virtual-dimmer
   *  fixtures, where a Dimmer effect scales the LED channels by the
   *  effect level and needs the colour the base look carries (a channel
   *  patch has already scaled it away by the base dimmer). */
  const baseAttributeValues = useMemo(() => {
    const values: Record<string, Record<string, number>> = {}
    const take = (patch: Record<string, Record<string, number>>) => {
      for (const [fixtureId, attrs] of Object.entries(patch)) {
        values[fixtureId] = { ...(values[fixtureId] ?? {}), ...attrs }
      }
    }
    const activeCue = resolveActiveCue({ show, cueLists, activeCueRef })
    if (activeCue) take(resolveCueValues(activeCue, presets, show?.fixtures ?? []))
    // Lit Live pads are part of the look too (Jake, 28 Nov 2026 — the
    // layering blank): a running Dimmer effect takes its colour from
    // the base look, so a Live colour button must reach it, or the
    // effect chases in the default blue while the button is lit. Live
    // sits below presets in the layer order, so it is taken before them.
    take(liveBaseValues(show?.livePages, activeLiveValues, liveActivationOrder, presets, show?.fixtures ?? []))
    for (const id of activePresetIds) {
      const preset = presets.find((item) => item.id === id)
      if (preset) take(preset.fixtureValues ?? {})
    }
    take(manualOverrides)
    // The base is the effect's colour source, so it carries the same
    // base-colour completion as the preset layer (Jake, 22 Nov 2026):
    // a partial Red look must not leak the default blue through the
    // channels it never wrote — once the preset patch stops masking
    // the effect (below), that leak would show.
    return completePresetBaseColour(values, show?.fixtures ?? [])
  }, [show, cueLists, activeCueRef, presets, activePresetIds, manualOverrides, show?.fixtures, activeLiveValues, liveActivationOrder])
  const [tab, setTab] = useState<Tab>('Design')
  // Panel sizes (Jake, 27 Nov 2026): the four main panels resize by
  // dragging the dividers between them. Per-machine, so they live in
  // localStorage, not the show file. The functional update keeps
  // incremental drag deltas race-free — the divider reports the pixels
  // since the last move, and the clamp runs against the live window.
  const [panelSizes, setPanelSizes] = useState<PanelSizes>(() => loadPanelSizes(localStorage, { width: window.innerWidth, height: window.innerHeight }))
  const resizePanelBy = (key: keyof PanelSizes, delta: number) => {
    setPanelSizes((prev) => {
      const sizes = clampPanelSizes({ ...prev, [key]: prev[key] + delta }, { width: window.innerWidth, height: window.innerHeight })
      savePanelSizes(sizes, localStorage)
      return sizes
    })
  }
  // Absolute width setter for the Get Info inspector (Jake, 28 Nov
  // 2026): the inspector's drag handle reports its new width directly,
  // not a delta — same clamp + persist as the divider drags above.
  const setPanelSize = (key: keyof PanelSizes, value: number) => {
    setPanelSizes((prev) => {
      const sizes = clampPanelSizes({ ...prev, [key]: value }, { width: window.innerWidth, height: window.innerHeight })
      savePanelSizes(sizes, localStorage)
      return sizes
    })
  }
  const [liveToolbarHost, setLiveToolbarHost] = useState<HTMLDivElement | null>(null)
  // Host for the effect editor's type tab (Jake, 21 Nov 2026): in
  // LightKey the "{Property} Effect ▾" tab sits IN the Design/Live pill
  // bar while an effect is being edited, and leaves it when the editor
  // closes. Same portal pattern as liveToolbarHost — the EffectEditor
  // portals its tab here, and renders it inline in its own header when
  // there is no host (standalone tests). The host only exists while an
  // effect editor is open in Design, so the pill bar is back to
  // Design/Live only the moment the editor closes.
  const [effectTabHost, setEffectTabHost] = useState<HTMLDivElement | null>(null)
  // The right-hand host in the same pill-bar row (Jake, 21 Nov 2026):
  // the EffectEditor portals its Fixture Order menu here, so the
  // editor has no second header row of its own — the whole editor
  // header lives in the Design/Live row, LightKey's way. Same
  // lifetime as the tab host above.
  const [effectToolsHost, setEffectToolsHost] = useState<HTMLDivElement | null>(null)
  // Host for the movement effect's Position HUD (Jake, 26 Nov 2026):
  // LightKey's circular movement chart floats over the Preview while a
  // movement effect is being edited. Same portal pattern as the tab
  // host above — the MovementEditor portals its chart here, and renders
  // it inline in the bottom panel when there is no host (standalone
  // tests). The host only exists while an effect editor is open in
  // Design, so the chart leaves with the editor. It is pointer-events
  // none; only the chart panel itself captures pointer events, so the
  // rest of the Preview stays usable underneath it.
  const [movementChartHost, setMovementChartHost] = useState<HTMLDivElement | null>(null)
  // The effects chooser's header hosts (Jake, 22 Nov 2026; LightKey
  // screenshot 12.03.49 am): the chooser portals its mode-swap pill
  // ("Custom Effect" / "Effect Template") to the far left of the
  // Design/Live row and its Search field to the far right — one
  // header row, not two. Only while the chooser is open in Design.
  const [chooserLeftHost, setChooserLeftHost] = useState<HTMLDivElement | null>(null)
  const [chooserSearchHost, setChooserSearchHost] = useState<HTMLDivElement | null>(null)
  const setupWizardStep = useShowStore((s) => s.setupWizardStep)
  const welcomeOpen = useShowStore((s) => s.welcomeOpen)
  const newProjectDialogOpen = useShowStore((s) => s.newProjectDialogOpen)
  const newProjectTemplate = useShowStore((s) => s.newProjectTemplate)
  // Setup wizard (Piece 5, Guide ch.4): the wizard is a full-window modal
  // (rendered below) and drives the workspace per step — the Patch panel
  // renders inside the modal for patching, Preview edit mode for Build Your
  // Preview and Fixture Groups, edit mode off for Light Beam Directions.
  // The Patch tool panel never opens during the wizard: its overlay used to
  // sit over the whole window with a `-webkit-app-region: drag` header,
  // which swallowed clicks on the wizard bar's Back / Next on the patch
  // step (19 Nov 2026, Jake's screenshot) even though the bar painted
  // above it.
  useEffect(() => {
    if (!setupWizardStep) return
    setTab('Design')
    setToolPanel(null)
    useShowStore.getState().setPreviewEditing(setupWizardStep === 'preview' || setupWizardStep === 'groups')
  }, [setupWizardStep])
  // While the setup wizard is open the native caption buttons must blend
  // with the wizard page, not the main window's grey header (Jake, 20 Nov
  // 2026, screenshot image-25.png — the grey strip covered the wizard's
  // Back button). While the Project Browser is open they must blend with
  // the app background purple instead (Jake, 23 Nov 2026, screenshot
  // image-ff69c11b.png — the grey strip over the purple welcome screen).
  // The wizard is a full-window modal over the welcome screen, so it wins
  // when both are set (startSetupWizard already closes the welcome screen,
  // this is just the ordering). The main process restores the grey when
  // both close; on macOS this is a no-op (native traffic lights).
  useEffect(() => {
    const mode = setupWizardStep ? 'wizard' : welcomeOpen ? 'welcome' : 'main'
    window.electronAPI?.setTitleBarOverlay?.(mode)
  }, [setupWizardStep, welcomeOpen])
  // The OFL library is the migration's second source (Jake, 20 Nov 2026,
  // image-18): without it, a show's OFL fixtures keep their stale inline
  // snapshots and the Dimmer brings up black. Load it once at startup so
  // a show opened afterwards heals on load; a show opened before it
  // arrives is re-healed when it lands (setOflProfiles). A failed load
  // is not an error — Patch loads the same list on demand, and the
  // built-in healing still runs.
  useEffect(() => {
    let active = true
    window.electronAPI.listOflProfiles().then((profiles) => {
      if (active && Array.isArray(profiles)) useShowStore.getState().setOflProfiles(profiles)
    }).catch(() => {})
    return () => { active = false }
  }, [])
  // A show opened with its own stored custom fixtures promotes them
  // into the global library (Jake, 20 Nov 2026 — all duplicates and
  // Build Your Own fixtures are global): the library is the single
  // home for a custom fixture, so a copy that only lives in one show
  // is moved there the first time the show opens with the library
  // loaded, and the show copy is removed so it cannot shadow the
  // fresh global record. A show copy whose id is ALREADY in the
  // library is left alone — it may carry edits made to the global
  // record's twin before customs went global, and deleting it would
  // lose them; editing that fixture converges the two (the editor's
  // global save replaces the library record and removes the show
  // copy). Only profiles whose save succeeded are removed, and only
  // while the same show is still open; the effect settles once the
  // promoted ids are in the library.
  const oflProfiles = useShowStore((s) => s.oflProfiles)
  useEffect(() => {
    if (!show) return
    const showId = show.id
    const missing = (show.fixtureProfiles ?? []).filter((p) => p.custom === true && !oflProfiles.some((g) => g.id === p.id))
    if (!missing.length) return
    let cancelled = false
    void (async () => {
      let profiles = oflProfiles
      const promoted: FixtureProfile[] = []
      for (const profile of missing) {
        if (cancelled) return
        try {
          const result = await window.electronAPI.saveOflCustomProfile(profile)
          if (result && result.success && Array.isArray(result.profiles)) { profiles = result.profiles; promoted.push(profile) }
        } catch { /* a failed promotion stays show-only until the next open */ }
      }
      if (cancelled || !promoted.length) return
      const store = useShowStore.getState()
      if (store.show?.id !== showId) return
      for (const profile of promoted) {
        if ((store.show?.fixtureProfiles ?? []).some((p) => p.id === profile.id)) store.deleteFixtureProfile(profile.id)
      }
      store.setOflProfiles(profiles)
    })()
    return () => { cancelled = true }
  }, [show, oflProfiles])
  // Create the project the New Project dialog named (Guide p.26). The
  // creation itself lives in ProjectBar — it owns the save path and
  // snapshot — via the `openlights-create-project` event; this only makes
  // sure the new project lands in the Design view.
  const createProject = (name: string) => {
    setTab('Design')
    window.dispatchEvent(new CustomEvent('openlights-create-project', { detail: name }))
  }
  const editingPreset = editingPresetId ? presets.find((p) => p.id === editingPresetId) : undefined
  // In-place preset editing opens in Design (LightKey, Guide ch.9).
  useEffect(() => { if (editingPresetId) setTab('Design') }, [editingPresetId])
  // The saved effect template being edited (LightKey Guide ch.9, p.128):
  // its name appears in the toolbar with Update, as for presets.
  const editingEffectTemplate = editingEffectTemplateId
    ? show?.effectTemplates?.find((t) => t.id === editingEffectTemplateId)
    : undefined
  // The live effect being edited from the Preset Palette (Jake,
  // 22 Nov 2026): its name appears in the toolbar with Update/Cancel,
  // exactly like a template session.
  const editingLiveEffect = editingLiveEffectId
    ? effects.find((e) => e.id === editingLiveEffectId)
    : undefined
  const editingCueAdHoc = editingCueAdHocId ? findInlineCue(show, cueLists, editingCueAdHocId)?.cue : undefined
  // In-place cue ad-hoc editing opens in Design (Guide ch.11, p.201).
  useEffect(() => { if (editingCueAdHocId) setTab('Design') }, [editingCueAdHocId])
  // Editing an effect opens in Design (Jake, 27 Nov 2026): the effect
  // editor lives in the Design panel only, so Edit on a palette effect
  // row from the Live tab set the session and showed nothing — there
  // is nowhere for the editor to render in Live. The switch uses
  // setTab directly, not goTab: goTab exits the editor, which would
  // cancel the edit just opened. Gated on editingEffectId, not just
  // the live-effect session, so editing a saved template from Live
  // opens the editor too.
  useEffect(() => { if (editingEffectId) setTab('Design') }, [editingEffectId])
  // "Show in Cue" from the Preset Palette (LightKey Guide p.144): reveal
  // a Live cue — select its page, select the button (accent border),
  // switch to Live and scroll it into view. Mirrors ProjectSearch's
  // reveal above; an open preset is saved first, like goTab does.
  useEffect(() => {
    const reveal = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId: string; controlId: string }>).detail
      if (!detail?.pageId || !detail?.controlId) return
      const state = useShowStore.getState()
      if (state.editingPresetId) state.saveEditingPreset()
      if (state.editingCueAdHocId) state.saveEditingCueAdHoc()
      state.selectLivePage(detail.pageId)
      // selectLivePage clears the page-object selection, so select after.
      state.setPageObjectSelection([{ type: 'cue', id: detail.controlId }])
      state.exitEffectEditor()
      setTab('Live')
      requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(detail.controlId)}"]`)
        if (!target) return
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
        target.tabIndex = -1
        target.focus({ preventScroll: true })
      })
    }
    window.addEventListener('openlights-reveal-live-control', reveal)
    return () => window.removeEventListener('openlights-reveal-live-control', reveal)
  }, [])
  // Switching to Live while a preset or a cue's ad-hoc layer is open
  // ends the session, keeping the edits (they were written live,
  // undoable); Cancel is explicit. Switching to Design or Live while
  // the effect editor (or chooser) is open exits it — Cancel semantics
  // (a template-edit working copy is discarded) — so clicking Design
  // never leaves the editor stuck (Jake, 21 Nov 2026).
  const goTab = (view: Tab) => { useShowStore.getState().exitEffectEditor(); if (view === 'Live' && editingPresetId) saveEditingPreset(); if (view === 'Live' && editingCueAdHocId) saveEditingCueAdHoc(); setTab(view) }
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The Settings dialog's tab persists across opens (LightKey reopens on
  // the last-used tab): the dialog reports tab switches back through
  // onTabChange, and Cmd+, reopens on that tab.
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('general')
  // A MIDI learn armed from a button's External Control menu (Jake,
  // 27 Nov 2026 — LightKey's "Add Trigger…"): opening Settings arms
  // the learn for that button. Cleared when the dialog closes, so a
  // later open does not re-arm it.
  const [midiLearnTarget, setMidiLearnTarget] = useState<{ targetType: 'live-cue'; targetId: string; label: string } | null>(null)
  // The far-right header button is a view-options menu (Jake, 22 Nov
  // 2026), not a settings menu: it shows/hides Preview, Preset Palette
  // and Shortcuts, and carries the header actions that are not settings.
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [adaptiveBackground, setAdaptiveBackground] = useState(() => localStorage.getItem('openlights.adaptiveBackground') !== 'false')
  const [toolPanel, setToolPanel] = useState<ToolPanel | null>(null)
  const headerTaps = useRef<number[]>([])
  const settingsMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const closeHeaderMenus = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || !settingsMenuRef.current?.contains(target)) setViewMenuOpen(false)
    }
    const closeHeaderMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setViewMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeHeaderMenus)
    window.addEventListener('keydown', closeHeaderMenusOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeHeaderMenus)
      window.removeEventListener('keydown', closeHeaderMenusOnEscape)
    }
  }, [])
  // Tap tempo for the Master column's BPM box (LightKey: the "90 bpm" box
  // under the Master fader). Shares the header Tap button's tap history —
  // one tempo, tapped from either place.
  const tapTempo = () => {
    const result = calculateTapTempo(headerTaps.current, performance.now())
    headerTaps.current = result.taps
    if (result.bpm !== null) setBpm(result.bpm)
  }
  useEffect(() => {
    document.documentElement.dataset.theme = show?.preferences?.theme ?? 'dark'
  }, [show?.preferences?.theme])

  const previousLivePage = useRef<string | null>(null)
  // The Live levels the last effect run saw, per control id — so a toggle
  // on the same page can fade over the page fade (Bug 3, Jake 20 Nov 2026)
  // while fader drags and flash presses stay immediate.
  const previousOutputLevels = useRef<Record<string, number>>({})
  useEffect(() => {
    localStorage.setItem('openlights.adaptiveBackground', String(adaptiveBackground))
    const root = document.documentElement
    if (!adaptiveBackground) { root.style.removeProperty('--adaptive-hue'); root.removeAttribute('data-adaptive'); return }
    root.dataset.adaptive = 'true'
    let alive = true
    let pending = false
    const refresh = async () => {
      if (pending || !window.electronAPI?.getChannels) return
      pending = true
      try {
        const channels = await window.electronAPI.getChannels()
        if (!alive) return
        const state = useShowStore.getState()
        const cue = resolveActiveCue(state)
        const hue = adaptiveBackgroundHue(state.show?.fixtures ?? [], channels, cue ? resolveCue(cue, state.presets, state.show?.fixtures ?? []) : undefined)
        root.style.setProperty('--adaptive-hue', String(hue ?? 283))
      } catch { /* Keep the previous appearance if output is unavailable. */ }
      finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(refresh, 200)
    return () => { alive = false; window.clearInterval(timer); root.style.removeProperty('--adaptive-hue'); root.removeAttribute('data-adaptive') }
  }, [adaptiveBackground])

  // The effects actually running this frame (Jake, 28 Nov 2026): the
  // stored list with ownership applied — a Live button's effects forced
  // on, an owned effect only while its owner is active. Computed once
  // here so the output loop and the dimmer-ownership strip below agree
  // on exactly which effects are running.
  const runtimeEffects = useMemo(
    () => activeOwnedEffects(effects, { presets: activePresetIds, sequences: activeSequenceIds, cues: activeLiveValues, liveEffects: activeLiveEffectIds(show?.livePages, activeLiveValues) }),
    [effects, activePresetIds, activeSequenceIds, activeLiveValues, show?.livePages]
  )
  // The LED channels a running Dimmer effect owns on virtual-dimmer
  // fixtures (Jake, 28 Nov 2026 — the layering blank): the preset/live/
  // override patches must not write these, or their explicit zeros sit
  // above the effect layer and blank the rig.
  const ownedDimmerChannels = useMemo(
    () => dimmerEffectOwnedChannels(show?.fixtures ?? [], runtimeEffects),
    [show?.fixtures, runtimeEffects]
  )

  useEffect(() => {
    // The chooser preview runs last so it wins over a stored effect on
    // the same channels — what the user is previewing is what they see.
    // It is session-only (never in show.effects), so it can never be
    // captured into a cue or survive a reload.
    configureEffects({
      effects: [...runtimeEffects, ...(previewEffect ? [previewEffect] : [])],
      fixtures: show?.fixtures ?? [],
      movementPaths: show?.movementPaths ?? [],
      bpm,
      master,
      blackout,
      baseValues: baseAttributeValues
    })
  }, [runtimeEffects, previewEffect, show?.fixtures, bpm, master, blackout, baseAttributeValues])

  useEffect(() => {
    // Sequences can be started globally or dropped onto a live cue; an active
    // cue's sequences run for as long as that cue is lit. A stored cue's
    // sequences (Piece 8) run the same way while it is the active cue —
    // in Design, or as the current step of a cuelist.
    const activeCue = resolveActiveCue({ show, cueLists, activeCueRef })
    const ids = new Set([...activeSequenceIds, ...activeCueSequenceIds(show?.livePages, activeLiveValues, collectInlineCues(show, cueLists)), ...(activeCue?.sequenceIds ?? [])])
    configureSequences([...ids].flatMap((id) => (show?.sequences ?? []).filter((s) => s.id === id)), presets)
  }, [show?.sequences, show?.livePages, show, cueLists, activeCueRef, activeSequenceIds, activeLiveValues, presets])

  // A run-once sequence auto-deactivates when it finishes (Video 2,
  // Jake 27 Nov 2026): the output layer only stops animating, so poll
  // the finished ids and release the buttons / cues running them. A
  // looping sequence never completes, so it repeats infinitely.
  useEffect(() => {
    if (!activeSequenceIds.length && !activeCueRef && !Object.values(activeLiveValues).some((level) => level > 0)) return
    const timer = window.setInterval(() => useShowStore.getState().deactivateCompletedSequences(), 250)
    return () => window.clearInterval(timer)
  }, [activeSequenceIds, activeCueRef, activeLiveValues])

  useEffect(() => {
    const patch: Record<number, number> = {}
    for (const id of activePresetIds) {
      const preset = presets.find((item) => item.id === id)
      if (!preset) continue
      // A preset's colour is the fixture's colour (Jake, 19 Nov
      // 2026): applying it live fans the bare colour out to every
      // beam, so a red preset lights all four cells of a 4Bar — and
      // the whole base colour (completePresetBaseColour), so the
      // lifted default blue cannot leak through the channels the
      // preset never wrote (Jake, 22 Nov 2026).
      Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { id: preset.id, name: preset.name, fadeMs: 0, fixtureValues: withEffectiveIntensity(completePresetBaseColour(fanPresetFixtureValues(preset.fixtureValues, show?.fixtures ?? []), show?.fixtures ?? []), effectiveLevels) }, master))
    }
    // A running Dimmer effect owns the LED channels on virtual-dimmer
    // fixtures (Jake, 28 Nov 2026 — the layering blank): strip them
    // here, or the preset's zero-scaled colours sit above the effect
    // layer and blank the rig. The effect layer already carries the
    // preset's colour from the base look.
    configurePresetOutput(stripOwnedDimmerChannels(patch, ownedDimmerChannels))
  }, [presets, activePresetIds, show?.fixtures, master, effectiveLevels, ownedDimmerChannels])

  useEffect(() => {
    const patch: Record<number, number> = {}
    const outputLevels = liveOutputLevels(show?.livePages, activeLiveValues)
    const controls = orderedLiveControls(show?.livePages, outputLevels, liveActivationOrder)
    // A Live pad's dimmer is a property of the fixture, like a palette
    // preset's (Jake, 22 Nov 2026): a Full On pad must lift a Red pad's
    // colour on a virtual-dimmer fixture, which has no dimmer channel
    // for the Full On pad to write — so the two pads never meet at the
    // channel level. Every pad's colours resolve against the effective
    // levels, which already carry the pressed pads (liveLevels above).
    // Hardware-dimmer fixtures are unaffected — their pads already
    // write the intensity channel.
    const levels = effectiveLevels
    for (const control of controls) {
      const level = outputLevels[control.id] ?? 0
      // Level 0 deactivates the cue (guide p.216 — "Drag the fader to
      // 0% to deactivate the cue"): a control at 0 writes nothing, not
      // even pan/tilt. The old fader exception here is gone — it was
      // dead code anyway (orderedLiveControls above already drops
      // level-0 controls), and it described the opposite: a fader at 0
      // used to run its cue with a zero master, which only zeroes
      // dimmer attributes (scaleAttribute) and left pan/tilt at full.
      if (!level) continue
      // A fader's level is applied once, by the split (guide p.204 —
      // Controls): the controlled properties are pre-scaled by the
      // level, the rest run at full master. Both sets are computed
      // with the plain master. Push buttons keep the existing
      // scaledMaster path. Note the split also ends the old double
      // scale on a fader's intensity: it used to be scaled once by
      // liveIntensityLevels (via withEffectiveIntensity) and again by
      // scaledMaster, so 50% came out at ~25%.
      const emit = (id: string, name: string, values: FixtureValuePatch) => {
        if (!isFaderControl(control)) {
          Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { id, name, fadeMs: 0, fixtureValues: withEffectiveIntensity(values, levels) }, master * level / 255))
          return
        }
        const { scaled, full } = splitFaderValues(values, faderControlsValue(control), level)
        Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { id, name, fadeMs: 0, fixtureValues: scaled }, master))
        Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { id, name, fadeMs: 0, fixtureValues: withEffectiveIntensity(full, levels) }, master))
      }
      const cue = control.cue
      if (cue && !cue.blackout) {
        const resolved = resolveCue(cue, presets, show?.fixtures ?? [])
        emit(resolved.id, resolved.name, resolved.fixtureValues)
      }
      for (const id of control.presetIds ?? []) {
        const preset = presets.find((item) => item.id === id)
        if (preset) emit(preset.id, preset.name, completePresetBaseColour(fanPresetFixtureValues(preset.fixtureValues, show?.fixtures ?? []), show?.fixtures ?? []))
      }
      if (control.adHocValues) emit(control.id, control.name, control.adHocValues)
    }
    const changed = previousLivePage.current !== activeLivePageId
    previousLivePage.current = activeLivePageId
    const activePage = show?.livePages?.find((page) => page.id === activeLivePageId)
    // The page fade falls back to the project's Page fade preference when
    // the page has no per-page value (Jake, 20 Nov 2026: a 10 s page fade
    // set in Manage Live Pages was ignored — the global default was never
    // consulted, so pages without an explicit value faded over 0 ms).
    const pageFade = liveFadeMs(activePage, outputLevels, activePage?.fadeMs ?? show?.preferences?.pageFadeMs ?? 500)
    // A toggle on the same page fades over the page fade too — the old
    // code only faded on a page switch, so switching cues on one page
    // always swapped instantly whatever the fade time was. Faders and
    // flash buttons stay immediate: a fader drag would otherwise restart
    // a 10 s fade on every input, and a flash must follow its press and
    // release. Cuelist Go/Back deliberately stay on the step's own fadeMs.
    const previousLevels = previousOutputLevels.current
    previousOutputLevels.current = { ...outputLevels }
    const liveControls = new Map((show?.livePages ?? []).flatMap((page) => page.controls).map((control) => [control.id, control]))
    const liveChanged = [...Object.keys(outputLevels), ...Object.keys(previousLevels)].some((id) => {
      const control = liveControls.get(id)
      if (!control || !isLatchingControl(control)) return false
      return (previousLevels[id] ?? 0) !== (outputLevels[id] ?? 0)
    })
    // A running Dimmer effect owns the LED channels on virtual-dimmer
    // fixtures (Jake, 28 Nov 2026 — the layering blank): strip them
    // here, or the Live button's zero-scaled colours sit above the
    // effect layer and blank the rig. The effect layer already carries
    // the button's colour from the base look.
    configureLiveOutput(stripOwnedDimmerChannels(patch, ownedDimmerChannels), changed || liveChanged ? pageFade : 0)
  }, [show?.livePages, show?.fixtures, presets, activeLiveValues, liveActivationOrder, activeLivePageId, master, effectiveLevels, ownedDimmerChannels])

  useEffect(() => {
    // Same ownership strip as the preset/live patches (Jake, 28 Nov
    // 2026): a Design override's zero-scaled colours must not sit above
    // a running Dimmer effect on a virtual-dimmer fixture either — the
    // effect layer already carries the override's colour from the base
    // look, so the colour changes while the effect keeps dimming.
    configureOverrideOutput(stripOwnedDimmerChannels(computeCueChannels(show?.fixtures ?? [], { id: 'manual', name: 'Manual', fadeMs: 0, fixtureValues: withEffectiveIntensity(manualOverrides, effectiveLevels) }, master), ownedDimmerChannels))
    // The base look is otherwise only recomputed when a cue activates,
    // so it would stay dark after a dimmer drag (Jake, 20 Nov 2026:
    // the dimmer drags but no light appears until the wheel is
    // clicked). This runs on every override change and re-sends the
    // base with the current effective intensities — a no-op under
    // blackout or with no show open.
    refreshBaseOutput()
  }, [manualOverrides, show?.fixtures, master, effectiveLevels, refreshBaseOutput, ownedDimmerChannels])

  useEffect(() => isLiveWindow() ? undefined : startCuePlaybackClock(), [])
  useEffect(() => startLiveWindowBridge(), [])

  // NDI Ambience (Jake, 23 Nov 2026): the shared session lives here,
  // in the always-mounted App, so the Live button works even when the
  // NDI panel never opened — the panel is one way to drive it, not the
  // only one. The session is initialised once, the edge mapper is kept
  // in step with the show, and a lit NDI Ambience Live button owns the
  // activation: pressing it connects the worker (with the remembered
  // source) and turns the output layer on; pressing it again lifts the
  // override and the rig goes back to the presets/cues underneath.
  // The main window owns the session — a live window only mirrors the
  // buttons, and its presses reach this effect through the bridge.
  const ndiSession = useNdiSession()
  useEffect(() => { initNdiSession() }, [])
  useEffect(() => {
    configureAmbienceFixtures(show?.fixtures ?? [], show?.stageObjects, master, show?.fixtureGroups)
  }, [show?.fixtures, show?.stageObjects, show?.fixtureGroups, master])
  useEffect(() => {
    if (isLiveWindow()) return
    const lit = (show?.livePages ?? [])
      .flatMap((page) => page.controls)
      .filter((control) => control.ndiAmbience && (activeLiveValues[control.id] ?? 0) > 0)
    if (!lit.length) {
      // Only release an activation the Live layer owns — a panel-driven
      // session stays up when the button goes off.
      if (getNdiSessionState().activeBy === 'live') setSessionActive(false)
      return
    }
    let cancelled = false
    const hasScreen = Boolean(findNdiScreen(show?.stageObjects))
    void (async () => {
      const ok = await ensureNdiSession(hasScreen)
      if (cancelled) return
      // A quick off-press while the worker was connecting must not
      // re-activate: re-check the store before touching the output.
      const stillLit = lit.some((control) => (useShowStore.getState().activeLiveValues[control.id] ?? 0) > 0)
      if (!stillLit) return
      if (ok) setSessionActive(true, 'live')
      else lit.forEach((control) => useShowStore.getState().setLiveValue(control.id, 0))
    })()
    return () => { cancelled = true }
  }, [show?.livePages, show?.stageObjects, activeLiveValues, ndiSession.connected, ndiSession.active])


  const blackoutDMX = async () => {
    try {
      if (!window.electronAPI) return
      await window.electronAPI.blackout()
    } catch (e) {
      console.error('DMX blackout error', e)
    }
  }

  const handleBlackout = async () => {
    if (!blackout) await blackoutDMX()
    toggleBlackout()
  }

  // The header Edit button toggles Preview editing only (LightKey Guide
  // p.53, "Edit the Preview"). Live page editing has its own Edit button
  // in the Live panel (Guide ch.11, "Edit Live View", LiveWorkspace's
  // toggleEditing). The two used to share one context-sensitive handler
  // that flipped whichever mode matched the current tab, so each button
  // flipped both modes (Jake, 20 Nov 2026). Disabled only while locked.
  const togglePreviewEditing = () => {
    const state = useShowStore.getState()
    if (state.locked) return
    state.setPreviewEditing(!state.previewEditing)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useShowStore.getState()
      // Return / Enter hides the override labels when they are up and
      // focus is not in a field (Guide ch.11, p.116).
      if (event.key === 'Enter' && state.showOverrideLabels && event.target === document.body) { event.preventDefault(); state.setShowOverrideLabels(false); return }
      const binding = matchShortcut(event, event.target as HTMLElement | null)
      if (!binding) return
      event.preventDefault()
      const command = binding.command
      if (command === 'undo' || command === 'redo') state[command]()
      else if (['save', 'saveAs', 'open', 'new', 'close'].includes(command)) window.dispatchEvent(new CustomEvent('openlights-project-command', { detail: command }))
      else if (command === 'design') { if (!state.locked) { state.exitEffectEditor(); setTab('Design') } }
      else if (command === 'live') { state.exitEffectEditor(); setTab('Live') }
      else if (command === 'editPreview') togglePreviewEditing()
      // Settings (LightKey: Command-Comma) opens the tabbed Settings
      // dialog on the last-used tab.
      else if (command === 'settings') setSettingsOpen(true)
      else if (command === 'showOverrides') state.setShowOverrideLabels(!state.showOverrideLabels)
      else if (command.startsWith('zoom')) window.dispatchEvent(new CustomEvent('openlights-preview-zoom', { detail: ({ zoomIn: 'in', zoomOut: 'out', zoomFit: 'fit', zoomSelection: 'selection' } as Record<string, string>)[command] }))
      else if (command === 'fullscreen') void window.electronAPI.toggleFullscreen()
      else if (command === 'blackout') state.toggleBlackout()
      else if (command === 'highlight') state.toggleHighlightMode()
      else if (command === 'beamDirection') window.dispatchEvent(new Event('openlights-open-calibration'))
      else if (command === 'group') {
        // Group the current selection (Guide p.35: Layout > Group, or
        // Control-click → Group).
        state.groupSelection()
      }
      // Select All / Deselect All (Guide pp.53, 72: Edit > Select All,
      // Cmd-A; Deselect All, Cmd-Shift-A): every fixture on the canvas
      // plus every truss. Deselect also clears the stage-object selection.
      else if (command === 'selectAll') { const trusses = state.show?.previewTrusses ?? []; state.selectFixtures((state.show?.fixtures ?? []).filter((f) => !f.inStorage).map((f) => f.id)); state.setSelectedLayoutTrussIds(trusses.map((t) => t.id)); state.setSelectedPreviewTrussId(trusses[0]?.id ?? null) }
      else if (command === 'deselectAll') { state.selectFixtures([]); state.setSelectedLayoutTrussIds([]); state.setSelectedPreviewTrussId(null); state.setSelectedStageObjectId(null) }
      else if (command === 'beamColor') window.dispatchEvent(new Event('openlights-open-beam-color'))
      else if (command === 'fixtureOptions') window.dispatchEvent(new Event('openlights-open-fixture-options'))
      else if (command === 'next') state.cueNext()
      else if (command === 'previous') state.cuePrev()
      else if (command === 'go') { if (previewSpacePan.held) { /* Space+drag pan over the Preview (Guide p.53) — Go must not fire. */ } else if (toolPanel === 'Automation') window.dispatchEvent(new Event('openlights-toggle-play')); else state.cueNext() }
      else if (command === 'escape') { if (state.editingPresetId) state.cancelEditingPreset(); else if (state.editingCueAdHocId) state.cancelEditingCueAdHoc(); else if (state.editingEffectTemplateId) state.cancelEditingEffectTemplate(); else if (state.editingLiveEffectId) state.cancelEditingLiveEffect(); else if (state.editingEffectId) state.setEditingEffectId(null); else if (state.effectChooserAttribute) state.setEffectChooserAttribute(null); else if (toolPanel && !setupWizardStep) setToolPanel(null); else if (setupWizardStep) { /* The wizard is modal: Back / Next / × navigate, Escape does not dismiss it (and never stops a cue mid-setup). Nested dialogs keep their own Escape handling (PatchDialog, CalibrationDialog). */ } else if (viewMenuOpen) setViewMenuOpen(false); else if (settingsOpen) setSettingsOpen(false); else if (state.showOverrideLabels) state.setShowOverrideLabels(false); else state.stopCue() }
      else if (command.startsWith('cue')) { const cue = collectInlineCues(state.show, state.cueLists)[Number(command.slice(3)) - 1]; if (cue) state.activateCue(cue.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolPanel, settingsOpen, viewMenuOpen, activateCue, cueNext, cuePrev, stopCue, toggleBlackout, tab, setupWizardStep])

  useEffect(() => window.electronAPI.onMenuCommand((command) => {
    const binding = SHORTCUTS.find((item) => item.command === command)
    if (binding) window.dispatchEvent(new KeyboardEvent('keydown', { key: binding.code, ctrlKey: binding.ctrl, shiftKey: binding.shift, altKey: binding.alt }))
    else window.dispatchEvent(new CustomEvent('openlights-menu-command', { detail: { command } }))
  }), [])

  // Menu commands with no keyboard binding (Add Overrides, Edit Ad Hoc
  // Properties — Guide ch.11, pp.201–202) arrive as custom events, from
  // the context menu or the native app menu (see onMenuCommand above).
  useEffect(() => {
    const onMenuCommand = (event: Event) => {
      const { command, selectedOnly } = (event as CustomEvent<{ command: string; selectedOnly?: boolean }>).detail
      const state = useShowStore.getState()
      if (command === 'addOverrides') state.addOverridesToCues(undefined, selectedOnly ?? false)
      else if (command === 'openLiveWindow') void window.electronAPI.openLiveWindow(state.activeLivePageId)
      else if (command === 'automation') setToolPanel('Automation')
      // 'ndiAmbience' is no longer a native menu command (Jake, 23 Nov
      // 2026 — the View-menu entry is gone); the preset palette's bottom
      // row still opens the panel by dispatching this command.
      else if (command === 'ndiAmbience') setToolPanel('NDI Ambience')
      else if (command === 'editAdHocProperties') {
        const target = editAdHocTarget(state)
        if (target && 'cueId' in target) state.startEditingCueAdHoc(target.cueId)
        else if (target && 'popup' in target) window.dispatchEvent(new Event('openlights-open-live-properties'))
      }
      // Layout menu (Guide ch.7): Select All / Deselect All live in the
      // Edit menu, the rest here. Align / Distribute dispatch the
      // Preview's align handler (it needs the live fixture positions);
      // Flip / Order act on the selected stage object only.
      else if (command === 'selectAll') { const trusses = state.show?.previewTrusses ?? []; state.selectFixtures((state.show?.fixtures ?? []).filter((f) => !f.inStorage).map((f) => f.id)); state.setSelectedLayoutTrussIds(trusses.map((t) => t.id)); state.setSelectedPreviewTrussId(trusses[0]?.id ?? null) }
      else if (command === 'deselectAll') { state.selectFixtures([]); state.setSelectedLayoutTrussIds([]); state.setSelectedPreviewTrussId(null); state.setSelectedStageObjectId(null) }
      else if (command === 'beamColor') window.dispatchEvent(new Event('openlights-open-beam-color'))
      else if (command === 'fixtureOptions') window.dispatchEvent(new Event('openlights-open-fixture-options'))
      // Ungroup (Guide p.64): no keyboard binding — the fixture menu
      // and the Layout menu dispatch it through this event (the Group
      // shortcut stays bound to Group).
      else if (command === 'ungroup') state.ungroupSelectedFixtures()
      else if (command.startsWith('align')) window.dispatchEvent(new CustomEvent('openlights-preview-align', { detail: ({ alignLeft: 'left', alignRight: 'right', alignTop: 'top', alignBottom: 'bottom', alignCenterX: 'center-x', alignCenterY: 'center-y' } as Record<string, string>)[command] }))
      else if (command === 'distributeX') window.dispatchEvent(new CustomEvent('openlights-preview-align', { detail: 'space-x' }))
      else if (command === 'distributeY') window.dispatchEvent(new CustomEvent('openlights-preview-align', { detail: 'space-y' }))
      else if (command === 'flipHorizontal' || command === 'flipVertical') { const id = state.selectedStageObjectId; if (id) state.flipStageObjects([id], command === 'flipHorizontal' ? 'x' : 'y') }
      else if (command.startsWith('order')) { const id = state.selectedStageObjectId; if (id) state.orderStageObjects([id], ({ orderFront: 'front', orderForward: 'forward', orderBackward: 'backward', orderBack: 'back' } as Record<string, 'front' | 'forward' | 'backward' | 'back'>)[command]) }
    }
    window.addEventListener('openlights-menu-command', onMenuCommand)
    return () => window.removeEventListener('openlights-menu-command', onMenuCommand)
  }, [])

  // A click on an override label row opens the fixture in Design —
  // and leaves the effect editor first (see goTab).
  useEffect(() => {
    const showDesign = () => { useShowStore.getState().exitEffectEditor(); setTab('Design') }
    window.addEventListener('openlights-show-design', showDesign)
    return () => window.removeEventListener('openlights-show-design', showDesign)
  }, [])

  // The effects panel's Design/Live tabs (Jake's screenshots): Live
  // switches the lower panel away from Design, like the ViewSwitch.
  useEffect(() => {
    const showLive = () => { useShowStore.getState().exitEffectEditor(); setTab('Live') }
    window.addEventListener('openlights-show-live', showLive)
    return () => window.removeEventListener('openlights-show-live', showLive)
  }, [])

  // A button's External Control > Add Trigger… (Jake, 27 Nov 2026):
  // open Settings on the External Control tab with MIDI learn armed
  // for that button, so the next MIDI note/CC the operator moves
  // becomes the button's trigger.
  useEffect(() => {
    const learn = (event: Event) => {
      const detail = (event as CustomEvent).detail as { targetId: string; label: string } | undefined
      if (!detail?.targetId) return
      setMidiLearnTarget({ targetType: 'live-cue', targetId: detail.targetId, label: detail.label ?? 'Live button' })
      setSettingsTab('external')
      setSettingsOpen(true)
    }
    window.addEventListener('openlights-learn-midi', learn)
    return () => window.removeEventListener('openlights-learn-midi', learn)
  }, [])

  // LightKey Preset Palette shortcuts (Jake's 18 Nov screenshots) live in
  // lib/shortcuts.ts with the panel builder. buildShortcutsList returns
  // one contextual list per state — see that file for why the Live-edit
  // rows are never concatenated with the palette rows.
  const shortcuts = buildShortcutsList({ tab, liveEditing, editingPreset: Boolean(editingPresetId), editingEffect: Boolean(editingEffectId), liveAlignmentOff })
  const closeToolPanel = () => setToolPanel(null)
  // The view-options menu's panel toggles (Jake, 22 Nov 2026): Preview,
  // Preset Palette and Shortcuts. The merge keeps every layout key, so
  // toggling one panel can never drop another — updateProject replaces
  // the whole layout object. (The old Inspector toggle wrote a flag
  // nothing read: the Inspector is the side panel in Preview-edit mode,
  // so its visibility already follows the Preset Palette column.)
  const setLayoutPanel = (panel: 'preview' | 'palette' | 'shortcuts', value: boolean) => {
    const state = useShowStore.getState()
    state.updateProject({ layout: { preview: true, palette: true, inspector: true, shortcuts: true, ...state.show?.layout, [panel]: value } })
  }
  // The Design workspace (Preview + side panel + bottom panel) renders
  // either under the header in the normal flow, or inside the setup wizard
  // modal for its preview / groups / directions steps — one JSX tree, used
  // in exactly one place at a time.
  const designWorkspace = (<>
      {/* Main row */}
      <div className="main-grid" style={{ display: show?.layout?.preview === false && show?.layout?.palette === false ? 'none' : undefined, gridTemplateColumns: show?.layout?.preview === false || show?.layout?.palette === false ? '1fr' : `minmax(0, 1fr) 6px ${panelSizes.paletteWidth}px` }}>
        {show?.layout?.preview !== false && <div className="preview-stack relative"><StagePreview designMode={tab === 'Design'} />{editingEffectId && tab === 'Design' && <div ref={setMovementChartHost} className="pointer-events-none absolute inset-0 z-30" data-testid="movement-chart-host" />}{blind && <div role="status" className="absolute left-3 top-3 z-40 rounded bg-amber-400 px-2 py-1 text-xs font-bold text-black">BLIND · preview only</div>}{freeze && <div role="status" className="absolute right-3 top-3 z-40 rounded bg-sky-400 px-2 py-1 text-xs font-bold text-black">FROZEN · output held</div>}{previewEditing && <FixtureStorageTray />}</div>}

        {/* Draggable divider (Jake, 27 Nov 2026): Preview | Preset
            Palette. Dragging left widens the palette, dragging right
            narrows it; hidden when either panel is hidden. */}
        {show?.layout?.preview !== false && show?.layout?.palette !== false && <PanelDivider orientation="vertical" label="Resize preset palette" onDrag={(dx) => resizePanelBy('paletteWidth', -dx)} />}

        {/* In Preview edit mode the side panel becomes the Preview
            Inspector (LightKey Guide p.53: "On the right of the window is
            the Inspector where you can change the properties of the
            selected objects") — the shape tools, layout tools and the
            selected truss/fixture properties move out of the canvas
            overlays and in here, so the canvas stays clean. Otherwise
            it is the Preset Palette as before. The Inspector follows
            Preview edit mode in EITHER tab, not Design only (Jake,
            24 Nov 2026): since the 20 Nov split the header Edit button
            toggles Preview editing in the Live tab too, and
            previewEditing deliberately survives leaving Design — so
            gating the Inspector to Design stranded Live-tab edit mode
            with an editable, selectable Preview but no way to edit the
            selection's properties. In Live edit mode the palette is
            replaced by the Inspector exactly as in Design; press Done
            to get the palette back for dragging onto Live pages. */}
        <div className="panel side-panel overflow-hidden p-2 min-h-0 flex flex-col gap-1" aria-label={previewEditing ? 'Preview inspector' : 'Preset palette sidebar'} onContextMenu={previewEditing ? undefined : (event) => {
          if ((event.target as Element).closest('[data-palette-row], [role="menu"]')) return
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('openlights-preset-palette-context', { detail: { x: event.clientX, y: event.clientY } }))
        }} style={{ display: show?.layout?.palette === false ? 'none' : undefined }}>
          {previewEditing ? <PreviewEditPanel /> : (<>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-dim">
                Preset Palette
              </div>
            </div>
            <GroupsPresetsPanel />
          </>)}
        </div>
      </div>

      {/* Draggable divider (Jake, 27 Nov 2026): main row over the
          Live/Design bottom panel. Dragging up grows the bottom panel,
          dragging down shrinks it. */}
      <PanelDivider orientation="horizontal" label="Resize Live and Design panel" onDrag={(dy) => resizePanelBy('bottomHeight', -dy)} />

      {/* Bottom row — the Design / Live switch lives here, built into the
          bottom panel (Jake, 18 Nov 2026, screenshots 9.17.29): a pinned row
          at the top of the bottom panel, centred on the panel's own width
          with flex justify-center. The panel is the bottom-grid's first
          column, so its width excludes the right sidebar (Preset Palette /
          Shortcuts) — that is what keeps the pill centred, where the old
          divider-straddling pill drifted off-centre and the header pill was
          in the wrong place entirely. The row is flex-none, so it never
          scrolls away with the Live canvas below it, and the switch works
          identically in Design, Live and Live Edit. */}
      <div className="bottom-grid" style={{ gridTemplateColumns: show?.layout?.shortcuts === false ? '1fr' : `minmax(0, 1fr) 6px ${panelSizes.shortcutsWidth}px`, height: panelSizes.bottomHeight }}>
        <div className="panel bottom-panel-shell">
          {/* Master fader column (LightKey, Jake 18 Nov 2026, screenshots
              10.12.28 / 10.17.25): rendered here, as a child of the bottom
              panel itself — NOT inside the scrolling Live workspace — so it
              sits on top of the panel's left edge (see
              .bottom-panel-shell > .live-master-column in index.css) and
              canvas content scrolls underneath it, while the column itself
              never moves or scrolls. Only in Live; Design keeps
              BottomPlayback with its own playback master. */}
          {tab === 'Live' && <MasterFader master={master} setMaster={setMaster} bpm={bpm} onTap={tapTempo} />}
          <div className="bottom-panel-switch">
            {editingEffectId && tab === 'Design' && <div ref={setEffectTabHost} className="bottom-panel-effect-tab" />}
            {effectChooserAttribute && tab === 'Design' && <div ref={setChooserLeftHost} className="bottom-panel-chooser-left" />}
            <ViewSwitch view={tab} onView={(view) => { if (view !== 'Edit') goTab(view) }} panelOverlayOpen={Boolean(editingEffectId || effectChooserAttribute) && tab === 'Design'} />
            {editingEffectId && tab === 'Design' && <div ref={setEffectToolsHost} className="bottom-panel-tools bottom-panel-effect-tools" />}
            {effectChooserAttribute && tab === 'Design' && <div ref={setChooserSearchHost} className="bottom-panel-tools" />}
            {tab === 'Live' && <div ref={setLiveToolbarHost} className="bottom-panel-tools" />}
          </div>
          <div className={`bottom-panel-body ${tab === 'Live' ? 'live-page-shell flex flex-col' : 'playback-shell'}`}>
            {tab === 'Live' ? <>
              {/* Canvas floor (Jake, 27 Nov 2026): the fixed cue-list
                  transport used to squeeze this wrapper to 2px and hide
                  every Live button. The bar is gone — the cuelist lives
                  only as a placed widget on the canvas, LightKey's way —
                  but the 200px floor stays as a guard in the 294px
                  bottom panel, so the canvas can never collapse again. */}
              <div className="min-h-[200px] flex-1">
              <LiveWorkspace masterOverlay toolbarHost={liveToolbarHost} inspectorWidth={panelSizes.inspectorWidth} onInspectorWidthChange={(width) => setPanelSize('inspectorWidth', width)} />
              </div>
            </> : <BottomPlayback effectTabHost={effectTabHost} effectToolsHost={effectToolsHost} chooserLeftHost={chooserLeftHost} chooserSearchHost={chooserSearchHost} movementChartHost={movementChartHost} />}
          </div>
        </div>

        {/* Draggable divider (Jake, 27 Nov 2026): bottom panel |
            Shortcuts. Dragging left widens Shortcuts, dragging right
            narrows it; hidden when Shortcuts is hidden. */}
        {show?.layout?.shortcuts !== false && <PanelDivider orientation="vertical" label="Resize shortcuts panel" onDrag={(dx) => resizePanelBy('shortcutsWidth', -dx)} />}

        <div className="panel overflow-hidden p-2 min-h-0 flex flex-col" style={show?.layout?.shortcuts === false ? { display: 'none' } : undefined}>
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
            Shortcuts · {tab}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {shortcuts.map((s) => (
              <div
                key={`${s.section}:${s.key}:${s.label}`}
                className="flex items-center justify-between gap-2 px-1 py-1 text-xs border-b border-line/40 last:border-0"
              >
                <kbd className="rounded bg-panel2 border border-line px-1.5 py-0.5 text-zinc-300 shrink-0">
                  {s.key}
                </kbd>
                <span className="text-dim truncate text-right">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
  </>)

  // "Show in Preview" from the patch grid (LightKey Guide p.35): select the
  // fixture and, on the wizard's patching step, advance to Build Your
  // Preview; anywhere else it just closes the Patch tool panel.
  const patchShowInPreview = (fixtureId: string) => {
    useShowStore.getState().selectFixtures([fixtureId])
    goTab('Design')
    if (setupWizardStep === 'patch') useShowStore.getState().setSetupWizardStep('preview')
    else closeToolPanel()
  }

  if (isLiveWindow()) return <div className="app overflow-auto p-3"><LiveTab inspectorWidth={panelSizes.inspectorWidth} onInspectorWidthChange={(width) => setPanelSize('inspectorWidth', width)} /></div>
  return (
    <div className={`app${welcomeOpen ? ' welcome-open' : ''}`}>
      {setupWizardStep ? (
        // Setup wizard modal (19 Nov 2026, Jake's screenshots): the wizard
        // used to be a bar above the header with the step bodies below it,
        // so the app header split the tutorial in two — and on the patch
        // step the Patch tool panel's `-webkit-app-region: drag` header sat
        // over the top of the window and swallowed clicks on Back / Next
        // even though the bar painted above it. The wizard is now one
        // full-window modal over the entire GUI (solid `bg-bg` — opacity-
        // modified theme backgrounds generate no rule, see the Project
        // Browser fix — z-[70] like the WelcomeScreen) with the step bar
        // and the current step's body inside it. Back / Next only, no Skip
        // (LightKey, Guide ch.4); × exits to Design as-is.
        //
        // The scrim background is a plain `var(--bg)` inline style, not
        // the Tailwind `bg-bg` utility (20 Nov 2026, Jake's screenshot
        // image-24.png: the Project Browser showed the GUI ghosted behind
        // it after a drag, although the utility compiles opaque — the
        // colour-mix utility is one silent failure away from translucent,
        // and a full-screen scrim must not depend on it). The modal stays
        // opaque with `select-none` so a drag on it can neither select
        // text nor move the window — but it must NOT be a hard event
        // boundary: the PatchPanel's drag-to-patch and footer buttons
        // live inside this modal, and the 335e34b hardening (`onDragStart`
        // preventDefault + `onPointerDown` stopPropagation on this root)
        // cancelled every drag starting in the wizard and was reported as
        // dead Duplicate / + Custom buttons too (Jake, 20 Nov 2026,
        // image-ecf244b1.png). That hardening lives on the WelcomeScreen
        // only, which has no draggable children.
        //
        // 25 Nov 2026: the no-drag (`.modal-scrim`) lives on the step
        // body below the bar, NOT on this root — a drag region is
        // honoured only where no `no-drag` rect covers it, so a
        // full-window no-drag root subtracted the bar's drag region away
        // entirely and the wizard could never be dragged (Jake, 25 Nov
        // 2026: the opening window could not be dragged on Windows).
        // The bar (`wizard-drag-bar` in SetupWizard) is the drag region,
        // like the in-app header, and the body below it stays no-drag.
        <div className="fixed inset-0 z-[70] flex select-none flex-col" role="dialog" aria-modal="true" aria-label="Setup wizard" style={{ backgroundColor: 'var(--bg)' }}>
          <SetupWizard isMac={isMac} />
          <div className="modal-scrim flex min-h-0 flex-1 flex-col overflow-hidden">
            {setupWizardStep === 'dmx' ? <div className="min-h-0 flex-1 overflow-y-auto"><WizardDmxStep /></div>
            : setupWizardStep === 'done' ? <div className="min-h-0 flex-1 overflow-y-auto"><WizardDoneStep /></div>
            : setupWizardStep === 'patch' ? <div className="min-h-0 flex-1 overflow-hidden p-4"><PatchPanel onShowInPreview={patchShowInPreview} /></div>
            : designWorkspace}
          </div>
        </div>
      ) : (<>
      {/* Top bar */}
      <header className={`top-bar ${isMac ? 'top-bar-mac' : ''}`}>
        <div className="flex items-center gap-2">
          <ProjectBar />
          <ProjectSearch onReveal={(result) => {
            const state = useShowStore.getState()
            // Cues are not in the palette (LightKey has no scene
            // concept, Guide ch.9); Project Search is one of the ways to
            // pick one — it jumps straight to Design on that cue.
            // 'cue' results also cover cuelist steps (listId) and Live
            // buttons (pageId); only a bare cue result is a stored cue.
            if (result.type === 'cue' && !result.listId && !result.pageId) { state.activateCue(result.id); setTab('Design') }
            else if (result.type === 'fixture' || result.type === 'group') { state.selectFixtures(result.type === 'fixture' ? [result.id] : (state.show?.fixtures ?? []).filter((f) => f.group === result.id).map((f) => f.id)); setTab('Design') }
            else if (result.type === 'page' || result.pageId) { state.selectLivePage(result.pageId ?? result.id); setTab('Live') }
            else if (result.listId || result.type === 'cueList') { state.setActiveCueList(result.listId ?? result.id); setTab('Live') }
            requestAnimationFrame(() => {
              const target = document.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(result.id)}"]`)
              if (!target) return
              let parent = target.parentElement
              while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement }
              target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.tabIndex = -1; target.focus({ preventScroll: true })
            })
          }} />
          {/* Header Edit toggles Preview editing only (LightKey Guide p.53,
              "Edit the Preview": click Edit in the toolbar to enter edit
              mode, click Done to exit). Live page editing has its own Edit
              button in the Live panel (Guide ch.11) — this button never
              touches it (Jake, 20 Nov 2026). It takes over the old "Edit
              layout" button that hovered on the Preview — the Preview
              toolbar no longer carries its own edit toggle. Undo/Redo used
              to live in a dropdown on this button; they stay available from
              the native app menu (Edit > Undo/Redo) and Ctrl+Z / Ctrl+Y.
              The toggle is disabled only while the project is locked. */}
          <button
            type="button"
            className={`btn-theme header-edit-button ${previewEditing ? 'on' : ''}`}
            aria-pressed={previewEditing}
            aria-label="Edit preview"
            title="Edit preview (LightKey Guide p.53)"
            disabled={locked}
            onClick={togglePreviewEditing}
          >{previewEditing ? 'Done' : 'Edit'}</button>
          <button
            type="button"
            className="lightkey-action header-patch-button"
            aria-label="Patch fixtures"
            title="Patch fixtures"
            onClick={() => setToolPanel('Patch')}
          >
            <svg viewBox="0 0 28 18" aria-hidden="true"><circle cx="4" cy="5" r="2" /><circle cx="14" cy="9" r="2" /><circle cx="24" cy="14" r="2" /><path d="M6 5.8 12 8m4 2 6 3" /></svg>
          </button>
          {/* Headless DMX auto-connect (Jake, 21 Nov 2026): the DMX
              button lives in the settings menu — LightKey's GUI has no
              DMX button in its header — but the remembered interface
              must still reconnect at startup, so this renders nothing
              and just runs the mount-time scan and restore. */}
          <DmxAutoConnect />
          <div ref={settingsMenuRef} className="relative">
            <button
              type="button"
              className={`lightkey-action ${viewMenuOpen ? 'on' : ''}`}
              aria-label="View options"
              title="View options"
              aria-expanded={viewMenuOpen}
              onClick={() => setViewMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M15 9v11"/></svg>
            </button>
            {viewMenuOpen && (
              <div data-header-settings-menu className="absolute right-0 top-full z-50 mt-1 flex w-56 flex-col rounded-lg border border-line bg-panel p-1 shadow-xl">
                {/* View options (LightKey, Jake 22 Nov 2026): the far-right
                    header button shows/hides Preview, Preset Palette and
                    Shortcuts — each label flips to Hide or Show with the
                    panel's state. Nothing else lives here (Jake, 23 Nov
                    2026): DMX and MIDI settings are in the Settings dialog
                    (Cmd+,), Blackout is in the Live menu and on B, Full
                    screen is in the Window menu and on F11, Open Live
                    window is in the Window menu, Automation… is in the
                    View menu. */}
                {(['preview', 'palette', 'shortcuts'] as const).map((panel) => {
                  const visible = show?.layout?.[panel] ?? true
                  const label = panel === 'preview' ? 'Preview' : panel === 'palette' ? 'Preset Palette' : 'Shortcuts'
                  return <button key={panel} type="button" className="rounded px-3 py-2 text-left text-xs text-text hover:bg-panel2" onClick={() => { setLayoutPanel(panel, !visible); setViewMenuOpen(false) }}>{visible ? `Hide ${label}` : `Show ${label}`}</button>
                })}
              </div>
            )}
          </div>
        </div>

        <div className="header-look-field">
          {editingPreset && (
            <span role="status" className="mr-3 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black">
              <span aria-hidden="true">✎</span>
              <span className="max-w-40 truncate">{editingPreset.name}</span>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={saveEditingPreset}>Save</button>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={cancelEditingPreset}>Cancel</button>
            </span>
          )}
          {editingEffectTemplate && (
            <span role="status" className="mr-3 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black">
              <span aria-hidden="true">✎</span>
              <span className="max-w-40 truncate">{editingEffectTemplate.name}</span>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={updateEffectTemplate}>Update</button>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={cancelEditingEffectTemplate}>Cancel</button>
            </span>
          )}
          {editingLiveEffect && (
            <span role="status" className="mr-3 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black">
              <span aria-hidden="true">✎</span>
              <span className="max-w-40 truncate">{editingLiveEffect.name}</span>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={saveEditingLiveEffect}>Update</button>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={cancelEditingLiveEffect}>Cancel</button>
            </span>
          )}
          {editingCueAdHoc && (
            <span role="status" className="mr-3 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-black">
              <span aria-hidden="true">✎</span>
              <span className="max-w-40 truncate">Ad hoc · {editingCueAdHoc.name}</span>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={saveEditingCueAdHoc}>Save</button>
              <button type="button" className="rounded-full bg-black/15 px-2 py-0.5 hover:bg-black/25" onClick={cancelEditingCueAdHoc}>Cancel</button>
            </span>
          )}
          <OverridesField />
        </div>

        <WorkspaceToolbar view={tab} onView={goTab} onBlackout={handleBlackout} />
      </header>

      {designWorkspace}
      </>)}
      <ContextMenu liveTabActive={tab === 'Live'} />
      {toolPanel && !setupWizardStep && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 ${toolPanel === 'Patch' ? 'p-0' : 'p-4'}`}
          role="presentation"
          onMouseDown={(event) => {
            // During the wizard's patching step the wizard bar is the
            // navigation — the backdrop must not dismiss the panel.
            if (event.target === event.currentTarget && setupWizardStep !== 'patch') closeToolPanel()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={toolPanel}
            className={`panel flex w-full flex-col overflow-hidden shadow-2xl ${toolPanel === 'Patch' ? 'h-full max-w-none rounded-none' : 'max-h-[92vh] max-w-6xl'}`}
          >
            <header className={`flex items-center gap-3 border-b border-line px-4 py-3 ${toolPanel === 'Patch' ? `patch-dialog-header ${isMac ? 'patch-dialog-header-mac' : ''}` : ''}`}>
              {toolPanel === 'Patch' && setupWizardStep !== 'patch' && <button type="button" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black" onClick={closeToolPanel}>Done</button>}
              <h2 className="flex-1 text-xs font-semibold uppercase tracking-wider text-dim">{toolPanel === 'Patch' ? show?.name ?? 'Fixture Patch' : toolPanel}</h2>
              {toolPanel !== 'Patch' && <button type="button" className="btn-theme text-xs" onClick={closeToolPanel}>Close</button>}
            </header>
            <div className={`min-h-0 flex-1 ${toolPanel === 'Patch' ? 'overflow-hidden p-4' : 'overflow-auto p-4'}`}>
              {toolPanel === 'Patch' && <PatchPanel onShowInPreview={patchShowInPreview} />}
              {toolPanel === 'Automation' && <AutomationPanel />}
              {toolPanel === 'MIDI' && <MidiPanel />}
              {toolPanel === 'NDI Ambience' && <NdiAmbiencePanel />}
            </div>
          </section>
        </div>
      )}
      {settingsOpen && !setupWizardStep && <SettingsDialog initialTab={settingsTab} onTabChange={setSettingsTab} initialLearnTarget={midiLearnTarget} onClose={() => { setSettingsOpen(false); setMidiLearnTarget(null) }} adaptiveBackground={adaptiveBackground} onAdaptiveBackgroundChange={setAdaptiveBackground} onTapTempo={tapTempo} />}
      {welcomeOpen && <WelcomeScreen />}
      {newProjectDialogOpen && <NewProjectDialog template={newProjectTemplate} onSave={createProject} onClose={() => { const state = useShowStore.getState(); state.setNewProjectDialogOpen(false); state.setNewProjectTemplate(null) }} />}
    </div>
  )
}
