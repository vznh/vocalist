# Vocalist UI defaults

Use a 4 px corner radius and a corner smoothing value of 2.5. The shared defaults live in `src/styles/base.css` as `--corner-radius` and `--corner-smoothing`. Use those tokens for new UI and preserve the defaults during unrelated design changes. The development corner controls start from the same values.

# File map

Open only the file for the area you are changing.

- `src/App.tsx` holds app state, playback and modal wiring. Each component is its own file in `src/components`. `src/hooks` holds the queue subscription (`useQueue`), zoom (`useZoom`) and window focus (`useWindowFocused`). `src/api.ts` holds the preload API and shared formatting helpers.
- `src/style.css` only imports the stylesheets. Each area has its own file in `src/styles`, such as `queue.css`, `song.css`, `timing.css`, `zoom.css` or `update.css`. Keep the import order, because later files override earlier ones.
- `shared/karaoke.mjs` holds `drawKaraoke` and the four-line karaoke renderer. `shared/scrolling.mjs` holds the Rolling mode. `shared/colors.mjs` holds singer colors and album palettes. `shared/karaoke-common.mjs` holds the frame size, fonts and text unit helpers.
- `electron/engine.mjs` holds the queue and processing pipeline. `electron/demo.mjs` holds the demo track.
- `scripts/lib/mp4.mjs` holds the MP4 checks the smoke scripts share.
