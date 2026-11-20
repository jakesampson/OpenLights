// Setup wizard chrome (Piece 5, Guide ch.4 pp.26–37; video 03:31–09:45).
// The bar of the full-window modal in App.tsx: step dots, the step title
// and description, the step's actions, and Back / Next. The modal owns the
// stacking (fixed inset-0, z-[70], solid bg-bg) — the bar no longer needs
// its own z-index, and the Patch panel renders inside the modal, so no
// overlay can sit over the bar and swallow clicks on Back / Next (the
// patch-step bug, 19 Nov 2026). There is no Skip button in LightKey —
// every guide step ends with "click Next" — so this bar has Back / Next
// only. Back from DMX Output returns to the Project Browser (the guide's
// Step 1); closing the wizard exits to the Design view with the project
// as-is and does not resume.

import { useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { WIZARD_STEPS, nextWizardStep, previousWizardStep, type WizardStep } from '../lib/setupWizard'
import { isCalibrationComplete } from '../lib/calibration'

export function SetupWizard({ isMac }: { isMac: boolean }) {
  const step = useShowStore((s) => s.setupWizardStep)
  const show = useShowStore((s) => s.show)
  const selectedFixtureIds = useShowStore((s) => s.selectedFixtureIds)
  const [learnMore, setLearnMore] = useState(false)
  if (!step) return null

  const current = WIZARD_STEPS.find((s) => s.id === step) ?? WIZARD_STEPS[0]
  const index = WIZARD_STEPS.findIndex((s) => s.id === step)
  const isLast = step === 'done'

  const back = () => {
    const state = useShowStore.getState()
    if (step === 'dmx') { state.exitSetupWizard(); state.setWelcomeOpen(true); return }
    const prev = previousWizardStep(step)
    if (prev) state.setSetupWizardStep(prev)
  }
  const next = () => {
    const state = useShowStore.getState()
    if (isLast) { state.finishSetupWizard(); return }
    const nextStep = nextWizardStep(step)
    if (nextStep) state.setSetupWizardStep(nextStep)
  }

  const fixtures = (show?.fixtures ?? []).filter((f) => !f.inStorage)
  const calibrated = step === 'directions' ? fixtures.filter((f) => isCalibrationComplete(f)).length : 0

  return (
    <div className="shrink-0 border-b border-line bg-panel shadow-lg">
      <div className={`flex items-center gap-3 px-4 py-2 ${isMac ? 'wizard-bar-mac' : 'wizard-bar-windows'}`}>
        <div className="flex items-center gap-1" aria-label={`Step ${index + 1} of ${WIZARD_STEPS.length}: ${current.title}`}>
          {WIZARD_STEPS.map((s, i) => (
            <span key={s.id} className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${i === index ? 'bg-accent text-black' : i < index ? 'bg-panel2 text-text' : 'bg-panel2 text-dim'}`} aria-current={i === index ? 'step' : undefined}>{i + 1}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{current.title}</div>
          <div className="truncate text-xs text-dim">{current.description}</div>
        </div>

        {step === 'groups' && (
          <div className="flex items-center gap-2">
            <button type="button" className="rounded bg-panel2 px-2 py-1 text-xs" onClick={() => useShowStore.getState().createGroupsForMe()} disabled={fixtures.length === 0}>Create Groups for Me</button>
            <button type="button" className="rounded bg-panel2 px-2 py-1 text-xs" onClick={() => useShowStore.getState().groupSelection()} disabled={selectedFixtureIds.length === 0}>Group</button>
          </div>
        )}
        {step === 'directions' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-dim">{fixtures.length === 0 ? 'No fixtures patched yet' : `${calibrated} of ${fixtures.length} calibrated`}</span>
            <button type="button" className="text-xs text-dim underline" onClick={() => setLearnMore(!learnMore)} aria-expanded={learnMore}>Learn more ›</button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button type="button" className="btn-theme text-xs" onClick={back}>Back</button>
          <button type="button" className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-black" onClick={next}>{isLast ? 'Go!' : 'Next'}</button>
          <button type="button" className="btn-theme" onClick={() => useShowStore.getState().exitSetupWizard()} aria-label="Close setup wizard" title="Close setup wizard">×</button>
        </div>
      </div>
      {step === 'directions' && learnMore && (
        <div className="border-t border-line px-4 py-2 text-xs text-dim">
          Home points the beam where the fixture sits; Rotation follows the beam as it pans (click inside the circle to reverse it); Limits cap the pan and tilt range; Perspective tells the Preview which way the fixture faces. Select a fixture — or several of the same type — and click Set… below its icon.
        </div>
      )}
    </div>
  )
}

export type { WizardStep }
