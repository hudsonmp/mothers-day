// =============================================================
// letter.js — the only file Hudson edits to swap in real content.
//
// Each scene is one paragraph + an optional polaroid + an optional
// doodle. Polaroids and doodles appear BEFORE their paragraph types,
// so they accompany the text rather than interrupting it.
//
// "position" is in normalized viewport coords [0..1] from top-left.
// e.g. {x: 0.85, y: 0.4} = 85% across, 40% down.
// =============================================================

export const scenes = [
  {
    paragraph: "Mom,\n\nIt's been a year of trolleys and cold emails. None of it would have happened without you.\n\n",
    polaroid: {
      src: "assets/photos/photo1.jpg",
      caption: "first day at UCSD",
      position: { x: 0.85, y: 0.35 },
      tilt: -4,
    },
    doodle: null,
  },
  {
    paragraph: "I think about the drive to the trolley station every morning. You never made me feel like a burden, even when I was asking for the fifth ride that week.\n\n",
    polaroid: null,
    doodle: {
      src: "assets/doodles/heart.svg",
      position: { x: 0.12, y: 0.55 },
      rotation: -8,
    },
  },
  {
    paragraph: "Thank you for trusting me to drop out. Most parents wouldn't have. You read the EV email, looked at me, and said \"do it.\"\n\n",
    polaroid: {
      src: "assets/photos/photo2.jpg",
      caption: "EV grant day",
      position: { x: 0.86, y: 0.65 },
      tilt: 5,
    },
    doodle: null,
  },
  {
    paragraph: "I love you. I'll bring you to CMU when I get there.\n\n— Hudson",
    polaroid: {
      src: "assets/photos/photo3.jpg",
      caption: "us, last summer",
      position: { x: 0.14, y: 0.78 },
      tilt: 3,
    },
    doodle: {
      src: "assets/doodles/flower.svg",
      position: { x: 0.88, y: 0.85 },
      rotation: 12,
    },
  },
];

// Words that should be typed faster (they read in chunks, not letter-by-letter
// when humans actually type). Pacing multiplier 0.6× across these spans.
export const FAST_WORDS = new Set([
  "the", "and", "I", "a", "of", "to", "is", "it", "in", "on", "at",
  "for", "with", "you", "me", "my", "your", "be", "was", "were",
]);
