import { useEffect, useRef, useState } from 'react'
import type { DmxStatus } from '@shared/types'

export function DmxTestPanel({ status }: { status: DmxStatus | null }) {
  const [active, setActive] = useState(false)
  const [channel, setChannel] = useState(1)
  const [values, setValues] = useState<number[]>(() => Array(512).fill(0))
  const [error, setError] = useState('')
  const activeRef = useRef(false)
  const available = status?.connected && status.mode === 'serial'

  useEffect(() => () => { if (activeRef.current) void window.electronAPI.stopDmxTest() }, [])
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      void window.electronAPI.getChannels().then(setValues).catch(() => {})
    }, 500)
    return () => window.clearInterval(timer)
  }, [active])
  useEffect(() => {
    if (active && !available) {
      activeRef.current = false
      setActive(false)
      void window.electronAPI.stopDmxTest()
    }
  }, [active, available])

  const start = async () => {
    try {
      await window.electronAPI.startDmxTest()
      activeRef.current = true
      setValues(Array(512).fill(0))
      setActive(true)
      setError('')
    } catch (e) { setError(String(e)) }
  }
  const stop = async () => {
    try {
      await window.electronAPI.stopDmxTest()
      activeRef.current = false
      setActive(false)
      setError('')
    } catch (e) { setError(String(e)) }
  }
  const changeValue = (value: number) => {
    const next = Math.max(0, Math.min(255, Math.round(value)))
    setValues((previous) => { const copy = [...previous]; copy[channel - 1] = next; return copy })
    void window.electronAPI.setDmxTestChannel(channel, next).catch((e) => setError(String(e)))
  }
  return <section className="mt-5 rounded border border-line bg-bg/30 p-4" aria-label="DMX channel test">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">DMX channel test</h3><p className="mt-1 text-xs text-dim">Send raw values directly to your USB interface.</p></div>
      {active ? <button type="button" className="btn-theme text-xs" onClick={() => void stop()}>Stop test</button> : <button type="button" className="btn-theme text-xs disabled:opacity-40" disabled={!available} onClick={() => void start()}>Start test</button>}
    </div>
    {!active ? <p className="mt-3 text-xs leading-relaxed text-dim">{available ? 'Starting the test sets all 512 channels to zero. Stopping restores the show output.' : 'Connect a USB DMX interface to start testing.'}</p> : <>
      <p className="mt-3 text-xs text-dim">Test output is live. Channels stay at their set values when you select another channel.</p>
      <div className="mt-3 flex items-end gap-3"><label className="text-xs text-dim">Channel<input aria-label="DMX channel" type="number" min="1" max="512" value={channel} onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 512) setChannel(n) }} className="mt-1 block w-20 rounded border border-line bg-panel2 px-2 py-2 text-sm text-white" /></label>
        <label className="min-w-0 flex-1 text-xs text-dim">Value<input aria-label="DMX value" type="range" min="0" max="255" value={values[channel - 1] ?? 0} onChange={(e) => changeValue(Number(e.target.value))} className="mt-2 block w-full accent-[var(--accent)]" /></label>
        <input aria-label="DMX value number" type="number" min="0" max="255" value={values[channel - 1] ?? 0} onChange={(e) => changeValue(Number(e.target.value))} className="w-20 rounded border border-line bg-panel2 px-2 py-2 text-sm text-white" />
      </div>
      <p className="mt-3 text-xs text-dim">USB frames sent: {status?.frameCount.toLocaleString() ?? 0}. This confirms writes, not a fixture response.</p>
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
  </section>
}
