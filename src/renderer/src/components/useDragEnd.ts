import { useCallback, useEffect, useRef } from 'react'

// Window-level drag-end guard. Pointer capture alone does not deliver
// pointerup when the button is released outside the window, so a drag
// tracked only by a ref stays live and re-engages the first time the
// pointer hovers back over the control (Jake, 19 Nov 2026: a colour
// fader dragged down and released off the fader resumed dragging on
// hover-back). Arming this on drag start ends the drag on any window
// pointerup / pointercancel / blur. Callers also end the drag when a
// move arrives with no button held (event.buttons === 0) or when
// pointer capture is lost — that covers a release the window never saw.
export function useDragEnd() {
  const active = useRef(false)
  const end = useCallback(() => {
    if (!active.current) return
    active.current = false
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
  }, [])
  const begin = useCallback(() => {
    if (active.current) return
    active.current = true
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
  }, [end])
  useEffect(() => () => {
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
  }, [end])
  const isActive = useCallback(() => active.current, [])
  return { begin, end, isActive }
}
