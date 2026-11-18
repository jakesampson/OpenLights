import type { DmxStatus } from './types'

/** Legacy network configuration can be read but never starts a network output. */
export function usbOnlyStatus(status: DmxStatus): DmxStatus {
  if (status.mode !== 'artnet') return status
  console.warn('Legacy network output ignored; using virtual DMX output.')
  return { ...status, mode: 'virtual', connected: false, port: null, artnet: undefined, error: null }
}
