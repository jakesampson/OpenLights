import { useEffect, useMemo, useRef, useState } from 'react'
import { useShowStore } from './stores/showStore'
import { AutomationPanel } from './components/AutomationPanel'
import { MidiPanel } from './components/MidiPanel'
import { PatchPanel } from './components/PatchPanel'
import { ProjectBar } from './components/ProjectBar'
import { isLiveWindow, startLiveWindowBridge } from './lib/liveWindowBridge'
import { WorkspaceToolbar } from './components/WorkspaceToolbar'
import { ProjectSearch } from './components/ProjectSearch'
import { SHORTCUTS, buildShortcutsList, matchShortcut } from './lib/shortcuts'
import { LiveTab } from './components/LiveTab'
import { LiveWorkspace } from './components/LiveWorkspace'
import { MasterFader } from './components/MasterFader'
import { StagePreview } from './components/StagePreview'
import { PreviewEditPanel } from './components/PreviewEditPanel'
import { previewSpacePan } from './lib/previewSpacePan'
import { GroupsPresetsPanel } from './components/GroupsPresetsPanel'
import { DmxConnection } from './components/DmxConnection'
import { ViewSwitch } from './components/ViewSwitch'
import { BottomPlayback } from './components/BottomPlayback'
import { configureSequences, configureEffects, configurePresetOutput, configureLiveOutput, configureOverrideOutput } from './lib/output'
import { computeCueChannels } from './lib/automationRuntime'
import { resolveCue, resolveCueValues, fanPresetFixtureValues } from '@shared/cueResolution'
import { effectiveIntensityLevels, withEffectiveIntensity } from './lib/effectiveIntensity'
import { startCuePlaybackClock } from './lib/cuePlaybackClock'
import { adaptiveBackgroundHue } from './lib/adaptiveBackground'
import { liveFadeMs, liveOutputLevels } from './lib/liveFrames'
import { activeCueSequenceIds } from './lib/liveDrops'
import { orderedLiveControls } from './lib/cuePriority'
import { activeOwnedEffects } from './lib/effectOwnership'
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
type ToolPanel = 'Patch' | 'Automation' | 'MIDI'

