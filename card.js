// =============================================================
// card.js — Three.js scene + typing engine + sequencer.
// =============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scenes as defaultScenes, FAST_WORDS } from './letter.js';

// Prefer scenes from /edit.html (localStorage) over the placeholder in letter.js.
function loadScenes() {
  try {
    const raw = localStorage.getItem('letterScenes');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('localStorage scenes unreadable, using letter.js defaults', e);
  }
  return defaultScenes;
}
const scenes = loadScenes();

// =============================================================
// KEYMAP: bone names per character. Underwood scan = fused geometry,
// so this is empty and we use KEY_POSITIONS overlay for visual feedback.
// =============================================================
const KEYMAP = {};

// =============================================================
// KEY_WORLD — approximate 3D positions of each letter key on the
// post-auto-fit typewriter (typewriter occupies x = -1..1 after scale).
// Projected to screen each time, so dots stay aligned regardless of
// viewport size, aspect ratio, or fullscreen state.
// =============================================================
function row(chars, y, z, xStart, xStep) {
  const out = {};
  chars.forEach((c, i) => { out[c] = [xStart + i * xStep, y, z]; });
  return out;
}
const KEY_WORLD = {
  ...row(['q','w','e','r','t','y','u','i','o','p'], 0.34, 0.45, -0.65, 0.143),
  ...row(['a','s','d','f','g','h','j','k','l'],     0.22, 0.58, -0.58, 0.143),
  ...row(['z','x','c','v','b','n','m'],             0.10, 0.71, -0.43, 0.143),
  ',': [0.50, 0.10, 0.71],
  '.': [0.65, 0.10, 0.71],
  ' ': [0.0, -0.02, 0.78],
};

const _projectVec = new (class { constructor(){} })(); // placeholder, replaced below
// Use THREE.Vector3 lazily after import
let _kpVec = null;

function flashKey(c) {
  const lower = String(c).toLowerCase();
  const arr = KEY_WORLD[lower];
  if (!arr) return;
  if (!_kpVec) _kpVec = new THREE.Vector3();
  _kpVec.set(arr[0], arr[1], arr[2]).project(camera);
  const x = (_kpVec.x + 1) / 2 * window.innerWidth;
  const y = (-_kpVec.y + 1) / 2 * window.innerHeight;

  const layer = document.getElementById('key-overlay');
  if (!layer) return;
  const dot = document.createElement('div');
  dot.className = 'key-pulse';
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  layer.appendChild(dot);
  setTimeout(() => dot.remove(), 380);
}

// =============================================================
// Constants
// =============================================================
const GLB_PATH = 'assets/typewriter.glb';
const CLICK_PATH = 'assets/sounds/click.mp3';
const DING_PATH = 'assets/sounds/ding.mp3';

const PAPER_HEIGHT_PX = 1448;
const PAPER_WIDTH_PX = 808;  // matches narrowed plane (1.45 / 2.6 aspect)
const FONT_SIZE = 32;
const LINE_HEIGHT = 44;
const MARGIN_X = 70;
const MARGIN_Y = 110;
const MAX_TEXT_WIDTH = PAPER_WIDTH_PX - MARGIN_X * 2;

// =============================================================
// Three.js scene setup — 3/4 hero shot
// =============================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1410);

// 3/4 hero camera: above and to the right, looking at the platen
const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(2.4, 2.2, 3.6);
camera.lookAt(0, 0.6, 0);

// Lighting: warm key + cool fill, soft ambient
const keyLight = new THREE.DirectionalLight(0xfff0d4, 1.6);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xa8c8ff, 0.4);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

// Ground (subtle dark plane to catch falloff)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.4;
scene.add(ground);

// =============================================================
// Paper plane with live CanvasTexture
// =============================================================
const paperCanvas = document.createElement('canvas');
paperCanvas.width = PAPER_WIDTH_PX;
paperCanvas.height = PAPER_HEIGHT_PX;
const pctx = paperCanvas.getContext('2d');

