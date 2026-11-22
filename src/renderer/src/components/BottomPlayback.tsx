import { DesignTab } from './DesignTab'

// Hosts for the effect editor's pill-bar pieces, portalled into the
// Design/Live row by App (Jake, 21 Nov 2026) — see EffectEditor: the
// type tab on the left of the switch, Fixture Order on the right.
// The chooser's hosts (swap pill far left, Search far right) are the
// same pattern (Jake, 22 Nov 2026).
export function BottomPlayback({ effectTabHost, effectToolsHost, chooserLeftHost, chooserSearchHost }: { effectTabHost?: HTMLElement | null; effectToolsHost?: HTMLElement | null; chooserLeftHost?: HTMLElement | null; chooserSearchHost?: HTMLElement | null } = {}) {
  return <section className="fixture-controls-bottom" aria-label="Fixture controls" data-testid="bottom-playback">
    <DesignTab effectTabHost={effectTabHost} effectToolsHost={effectToolsHost} chooserLeftHost={chooserLeftHost} chooserSearchHost={chooserSearchHost} />
  </section>
}
