// Setup wizard Step 1 — DMX Output (Piece 5, video 03:42 frame; Guide
// ch.4 p.27 "Choose an output method"). USB only: OpenLights outputs DMX
// over an Enttec USB Pro / Open DMX interface, single universe — there are
// no Art-Net / sACN / ESP Net tabs. The connection itself reuses the same
// Electron calls and saved-default key as DmxConnection
// (`openlights.usbDmxDefault`), so a choice made here is the choice the
// DMX settings remember.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from '@shared/types'
import { formatDmxPortLabel, isDmxPortInfoList } from '@shared/dmxPorts'

const SETTINGS_KEY = 'openlights.usbDmxDefault'
interface UsbDefault { path: string; serialNumber?: string; vendorId?: string; productId?: string; protocol: SerialDmxProtocol }
function readDefault(): UsbDefault | null {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    return value && typeof value.path === 'string' && (value.protocol === 'open-dmx-usb' || value.protocol === 'enttec-usb-pro') ? value : null
  } catch { return null }
}
function findSavedDevice(ports: DmxPortInfo[], saved: UsbDefault): DmxPortInfo | undefined {
  if (saved.serialNumber) return ports.find((p) => p.serialNumber === saved.serialNumber && (!saved.vendorId || p.vendorId === saved.vendorId) && (!saved.productId || p.productId === saved.productId))
  return ports.find((p) => p.path === saved.path && (!saved.vendorId || p.vendorId === saved.vendorId) && (!saved.productId || p.productId === saved.productId))
}

export function WizardDmxStep() {
  const [ports, setPorts] = useState<DmxPortInfo[]>([])
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState<SerialDmxProtocol | ''>('')
  const [status, setStatus] = useState<DmxStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [savedMissing, setSavedMissing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const pending = useRef(false)
  const connected = status?.connected ?? false

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
      const saved = readDefault()
      if (saved && restore) {
        setProtocol(saved.protocol)
        const device = findSavedDevice(result, saved)
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
  }, [connect])

  useEffect(() => { void scan(true) }, [scan])

  const chooseNoOutput = async () => {
    if (pending.current) return
    if (!connected) return
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

  const changeDevice = (path: string) => {
    setPort(path)
    const device = ports.find((item) => item.path === path)
    if (device && protocol) void connect(device, protocol)
  }
  const changeProtocol = (type: SerialDmxProtocol | '') => {
    setProtocol(type)
    const device = ports.find((item) => item.path === port)
    if (device && type) void connect(device, type)
  }

  return (
    <div className="mx-auto w-full max-w-[620px] px-6 py-8">
      <h2 className="text-lg font-semibold">DMX Output</h2>
      <p className="mt-1 text-sm text-dim">Choose how OpenLights outputs DMX. OpenLights outputs over USB only — there are no Art-Net or sACN tabs.</p>

      <div className="mt-6 rounded border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3 text-xs" role="status">
          <div>
            <span className="font-semibold">{busy ? 'Connecting…' : connected ? 'Output connected' : 'No DMX Output'}</span>
            <span className="ml-2 text-dim">{connected ? `${status?.port ?? ''} · ${status?.serialProtocol === 'open-dmx-usb' ? 'Open DMX USB' : 'DMX USB Pro'}` : 'Disables DMX output — set up without lights connected.'}</span>
          </div>
          {connected && <button type="button" onClick={() => void chooseNoOutput()} disabled={busy} className="btn-theme text-xs">Use No DMX Output</button>}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <label htmlFor="wizard-dmx-device" className="text-xs font-semibold">USB device</label>
          <button type="button" onClick={() => void scan(true)} disabled={busy || scanning} className="text-xs text-dim underline">{scanning ? 'Scanning…' : 'Find Devices'}</button>
        </div>
        <select id="wizard-dmx-device" value={port} disabled={busy || scanning} onChange={(e) => changeDevice(e.target.value)} className="mt-2 w-full rounded border border-line bg-panel2 px-3 py-2 text-sm text-white">
          <option value="" disabled>Select a USB device</option>
          {ports.map((item) => <option key={item.path} value={item.path}>{formatDmxPortLabel(item)}</option>)}
        </select>
        {savedMissing && <p className="mt-2 text-xs text-amber-300">Saved interface not found. Reconnect it and rescan, or select another device.</p>}
        {!savedMissing && !ports.length && !scanning && <p className="mt-2 text-xs text-dim">No USB interfaces were found. Plug in the interface and Find Devices.</p>}

        <label htmlFor="wizard-usb-protocol" className="mt-5 block text-xs font-semibold">Interface type</label>
        <select id="wizard-usb-protocol" value={protocol} disabled={busy || scanning} onChange={(e) => changeProtocol(e.target.value as SerialDmxProtocol | '')} className="mt-2 w-full rounded border border-line bg-panel2 px-3 py-2 text-sm text-white">
          <option value="" disabled>Choose your interface type</option>
          <option value="open-dmx-usb">Open DMX USB / unbuffered</option>
          <option value="enttec-usb-pro">DMX USB Pro / compatible buffered</option>
        </select>
        <p className="mt-2 text-xs text-dim">OpenLights connects automatically when both are selected and remembers successful settings.</p>
        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        {status?.error && status.error !== error && <p role="alert" className="mt-3 text-xs text-red-300">{status.error}</p>}

        <button type="button" className="mt-5 text-xs text-dim underline" onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp}>My USB interface does not appear ›</button>
        {showHelp && <div className="mt-2 rounded border border-line bg-bg/30 p-3 text-xs text-dim">
          <p>Check the interface is plugged in and its USB cable is firmly seated, then click Find Devices. Plug the interface in before starting OpenLights if it still does not appear. Enttec interfaces need the FTDI driver installed — see the interface manufacturer's instructions. Try another USB port, and make sure no other lighting software is holding the port open.</p>
        </div>}
      </div>
      <p className="mt-4 text-xs text-dim">You can change the DMX output later from the DMX button in the header.</p>
    </div>
  )
}