export default function App() {
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent)
  const {
    show,
    cues,
    effects,
    presets,
    activePresetIds,
    activeSequenceIds,
    activeLiveValues,
    liveActivationOrder,
    activeLivePageId,
    manualOverrides,
    bpm,
    activeCueId,
    master,
    setMaster,
    setBpm,
    blackout,
    blind,
    freeze,
    locked,
    liveEditing,
    previewEditing,
    setPreviewEditing,
    editingPresetId,
    saveEditingPreset,
    cancelEditingPreset,
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
  // without the wheel being touched. Sequences and Live controls are
  // deliberately not sources (see effectiveIntensity.ts).
  const effectiveLevels = useMemo(() => {
    const activeCue = cues.find((item) => item.id === activeCueId)
    return effectiveIntensityLevels({
      cueValues: activeCue ? resolveCueValues(activeCue, presets, show?.fixtures ?? []) : {},
      activePresetIds,
      presets,
      manualOverrides
    })
  }, [cues, activeCueId, presets, activePresetIds, manualOverrides, show?.fixtures])
  const [tab, setTab] = useState<Tab>('Design')
  const [liveToolbarHost, setLiveToolbarHost] = useState<HTMLDivElement | null>(null)
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
  // Back button). The main process restores the grey when the wizard
  // closes; on macOS this is a no-op (native traffic lights).
  useEffect(() => {
    window.electronAPI?.setTitleBarOverlay?.(Boolean(setupWizardStep))
  }, [setupWizardStep])
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
  const editingCueAdHoc = editingCueAdHocId ? cues.find((c) => c.id === editingCueAdHocId) : undefined
  // In-place cue ad-hoc editing opens in Design (Guide ch.11, p.201).
  useEffect(() => { if (editingCueAdHocId) setTab('Design') }, [editingCueAdHocId])
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
  // undoable); Cancel is explicit.
  const goTab = (view: Tab) => { if (view === 'Live' && editingPresetId) saveEditingPreset(); if (view === 'Live' && editingCueAdHocId) saveEditingCueAdHoc(); setTab(view) }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adaptiveBackground, setAdaptiveBackground] = useState(() => localStorage.getItem('openlights.adaptiveBackground') !== 'false')
  const [toolPanel, setToolPanel] = useState<ToolPanel | null>(null)
  const headerTaps = useRef<number[]>([])
  const settingsMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const closeHeaderMenus = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || !settingsMenuRef.current?.contains(target)) setSettingsOpen(false)
    }
    const closeHeaderMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSettingsOpen(false)
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
        const cue = state.cues.find((item) => item.id === state.activeCueId)
        const hue = adaptiveBackgroundHue(state.show?.fixtures ?? [], channels, cue ? resolveCue(cue, state.presets, state.show?.fixtures ?? []) : undefined)
        root.style.setProperty('--adaptive-hue', String(hue ?? 283))
      } catch { /* Keep the previous appearance if output is unavailable. */ }
      finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(refresh, 200)
    return () => { alive = false; window.clearInterval(timer); root.style.removeProperty('--adaptive-hue'); root.removeAttribute('data-adaptive') }
  }, [adaptiveBackground])

  useEffect(() => {
    configureEffects({
      effects: activeOwnedEffects(effects, { presets: activePresetIds, sequences: activeSequenceIds, cues: activeLiveValues }),
      fixtures: show?.fixtures ?? [],
      movementPaths: show?.movementPaths ?? [],
      bpm,
      master,
      blackout
    })
  }, [effects, activePresetIds, activeSequenceIds, activeLiveValues, show?.fixtures, bpm, master, blackout])

  useEffect(() => {
    // Sequences can be started globally or dropped onto a live cue; an active
    // cue's sequences run for as long as that cue is lit. A stored cue's
    // sequences (Piece 8) run the same way while it is the active cue —
    // in Design, or as the current step of a cuelist.
    const activeCue = cues.find((cue) => cue.id === activeCueId)
    const ids = new Set([...activeSequenceIds, ...activeCueSequenceIds(show?.livePages, activeLiveValues), ...(activeCue?.sequenceIds ?? [])])
    configureSequences([...ids].flatMap((id) => (show?.sequences ?? []).filter((s) => s.id === id)), presets)
  }, [show?.sequences, show?.livePages, activeSequenceIds, activeLiveValues, presets, cues, activeCueId])

  useEffect(() => {
    const patch: Record<number, number> = {}
    for (const id of activePresetIds) {
      const preset = presets.find((item) => item.id === id)
      if (!preset) continue
      // A preset's colour is the fixture's colour (Jake, 19 Nov
      // 2026): applying it live fans the bare colour out to every
      // beam, so a red preset lights all four cells of a 4Bar.
      Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { id: preset.id, name: preset.name, fadeMs: 0, fixtureValues: withEffectiveIntensity(fanPresetFixtureValues(preset.fixtureValues, show?.fixtures ?? []), effectiveLevels) }, master))
    }
    configurePresetOutput(patch)
  }, [presets, activePresetIds, show?.fixtures, master, effectiveLevels])

  useEffect(() => {
    const patch: Record<number, number> = {}
    const outputLevels = liveOutputLevels(show?.livePages, activeLiveValues)
    for (const control of orderedLiveControls(show?.livePages, outputLevels, liveActivationOrder)) {
      const level = outputLevels[control.id] ?? 0
      if (!level && !(control.type === 'fader' && control.id in outputLevels)) continue
      const scaledMaster = master * level / 255
      const cue = cues.find((item) => item.id === control.cueId)
      if (cue && !cue.blackout) {
        const resolved = resolveCue(cue, presets, show?.fixtures ?? [])
        Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { ...resolved, fixtureValues: withEffectiveIntensity(resolved.fixtureValues, effectiveLevels) }, scaledMaster))
      }
      for (const id of control.presetIds) {
        const preset = presets.find((item) => item.id === id)
        if (preset) Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { id, name: preset.name, fadeMs: 0, fixtureValues: withEffectiveIntensity(fanPresetFixtureValues(preset.fixtureValues, show?.fixtures ?? []), effectiveLevels) }, scaledMaster))
      }
      if (control.adHocValues) Object.assign(patch, computeCueChannels(show?.fixtures ?? [], { id: control.id, name: control.name, fadeMs: 0, fixtureValues: withEffectiveIntensity(control.adHocValues, effectiveLevels) }, scaledMaster))
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
      if (!control || control.type !== 'toggle') return false
      return (previousLevels[id] ?? 0) !== (outputLevels[id] ?? 0)
    })
    configureLiveOutput(patch, changed || liveChanged ? pageFade : 0)
  }, [show?.livePages, show?.fixtures, cues, presets, activeLiveValues, liveActivationOrder, activeLivePageId, master, effectiveLevels])

  useEffect(() => {
    configureOverrideOutput(computeCueChannels(show?.fixtures ?? [], { id: 'manual', name: 'Manual', fadeMs: 0, fixtureValues: withEffectiveIntensity(manualOverrides, effectiveLevels) }, master))
    // The base look is otherwise only recomputed when a cue activates,
    // so it would stay dark after a dimmer drag (Jake, 20 Nov 2026:
    // the dimmer drags but no light appears until the wheel is
    // clicked). This runs on every override change and re-sends the
    // base with the current effective intensities — a no-op under
    // blackout or with no show open.
    refreshBaseOutput()
  }, [manualOverrides, show?.fixtures, master, effectiveLevels, refreshBaseOutput])

  useEffect(() => isLiveWindow() ? undefined : startCuePlaybackClock(), [])
  useEffect(() => startLiveWindowBridge(), [])


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
      else if (command === 'design') { if (!state.locked) setTab('Design') }
      else if (command === 'live') setTab('Live')
      else if (command === 'editPreview') togglePreviewEditing()
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
      else if (command === 'next') state.cueNext()
      else if (command === 'previous') state.cuePrev()
      else if (command === 'go') { if (previewSpacePan.held) { /* Space+drag pan over the Preview (Guide p.53) — Go must not fire. */ } else if (toolPanel === 'Automation') window.dispatchEvent(new Event('openlights-toggle-play')); else state.cueNext() }
      else if (command === 'escape') { if (state.editingPresetId) state.cancelEditingPreset(); else if (state.editingCueAdHocId) state.cancelEditingCueAdHoc(); else if (toolPanel && !setupWizardStep) setToolPanel(null); else if (setupWizardStep) { /* The wizard is modal: Back / Next / × navigate, Escape does not dismiss it (and never stops a cue mid-setup). Nested dialogs keep their own Escape handling (PatchDialog, CalibrationDialog). */ } else if (settingsOpen) setSettingsOpen(false); else if (state.showOverrideLabels) state.setShowOverrideLabels(false); else state.stopCue() }
      else if (command.startsWith('cue')) { const cue = state.cues[Number(command.slice(3)) - 1]; if (cue) state.activateCue(cue.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolPanel, settingsOpen, cues, activateCue, cueNext, cuePrev, stopCue, toggleBlackout, tab, setupWizardStep])

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
      else if (command === 'editAdHocProperties') {
        const target = editAdHocTarget(state)
        if (target && 'cueId' in target) state.startEditingCueAdHoc(target.cueId)
        else if (target && 'popup' in target) window.dispatchEvent(new Event('openlights-open-live-properties'))
      }
    }
    window.addEventListener('openlights-menu-command', onMenuCommand)
    return () => window.removeEventListener('openlights-menu-command', onMenuCommand)
  }, [])

  // A click on an override label row opens the fixture in Design.
  useEffect(() => {
    const showDesign = () => setTab('Design')
    window.addEventListener('openlights-show-design', showDesign)
    return () => window.removeEventListener('openlights-show-design', showDesign)
  }, [])

  // LightKey Preset Palette shortcuts (Jake's 18 Nov screenshots) live in
  // lib/shortcuts.ts with the panel builder. buildShortcutsList returns
  // one contextual list per state — see that file for why the Live-edit
  // rows are never concatenated with the palette rows.
  const shortcuts = buildShortcutsList({ tab, liveEditing, editingPreset: Boolean(editingPresetId) })
  const closeToolPanel = () => setToolPanel(null)
  // The Design workspace (Preview + side panel + bottom panel) renders
  // either under the header in the normal flow, or inside the setup wizard
  // modal for its preview / groups / directions steps — one JSX tree, used
  // in exactly one place at a time.
  const designWorkspace = (<>
      {/* Main row */}
      <div className="main-grid" style={{ display: show?.layout?.preview === false && show?.layout?.palette === false ? 'none' : undefined, gridTemplateColumns: show?.layout?.preview === false || show?.layout?.palette === false ? '1fr' : undefined }}>
        {show?.layout?.preview !== false && <div className="preview-stack relative"><StagePreview designMode={tab === 'Design'} />{blind && <div role="status" className="absolute left-3 top-3 z-40 rounded bg-amber-400 px-2 py-1 text-xs font-bold text-black">BLIND · preview only</div>}{freeze && <div role="status" className="absolute right-3 top-3 z-40 rounded bg-sky-400 px-2 py-1 text-xs font-bold text-black">FROZEN · output held</div>}</div>}

        {/* In Design edit mode the side panel becomes the Preview
            Inspector (LightKey Guide p.53: "On the right of the window is
            the Inspector where you can change the properties of the
            selected objects") — the shape tools, layout tools and the
            selected truss/fixture properties move out of the canvas
            overlays and in here, so the canvas stays clean. Otherwise
            it is the Preset Palette as before. */}
        <div className="panel side-panel overflow-hidden p-2 min-h-0 flex flex-col gap-1" aria-label={tab === 'Design' && previewEditing ? 'Preview inspector' : 'Preset palette sidebar'} onContextMenu={tab === 'Design' && previewEditing ? undefined : (event) => {
          if ((event.target as Element).closest('[data-palette-row], [role="menu"]')) return
          event.preventDefault()
          window.dispatchEvent(new CustomEvent('openlights-preset-palette-context', { detail: { x: event.clientX, y: event.clientY } }))
        }} style={{ display: show?.layout?.palette === false ? 'none' : undefined }}>
          {tab === 'Design' && previewEditing ? <PreviewEditPanel /> : (<>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-dim">
                Preset Palette
              </div>
            </div>
            <GroupsPresetsPanel />
          </>)}
        </div>
      </div>

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
      <div className="bottom-grid">
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
            <ViewSwitch view={tab} onView={(view) => { if (view !== 'Edit') goTab(view) }} />
            {tab === 'Live' && <div ref={setLiveToolbarHost} className="bottom-panel-tools" />}
          </div>
          <div className={`bottom-panel-body ${tab === 'Live' ? 'live-page-shell' : 'playback-shell'}`}>
            {tab === 'Live' ? <LiveWorkspace masterOverlay toolbarHost={liveToolbarHost} /> : <BottomPlayback />}
          </div>
        </div>

        <div className="panel overflow-hidden p-2 min-h-0 flex flex-col">
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

  if (isLiveWindow()) return <div className="app overflow-auto p-3"><LiveTab /></div>
  return (
    <div className="app">
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
        // opaque and no-drag (`.modal-scrim`) with `select-none` so a drag
        // on it can neither select text nor move the window — but it must
        // NOT be a hard event boundary: the PatchPanel's drag-to-patch and
        // footer buttons live inside this modal, and the 335e34b hardening
        // (`onDragStart` preventDefault + `onPointerDown`
        // stopPropagation on this root) cancelled every drag starting in
        // the wizard and was reported as dead Duplicate / + Custom
        // buttons too (Jake, 20 Nov 2026, image-ecf244b1.png). That
        // hardening lives on the WelcomeScreen only, which has no
        // draggable children.
        <div className="modal-scrim fixed inset-0 z-[70] flex select-none flex-col" role="dialog" aria-modal="true" aria-label="Setup wizard" style={{ backgroundColor: 'var(--bg)' }}>
          <SetupWizard isMac={isMac} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
            className={`btn-theme ${previewEditing ? 'on' : ''}`}
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
          {/* DMX status button (Jake, 20 Nov 2026): this component owns
              the auto-connect — on mount it re-connects the remembered
              interface — so it must be mounted with the header, not
              inside the settings menu: nested there it only ran when
              the menu was opened, and a fresh launch never connected. */}
          <DmxConnection />
          <div ref={settingsMenuRef} className="relative">
            <button
              type="button"
              className={`lightkey-action ${settingsOpen ? 'on' : ''}`}
              aria-label="Layout and settings"
              title="Layout and settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M15 9v11"/></svg>
            </button>
            {settingsOpen && (
              <div data-header-settings-menu className="absolute right-0 top-full z-50 mt-1 flex w-56 flex-col rounded-lg border border-line bg-panel p-1 shadow-xl">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-xs text-text hover:bg-panel2">
                  <span>Adaptive background colour</span>
                  <input type="checkbox" checked={adaptiveBackground} onChange={(event) => setAdaptiveBackground(event.target.checked)} />
                </label>
                <label className="px-3 py-2 text-xs">On project open<select aria-label="Project startup state" value={show?.startup?.mode ?? 'none'} onChange={(event) => useShowStore.getState().setStartupMode(event.target.value as 'none' | 'restore')} className="mt-1 w-full rounded bg-panel2 p-1"><option value="none">No active looks</option><option value="restore">Restore saved looks</option></select></label>
                <label className="px-3 py-2 text-xs">Default fade (ms)<input aria-label="Default fade milliseconds" type="number" min="0" value={show?.preferences?.defaultFadeMs ?? 1000} onChange={(event) => useShowStore.getState().updatePreferences({ defaultFadeMs: Math.max(0, Number(event.target.value)) })} className="mt-1 w-full rounded bg-panel2 p-1" /></label>
                <label className="px-3 py-2 text-xs">Page fade (ms)<input aria-label="Page fade milliseconds" type="number" min="0" value={show?.preferences?.pageFadeMs ?? 500} onChange={(event) => useShowStore.getState().updatePreferences({ pageFadeMs: Math.max(0, Number(event.target.value)) })} className="mt-1 w-full rounded bg-panel2 p-1" /></label>
                <label className="px-3 py-2 text-xs">Appearance<select aria-label="Application appearance" value={show?.preferences?.theme ?? 'dark'} onChange={(event) => useShowStore.getState().updatePreferences({ theme: event.target.value as 'dark' | 'system' })} className="mt-1 w-full rounded bg-panel2 p-1"><option value="dark">Dark</option><option value="system">System</option></select></label>
                <label className="px-3 py-2 text-xs">Default USB DMX interface<select aria-label="Default USB DMX interface" value={show?.preferences?.dmxProtocol ?? 'open-dmx-usb'} onChange={(event) => useShowStore.getState().updatePreferences({ dmxProtocol: event.target.value as 'open-dmx-usb' | 'enttec-usb-pro' })} className="mt-1 w-full rounded bg-panel2 p-1"><option value="open-dmx-usb">Open DMX USB</option><option value="enttec-usb-pro">DMX USB Pro</option></select></label>
                <label className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span>Deactivate cues on page switch</span><input type="checkbox" checked={show?.deactivateOnPageSwitch === true} onChange={(event) => useShowStore.getState().setPageSwitchMode(event.target.checked)} /></label>
                <label className="px-3 py-2 text-xs">Tempo (BPM)<span className="mt-1 flex gap-1"><input aria-label="Tempo in BPM" type="number" min="30" max="240" value={bpm} onChange={(event) => useShowStore.getState().setBpm(Number(event.target.value))} className="min-w-0 flex-1 rounded bg-panel2 p-1" /><button type="button" className="btn-theme text-xs" onClick={() => { const result = calculateTapTempo(headerTaps.current, performance.now()); headerTaps.current = result.taps; if (result.bpm !== null) useShowStore.getState().setBpm(result.bpm) }}>Tap</button></span></label>
                <div className="my-1 border-t border-line" />
                <button className="btn-panic rounded px-3 py-2 text-xs" onClick={handleBlackout}>{blackout ? 'Restore output' : 'Blackout'}</button>
                <button className="btn-theme text-xs" onClick={() => void window.electronAPI.openLiveWindow(useShowStore.getState().activeLivePageId)}>Open Live window</button>
                <button className="btn-theme text-xs" onClick={() => void window.electronAPI.toggleFullscreen()}>Full screen · F11</button>
                {(['preview', 'palette', 'inspector'] as const).map((panel) => <label key={panel} className="flex items-center justify-between px-3 py-1 text-xs capitalize">{panel}<input type="checkbox" aria-label={`Show ${panel}`} checked={show?.layout?.[panel] ?? true} onChange={(event) => useShowStore.getState().updateProject({ layout: { preview: true, palette: true, inspector: true, ...show?.layout, [panel]: event.target.checked } })} /></label>)}
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-text hover:bg-panel2"
                  onClick={() => {
                    setToolPanel('Automation')
                    setSettingsOpen(false)
                  }}
                >
                  Automation
                </button>
                <button
                  type="button"
                  className="rounded px-3 py-2 text-left text-xs text-text hover:bg-panel2"
                  onClick={() => {
                    setToolPanel('MIDI')
                    setSettingsOpen(false)
                  }}
                >
                  MIDI
                </button>
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
      <ContextMenu />
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
            </div>
          </section>
        </div>
      )}
      {welcomeOpen && <WelcomeScreen />}
      {newProjectDialogOpen && <NewProjectDialog template={newProjectTemplate} onSave={createProject} onClose={() => { const state = useShowStore.getState(); state.setNewProjectDialogOpen(false); state.setNewProjectTemplate(null) }} />}
    </div>
  )
}
