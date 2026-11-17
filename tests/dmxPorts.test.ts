import { describe, expect, it } from 'vitest'
import type { DmxPortInfo } from '../src/shared/types'
import {
  formatDmxPortLabel,
  identifyDmxPort,
  isDmxPortInfoList,
  preferredDmxPortPath,
  serialProtocolForDmxPort
} from '../src/shared/dmxPorts'

const openDmxCandidate: DmxPortInfo = {
  path: 'COM3',
  manufacturer: 'FTDI',
  serialNumber: 'TEST1234',
  pnpId: 'FTDIBUS\\VID_0403+PID_6001+TEST1234\\0000',
  vendorId: '0403',
  productId: '6001'
}

describe('DMX USB device discovery', () => {
  it('rejects legacy path-only port results from an outdated main process', () => {
    expect(isDmxPortInfoList([openDmxCandidate])).toBe(true)
    expect(isDmxPortInfoList(['COM3'])).toBe(false)
  })

  it('identifies FTDI adapters and includes their USB identifiers in the label', () => {
    expect(identifyDmxPort(openDmxCandidate)).toBe('ftdi')
    expect(formatDmxPortLabel(openDmxCandidate)).toBe(
      'COM3 — FTDI USB serial · VID:PID 0403:6001 · S/N TEST1234'
    )
    expect(serialProtocolForDmxPort(openDmxCandidate)).toBe('open-dmx-usb')
  })

  it('prefers a unique ENTTEC device, then a unique FTDI candidate', () => {
    const enttec = { path: 'COM4', manufacturer: 'ENTTEC Open DMX USB' }
    expect(preferredDmxPortPath([openDmxCandidate, enttec], '')).toBe('COM4')
    expect(preferredDmxPortPath([openDmxCandidate], '')).toBe('COM3')
  })

  it('automatically selects the USB Pro protocol when its model is identified', () => {
    expect(
      serialProtocolForDmxPort({ path: 'COM4', manufacturer: 'ENTTEC DMX USB Pro' })
    ).toBe('enttec-usb-pro')
  })

  it('does not guess when multiple matching adapters are present', () => {
    const secondFtdi: DmxPortInfo = { ...openDmxCandidate, path: 'COM5', serialNumber: 'OTHER' }
    expect(preferredDmxPortPath([openDmxCandidate, secondFtdi], '')).toBe('')
    expect(preferredDmxPortPath([openDmxCandidate, secondFtdi], 'COM5')).toBe('COM5')
  })
})
