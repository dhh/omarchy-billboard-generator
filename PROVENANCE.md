# Sources and third-party notices

Third-party materials are redistributed with permission. The project's MIT license applies only to original project code, not to the third-party materials and adaptations identified here. Public availability of a source is not itself a license grant. No trademark license or official endorsement is implied.

## Website data, artwork and animations

Source: [omacom/omarchy-site](https://github.com/omacom/omarchy-site).

- Theme/tagline snapshot: `5f908e4a85b8a4594be73db725906cf656660823`.
- Animation catalog, bindings and all-effects runtime: `47711270650b9c78c7bfa996cdd0b6050c79566f`.
- `data/upstream.json` records source paths and hashes for 22 palettes and 31 localized taglines, including the homepage's DHH attribution.
- `data/animations.json` records 37 effect IDs and upstream simulation rates from `src/lib/etch.ts`.
- `assets/website-etch/provenance.json` records binding/runtime and bitmap sources and hashes.
- `assets/official-wordmark.svg` retains the official 211-rectangle geometry. The website's 81×19 bitmap and campaign's 81×10 ASCII input describe the same branding at their respective cell resolutions.
- `web/website-simulation.js`, `web/website-animation.js` and `web/etch-cells.js` adapt the website's effect integration and `HeroPixelField.tsx` cell-painting rules.

Adaptations use fixed seed 42, precomputed seekable frames, canvas-derived viewports and a five-second opening, rather than the homepage's random selection, variable durations and interactive background. Website sync updates data only, never executable assets.

Website-derived content, artwork, bindings and adapted painting code are not licensed by this project's MIT license. No standalone license file was present in the inspected website revision; redistribution here relies on permission rather than an inferred open-source license.

## Campaign animation and palettes

The bundled campaign implementation preserves two independent native simulations, seeds 42 and 137, native effect colors and irregular ember packing. It is self-contained and needs no separate campaign repository.

Campaign material includes `assets/runtime/`, `web/independent-sparks.js`, `web/glyph-piles.js`, `web/simulation.js`, `web/campaign-animation.js`, and campaign-derived portions of `web/renderer.js`. Runtime bindings and playback are retained; viewport/floor mapping and layout integration are generalized. The native runtime and playback retain third-party rights and are not relicensed here.

`data/campaign-themes.json` contains Astral and Danish Dynamite palettes. Its fingerprint covers the JSON-serialized `themes` array. These palettes are independent of website sync. No reference photographs or videos are bundled.

`assets/provenance.json` records shipped file integrity and available public source references. The campaign-derived materials identified above are excluded from the original-code MIT grant unless independently licensed by their rights holders.

## Runtime path sanitization

Both bundled WASM binaries contain compiler-generated diagnostic strings. Home-directory prefixes in those strings were replaced with equal-length anonymous build prefixes before distribution. Binary sizes, offsets and instructions remain unchanged. The asset manifests record the resulting hashes, and the website runtime manifest also records the upstream binary hash. Animation and visual regression tests validate the sanitized binaries. No private build paths are needed at runtime.

## FIGlet suffix artwork

`assets/Delta-Corps-Priest-1.flf` credits **CoSMiC cHiLD** and patorjk.com's FIGFont Editor. Its original header and significant whitespace are retained. The font is redistributed with permission, not under this project's MIT license. The suffix builder preserves half-block anatomy and a condensed D. Digits, hyphens and dots are separately authored block constructions, not attributed to the original font.

## Typography

The following fonts retain their **SIL Open Font License 1.1** terms, with license texts included in `assets/fonts/`:

- JetBrains Mono Regular and Bold, verified against the pinned website fonts. License source: [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono).
- Noto Sans, Noto Sans JP, SC, KR, Arabic, Devanagari, Bengali, Sinhala, Tamil and Thai. Source: [google/fonts](https://github.com/google/fonts), commit `334b789e33413f3aba4264d9aa6c97f7b94c5a2f`.

Exact font and license paths, commits and SHA-256 values are in `assets/fonts/provenance.json` and `assets/provenance.json`. Font bytes are unmodified; local filenames may omit upstream variable-axis brackets. Normal rendering does not download fonts or silently substitute system fonts for missing tagline characters.

## Dependencies and custom palettes

npm dependencies retain the licenses distributed with their packages. Their licenses do not cover unrelated artwork or runtimes. Chromium and ffmpeg are installed separately through the system package manager, not bundled.

Custom JSON palettes are user-provided data. Their normalized content and checksum are captured for rendering without retaining input paths. `examples/aurora.json` is an original format example. Importing a palette does not grant rights to unrelated branding or assets.