function paintPaperBackground() {
  pctx.fillStyle = '#f4ead4';
  pctx.fillRect(0, 0, PAPER_WIDTH_PX, PAPER_HEIGHT_PX);
  // Subtle ruled-paper lines
  pctx.strokeStyle = 'rgba(150, 130, 100, 0.05)';
  pctx.lineWidth = 1;
  for (let y = MARGIN_Y; y < PAPER_HEIGHT_PX - MARGIN_Y; y += LINE_HEIGHT) {
    pctx.beginPath();
    pctx.moveTo(MARGIN_X - 20, y);
    pctx.lineTo(PAPER_WIDTH_PX - MARGIN_X + 20, y);
    pctx.stroke();
  }
}
paintPaperBackground();

const paperTexture = new THREE.CanvasTexture(paperCanvas);
paperTexture.colorSpace = THREE.SRGBColorSpace;
paperTexture.anisotropy = 8;

const paperMaterial = new THREE.MeshStandardMaterial({
  map: paperTexture,
  roughness: 0.95,
  metalness: 0,
  side: THREE.DoubleSide,
});

// Paper extends above and below typewriter so the bottom looks like
// it has been fed through the platen. Width is narrower than the
// typewriter base so the paper appears to fit through the platen.
const paperWorldHeight = 2.6;
const paperWorldWidth = 1.45;
const paperPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(paperWorldWidth, paperWorldHeight),
  paperMaterial
);
paperPlane.position.set(0, 1.15, -0.05);
paperPlane.rotation.x = -0.04;
scene.add(paperPlane);

// =============================================================
// Text engine — buffer + repaint approach (immediate mode).
// On every char we repaint the whole paper canvas with word-wrap.
// Cheap at 1024x1448 / ~20 fps, makes scrolling trivial.
// =============================================================
let textBuffer = '';

function wordWrap(text, maxWidth) {
  pctx.font = `${FONT_SIZE}px "Special Elite", monospace`;
  const paragraphs = text.split('\n');
  const lines = [];
  for (const para of paragraphs) {
    if (para === '') { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (pctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line !== '') lines.push(line);
  }
  return lines;
}

// TYPE_LINE_Y: middle-ish of canvas → middle of viewport in world Y →
// just above the typing bar. Latest line lands HERE. Older lines stack
// ABOVE in canvas (smaller Y), which maps to HIGHER in viewport.
// When older lines exceed top margin, they're clipped off (scrolled out).
const TYPE_LINE_Y = Math.round(PAPER_HEIGHT_PX * 0.55);
let _lastNewlineCount = 0;

function repaintPaper() {
  paintPaperBackground();
  pctx.font = `${FONT_SIZE}px "Special Elite", monospace`;
  pctx.fillStyle = '#1f1610';
  pctx.textBaseline = 'top';

  const lines = wordWrap(textBuffer, MAX_TEXT_WIDTH);
  // Render so the LAST line sits at TYPE_LINE_Y. Earlier lines stack
  // upward (smaller canvas Y → higher in viewport). Anything above
  // the top margin gets occluded by the fold gradient (scroll off effect).
  for (let i = 0; i < lines.length; i++) {
    const y = TYPE_LINE_Y - (lines.length - 1 - i) * LINE_HEIGHT;
    if (y < -LINE_HEIGHT) continue;                  // way off the top
    if (y > TYPE_LINE_Y) break;
    pctx.fillText(lines[i], MARGIN_X, y);
  }

  // Top-fold overlay: text fades into shadow at the top of the paper,
  // simulating the paper curling/rolling at the top of the visible area.
  const foldHeight = MARGIN_Y * 2.2;
  const grad = pctx.createLinearGradient(0, 0, 0, foldHeight);
  grad.addColorStop(0, 'rgba(40, 28, 18, 0.96)');
  grad.addColorStop(0.45, 'rgba(90, 65, 42, 0.55)');
  grad.addColorStop(0.85, 'rgba(180, 150, 110, 0.12)');
  grad.addColorStop(1, 'rgba(244, 234, 212, 0)');
  pctx.fillStyle = grad;
  pctx.fillRect(0, 0, PAPER_WIDTH_PX, foldHeight);

  paperTexture.needsUpdate = true;

  // Brief paper twitch up on each new line — visual carriage advance
  const newlineCount = (textBuffer.match(/\n/g) || []).length;
  if (newlineCount > _lastNewlineCount && window.gsap && paperPlane) {
    _lastNewlineCount = newlineCount;
    const baseY = paperPlane.userData._restY ?? paperPlane.position.y;
    if (paperPlane.userData._restY === undefined) paperPlane.userData._restY = baseY;
    window.gsap.fromTo(paperPlane.position, { y: baseY }, {
      y: baseY + 0.025, duration: 0.07, yoyo: true, repeat: 1, ease: 'power2.out',
    });
  }
}

// =============================================================
// Audio — Web Audio API with playbackRate jitter so identical
// click samples don't pattern-match as fake.
// =============================================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let clickBuffer = null;
let dingBuffer = null;

async function loadAudio(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return await audioCtx.decodeAudioData(arr);
  } catch (e) {
    console.warn(`Audio not loaded: ${url}`, e.message);
    return null;
  }
}

