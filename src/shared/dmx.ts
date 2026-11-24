import { SerialPort } from 'serialport'
import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from './types'

const DMX_CHANNELS = 512
const OPEN_DMX_BAUD_RATE = 250000
const ENTTEC_PRO_BAUD_RATE = 57600
const ENTTEC_PRO_OUTPUT_LABEL = 6

export function buildOpenDmxFrame(data: Uint8Array): Buffer {
  const frame = Buffer.alloc(DMX_CHANNELS + 1)
  Buffer.from(data.subarray(0, DMX_CHANNELS)).copy(frame, 1)
  return frame
}

export function buildEnttecProFrame(data: Uint8Array): Buffer {
  const messageLength = Math.min(DMX_CHANNELS, data.length) + 1
  const frame = Buffer.alloc(messageLength + 5)
  frame[0] = 0x7e
  frame[1] = ENTTEC_PRO_OUTPUT_LABEL
  frame[2] = messageLength & 0xff
  frame[3] = (messageLength >> 8) & 0xff
  frame[4] = 0x00
  Buffer.from(data.subarray(0, DMX_CHANNELS)).copy(frame, 5)
  frame[messageLength + 4] = 0xe7
  return frame
}

export function setOpenDmxBreak(port: Pick<SerialPort, 'set'>, active: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    port.set({ brk: active, rts: false }, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function writeAndDrain(port: SerialPort, frame: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(frame, (writeError) => {
      if (writeError) {
        reject(writeError)
        return
      }
      port.drain((drainError) => {
        if (drainError) reject(drainError)
        else resolve()
      })
    })
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class DMXEngine {
  private port: SerialPort | null = null
  private portPath: string | null = null
  private baudRate = ENTTEC_PRO_BAUD_RATE
  private serialProtocol: SerialDmxProtocol | null = null
  private serialFrameInProgress = false
  private universe = new Uint8Array(DMX_CHANNELS)
  private testUniverse: Uint8Array | null = null
  private timer: NodeJS.Timeout | null = null
  private sentFrames = 0
  private lastFrameAt: number | null = null
  private error: string | null = null
  private connected = false
  private reconnectTarget: { path: string; protocol: SerialDmxProtocol } | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private connectionGeneration = 0
  private onStatusChange: ((status: DmxStatus) => void) | null = null

  constructor() {
    this.startFramePump()
  }

  setStatusCallback(cb: (status: DmxStatus) => void) {
    this.onStatusChange = cb
  }

  async connect(path: string, protocol: SerialDmxProtocol = 'enttec-usb-pro'): Promise<void> {
    if (protocol !== 'open-dmx-usb' && protocol !== 'enttec-usb-pro') {
      throw new Error(`Unsupported USB-DMX protocol: ${protocol}`)
    }

    const generation = ++this.connectionGeneration
    this.reconnectTarget = { path, protocol }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    await this.disconnectAll()
    // A previous disconnect() stops the frame pump; restart it so frames
    // (and the virtual frame counters) keep ticking while connected.
    this.startFramePump()
    if (generation !== this.connectionGeneration) return

    this.portPath = path
    this.serialProtocol = protocol
    this.baudRate = protocol === 'open-dmx-usb' ? OPEN_DMX_BAUD_RATE : ENTTEC_PRO_BAUD_RATE
    this.error = null

    try {
      this.port = new SerialPort({
        path,
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 2,
        parity: 'none',
        autoOpen: false
      })
      const port = this.port
      port.on('close', () => { if (this.port === port && this.reconnectTarget) { this.connected = false; this.error = 'USB interface disconnected; waiting to reconnect'; this.emitStatus(); this.scheduleReconnect() } })
      // This listener MUST stay, even though it does nothing while the
      // port is being closed (this.port is already null then): closing a
      // port while a write is stuck (device stopped draining) cancels the
      // write, and serialport emits an 'error' event (BindingsError:
      // Canceled) while closing. With no listener that emission throws
      // inside the stream machinery and kills the main process's event
      // loop, so the close never completes and the app hangs in the Dock
      // until Force Quit (Jake, 24 Nov 2026 — Mac quit hang; see
      // tests/dmx-wedged-port.test.ts). The listener consumes the event.
      port.on('error', (error: Error) => { if (this.port === port) { this.connected = false; this.error = error.message; this.emitStatus(); this.scheduleReconnect() } })

      await new Promise<void>((resolve, reject) => {
        port.open((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      if (generation !== this.connectionGeneration) { if (port.isOpen) port.close(() => {}); return }

      if (protocol === 'open-dmx-usb') await setOpenDmxBreak(this.port, false)
      this.connected = true
      this.emitStatus()
    } catch (e: any) {
      if (generation !== this.connectionGeneration) return
      this.connected = false
      this.error = e?.message ?? String(e)
      const failedPort = this.port
      this.port = null
      if (failedPort?.isOpen) await new Promise<void>((resolve) => failedPort.close(() => resolve()))
      this.emitStatus()
      this.scheduleReconnect()
      throw e
    }
  }

  async disconnect(): Promise<void> {
    this.connectionGeneration++
    this.reconnectTarget = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    // Stop the 40 Hz pump as well: a disconnected engine must not leave a
    // live interval behind (it kept the main process's event loop busy
    // after quit was requested). connect() restarts the pump.
    this.stopFramePump()
    await this.disconnectAll()
  }

  private scheduleReconnect() {
    if (!this.reconnectTarget || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      const target = this.reconnectTarget
      if (target) void this.connect(target.path, target.protocol).catch(() => {})
    }, 1000)
    this.reconnectTimer.unref?.()
  }

  private async disconnectAll(): Promise<void> {
    this.connected = false
    this.portPath = null
    this.serialProtocol = null
    if (this.port) {
      const port = this.port
      this.port = null
      await new Promise<void>((resolve) => {
        port.close(() => resolve())
      })
    }
    this.emitStatus()
  }

  async listPorts(): Promise<DmxPortInfo[]> {
    const ports = await SerialPort.list()
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      pnpId: port.pnpId,
      locationId: port.locationId,
      productId: port.productId,
      vendorId: port.vendorId
    }))
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
    return new Uint8Array(this.testUniverse ?? this.universe)
  }

  startTest() { this.testUniverse = new Uint8Array(DMX_CHANNELS) }

  setTestChannel(channel: number, value: number) {
    if (!this.testUniverse || !Number.isInteger(channel) || channel < 1 || channel > DMX_CHANNELS || !Number.isFinite(value)) return
    this.testUniverse[channel - 1] = clampByte(value)
  }

  stopTest() { this.testUniverse = null }

  blackout() {
    this.testUniverse?.fill(0)
    this.universe.fill(0)
    this.emitStatus()
  }

  private startFramePump() {
    if (this.timer) return
    this.timer = setInterval(() => this.pushFrame(), 25) // 40 Hz
    // Never let the pump hold the process alive on its own: on quit the
    // engine is shut down explicitly, but an unref'd timer cannot keep
    // Electron's event loop (or a test runner) from exiting by itself.
    this.timer.unref?.()
  }

  private stopFramePump() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Stop all output and release every handle (frame pump, reconnect timer,
   * serial port). Called once when the app quits; after this the engine
   * must not keep the process alive. A later connect() restarts the pump.
   */
  async shutdown(): Promise<void> {
    this.stopFramePump()
    await this.disconnect()
  }

  private pushFrame() {
    if (this.port && this.connected) {
      const port = this.port
      if (this.serialProtocol === 'open-dmx-usb') {
        void this.pushOpenDmxFrame(port)
        return
      }

      port.write(buildEnttecProFrame(this.snapshot()), (err) => {
        if (this.port !== port) return
        if (err) {
          this.error = err.message
          this.connected = false
          this.emitStatus()
          this.scheduleReconnect()
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

  private async pushOpenDmxFrame(port: SerialPort): Promise<void> {
    if (this.serialFrameInProgress) return
    this.serialFrameInProgress = true

    try {
      await setOpenDmxBreak(port, true)
      await delay(1)
      await setOpenDmxBreak(port, false)
      await delay(1)
      if (this.port !== port || !this.connected) return

      await writeAndDrain(port, buildOpenDmxFrame(this.snapshot()))
      if (this.port !== port || !this.connected) return

      this.sentFrames++
      this.lastFrameAt = Date.now()
      this.error = null
      this.emitStatus()
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error)
      if (port.isOpen) {
        try {
          await setOpenDmxBreak(port, false)
        } catch (clearError) {
          const clearMessage = clearError instanceof Error ? clearError.message : String(clearError)
          message = `${message}; failed to clear DMX break: ${clearMessage}`
        }
      }
      if (this.port === port) {
        this.connected = false
        this.error = message
        this.emitStatus()
        this.scheduleReconnect()
      }
    } finally {
      this.serialFrameInProgress = false
    }
  }

  getStatus(): DmxStatus {
    const mode: DmxStatus['mode'] = this.connected ? 'serial' : 'virtual'
    return {
      connected: this.connected,
      port: this.portPath,
      baudRate: this.baudRate,
      lastFrameAt: this.lastFrameAt,
      frameCount: this.sentFrames,
      universe: 1,
      error: this.error,
      mode,
      serialProtocol: this.connected ? this.serialProtocol ?? undefined : undefined
    }
  }

  private emitStatus() {
    this.onStatusChange?.(this.getStatus())
  }
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}
