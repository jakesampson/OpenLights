import { describe, it, expect } from 'vitest'
import {
  DMXEngine,
  buildArtNetPacket,
  buildEnttecProFrame,
  buildOpenDmxFrame
} from '../src/shared/dmx'

describe('Art-Net packet', () => {
  it('builds an ArtDmx packet with protocol, universe and payload', () => {
    const data = new Uint8Array(512)
    data[0] = 255
    data[511] = 42
    const packet = buildArtNetPacket(0x0102, data, 7)

    expect(packet.length).toBe(18 + 512)
    expect(packet.subarray(0, 8).toString('ascii')).toBe('Art-Net\0')
    expect(packet.readUInt16LE(8)).toBe(0x5000)
    expect(packet.readUInt16BE(10)).toBe(14)
    expect(packet[12]).toBe(7) // sequence
    expect(packet[14]).toBe(0x02) // sub-uni
    expect(packet[15]).toBe(0x01) // net
    expect(packet.readUInt16BE(16)).toBe(512)
    expect(packet[18]).toBe(255)
    expect(packet[18 + 511]).toBe(42)
  })

  it('uses 0-based universe addressing', () => {
    const packet = buildArtNetPacket(3, new Uint8Array(512), 1)
    expect(packet[14]).toBe(3)
    expect(packet[15]).toBe(0)
  })
})

describe('USB DMX frames', () => {
  it('builds a raw Open DMX USB frame with a start code and 512 channel slots', () => {
    const data = new Uint8Array(512)
    data[0] = 128
    data[511] = 64
    const frame = buildOpenDmxFrame(data)

    expect(frame).toHaveLength(513)
    expect(frame[0]).toBe(0)
    expect(frame[1]).toBe(128)
    expect(frame[512]).toBe(64)
  })

  it('retains the ENTTEC USB Pro packet framing', () => {
    const frame = buildEnttecProFrame(new Uint8Array(512))

    expect(frame).toHaveLength(518)
    expect(frame[0]).toBe(0x7e)
    expect(frame[1]).toBe(6)
    expect(frame[4]).toBe(0)
    expect(frame[517]).toBe(0xe7)
  })
})

describe('DMXEngine', () => {
  it('starts in virtual mode', () => {
    const engine = new DMXEngine()
    const status = engine.getStatus()
    expect(status.connected).toBe(false)
    expect(status.mode).toBe('virtual')
  })

  it('sets and gets channel values', () => {
    const engine = new DMXEngine()
    engine.setChannel(1, 128)
    engine.setChannel(2, 255)
    expect(engine.getChannel(1)).toBe(128)
    expect(engine.getChannel(2)).toBe(255)
    expect(engine.getChannel(3)).toBe(0) // default
  })

  it('clamps values to 0-255', () => {
    const engine = new DMXEngine()
    engine.setChannel(1, 300)
    engine.setChannel(2, -50)
    expect(engine.getChannel(1)).toBe(255)
    expect(engine.getChannel(2)).toBe(0)
  })

  it('blackout zeroes all channels', () => {
    const engine = new DMXEngine()
    engine.setChannel(1, 128)
    engine.setChannel(100, 200)
    engine.blackout()
    expect(engine.getChannel(1)).toBe(0)
    expect(engine.getChannel(100)).toBe(0)
  })

  it('snapshot returns copy of universe', () => {
    const engine = new DMXEngine()
    engine.setChannel(1, 42)
    const snap = engine.snapshot()
    expect(snap[0]).toBe(42)
    snap[0] = 99
    expect(engine.getChannel(1)).toBe(42) // original unchanged
  })
})
it('isolates test channels from show playback and restores the show on exit', () => {
  const engine = new DMXEngine()
  engine.setChannel(1, 70)
  engine.startTest()
  expect(engine.snapshot()[0]).toBe(0)
  engine.setTestChannel(1, 255)
  engine.setTestChannel(2, 100)
  engine.setChannel(1, 90)
  expect(Array.from(engine.snapshot().slice(0, 2))).toEqual([255, 100])
  engine.stopTest()
  expect(Array.from(engine.snapshot().slice(0, 2))).toEqual([90, 0])
})

it('clears test output on blackout and rejects invalid test channels', () => {
  const engine = new DMXEngine()
  engine.startTest()
  engine.setTestChannel(1, 999)
  engine.setTestChannel(0, 99)
  engine.setTestChannel(1.5, 99)
  expect(engine.snapshot()[0]).toBe(255)
  engine.blackout()
  expect(engine.snapshot().every((value) => value === 0)).toBe(true)
})
