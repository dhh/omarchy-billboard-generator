export function contrastRatio(a, b) {
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
    const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

export function backgroundWarnings(config) {
  if (!config.background || config.background === 'theme') return [];
  const messages = [];
  const ratio = contrastRatio(config.theme.background, config.theme.brand);
  if (ratio < 3) messages.push(`Low tagline contrast: ${ratio.toFixed(2)}:1 against the ${config.background} background (below 3:1). Choose a different theme or background for better readability.`);
  return messages;
}
