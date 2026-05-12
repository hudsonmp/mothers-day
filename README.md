# Mother's Day Card

A photoreal 3D typewriter that types a handwritten letter character-by-character, with polaroid photos developing alongside paragraphs and hand-drawn doodles in the margins.

**Open source** (MIT). Bring your own letter, your own photos, your own doodles, your own deploy. No accounts, no tracking, no shared backend — your content lives in your browser's localStorage and only on whatever host you deploy it to.

## What's in the box

```
index.html              Three.js + GSAP scaffold
card.js                 Engine: 3D scene + typing + animations
letter.js               YOUR letter content (edit this!)
style.css               Polaroid + doodle styles
assets/
  typewriter.glb        3D model (you download separately — see below)
  photos/               Polaroids (your photos)
  doodles/              SVG doodles (heart, flower, sun, star)
  sounds/click.mp3      Typewriter key click
  sounds/ding.mp3       Bell on line return
```

## Setup

### 1. Get the typewriter GLB

Download from Sketchfab — Underwood 5 by Museum of Engineering Krakow:
https://sketchfab.com/3d-models/underwood-5-typewriter-ad4df24b943e4f6ea4b8336072b0d6ae

Pick the **GLB 1k texture (42MB)**. Save as `assets/typewriter.glb`.

License: CC-BY-NC-SA. Personal Mother's Day card qualifies as non-commercial. Attribution is in the footer.

If GLB is missing, the engine renders a placeholder typewriter so you can still test everything else.

### 2. Get sounds

From Pixabay (no login needed):
- Click sample: search "typewriter key" → save as `assets/sounds/click.mp3`
- Bell ding: search "typewriter bell" → save as `assets/sounds/ding.mp3`

If sounds are missing, typing happens silently — no other harm.

### 3. Add your photos

Drop 3-5 JPGs into `assets/photos/` (e.g. `photo1.jpg`, `photo2.jpg`...). They appear as polaroids tied to specific paragraphs.

These are gitignored so your mom's photos don't end up on the public repo.

### 4. Edit `letter.js`

This is the only file you edit for content. Each `scene` is one paragraph + optional photo + optional doodle:

```js
{
  paragraph: "Mom,\n\nIt's been a year of trolleys and cold emails...\n\n",
  polaroid: { src: "assets/photos/photo1.jpg", caption: "first day", position: { x: 0.85, y: 0.35 }, tilt: -4 },
  doodle: { src: "assets/doodles/heart.svg", position: { x: 0.12, y: 0.55 }, rotation: -8 },
}
```

Position is in normalized viewport coords [0..1] from top-left. e.g. `{x: 0.85, y: 0.4}` = 85% across, 40% down.

### 5. Run it

Two-line local server (Python comes preinstalled on macOS):

```bash
cd ~/mothers-day
python3 -m http.server 3001
```

Then open http://localhost:3001 — click "Open the letter" to start.

- `/edit` — content editor (auto-saves to localStorage)
- `/test` — same as `/` but with a "Skip to end" button to bypass the typing animation

## Development log: bone introspection

When the GLB loads, the console prints every node name in the model. To make individual keys depress per character, find the key bone names in the console table and add them to the `KEYMAP` at the top of `card.js`:

```js
const KEYMAP = {
  'a': 'Key_A',
  'b': 'Key_B',
  // ...
};
```

If keys aren't separately rigged (likely for the Underwood scan), the engine falls back to a subtle full-typewriter shake per character — the click sound + paper text appearing still sells the typing illusion.

## Pacing knobs

In `card.js` look for `delayForChar`. Tune these to match how your mom would read:
- `.` → 400ms (sentence pause)
- `,` → 220ms (clause pause)
- `\n` → 600ms + bell (paragraph break)
- default → 50–90ms jitter (typing rhythm)

## Deploy

This is a static site — `index.html` is the entry. Any host that serves files works.

### Vercel (recommended, free tier)
```bash
npm i -g vercel
vercel --prod
```
First run links the directory to a new Vercel project. **Vercel teams default to SSO Deployment Protection** — disable it on this project so your recipient doesn't hit a 401:
```bash
vercel project protection disable <project-name> --sso
```
Custom domains bypass SSO automatically; auto-generated `*.vercel.app` aliases don't.

### Railway / Cloudflare Pages / Netlify / GitHub Pages
All work the same way — point the host at this repo's root, no build command, no output directory (it serves `.` directly). The 70MB `assets/typewriter.glb` is well under any free tier's per-file limit but check your monthly bandwidth allowance if you expect heavy traffic.

### Privacy posture
- The personal photos in `assets/photos/` are **gitignored** so they never end up on a public GitHub fork. They DO get uploaded to whichever host you deploy to (Vercel / Railway / etc.) — anyone with the photo URL can fetch them.
- Use `.vercelignore` (or your host's equivalent) to swap in deploy-specific exclusions without touching `.gitignore`.
- For zero-server delivery, `letter-print.html` opens in a new tab as a fully self-contained print view.

## Credits

- Typewriter model: [Inlet via Sketchfab](https://sketchfab.com/3d-models/typewriter-rigged-and-ready-for-animation-3e206596358446069e3c3b9bf04830ef) (placeholder fallback uses Inlet's name in attribution; swap if using Underwood)
- Sounds: Pixabay (CC0)
- Built with Three.js + GSAP, no build step.

## License

MIT — see [LICENSE](./LICENSE). Bundled GLBs / sounds carry their own licenses (CC-BY-NC-SA for the Underwood typewriter; CC0 for Pixabay sounds).
