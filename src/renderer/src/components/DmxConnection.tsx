import { useEffect, useRef, useState } from 'react'
import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from '@shared/types'
import { isDmxPortInfoList } from '@shared/dmxPorts'
import { getDmxStatusLabel } from '../lib/dmxStatusLabel'

const SETTINGS_KEY = 'openlights.usbDmxDefault'
interface UsbDefault { path: string; serialNumber?: string; vendorId?: string; productId?: string; protocol: SerialDmxProtocol }
/** The remembered USB interface (localStorage): the device + protocol the
 *  app reconnects at startup and the DMX Output tab's Enable uses. */
export function readUsbDmxDefault(): UsbDefault | null {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    return value && typeof value.path === 'string' && (value.protocol === 'open-dmx-usb' || value.protocol === 'enttec-usb-pro') ? value : null
  } catch { return null }
}
export function findSavedUsbDevice(ports: DmxPortInfo[], saved: UsbDefault): DmxPortInfo | undefined {
  if (saved.serialNumber) return ports.find((p) => p.serialNumber === saved.serialNumber && (!saved.vendorId || p.vendorId === saved.vendorId) && (!saved.productId || p.productId === saved.productId))
  return ports.find((p) => p.path === saved.path && (!saved.vendorId || p.vendorId === saved.vendorId) && (!saved.productId || p.productId === saved.productId))
}

/** Headless auto-connect (Jake, 21 Nov 2026): the DMX button belongs in
 *  the settings menu — LightKey's GUI has no DMX button in its header — but the remembered interface
 *  must still reconnect at startup, so this renders nothing
 *  and just runs the mount-time scan and restore. */
export function DmxAutoConnect() {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void (async () => {
      try {
        const result: unknown = await window.electronAPI.getDmxPorts()
        if (!isDmxPortInfoList(result)) return
        const saved = readUsbDmxDefault()
        if (!saved) return
        const device = findSavedUsbDevice(result, saved)
        if (!device) return
        const current = await window.electronAPI.getDmxStatus()
        if (!current.connected || current.port !== device.path || current.serialProtocol !== saved.protocol) {
          await window.electronAPI.setDmxPort(device.path, saved.protocol)
        }
      } catch { /* stays disconnected */ }
    })()
  }, [])
  return null
}

/** The DMX status button (Jake, 22 Nov 2026): it lives in the header
 *  view-options menu, not the header itself — LightKey's GUI has no DMX
 *  button in its header (Jake, 21 Nov 2026) — and opens Settings on the
 *  DMX Output tab, so the gear is the clickable entry point to Settings
 *  alongside Cmd/Ctrl+,. The connection UI itself lives in the Settings
 *  dialog's DMX Output tab (DmxOutputPanel). */
export function DmxConnection({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [status, setStatus] = useState<DmxStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const connected = status?.connected ?? false

  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try { const result = await window.electronAPI.getDmxStatus(); if (alive) setStatus(result) }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
    }
    void refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  return (
    <button type="button" onClick={onOpenSettings} className="btn-theme flex w-full items-center gap-2 px-3 text-xs" title={status?.connected ? `DMX output settings · ${status.frameCount.toLocaleString()} frames sent` : 'DMX output settings'} aria-haspopup="dialog">
      <span aria-hidden="true">⚙</span><span className="h-2 w-2 rounded-full" style={{ background: connected ? 'var(--accent)' : 'var(--dim)' }} /><span className="text-[10px] font-semibold">{getDmxStatusLabel(status, error)}</span> DMX
    </button>
  )
}
