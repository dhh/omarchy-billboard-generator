// Interface colors never enter the billboard's renderer configuration.
export async function startDesktopTheme(api) {
  let stopped = false, timer;
  const refresh = async () => {
    try {
      const theme = await api('/api/desktop-theme');
      if (stopped) return;
      const root = document.documentElement;
      for (const [key, value] of Object.entries(theme.variables)) root.style.setProperty(key, value);
      root.style.colorScheme = theme.mode;
      root.dataset.desktopTheme = theme.name;
    } catch { /* Retain the current interface palette on transient failures. */ }
    finally { if (!stopped) timer = setTimeout(refresh, 2000); }
  };
  await refresh();
  return () => { stopped = true; clearTimeout(timer); };
}
