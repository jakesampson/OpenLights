import { useEffect, useState } from 'react'
import { useShowStore } from '../stores/showStore'
import { channelFixtureLabels } from '../lib/channelLabels'

export function DmxMonitor() {
  const [channels, setChannels] = useState<number[]>(Array(512).fill(0))
  const [showFull, setShowFull] = useState(true)
  const fixtures = useShowStore((state) => state.show?.fixtures ?? [])
  const labels = channelFixtureLabels(fixtures)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      if (!window.electronAPI?.getChannels) return
      try {
        const values = await window.electronAPI.getChannels()
        if (alive) setChannels(values || [])
      } catch {
        /* ignore */
      }
    }

    tick()
    const timer = window.setInterval(tick, 500)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const active = channels
    .map((value, index) => ({ channel: index + 1, value }))
    .filter((entry) => entry.value > 0)
  const visible = showFull ? channels.map((value, index) => ({ channel: index + 1, value })) : active

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          DMX Output Monitor
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500">
            {showFull ? '512 channels' : `${active.length} active channels`}
          </span>
          <button
            onClick={() => setShowFull((v) => !v)}
            className="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700"
          >
            {showFull ? 'Active only' : 'Show all'}
          </button>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="py-2 text-xs text-zinc-600">
          Output is black. Fire a scene or cue to see channel values here.
        </div>
      ) : (
        <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8">
          {visible.map(({ channel, value }) => (
            <div
              key={channel}
              title={labels[channel]?.join('; ') ?? 'Unpatched channel'}
              className={`rounded px-2 py-1 font-mono text-[10px] ${
                value > 0 ? 'bg-indigo-500/15 text-indigo-300' : 'bg-zinc-950/60 text-zinc-600'
              }`}
            >
              <span className="text-zinc-500">{channel}</span>
              <span className="float-right">{value}</span>
              <span className="block truncate text-[9px] text-dim">{labels[channel]?.join('; ') ?? 'Unpatched'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
