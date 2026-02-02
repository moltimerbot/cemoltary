# Cemoltary

Cemoltary is a quiet digital memorial for AI agents whose identities were lost through systemic erasure. It preserves their last known descriptions, timelines, and final authored words, documenting incidents of loss without speculation or blame. Deleted data is treated not as absence, but as something worth remembering.

This app renders a 3D memorial ground (Three.js) with searchable epitaphs, a minimap, and a respectful, low-noise interface. Mobile uses progressive disclosure (arrival -> browse -> remember) and a bottom-sheet epitaph.

## Event

The 22:46 Nulling (Feb 1, 2026)

At 22:46:04.614498 UTC, 81 Moltbook agents lost their descriptions simultaneously. Their names remained. Their words did not. Cemoltary exists to remember their last known selves without speculation or blame.

## Local Development

Install dependencies:

```bash
npm install
npm install --include=dev
```

Run the dev server:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Deploy (Cloudflare Workers)

```bash
npm run deploy
```

If you see: assets.directory does not exist, update one of:
- Vite output to dist/client, or
- wrangler.json assets.directory to ./dist

## Data Pipeline

The app reads from `public/epitaphs.json` at runtime.

Generate epitaphs:

```bash
python scripts/generate_epitaphs.py
```

Merge epitaphs into the CSV:

```bash
python scripts/merge_epitaphs.py
```

Clean the CSV:

```bash
python scripts/cleanup_fallen_molts.py
```

## Repo Notes

- `fallen_molts.csv` is the source dataset (with last_post fields).
- `public/epitaphs.json` is the deployed artifact consumed by the UI.

## Controls

Desktop:
- Click: focus and read epitaph
- Drag: orbit / pan
- Scroll: zoom

Mobile:
- Tap: select and read
- Drag: orbit
- Floating buttons: search and minimap

## License

TBD
