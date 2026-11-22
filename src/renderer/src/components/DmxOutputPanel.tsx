import { useCallback, useEffect, useRef, useState } from 'react'
import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from '@shared/types'
import { formatDmxPortLabel, isDmxPortInfoList } from '@shared/dmxPorts'
import { DmxTestPanel } from './DmxTestPanel'
import { findSavedUsbDevice, readUsbDmxDefault } from './DmxConnection'

const SETTINGS_KEY = 'openlights.usbDmxDefault'

/** The USB connection controls from the old DMX Output dialog (Jake,
 *  22 Nov 2026): they now live in the Settings dialog's DMX Output tab,
 *  under the output-method list. The interface type is controlled by the
 *  tab — picking a method there picks the protocol here — while the
 *  device, the live status and the connect/disconnect work stay here.
 *  Selecting a device and a protocol connects immediately and remembers
 *  the pair, as before. */
export function DmxOutputPanel({ protocol, onProtocolChange, onStatusChange }: {
  protocol: SerialDmxProtocol | ''
  onProtocolChange: (protocol: SerialDmxProtocol | '') => void
  onStatusChange?: (status: DmxStatus | null) => void
}) {
  const [ports, setPorts] = useState<DmxPortInfo[]>([])
  const [port, setPort] = useState('')
  const [status, setStatus] = useState<DmxStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [savedMissing, setSavedMissing] = useState(false)
  const pending = useRef(false)
  const connected = status?.connected ?? false

  useEffect(() => { onStatusChange?.(status) }, [status, onStatusChange])

  const connect = useCallback(async (device: DmxPortInfo, type: SerialDmxProtocol) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const result = await window.electronAPI.setDmxPort(device.path, type)
      if (result.status) setStatus(result.status)
      if (result.success) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ path: device.path, serialNumber: device.serialNumber, vendorId: device.vendorId, productId: device.productId, protocol: type }))
        setSavedMissing(false)
        setError(null)
      } else setError(result.error ?? 'Could not open the USB interface.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { pending.current = false; setBusy(false) }
  }, [])

  const scan = useCallback(async (restore = false) => {
    setScanning(true)
    try {
      const result: unknown = await window.electronAPI.getDmxPorts()
      if (!isDmxPortInfoList(result)) throw new Error('Restart OpenLights to update the USB device scan.')
      setPorts(result)
      const saved = readUsbDmxDefault()
      if (saved && restore) {
        onProtocolChange(saved.protocol)
        const device = findSavedUsbDevice(result, saved)
        if (device) {
          setPort(device.path)
          setSavedMissing(false)
          const current = await window.electronAPI.getDmxStatus()
          if (!current.connected || current.port !== device.path || current.serialProtocol !== saved.protocol) await connect(device, saved.protocol)
          else setStatus(current)
        } else { setPort(''); setSavedMissing(true) }
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setScanning(false) }
  }, [connect, onProtocolChange])

  useEffect(() => { void scan(true) }, [scan])
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try { const result = await window.electronAPI.getDmxStatus(); if (alive && !pending.current) setStatus(result) }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
    }
    void refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  const changeDevice = (path: string) => {
    setPort(path)
    const device = ports.find((item) => item.path === path)
    if (device && protocol) void connect(device, protocol)
  }
  const changeProtocol = (type: SerialDmxProtocol | '') => {
    onProtocolChange(type)
    const device = ports.find((item) => item.path === port)
    if (device && type) void connect(device, type)
  }
  const disconnect = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const result = await window.electronAPI.disconnectDmx()
      if (result.status) setStatus(result.status)
      if (result.success) { localStorage.removeItem(SETTINGS_KEY); setPort(''); setSavedMissing(false); setError(null) }
      else setError(result.error ?? 'Could not disconnect.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { pending.current = false; setBusy(false) }
  }

  return <>
    <div className="flex items-center justify-between gap-3 rounded border border-line bg-bg/30 p-3 text-xs" role="status"><div><span className="font-semibold">{busy ? 'Connecting…' : connected ? 'Output connected' : 'No DMX output'}</span><span className="ml-2 text-dim">{connected ? `${status?.port ?? ''} · ${status?.serialProtocol === 'open-dmx-usb' ? 'Open DMX USB' : 'DMX USB Pro'}` : 'Virtual mode'}</span>{status && <span className="ml-2 block text-dim">{status.frameCount.toLocaleString()} frames{status.lastFrameAt ? ` · last frame ${Math.max(0, Date.now() - status.lastFrameAt)}ms ago` : ' · no frames sent yet'}</span>}</div>{connected && <button type="button" onClick={() => void disconnect()} disabled={busy} className="btn-theme text-xs">Disconnect</button>}</div>
    <div className="mt-5 flex items-center justify-between"><label htmlFor="dmx-device" className="text-xs font-semibold">USB device</label><button type="button" onClick={() => void scan(true)} disabled={busy || scanning} className="text-xs text-dim underline">{scanning ? 'Scanning…' : 'Rescan devices'}</button></div>
    <select id="dmx-device" value={port} disabled={busy || scanning} onChange={(e) => changeDevice(e.target.value)} className="mt-2 w-full rounded border border-line bg-panel2 px-3 py-2 text-sm text-white"><option value="" disabled>Select a USB device</option>{ports.map((item) => <option key={item.path} value={item.path}>{formatDmxPortLabel(item)}</option>)}</select>
    {savedMissing && <p className="mt-2 text-xs text-amber-300">Saved interface not found. Reconnect it and rescan, or select another device.</p>}
    {!savedMissing && !ports.length && !scanning && <p className="mt-2 text-xs text-dim">No serial devices found. Plug in the interface and rescan.</p>}
    <label htmlFor="usb-protocol" className="mt-5 block text-xs font-semibold">Interface type</label><select id="usb-protocol" value={protocol} disabled={busy || scanning} onChange={(e) => changeProtocol(e.target.value as SerialDmxProtocol | '')} className="mt-2 w-full rounded border border-line bg-panel2 px-3 py-2 text-sm text-white"><option value="" disabled>Choose your interface type</option><option value="open-dmx-usb">Open DMX USB / unbuffered</option><option value="enttec-usb-pro">DMX USB Pro / compatible buffered</option></select>
    <p className="mt-2 text-xs text-dim">OpenLights connects automatically when both are selected and remembers successful settings.</p>
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error} {port && protocol && <button type="button" className="underline" disabled={busy} onClick={() => { const device = ports.find((item) => item.path === port); if (device) void connect(device, protocol) }}>Try again</button>}</p>}{status?.error && status.error !== error && <p role="alert" className="mt-3 text-xs text-red-300">{status.error}</p>}
    <DmxTestPanel status={status} />
  </>
}