function playClick() {
  if (!clickBuffer) return;
  const src = audioCtx.createBufferSource();
  src.buffer = clickBuffer;
  src.playbackRate.value = 0.92 + Math.random() * 0.16; // 0.92 - 1.08
  const gain = audioCtx.createGain();
  gain.gain.value = 0.5;
  src.connect(gain).connect(audioCtx.destination);
  src.start();
}

function playDing() {
  if (!dingBuffer) return;
  const src = audioCtx.createBufferSource();
  src.buffer = dingBuffer;
  src.playbackRate.value = 0.98 + Math.random() * 0.04;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.6;
  src.connect(gain).connect(audioCtx.destination);
  src.start();
}

// =============================================================
// GLB loader + bone introspection
// =============================================================
let typewriterRoot = null;
const keyNodes = {};        // populated from KEYMAP after GLB loads
let carriageRoot = null;    // for thunk-shake fallback

const loader = new GLTFLoader();

function loadTypewriter() {
  return new Promise((resolve) => {
    loader.load(
      GLB_PATH,
      (gltf) => {
        typewriterRoot = gltf.scene;

        // Auto-fit: typewriter slightly smaller than the paper now
        const box = new THREE.Box3().setFromObject(typewriterRoot);
        const size = box.getSize(new THREE.Vector3());
        const targetWidth = 2.0;
        const scale = targetWidth / size.x;
        typewriterRoot.scale.setScalar(scale);

        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        typewriterRoot.position.set(-center.x, -box.min.y * scale - 0.4, -center.z);

        scene.add(typewriterRoot);

        // Expose for debugging — window.tw.scene, window.tw.nodes
        window.tw = { root: typewriterRoot, scene, camera };

        // === INTROSPECT: log every node so Hudson can build KEYMAP ===
        const nodes = [];
        typewriterRoot.traverse((node) => {
          if (node.name) {
            const pos = node.getWorldPosition(new THREE.Vector3());
            nodes.push({
              name: node.name,
              type: node.type,
              x: pos.x.toFixed(2),
              y: pos.y.toFixed(2),
              z: pos.z.toFixed(2),
            });
          }
        });
        window.tw.nodes = nodes;
        console.log(`=== GLB NODE INVENTORY: ${nodes.length} named nodes ===`);
        console.log('window.tw.nodes for full table; window.tw.root for THREE object');
        console.table(nodes.slice(0, 30));

        // Resolve KEYMAP entries to actual nodes
        for (const [char, nodeName] of Object.entries(KEYMAP)) {
          const node = typewriterRoot.getObjectByName(nodeName);
          if (node) {
            keyNodes[char] = node;
            // Cache rest position for spring-back
            node.userData.restY = node.position.y;
          } else {
            console.warn(`KEYMAP: node "${nodeName}" for char "${char}" not found in GLB.`);
          }
        }

        // Try to find a "carriage" or "body" root for the thunk shake
        carriageRoot = typewriterRoot.getObjectByName('Carriage')
          || typewriterRoot.getObjectByName('carriage')
          || typewriterRoot.getObjectByName('Body')
          || typewriterRoot;

        resolve(typewriterRoot);
      },
      undefined,
      (err) => {
        console.warn('GLB not found — using placeholder. Drop assets/typewriter.glb to use the real model.', err);
        buildPlaceholderTypewriter();
        resolve(null);
      }
    );
  });
}

