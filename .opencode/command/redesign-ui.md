---
description: Redesign the OpenLights main window to match the reference mockups
---
TASK: UI/UX redesign of the OpenLights main window. Layout and visual change
only. Do not change lighting, DMX, cue, MIDI or storage logic.

REFERENCES (read these first, they are in the repo):
- docs/design/reference-purple-design.png  (Design tab, purple theme)
- docs/design/reference-teal-live.png      (Live tab, teal theme)
- docs/design/layout-prototype.html        (simplified layout prototype; open it
  in a browser to see structure, proportions and theme tokens)
The screenshots are layout references only. Do not copy their icons, artwork
or branding. Match layout, proportions, spacing and colour as closely as practical.

LAYOUT
1. Top bar: project name centred, search/overrides on the sides, and a
   BLACKOUT/panic button that is always visible and prominent.
2. Main row: large stage preview filling the remaining width, resizing with the
   window and keeping its aspect ratio. Right column (~260pt): tree/list of
   groups and presets with coloured dots and a clear selected state.
3. Bottom row: tabbed panel (Design | Live, plus Edit) on the left, narrower
   Shortcuts panel on the right.
   - Design tab: vertical dimmer fader with percentage, colour wheel, vertical
     channel sliders, Shutter/Strobe (Open, Closed, Strobe, Pulse), Movement
     Speed (Tracking, Vector).
   - Live tab: dimmer fader plus grids of scene buttons under labelled
     headings; tapping toggles an active state.
   - Shortcuts panel: key-to-action list that follows the current tab.
4. Keep every existing menu item and feature. If a mockup element has no
   backing feature, add it as a visibly disabled stub instead of inventing behaviour.

STYLE
- Dark UI. Put colours, spacing and radii in one shared theme definition so the
  purple and teal looks are a theme swap, not duplicated views.
- Large, high-contrast, hard-to-mis-tap controls suited to live worship use.

PROCESS
1. Inspect the current main window code and list the views you will change.
2. Implement in small steps, building after each step.
3. Build and launch the app, screenshot the running window and compare with
   the references. Fix differences and repeat until it closely matches.
   If you cannot launch or screenshot the app, say so and stop after the code
   changes. Do not claim a visual match you did not verify.
4. Check minimum window size and full screen: nothing may overlap or clip.
5. Run the existing tests and confirm they pass.

OUTPUT: summarise what changed, files touched, and any stubbed or deviating
elements with reasons.

Extra notes from the user: $ARGUMENTS
