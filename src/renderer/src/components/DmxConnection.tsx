import { useCallback, useEffect, useState } from 'react'
import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from '@shared/types'
import { identifyDmxPort, isDmxPortInfoList } from '@shared/dmxPorts'
import { getDmxStatusLabel } from '../lib/dmxStatusLabel'

export function DmxConnection() {
  const [open, setOpen] = useState(false)
  const [port, setPort] = useState('')
  const [ports, setPorts] = useState<DmxPortInfo[]>([])
  const [protocol, setProtocol] = useState<SerialDmxProtocol | ''>('')
  const [status, setStatus] = useState<DmxStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const selected = ports.find((item) => item.path === port)
  const candidates = ports.filter((item) => identifyDmxPort(item) !== 'other')
  const visiblePorts = showAll ? ports : candidates
  const connected = status?.connected ?? false

  const scan = useCallback(async () => {
    setBusy(true)
    try {
      const result: unknown = await window.electronAPI.getDmxPorts()
      if (!isDmxPortInfoList(result)) throw new Error('Restart OpenLights to update the USB device scan.')
      setPorts(result)
      setPort((current) => result.some((item) => item.path === current) ? current : '')
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }, [])

  const refresh = useCallback(async () => {
    try { setStatus(await window.electronAPI.getDmxStatus()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => window.clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    if (!open) return
    void scan()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, scan])

  const connect = async () => {
    if (!port || !protocol) return
    setBusy(true)
    try {
      const result = await window.electronAPI.setDmxPort(port, protocol)
      if (result.status) setStatus(result.status)
      setError(result.success ? null : result.error ?? 'Could not open the USB interface.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const disconnect = async () => {
    setBusy(true)
    try {
      const result = await window.electronAPI.disconnectDmx()
      if (result.status) setStatus(result.status)
      setError(result.success ? null : result.error ?? 'Could not disconnect.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="btn-theme flex items-center gap-2 px-3 text-xs" title="DMX output settings" aria-haspopup="dialog">
      <span aria-hidden="true">⚙</span><span className="h-2 w-2 rounded-full" style={{ background: connected ? 'var(--accent)' : 'var(--dim)' }} />
      <span className="text-[10px] font-semibold">{getDmxStatusLabel(status, error)}</span> DMX
    </button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="dmx-title" className="panel flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden shadow-2xl">
        <header className="flex items-start justify-between border-b border-line px-6 py-4">
          <div><h2 id="dmx-title" className="text-lg font-semibold">DMX Output</h2><p className="mt-1 text-xs text-dim">Choose how OpenLights sends DMX to your fixtures.</p></div>
          <button type="button" className="btn-theme" onClick={() => setOpen(false)} aria-label="Close DMX output settings">✕</button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[170px_1fr] overflow-hidden">
          <nav className="border-r border-line bg-bg/30 p-3" aria-label="Output methods">
            <div className="rounded border border-line bg-panel2 px-3 py-2 text-sm font-medium" aria-current="page">USB DMX</div>
            <p className="px-3 pt-3 text-xs leading-relaxed text-dim">One USB interface · one DMX universe</p>
          </nav>
          <div className="overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">USB interfaces</h3><p className="mt-1 text-xs text-dim">Select an interface and choose its protocol.</p></div><button type="button" className="btn-theme whitespace-nowrap text-xs" onClick={() => void scan()} disabled={busy}>Find devices</button></div>
            <div className="mt-4 rounded border border-line bg-bg/30 p-3 text-xs" role="status">
              <span className="font-semibold">{connected ? 'Output connected' : 'No DMX output'}</span>
              <span className="ml-2 text-dim">{connected ? `${status?.port ?? ''} · ${status?.serialProtocol === 'open-dmx-usb' ? 'Open DMX USB' : 'DMX USB Pro'}` : 'Virtual mode is active.'}</span>
              {connected && <button type="button" onClick={() => void disconnect()} disabled={busy} className="btn-theme float-right text-xs">Disconnect</button>}
            </div>
            <div className="mt-4 flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-wide text-dim">Detected devices</h4><label className="flex items-center gap-2 text-xs text-dim"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all serial ports</label></div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded border border-line">
              {visiblePorts.length === 0 ? <p className="p-4 text-xs leading-relaxed text-dim">{busy ? 'Searching for devices…' : 'No recognised USB candidates found. Plug in your interface and choose Find devices. You can also show all serial ports.'}</p> : visiblePorts.map((item) => {
                const match = identifyDmxPort(item)
                return <button type="button" key={item.path} onClick={() => { setPort(item.path); setProtocol('') }} className={`flex w-full items-center justify-between gap-3 border-b border-line px-3 py-3 text-left last:border-0 ${port === item.path ? 'bg-panel2' : 'hover:bg-panel2/50'}`} aria-pressed={port === item.path}>
                  <span><span className="block text-sm font-medium">{item.manufacturer?.trim() || 'Serial device'}</span><span className="mt-1 block text-xs text-dim">{item.path} {item.serialNumber ? `· Serial ${item.serialNumber}` : ''} {item.vendorId && item.productId ? `· USB ${item.vendorId}:${item.productId}` : ''}</span></span>
                  <span className="text-right text-[10px] text-dim">{match === 'enttec' ? 'ENTTEC identified' : match === 'ftdi' ? 'FTDI candidate' : 'Unidentified'}</span>
                </button>
              })}
            </div>
            {selected && <div className="mt-4"><label htmlFor="usb-protocol" className="block text-xs font-semibold">Interface type</label><select id="usb-protocol" value={protocol} onChange={(e) => setProtocol(e.target.value as SerialDmxProtocol | '')} className="mt-2 w-full rounded border border-line bg-panel2 px-3 py-2 text-sm text-white"><option value="">Choose your interface type</option><option value="open-dmx-usb">Open DMX USB / unbuffered</option><option value="enttec-usb-pro">DMX USB Pro / compatible buffered</option></select><p className="mt-2 text-xs leading-relaxed text-dim">USB identifiers alone may not identify the DMX model. Check the label or documentation for the correct type.</p></div>}
            {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
            {status?.error && status.error !== error && <p role="alert" className="mt-3 text-xs text-red-300">{status.error}</p>}
          </div>
        </div>
        <footer className="flex items-center justify-between gap-4 border-t border-line px-6 py-4"><p className="text-xs text-dim">{connected ? 'A successful connection does not confirm fixture response.' : 'Select a device to enable USB output.'}</p><div className="flex gap-2"><button type="button" className="btn-theme text-xs" onClick={() => setOpen(false)}>Close</button><button type="button" className="btn-theme on text-xs disabled:cursor-not-allowed disabled:opacity-40" disabled={!port || !protocol || busy || connected} onClick={() => void connect()}>Connect</button></div></footer>
      </section>
    </div>}
  </>
}
