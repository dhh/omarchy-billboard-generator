# Custom theme files

Use a UTF-8 JSON palette, not a script or an Omarchy desktop `colors.toml` file. Start with [examples/aurora.json](examples/aurora.json).

## CLI

```bash
./bin/omarchy-billboard \
  --theme-file examples/aurora.json \
  --animation laseretch \
  --language da --tld .dk \
  --resolution 1920x1080 \
  --output aurora.mp4
```

Use `--theme-file` instead of `--theme`, not together. Relative theme-file and output paths are resolved from your current directory. The output directory must exist; existing videos require `--force` to replace. `--background black` or `--background white` can override the file's background without changing its artwork colors.

The file is read once for a render and is never modified. The renderer and verifier reuse the captured palette, so changing the file during export cannot change colors halfway through the video.

## App

1. Click **Import theme** below **Billboard theme**.
2. Choose your JSON file.
3. The validated palette is selected and marked **Custom**. Preview and export use the same data.

Invalid imports leave the previous selection and preview available. Imports preserve playing/paused state and frame position, like other palette changes. Changing the Animation dropdown still has its separate restart-while-playing behavior.

Imported palettes remain available for the current app session, including after website sync. Re-import the file after restarting the app. Up to 32 distinct palettes can be imported per session. Identical normalized data is deduplicated; changed data receives a different identity, even when the name matches. Importing does not install or change your desktop theme.

## Format

All fields shown below are required. Unknown fields are rejected to catch mistakes. Do not add comments, trailing commas, scripts, URLs, file paths or CSS expressions.

```json
{
  "schemaVersion": 1,
  "name": "My palette",
  "light": false,
  "background": "#101827",
  "brand": "#6ee7b7",
  "cursor": "#fbbf24",
  "gradient": [
    { "color": "#d1fae5", "from": 0, "to": 30 },
    { "color": "#34d399", "from": 30, "to": 65 },
    { "color": "#047857", "from": 65, "to": 100 }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Must be the number `1` |
| `name` | Display name, 1 to 80 characters, without control characters |
| `light` | Boolean, normally `true` for a light background; selects the campaign effect's contrast treatment |
| `background` | Canvas background |
| `brand` | Tagline text color |
| `cursor` | Tagline typing cursor color |
| `gradient` | Logo bands, ordered from top to bottom; also supplies website-animation theme inks |

Colors must be opaque six-digit `#RRGGBB` hex values. Uppercase hex is accepted and normalized to lowercase. There must be 1 to 32 gradient bands, covering 0 through 100 percent with no gaps or overlaps. Each band's `to` must equal the next band's `from`; every band must have positive height. A single band from 0 to 100 produces a solid-color logo. File size is limited to **16 KiB**.

Theme files control colors, not fonts, text, animation code or resolution. All animations accept custom palettes. **laseretch - campaign** retains its original laser/spark colors and irregular piles; the custom palette colors its settled logo, tagline and cursor. Website animations use the custom palette's nearest-brightness inks.

Low tagline contrast still produces a warning rather than silently recoloring or blocking the render. Inspect the preview, particularly when combining a bright palette with a white background override.

## Reproducibility and privacy

Custom themes have a separate `custom:` identity derived from SHA-256 of their normalized data. They do not replace website/campaign themes or acquire upstream provenance. MP4 metadata records the normalized palette, its checksum, custom origin and the effective background override. The source file's path is not stored in video metadata.

The app reads the file through the browser's file picker and sends its contents only to its authenticated loopback backend. It does not accept filesystem paths through the import API or fetch remote theme assets. Website sync never overwrites imported data or the original file. Neither importing nor using a palette grants rights to unrelated bundled branding or animation assets.
