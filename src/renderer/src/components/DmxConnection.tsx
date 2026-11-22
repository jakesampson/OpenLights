import { useEffect, useRef } from 'react'
import type { DmxPortInfo, SerialDmxProtocol } from '@shared/types'
import { isDmxPortInfoList } from '@shared/dmxPorts'

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

/** Headless auto-connect (Jake, 21 Nov 2026): LightKey's GUI has no DMX
 *  button in its header, and the DMX settings live in the Settings
 *  dialog's DMX Output tab (Cmd+,) — so this renders nothing and just
 *  runs the mount-time scan and restore of the remembered interface. */
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
