// Setup wizard Step 6 — That's It (Piece 5, video 09:30 frame; Guide ch.4
// p.37 "You're done": "After completing these steps, Lightkey is ready to
// control your lights."). The end card, with a summary of what the wizard
// set up. Go! (in the wizard bar) applies the default home position with
// the lights on and opens the Design view.

import { useShowStore, collectInlineCues } from '../stores/showStore'
import { isCalibrationComplete } from '../lib/calibration'

export function WizardDoneStep() {
  const show = useShowStore((s) => s.show)
  const fixtures = (show?.fixtures ?? []).filter((f) => !f.inStorage)
  const groups = show?.fixtureGroups ?? []
  const calibrated = fixtures.filter((f) => isCalibrationComplete(f)).length

  return (
    <div className="mx-auto w-full max-w-[620px] px-6 py-12 text-center">
      <h2 className="text-2xl font-semibold">That&apos;s It</h2>
      <p className="mt-2 text-sm text-dim">Have fun creating magic lightshows with OpenLights.</p>
      <div className="mx-auto mt-8 max-w-[420px] rounded border border-line bg-panel p-4 text-left text-sm">
        <div className="flex justify-between py-1"><span className="text-dim">Fixtures patched</span><span className="font-semibold">{fixtures.length}</span></div>
        <div className="flex justify-between border-t border-line/40 py-1"><span className="text-dim">Fixture groups</span><span className="font-semibold">{groups.length}</span></div>
        <div className="flex justify-between border-t border-line/40 py-1"><span className="text-dim">Beam directions set</span><span className="font-semibold">{calibrated} of {fixtures.length}</span></div>
        <div className="flex justify-between border-t border-line/40 py-1"><span className="text-dim">Cues</span><span className="font-semibold">{collectInlineCues(show ?? null, show?.cueLists ?? []).length}</span></div>
      </div>
      <p className="mt-6 text-xs text-dim">Go! applies the default home position — lights on, pointing home — and opens the Design view. You can change anything later: the patch, the Preview, groups and beam directions are all editable from the Design view.</p>
    </div>
  )
}
