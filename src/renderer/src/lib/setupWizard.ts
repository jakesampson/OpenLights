// The setup wizard's step machine (Piece 5, LightKey Guide ch.4 pp.26–37
// and video 03:31–09:45). The wizard is the new-project flow: it walks
// through DMX Output, Fixture Patching, Build Your Preview, Fixture Groups,
// Light Beam Directions, and That's It, ending in the Design view. Every
// guide step ends with "click Next" — there is no Skip button in LightKey,
// and no resume for a half-finished wizard, so the machine has Back / Next
// only (Back from DMX Output returns to the Project Browser).

export type WizardStep = 'dmx' | 'patch' | 'preview' | 'groups' | 'directions' | 'done'

export const WIZARD_STEPS: { id: WizardStep; title: string; description: string }[] = [
  { id: 'dmx', title: 'DMX Output', description: 'Choose how OpenLights outputs DMX.' },
  { id: 'patch', title: 'Fixture Patching', description: 'Patch your fixtures to DMX channels.' },
  { id: 'preview', title: 'Build Your Preview', description: 'Move and resize the icons so they match the physical locations of your fixtures.' },
  { id: 'groups', title: 'Fixture Groups', description: 'Create groups of fixtures that will be selected together.' },
  { id: 'directions', title: 'Light Beam Directions', description: 'Please set the beam direction for each fixture.' },
  { id: 'done', title: "That's It", description: 'Have fun creating magic lightshows with Lightkey.' },
]

export function nextWizardStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.findIndex((s) => s.id === step)
  return index >= 0 && index < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[index + 1].id : null
}

export function previousWizardStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.findIndex((s) => s.id === step)
  return index > 0 ? WIZARD_STEPS[index - 1].id : null
}

export function wizardStepTitle(step: WizardStep): string {
  return WIZARD_STEPS.find((s) => s.id === step)?.title ?? step
}