function buildPlaceholderTypewriter() {
  // Simple boxy stand-in so the rest of the system is visible/testable.
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.6, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1f, roughness: 0.7 })
  );
  body.position.y = 0;
  group.add(body);

  const platen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 2.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.4 })
  );
  platen.rotation.z = Math.PI / 2;
  platen.position.set(0, 0.4, -0.4);
  group.add(platen);

  // Mock keyboard (5 rows of "keys")
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xf4ead4, roughness: 0.5 });
  const keyGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 10; col++) {
      const k = new THREE.Mesh(keyGeom, keyMat);
      k.position.set(
        -0.9 + col * 0.2 + (row % 2) * 0.1,
        0.32 + row * 0.04,
        0.1 + row * 0.18
      );
      group.add(k);
    }
  }

  group.position.y = -0.2;
  typewriterRoot = group;
  carriageRoot = group;
  scene.add(group);
}

// =============================================================
// Per-key animation
// =============================================================
function pressKey(char) {
  const lower = char.toLowerCase();
  const node = keyNodes[lower];

  if (node && window.gsap) {
    const restY = node.userData.restY ?? node.position.y;
    window.gsap.to(node.position, {
      y: restY - 0.015,
      duration: 0.04,
      ease: 'power1.in',
      onComplete: () => {
        window.gsap.to(node.position, {
          y: restY,
          duration: 0.08,
          ease: 'power2.out',
        });
      },
    });
  }
  // No typewriter shake — only the per-key ripple gives visual feedback.
  flashKey(lower);
}

