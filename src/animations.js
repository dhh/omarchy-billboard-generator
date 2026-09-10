import registry from '../data/animations.json' with { type: 'json' };

export const DEFAULT_ANIMATION = 'laseretch-campaign';
export const animations = [
  { id: DEFAULT_ANIMATION, name: 'laseretch - campaign', origin: 'campaign' },
  ...registry.effects.map(effect => ({ ...effect, provenance: registry.provenance })),
];
export function animationById(id = DEFAULT_ANIMATION) {
  if (typeof id !== 'string') throw Error('Animation must be text.');
  const animation = animations.find(item => item.id === id.toLowerCase());
  if (!animation) throw Error(`Unknown animation: ${id}. Use --list-animations.`);
  return animation;
}
