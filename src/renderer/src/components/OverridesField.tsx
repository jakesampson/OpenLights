// LightKey's header Overrides field (Jake's LightKey screenshots,
// 20 Nov 2026): a toggle that always reads "Overrides" — not a
// dropdown — which shows the per-fixture override labels in the Preview
// when on; a paintbrush icon appears beside it only while overrides
// exist, with the tooltip "Clear overridden fixture properties", and
// clicking it clears all overrides. A small tag glyph at the field's
// left appears only while the labels are shown.
import { useShowStore } from '../stores/showStore'

function BrushIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 3.5 20.5 9.5 12 18H9v-3l5.5-11.5z" />
      <path d="M9 15 6.5 17.5a2.1 2.1 0 0 0 3 3L12 18" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 12.5v-8a1 1 0 0 1 1-1h8l9 9-9 9-9-9z" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  )
}

export function OverridesField() {
  const { manualOverrides, showOverrideLabels, toggleOverrideLabels, clearManualOverrides } = useShowStore()
  const hasOverrides = Object.keys(manualOverrides).length > 0
  return (
    <>
      <button
        type="button"
        className="overrides-toggle"
        aria-pressed={showOverrideLabels}
        aria-label="Overrides"
        title="Show overridden fixture properties"
        onClick={toggleOverrideLabels}
      >
        {showOverrideLabels && <TagIcon />}
        <span>Overrides</span>
      </button>
      {hasOverrides && (
        <button
          type="button"
          className="overrides-clear"
          aria-label="Clear overridden fixture properties"
          title="Clear overridden fixture properties"
          onClick={clearManualOverrides}
        >
          <BrushIcon />
        </button>
      )}
    </>
  )
}
