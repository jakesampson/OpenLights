import type { DmxPortInfo } from './types'

export type DmxPortMatch = 'enttec' | 'ftdi' | 'other'

export function identifyDmxPort(port: DmxPortInfo): DmxPortMatch {
  const descriptors = `${port.manufacturer ?? ''} ${port.pnpId ?? ''}`.toLowerCase()
  if (descriptors.includes('enttec') || descriptors.includes('open dmx')) return 'enttec'

  const vendorId = (port.vendorId ?? '').replace(/^0x/i, '').toLowerCase()
  if (
    vendorId === '0403' ||
    (port.manufacturer ?? '').toLowerCase().includes('ftdi') ||
    descriptors.includes('vid_0403')
  ) {
    return 'ftdi'
  }

  return 'other'
}

export function formatDmxPortLabel(port: DmxPortInfo): string {
  const match = identifyDmxPort(port)
  const deviceName =
    match === 'enttec'
      ? 'ENTTEC USB-DMX'
      : match === 'ftdi'
        ? 'FTDI USB serial'
        : port.manufacturer?.trim() || 'Serial device'
  const vendorId = port.vendorId?.replace(/^0x/i, '').toUpperCase()
  const productId = port.productId?.replace(/^0x/i, '').toUpperCase()
  const usbId = vendorId && productId ? `VID:PID ${vendorId}:${productId}` : ''
  const serial = port.serialNumber ? `S/N ${port.serialNumber}` : ''
  const details = [deviceName, usbId, serial].filter(Boolean).join(' · ')

  return `${port.path} — ${details}`
}

export function preferredDmxPortPath(ports: DmxPortInfo[], currentPath: string): string {
  if (ports.some((port) => port.path === currentPath)) return currentPath

  const enttecPorts = ports.filter((port) => identifyDmxPort(port) === 'enttec')
  if (enttecPorts.length === 1) return enttecPorts[0].path
  if (enttecPorts.length > 1) return ''

  const ftdiPorts = ports.filter((port) => identifyDmxPort(port) === 'ftdi')
  return ftdiPorts.length === 1 ? ftdiPorts[0].path : ''
}
