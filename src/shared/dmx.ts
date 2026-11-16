import { SerialPort } from 'serialport'
import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import type { DmxStatus } from './types'

const DMX_CHANNELS = 512
const ENTTEC_PRO_OUTPUT_LABEL = 6
const ARTNET_PORT = 6454

/**
 * Build an ArtDMX packet (Art-Net 4). `universe` is 0-based: Net + SubUni.
 * Exported so the packet layout can be unit tested without a network.
 */
export function buildArtNetPacket(
  universe: number,
  data: Uint8Array,
  sequence = 0
): Buffer {
  const size = Math.min(DMX_CHANNELS, data.length)
  const buffer = Buffer.alloc(18 + size)
  buffer.write('Art-Net\0', 0, 'ascii')
  buffer.writeUInt16LE(0x5000, 8) // OpDmx
  buffer.writeUInt16BE(14, 10) // protocol version
  buffer[12] = sequence & 0xff
  buffer[13] = 0 // physical
  buffer[14] = universe & 0xff // sub-uni
  buffer[15] = (universe >> 8) & 0x7f // net
  buffer.writeUInt16BE(size, 16)
  Buffer.from(data.subarray(0, size)).copy(buffer, 18)
  return buffer
}

export class DMXEngine {
  private port: SerialPort | null = null
  private portPath: string | null = null
  private baudRate = 57600
  private universe = new Uint8Array(DMX_CHANNELS)
  private timer: NodeJS.Timeout | null = null
  private sentFrames = 0
  private lastFrameAt: number | null = null
  private error: string | null = null
  private connected = false
  private onStatusChange: ((status: DmxStatus) => void) | null = null

  private artnetSocket: UdpSocket | null = null
  private artnetHost: string | null = null
  private artnetUniverse = 0
  private artnetConnected = false
  private sequence = 0

  constructor() {
    this.startFramePump()
  }

  setStatusCallback(cb: (status: DmxStatus) => void) {
    this.onStatusChange = cb
  }

  async connect(path: string, baudRate = 57600): Promise<void> {
    await this.disconnectAll()

    this.portPath = path
    this.baudRate = baudRate
    this.error = null

    try {
      this.port = new SerialPort({
        path,
        baudRate,
        dataBits: 8,
        stopBits: 2,
        parity: 'none',
        autoOpen: false
      })

      await new Promise<void>((resolve, reject) => {
        this.port!.open((err) => {
          if (err) reject(err)
          else resolve()
        })
      })

      this.connected = true
      this.emitStatus()
    } catch (e: any) {
      this.connected = false
      this.error = e?.message ?? String(e)
      this.port = null
      this.emitStatus()
      throw e
    }
  }

  /** Send DMX over Art-Net to a node or lighting console. */
  async connectArtNet(host: string, universe = 0): Promise<void> {
    await this.disconnectAll()
    if (!host.trim()) throw new Error('Art-Net host is required')

    this.artnetHost = host.trim()
    this.artnetUniverse = Math.max(0, Math.min(32767, Math.round(universe)))
    this.error = null
    this.artnetSocket = createSocket({ type: 'udp4', reuseAddr: true })
    await new Promise<void>((resolve, reject) => {
      this.artnetSocket!.once('error', reject)
      this.artnetSocket!.bind(() => {
        this.artnetSocket!.off('error', reject)
        resolve()
      })
    })
    this.artnetConnected = true
    this.emitStatus()
  }

  async disconnect(): Promise<void> {
    await this.disconnectAll()
  }

  private async disconnectAll(): Promise<void> {
    this.connected = false
    this.portPath = null
    if (this.port) {
      const port = this.port
      this.port = null
      await new Promise<void>((resolve) => {
        port.close(() => resolve())
      })
    }
    this.artnetConnected = false
    this.artnetHost = null
    if (this.artnetSocket) {
      const socket = this.artnetSocket
      this.artnetSocket = null
      await new Promise<void>((resolve) => {
        try {
          socket.close(() => resolve())
        } catch {
          resolve()
        }
      })
    }
    this.emitStatus()
  }

  async listPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
    const ports = await SerialPort.list()
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer }))
  }

  setChannel(channel1Based: number, value: number) {
    if (channel1Based < 1 || channel1Based > DMX_CHANNELS) return
    this.universe[channel1Based - 1] = clampByte(value)
  }

  setChannels(values: Record<number, number>) {
    for (const [key, value] of Object.entries(values)) {
      this.setChannel(Number(key), value)
    }
  }

  getChannel(channel1Based: number): number {
    return this.universe[channel1Based - 1] ?? 0
  }

  snapshot(): Uint8Array {
    return new Uint8Array(this.universe)
  }

  blackout() {
    this.universe.fill(0)
    this.emitStatus()
  }

  private startFramePump() {
    if (this.timer) return
    this.timer = setInterval(() => this.pushFrame(), 25) // 40 Hz
  }

  private pushFrame() {
    if (this.port && this.connected) {
      const messageLength = DMX_CHANNELS + 1
      const buffer = Buffer.alloc(messageLength + 5)
      buffer[0] = 0x7e
      buffer[1] = ENTTEC_PRO_OUTPUT_LABEL
      buffer[2] = messageLength & 0xff
      buffer[3] = (messageLength >> 8) & 0xff
      buffer[4] = 0x00
      Buffer.from(this.universe).copy(buffer, 5)
      buffer[messageLength + 4] = 0xe7

      this.port.write(buffer, (err) => {
        if (err) {
          this.error = err.message
          this.connected = false
          this.emitStatus()
        } else {
          this.sentFrames++
          this.lastFrameAt = Date.now()
          this.error = null
          this.emitStatus()
        }
      })
      return
    }

    if (this.artnetSocket && this.artnetConnected && this.artnetHost) {
      const packet = buildArtNetPacket(
        this.artnetUniverse,
        this.universe,
        ++this.sequence
      )
      this.artnetSocket.send(packet, ARTNET_PORT, this.artnetHost, (err) => {
        if (err) {
          this.error = err.message
          this.emitStatus()
        } else {
          this.sentFrames++
          this.lastFrameAt = Date.now()
          this.error = null
          this.emitStatus()
        }
      })
      return
    }

    this.sentFrames++
    this.lastFrameAt = Date.now()
    this.emitStatus()
  }

  getStatus(): DmxStatus {
    const mode: DmxStatus['mode'] = this.connected
      ? 'serial'
      : this.artnetConnected
        ? 'artnet'
        : 'virtual'
    return {
      connected: this.connected || this.artnetConnected,
      port: this.connected ? this.portPath : this.artnetHost,
      baudRate: this.baudRate,
      lastFrameAt: this.lastFrameAt,
      frameCount: this.sentFrames,
      universe: 1,
      error: this.error,
      mode,
      artnet:
        this.artnetConnected && this.artnetHost
          ? { host: this.artnetHost, universe: this.artnetUniverse }
          : undefined
    }
  }

  private emitStatus() {
    this.onStatusChange?.(this.getStatus())
  }
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