// =============================================================
// Typing engine — variable pacing
// =============================================================
function delayForChar(c, isShortWord) {
  // Reading-comfortable pace ~ 180-200 wpm.
  if (c === '\n') return 360;
  if (c === '.') return 240;
  if (c === '?' || c === '!') return 220;
  if (c === ',' || c === ';' || c === ':') return 130;
  if (c === ' ') return 50;
  const base = 35 + Math.random() * 25; // 35-60ms
  return Math.round(isShortWord ? base * 0.7 : base);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pre-compute fast-word spans for the paragraph so we know which
// characters are inside a fast word.
function buildFastSpans(paragraph) {
  const spans = new Array(paragraph.length).fill(false);
  let i = 0;
  while (i < paragraph.length) {
    if (/[a-zA-Z']/.test(paragraph[i])) {
      let j = i;
      while (j < paragraph.length && /[a-zA-Z']/.test(paragraph[j])) j++;
      const word = paragraph.slice(i, j);
      if (FAST_WORDS.has(word) || FAST_WORDS.has(word.toLowerCase())) {
        for (let k = i; k < j; k++) spans[k] = true;
      }
      i = j;
    } else {
      i++;
    }
  }
  return spans;
}

async function typeParagraph(paragraph) {
  const fastSpans = buildFastSpans(paragraph);

  for (let i = 0; i < paragraph.length; i++) {
    const c = paragraph[i];
    textBuffer += c;
    repaintPaper();

    if (c !== '\n' && c !== ' ') {
      pressKey(c);
      playClick();
    } else if (c === '\n') {
      playDing();
    }

    await sleep(delayForChar(c, fastSpans[i]));
  }
}

// =============================================================
// Polaroid + doodle reveal
// =============================================================
// Scrapbook trail: polaroids accumulate left-to-right across the
// bottom of the viewport, slightly overlapping with random tilts.
// Position from scene config is IGNORED — auto-placement only.
let polaroidIndex = 0;
function showPolaroid(p) {
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'polaroid';

  // Polaroids land on the SIDES, well clear of the central paper area.
  // Alternating left/right columns, stacking down as more accumulate.
  const isLeft = polaroidIndex % 2 === 0;
  const xPct = isLeft ? 0.13 : 0.87;
  const yPct = 0.20 + (Math.floor(polaroidIndex / 2)) * 0.18;
  el.style.left = `${xPct * 100}vw`;
  el.style.top = `${yPct * 100}vh`;

  // Random tilt per polaroid for hand-placed feel
  const tilt = (Math.random() - 0.5) * 12;
  el.style.setProperty('--tilt', `${tilt}deg`);

  const img = document.createElement('img');
  img.src = p.src;
  img.onerror = () => {
    img.style.background = '#c9a987';
    img.removeAttribute('src');
  };
  el.appendChild(img);

  if (p.caption) {
    const cap = document.createElement('div');
    cap.className = 'caption';
    cap.textContent = p.caption;
    el.appendChild(cap);
  }

  document.getElementById('polaroids').appendChild(el);
  polaroidIndex++;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('visible'));
  });
}

async function showDoodle(d) {
  if (!d) return;
  const el = document.createElement('div');
  el.className = 'doodle';
  el.style.left = `${d.position.x * 100}vw`;
  el.style.top = `${d.position.y * 100}vh`;
  el.style.setProperty('--rot', `${d.rotation ?? 0}deg`);

  try {
    const res = await fetch(d.src);
    if (res.ok) {
      el.innerHTML = await res.text();
    } else {
      throw new Error('not found');
    }
  } catch {
    // Fallback inline doodle (heart) if SVG missing
    el.innerHTML = `<svg viewBox="0 0 100 100"><path d="M50 80 C 20 60, 10 30, 30 20 C 45 12, 50 30, 50 30 C 50 30, 55 12, 70 20 C 90 30, 80 60, 50 80 Z"/></svg>`;
  }

  document.getElementById('doodles').appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('draw'));
  });
}

// =============================================================
// Master sequencer
// =============================================================
async function runLetter() {
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (s.polaroid) showPolaroid(s.polaroid);
    if (s.doodle) showDoodle(s.doodle);
    // Small breath before typing so the polaroid/doodle is visible first
    await sleep(700);

    // Ensure paragraph break BETWEEN scenes — append \n if the
    // current paragraph doesn't already end with one. This guarantees
    // visual separation regardless of how the user wrote the text.
    let para = s.paragraph || '';
    if (i < scenes.length - 1 && !para.endsWith('\n\n')) {
      para = para.replace(/\n*$/, '') + '\n\n';
    }
    await typeParagraph(para);
  }
  // Letter complete — reveal the post-letter actions
  document.getElementById('post-actions')?.classList.add('visible');
}

// =============================================================
// Render loop
// =============================================================
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =============================================================
// Boot
// =============================================================
async function boot() {
  animate();

  const [_, click, ding] = await Promise.all([
    loadTypewriter(),
    loadAudio(CLICK_PATH),
    loadAudio(DING_PATH),
  ]);
  clickBuffer = click;
  dingBuffer = ding;

  // Hide loading overlay, show start button
  document.getElementById('loading').classList.add('gone');
  document.getElementById('start-overlay').classList.remove('hidden');

  document.getElementById('start-button').addEventListener('click', async () => {
    // Resume AudioContext (browsers require user gesture)
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    // Auto-enter fullscreen — user gesture required, this is one
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    document.getElementById('start-overlay').classList.add('hidden');
    runLetter();
  });

  // Save as PDF — opens print-friendly view of letter content
  document.getElementById('save-pdf-btn')?.addEventListener('click', () => {
    const w = window.open('letter-print.html', '_blank');
    // letter-print.html auto-triggers print on load
  });

  // Replay
  document.getElementById('replay-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
}

boot();
