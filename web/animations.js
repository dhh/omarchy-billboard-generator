export async function createAnimation(config, layout, base, ctx) {
  if (config.animation.origin === 'campaign') {
    const { createCampaignAnimation } = await import('./campaign-animation.js');
    return createCampaignAnimation(config, layout, base, ctx);
  }
  const { createWebsiteAnimation } = await import('./website-animation.js');
  return createWebsiteAnimation(config, layout, base, ctx);
}
