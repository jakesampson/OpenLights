import { useState } from 'react'
import { useShowStore } from '../stores/showStore'

const SCENE_GROUPS = [
  { title: 'Basic Scenes', scenes: ['Green Scene', 'Purple Scene', 'Red Scene', 'Blue Scene', 'Sunset', 'Chase 1', 'Warm', 'Cool'] },
  { title: 'Effects', scenes: ['Strobe Fast', 'Strobe Slow', 'Rainbow', 'Fade', 'Pulse'] }
]

export function LiveTab() {
  const { scenes, goToScene, activeSceneId } = useShowStore()
  const [activeStates, setActiveStates] = useState<Record<string, boolean>>({})
  
  const toggleScene = (sceneId: string) => {
    setActiveStates(prev => ({ ...prev, [sceneId]: !prev[sceneId] }))
    goToScene(sceneId)
  }
  
  return (
    <div className="flex flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <label className="text-[9px] text-dim uppercase font-medium">Dimmer</label>
        <span className="font-mono text-xs text-white">Full</span>
      </div>
      <div className="relative h-16 w-full bg-panel border border-line rounded px-2 mb-1">
        <div className="absolute bottom-0 h-full w-[100%] bg-accent rounded"></div>
      </div>
      {SCENE_GROUPS.map(group => (
        <div key={group.title} className="flex flex-col gap-1">
          <label className="text-[9px] text-dim uppercase font-medium">{group.title}</label>
          <div className="grid grid-cols-4 gap-1 p-1">
            {group.scenes.map((name) => {
              const scene = scenes.find(s => s.name === name)
              const isActive = activeStates[scene?.id ?? ''] ?? false
              return (
                <button
                  key={name}
                  onClick={() => scene && toggleScene(scene.id)}
                  className={`pad flex flex-col items-center justify-center gap-1 p-2 border border-line rounded text-[9px] transition-colors ${
                    isActive 
                      ? 'bg-accent text-[#111] font-bold' 
                      : 'bg-panel2 text-zinc-200 hover:bg-accent hover:text-[#111]'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}