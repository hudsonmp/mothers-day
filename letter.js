// =============================================================
// letter.js — placeholder template. Edit via /edit or replace
// these scenes directly. Each scene is one paragraph + optional
// polaroid + optional doodle. Polaroids/doodles render before
// the paragraph types, so they accompany the text.
//
// Once you set scenes via /edit they're saved to localStorage
// and override this file. To deploy a baked version, replace
// these objects with your content.
// =============================================================

export const scenes = [
  {
    paragraph: "Mom,\n\nThis is the placeholder letter. Open /edit to write your own — your scenes save to localStorage and load automatically.\n\n",
    polaroid: null,
    doodle: null,
  },
  {
    paragraph: "Each paragraph types onto the page at reading speed. Add a polaroid or a doodle per scene and they appear alongside the text.\n\n",
    polaroid: null,
    doodle: {
      src: "assets/doodles/heart.svg",
      position: { x: 0.12, y: 0.55 },
      rotation: -8,
    },
  },
  {
    paragraph: "When you're done, scroll back through the letter, type a response in red, or save it as a PDF.\n\n— the template",
    polaroid: null,
    doodle: null,
  },
];

// Words that should be typed faster (they read in chunks, not letter-by-letter
// when humans actually type). Pacing multiplier 0.6× across these spans.
export const FAST_WORDS = new Set([
  "the", "and", "I", "a", "of", "to", "is", "it", "in", "on", "at",
  "for", "with", "you", "me", "my", "your", "be", "was", "were",
]);
