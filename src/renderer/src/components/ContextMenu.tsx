import { useEffect, useState } from 'react'
import { CONTEXT_MENUS } from '@shared/menuModel'
import { SHORTCUTS } from '../lib/shortcuts'

type ContextKind = keyof typeof CONTEXT_MENUS
export function ContextMenu() {
  const [menu, setMenu] = useState<{ kind: ContextKind; x: number; y: number } | null>(null)
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const element = event.target as Element | null
      const target = element?.closest<HTMLElement>('[data-context-menu]')
      const projectObject = element?.closest<HTMLElement>('[data-project-id]')
      const kind = (projectObject && projectObject.closest('[data-context-menu="page"]') ? 'cue' : target?.dataset.contextMenu) as ContextKind | undefined
      if (!kind || !(kind in CONTEXT_MENUS)) return
      event.preventDefault(); setMenu({ kind, x: event.clientX, y: event.clientY })
    }
    const close = () => setMenu(null)
    window.addEventListener('contextmenu', open); window.addEventListener('pointerdown', close)
    return () => { window.removeEventListener('contextmenu', open); window.removeEventListener('pointerdown', close) }
  }, [])
  if (!menu) return null
  return <div role="menu" aria-label={`${menu.kind} actions`} className="fixed z-[300] min-w-36 rounded border border-line bg-panel p-1 shadow-xl" style={{ left: menu.x, top: menu.y }}>
    {CONTEXT_MENUS[menu.kind].map((command) => { const binding = SHORTCUTS.find((item) => item.command === command)!; return <button key={command} role="menuitem" className="block w-full rounded px-3 py-2 text-left text-xs hover:bg-panel2" onClick={() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: binding.code, ctrlKey: binding.ctrl, shiftKey: binding.shift, altKey: binding.alt })); setMenu(null) }}>{binding.label}<span className="float-right ml-4 text-dim">{binding.key}</span></button> })}
  </div>
}
