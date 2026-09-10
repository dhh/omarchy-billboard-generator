import campaign from '../data/campaign-themes.json' with { type: 'json' };

// Campaign palettes are bundled separately. Sync never writes or replaces them.
export function availableThemes(snapshot) {
  const local = campaign.themes.map(theme => ({
    id: theme.id, name: theme.name, origin: 'campaign', light: false,
    background: theme.background, brand: theme.brand, cursor: theme.cursor,
    gradient: theme.bands.map((color, i) => ({ color, from: theme.stops[i] * 100, to: theme.stops[i + 1] * 100 })),
    provenance: { ...campaign.source, sourceId: theme.sourceId },
  }));
  for (const theme of local) {
    if (snapshot.themes.some(upstream => upstream.id === theme.id)) throw Error(`Website theme ID ${theme.id} conflicts with a bundled campaign theme. Update the theme adapter to disambiguate them.`);
  }
  return [...snapshot.themes.map(theme => ({ ...theme, origin: 'website', provenance: { repository: snapshot.repository, commit: snapshot.commit } })), ...local];
}
