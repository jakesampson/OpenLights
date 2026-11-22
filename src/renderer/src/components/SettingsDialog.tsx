import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useShowStore } from '../stores/showStore'
import { MidiPanel } from './MidiPanel'
import { DmxOutputPanel } from './DmxOutputPanel'
import { readUsbDmxDefault } from './DmxConnection'
import type { DmxStatus, SerialDmxProtocol } from '@shared/types'

export type SettingsTabId = 'general' | 'timing' | 'gestures' | 'dmx' | 'external'

// LightKey's Settings window (Jake's screenshots, 22 Nov 2026): five tabs
// across the top — General, Timing, Gestures, DMX Output, External
// Control — each with an icon above its label, the active tab in blue.
// OpenLights' existing settings are spread across the tabs by their
// LightKey counterpart, keeping OpenLights' own values and defaults
// (Page fade stays 500 ms even though LightKey's screenshot shows 00:00.3).
// Settings apply immediately — there is no Apply step.
const TABS: { id: SettingsTabId; label: string; icon: ReactNode }[] = [
  { id: 'general', label: 'General', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" /></svg> },
  { id: 'timing', label: 'Timing', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg> },
  { id: 'gestures', label: 'Gestures', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v4.5m0-6a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-2.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.6a6 6 0 0 1-4.7-2.3l-2.4-3a1.6 1.6 0 0 1 2.4-2.1L8 15.5" /></svg> },
  { id: 'dmx', label: 'DMX Output', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 4.2 6 7.3 6 10.2a6 6 0 0 1-12 0C6 10.3 8.5 7.2 12 3Z" /></svg> },
  { id: 'external', label: 'External Control', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" /></svg> }
]

// OpenLights is USB-only by deliberate scope, so the DMX Output tab
// shows only the two output methods it actually supports — no Art-Net,
// sACN, ESP Net, Eurolite PRO or Other USB Interfaces (LightKey shows
// all seven). The two methods are mutually exclusive, as in LightKey:
// enabling one disables the other.
const DMX_METHODS: { protocol: SerialDmxProtocol; name: string; description: string }[] = [
  { protocol: 'enttec-usb-pro', name: 'Serial USB Interfaces', description: 'USB interfaces that emulate a serial port, driven with the buffered DMX USB Pro protocol — Enttec DMX USB Pro and compatible devices. This output method cannot be used together with “Open DMX Interfaces”.' },
  { protocol: 'open-dmx-usb', name: 'Open DMX Interfaces', description: 'Unbuffered Open DMX USB interfaces — Enttec Open DMX USB and compatible devices. This output method cannot be used together with “Serial USB Interfaces”.' }
]

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-start gap-4">
    <span className="w-44 shrink-0 pt-1 text-right text-xs font-semibold">{label}</span>
    <div className="min-w-0 flex-1 text-xs">{children}</div>
  </div>
}

export function SettingsDialog({ initialTab, onTabChange, adaptiveBackground, onAdaptiveBackgroundChange, onTapTempo, onClose }: {
  initialTab: SettingsTabId
  // Reports tab switches back so the opener can reopen on the
  // last-used tab (LightKey behaviour); optional.
  onTabChange?: (tab: SettingsTabId) => void
  adaptiveBackground: boolean
  onAdaptiveBackgroundChange: (value: boolean) => void
  onTapTempo: () => void
  onClose: () => void
}) {
  const show = useShowStore((s) => s.show)
  const bpm = useShowStore((s) => s.bpm)
  const [tab, setTab] = useState<SettingsTabId>(initialTab)
  const [dmxStatus, setDmxStatus] = useState<DmxStatus | null>(null)
  // The DMX method in use: the remembered interface's protocol first,
  // then the Default USB DMX interface preference.
  const [selectedMethod, setSelectedMethod] = useState<SerialDmxProtocol>(() => readUsbDmxDefault()?.protocol ?? show?.preferences?.dmxProtocol ?? 'open-dmx-usb')
  const handleDmxProtocolChange = useCallback((protocol: SerialDmxProtocol | '') => { if (protocol) setSelectedMethod(protocol) }, [])
  const handleDmxStatusChange = useCallback((status: DmxStatus | null) => { setDmxStatus(status) }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const selectedMethodActive = dmxStatus?.connected === true && dmxStatus.serialProtocol === selectedMethod
  const enableMethod = async () => {
    const state = useShowStore.getState()
    state.updatePreferences({ dmxProtocol: selectedMethod })
    // Reconnect the remembered device for this method, if there is one;
    // otherwise the device is picked in the panel below, which connects
    // as soon as device and protocol are both chosen.
    const saved = readUsbDmxDefault()
    if (saved && saved.protocol === selectedMethod) {
      try { await window.electronAPI.setDmxPort(saved.path, selectedMethod) } catch { /* the panel shows the error */ }
    }
  }
  const disableMethod = async () => {
    try { await window.electronAPI.disconnectDmx() } catch { /* the panel shows the error */ }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="panel flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden shadow-2xl">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <h2 id="settings-title" className="text-base font-semibold">Settings</h2>
        <button type="button" className="btn-theme text-xs" onClick={onClose} aria-label="Close Settings" title="Close Settings">×</button>
      </header>
      <div className="flex justify-center gap-1 border-b border-line px-4 py-2" role="tablist" aria-label="Settings sections">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); onTabChange?.(item.id) }} className={`flex w-[110px] flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs ${tab === item.id ? 'bg-white/10 text-[#6db3ff]' : 'text-dim hover:bg-white/5 hover:text-text'}`}>
            <span className="[&>svg]:h-[22px] [&>svg]:w-[22px] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-[1.7] [&>svg]:stroke-linecap-round [&>svg]:stroke-linejoin-round">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tab === 'general' && <div className="flex flex-col gap-5">
          <SettingsRow label="At startup:">
            <select aria-label="Project startup state" value={show?.startup?.mode ?? 'none'} onChange={(event) => useShowStore.getState().setStartupMode(event.target.value as 'none' | 'restore')} className="w-full max-w-xs rounded bg-panel2 p-1.5"><option value="none">No active looks</option><option value="restore">Restore saved looks</option></select>
          </SettingsRow>
          <SettingsRow label="Preview:">
            <label className="flex cursor-pointer items-center gap-2 py-1"><input type="checkbox" checked={adaptiveBackground} onChange={(event) => onAdaptiveBackgroundChange(event.target.checked)} /> Adaptive background colour</label>
          </SettingsRow>
          <SettingsRow label="Appearance:">
            <select aria-label="Application appearance" value={show?.preferences?.theme ?? 'dark'} onChange={(event) => useShowStore.getState().updatePreferences({ theme: event.target.value as 'dark' | 'system' })} className="w-full max-w-xs rounded bg-panel2 p-1.5"><option value="dark">Dark</option><option value="system">System</option></select>
          </SettingsRow>
          <SettingsRow label="Live view:">
            <label className="flex cursor-pointer items-center gap-2 py-1"><input type="checkbox" checked={show?.deactivateOnPageSwitch === true} onChange={(event) => useShowStore.getState().setPageSwitchMode(event.target.checked)} /> Deactivate cues before switching pages</label>
          </SettingsRow>
        </div>}
        {tab === 'timing' && <div className="flex flex-col gap-5">
          <SettingsRow label="Default times:">
            <div className="flex max-w-md flex-col gap-2 rounded border border-line p-3">
              <label className="flex items-center justify-between gap-3">Default fade<span className="flex items-center gap-1"><input aria-label="Default fade milliseconds" type="number" min="0" value={show?.preferences?.defaultFadeMs ?? 1000} onChange={(event) => useShowStore.getState().updatePreferences({ defaultFadeMs: Math.max(0, Number(event.target.value)) })} className="w-24 rounded bg-panel2 p-1 text-right" /> ms</span></label>
              <p className="text-[11px] text-dim">The fade new cues are created with.</p>
              <label className="flex items-center justify-between gap-3">Live page: Fade time<span className="flex items-center gap-1"><input aria-label="Page fade milliseconds" type="number" min="0" value={show?.preferences?.pageFadeMs ?? 500} onChange={(event) => useShowStore.getState().updatePreferences({ pageFadeMs: Math.max(0, Number(event.target.value)) })} className="w-24 rounded bg-panel2 p-1 text-right" /> ms</span></label>
              <p className="text-[11px] text-dim">The fade when a Live page switches, unless the page sets its own.</p>
            </div>
          </SettingsRow>
          <SettingsRow label="Tempo:">
            <span className="flex max-w-xs gap-1"><input aria-label="Tempo in BPM" type="number" min="30" max="240" value={bpm} onChange={(event) => useShowStore.getState().setBpm(Number(event.target.value))} className="min-w-0 flex-1 rounded bg-panel2 p-1.5" /><button type="button" className="btn-theme text-xs" onClick={onTapTempo}>Tap</button></span>
            <p className="mt-1 text-[11px] text-dim">The tempo beat-synced effects follow.</p>
          </SettingsRow>
        </div>}
        {tab === 'gestures' && <div className="flex flex-col gap-3 text-xs leading-relaxed">
          <p>OpenLights doesn’t use trackpad gestures for Dimmer, Colour or Master Dimmer — there is nothing to configure here.</p>
          <p className="text-dim">In the Preview, scroll pans the canvas and Ctrl/⌘-scroll (or pinch on a trackpad) zooms around the cursor. Slider values change by dragging, not by scrolling.</p>
        </div>}
        {tab === 'dmx' && <div className="flex gap-4">
          <div className="w-[240px] shrink-0" role="listbox" aria-label="DMX output methods">
            {DMX_METHODS.map((method) => {
              const active = dmxStatus?.connected === true && dmxStatus.serialProtocol === method.protocol
              return <button key={method.protocol} type="button" role="option" aria-selected={selectedMethod === method.protocol} onClick={() => setSelectedMethod(method.protocol)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${selectedMethod === method.protocol ? 'bg-[#0a84ff] text-white' : 'hover:bg-panel2'}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: active ? '#34d399' : '#ef4444' }} aria-label={active ? 'Connected' : 'Disabled'} />
                {method.name}
              </button>
            })}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed">{DMX_METHODS.find((m) => m.protocol === selectedMethod)?.description}</p>
            <div className="mt-5 flex items-center gap-4 border-t border-line pt-4">
              <span className="text-xs">Status: <strong>{selectedMethodActive ? 'Connected' : 'Disabled'}</strong>{selectedMethodActive && dmxStatus?.port ? <span className="ml-2 text-dim">{dmxStatus.port}</span> : null}</span>
              {selectedMethodActive
                ? <button type="button" className="btn-theme text-xs" onClick={() => void disableMethod()}>Disable</button>
                : <button type="button" className="btn-theme text-xs" onClick={() => void enableMethod()}>Enable</button>}
            </div>
            <div className="mt-5">
              <DmxOutputPanel protocol={selectedMethod} onProtocolChange={handleDmxProtocolChange} onStatusChange={handleDmxStatusChange} />
            </div>
          </div>
        </div>}
        {tab === 'external' && <div className="flex flex-col gap-3">
          <SettingsRow label="MIDI ports:">
            <span className="text-dim">Connected MIDI inputs are listed below. OpenLights listens for MIDI notes and CCs only — there is no MIDI output.</span>
          </SettingsRow>
          <MidiPanel />
        </div>}
      </div>
      <footer className="flex items-center justify-between border-t border-line px-6 py-3">
        <span className="text-[11px] text-dim">Settings apply immediately.</span>
        <button type="button" className="btn-theme text-xs" onClick={onClose}>Close</button>
      </footer>
    </section>
  </div>
}
