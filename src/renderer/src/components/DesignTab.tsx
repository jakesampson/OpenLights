export function DesignTab() {
  const channels = [
    { label: 'Red', value: 60 },
    { label: 'Green', value: 35 },
    { label: 'Blue', value: 80 },
    { label: 'White', value: 20 },
    { label: 'Amber', value: 10 },
    { label: 'UV', value: 0 }
  ];

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Fader + colour wheel + channel sliders */}
      <div className="flex gap-3 items-stretch min-h-0">
        {/* Vertical dimmer fader */}
        <div className="flex flex-col items-center gap-0.5 w-14 shrink-0">
          <span className="text-[11px] text-dim uppercase font-medium">Dimmer</span>
          <div className="fader flex-1 min-h-[100px]">
            <div className="fader-fill" style={{ height: '85%' }} />
          </div>
          <span className="font-mono text-[12px] text-white">80%</span>
        </div>
        
        {/* Colour wheel */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-[11px] text-dim uppercase font-medium">Colour</span>
          <div className="wheel" style={{ width: 84, height: 84 }} />
          <span className="font-mono text-[11px] text-dim">RGB 153·089·204</span>
        </div>
        
        {/* Vertical channel sliders */}
        <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto">
          {channels.map((c) => (
            <div key={c.label} className="chan w-9 shrink-0">
              <span className="text-[10px] text-dim text-center leading-none">{c.label}</span>
              <div className="chan-track" style={{ minHeight: 90 }}>
                <div className="chan-fill" style={{ height: `${c.value}%` }} />
              </div>
              <span className="font-mono text-[11px] text-zinc-400 text-center leading-none">{c.value}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Shutter / Strobe + Movement Speed */}
      <div className="flex flex-wrap gap-4 pt-1.5 border-t border-line">
        <div className="flex items-center gap-1.5 shrink-0">
          <label className="text-[10px] text-dim uppercase font-medium whitespace-nowrap">Shutter / Strobe</label>
          <div className="flex gap-1">
            <button className="btn-theme on text-[10px] px-2">Open</button>
            <button className="btn-theme text-[10px] px-2">Closed</button>
            <button className="btn-theme text-[10px] px-2" disabled title="Not implemented">Strobe</button>
            <button className="btn-theme text-[10px] px-2" disabled title="Not implemented">Pulse</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <label className="text-[10px] text-dim uppercase font-medium whitespace-nowrap">Movement Speed</label>
          <div className="flex gap-1">
            <button className="btn-theme on text-[10px] px-2">Tracking</button>
            <button className="btn-theme text-[10px] px-2" disabled title="Not implemented">Vector</button>
          </div>
        </div>
      </div>
    </div>
  )
}