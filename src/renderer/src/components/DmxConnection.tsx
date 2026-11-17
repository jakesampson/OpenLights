import { useCallback, useEffect, useRef, useState } from 'react'
import type { DmxPortInfo, DmxStatus, SerialDmxProtocol } from '@shared/types'
import {
  formatDmxPortLabel,
  identifyDmxPort,
  preferredDmxPortPath
} from '@shared/dmxPorts'

export function DmxConnection() {
  const [open, setOpen] = useState(false)
  const [port, setPort] = useState<string>('')
  const [ports, setPorts] = useState<DmxPortInfo[]>([])
  const [status, setStatus] = useState<DmxStatus | null>(null)
  const [dmxError, setDmxError] = useState<string | null>(null)
  const [outputMode, setOutputMode] = useState<'usb' | 'artnet'>('usb')
  const [serialProtocol, setSerialProtocol] =
    useState<SerialDmxProtocol>('open-dmx-usb')
  const [artnetHost, setArtnetHost] = useState('255.255.255.255')
  const [artnetUniverse, setArtnetUniverse] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectedPort = ports.find((candidate) => candidate.path === port)

  const scanPorts = useCallback(async () => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.getDmxPorts()
      setPorts(result)
      setPort((current) => preferredDmxPortPath(result, current))
      setDmxError(null)
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    const host = window.localStorage.getItem('openlights.artnetHost')
    const universe = Number(window.localStorage.getItem('openlights.artnetUniverse'))
    if (host) setArtnetHost(host)
    if (Number.isFinite(universe) && universe >= 0) setArtnetUniverse(universe)
  }, [])

  useEffect(() => {
    void scanPorts()
  }, [scanPorts])

  const refreshStatus = async () => {
    if (!window.electronAPI?.getDmxStatus) return
    try {
      setStatus(await window.electronAPI.getDmxStatus())
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    refreshStatus()
    const timer = window.setInterval(refreshStatus, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Close the popover on outside clicks.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const connectDMX = async () => {
    if (!window.electronAPI) return
    try {
      const result = await window.electronAPI.setDmxPort(port, serialProtocol)
      if (result.status) setStatus(result.status)
      if (result.success) setDmxError(null)
      else setDmxError(result.error ?? 'Could not open DMX port')
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

  const connectArtNet = async () => {
    if (!window.electronAPI) return
    try {
      window.localStorage.setItem('openlights.artnetHost', artnetHost)
      window.localStorage.setItem('openlights.artnetUniverse', String(artnetUniverse))
      const result = await window.electronAPI.connectArtNet(artnetHost, artnetUniverse)
      if (result.status) setStatus(result.status)
      if (result.success) setDmxError(null)
      else setDmxError(result.error ?? 'Could not start Art-Net output')
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

  const disconnectDMX = async () => {
    if (!window.electronAPI?.disconnectDmx) return
    try {
      const result = await window.electronAPI.disconnectDmx()
      if (result.status) setStatus(result.status)
      setDmxError(null)
    } catch (e) {
      setDmxError(e instanceof Error ? e.message : String(e))
    }
  }

  const connected = status?.connected ?? false

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn-theme flex items-center gap-2 px-3 text-xs ${open ? 'on' : ''}`}
        title="DMX output settings"
        aria-expanded={open}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: connected ? 'var(--accent)' : 'var(--dim)' }}
        />
        DMX
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 panel p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-dim">
              DMX Connection
            </div>
            <span className="flex items-center gap-1 text-[9px] text-dim">
              {connected ? '●' : '○'}{' '}
              {connected
                ? status?.mode === 'artnet'
                  ? `Art-Net · u${status.artnet?.universe ?? 0}`
                  : status?.serialProtocol === 'open-dmx-usb'
                    ? 'Open DMX USB'
                    : status?.serialProtocol === 'enttec-usb-pro'
                      ? 'DMX USB Pro'
                      : 'Connected'
                : 'Virtual mode'}
            </span>
          </div>

          <div className="mb-2 flex gap-1">
            <button
              onClick={() => setOutputMode('usb')}
              className={`btn-theme flex-1 text-[10px] ${outputMode === 'usb' ? 'on' : ''}`}
            >
              USB
            </button>
            <button
              onClick={() => setOutputMode('artnet')}
              className={`btn-theme flex-1 text-[10px] ${outputMode === 'artnet' ? 'on' : ''}`}
            >
              Art-Net
            </button>
          </div>

          {outputMode === 'usb' ? (
            <div className="flex flex-col gap-1">
              <select
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="rounded border border-line bg-panel2 px-2 py-1 text-xs text-white"
              >
                <option value="">Select USB device</option>
                {ports.map((device) => (
                  <option key={device.path} value={device.path}>
                    {formatDmxPortLabel(device)}
                  </option>
                ))}
              </select>
              {ports.length === 0 && (
                <div className="text-[9px] text-dim">
                  No serial devices found. Check the FTDI driver, then scan again.
                </div>
              )}
              {ports.length > 0 &&
                !ports.some((device) => identifyDmxPort(device) !== 'other') && (
                  <div className="text-[9px] text-dim">
                    No ENTTEC or FTDI identifier found; choose a port only if you recognize it.
                  </div>
                )}
              {selectedPort && (
                <div className="text-[9px] text-dim">
                  {identifyDmxPort(selectedPort) === 'enttec'
                    ? 'ENTTEC identity found'
                    : identifyDmxPort(selectedPort) === 'ftdi'
                      ? 'FTDI adapter candidate; USB ID alone cannot confirm the ENTTEC model'
                      : 'No ENTTEC or FTDI identifier found'}
                </div>
              )}
              <label className="text-[9px] uppercase text-dim">USB protocol</label>
              <select
                value={serialProtocol}
                onChange={(e) => {
                  if (
                    e.target.value === 'open-dmx-usb' ||
                    e.target.value === 'enttec-usb-pro'
                  ) {
                    setSerialProtocol(e.target.value)
                  }
                }}
                className="rounded border border-line bg-panel2 px-2 py-1 text-xs text-white"
              >
                <option value="open-dmx-usb">ENTTEC Open DMX USB · raw DMX / FTDI</option>
                <option value="enttec-usb-pro">ENTTEC DMX USB Pro · Pro packet</option>
              </select>
              <div className="flex gap-1">
                <button onClick={scanPorts} className="btn-theme flex-1 text-xs">
                  Scan USB
                </button>
                <button
                  onClick={connectDMX}
                  className="btn-theme flex-1 text-xs disabled:opacity-40"
                  disabled={!port}
                >
                  Connect
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-[9px] uppercase text-dim">Node IP</label>
              <input
                value={artnetHost}
                onChange={(e) => setArtnetHost(e.target.value)}
                placeholder="192.168.1.50"
                className="rounded border border-line bg-panel2 px-2 py-1 text-xs text-white"
              />
              <label className="text-[9px] uppercase text-dim">Universe</label>
              <input
                type="number"
                min={0}
                max={32767}
                value={artnetUniverse}
                onChange={(e) => setArtnetUniverse(Number(e.target.value))}
                className="rounded border border-line bg-panel2 px-2 py-1 text-center font-mono text-xs text-white"
              />
              <button onClick={connectArtNet} className="btn-theme text-xs">
                Connect
              </button>
            </div>
          )}

          {connected && (
            <>
              {status?.mode === 'serial' && (
                <div className="mt-2 text-[9px] text-dim">
                  {status.port} · {status.frameCount.toLocaleString()} frames · last output{' '}
                  {status.lastFrameAt ? new Date(status.lastFrameAt).toLocaleTimeString() : 'waiting'}
                  <div className="mt-1">
                    Frame status confirms USB writes, not fixture response.
                  </div>
                </div>
              )}
              <button onClick={disconnectDMX} className="btn-theme mt-1 w-full text-xs">
                Disconnect
              </button>
            </>
          )}
          {status?.error && <div className="mt-1 text-[9px] text-red-400">{status.error}</div>}
        </div>
      )}

      {dmxError && (
        <div className="fixed bottom-3 left-3 z-40 max-w-sm rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300 shadow-lg">
          {dmxError}
        </div>
      )}
    </div>
  )
}
