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
// KEY_TYPEWRITER_PCT — each key as a (x, y) percentage within the
// typewriter's projected screen bounding box. This stays accurate
// across any viewport / fullscreen because we recompute the bounds
// from the auto-fit typewriter every frame.
//
// Layout of the Underwood from the 3/4 hero shot:
//   Top row (Q-P)     ≈ y 0.45
//   Middle row (A-L)  ≈ y 0.58
//   Bottom row (Z-M)  ≈ y 0.71
//   Keys span x 0.12 → 0.78 (slightly inset from typewriter edges)
// =============================================================
function row(chars, y, xStart, xStep) {
  const out = {};
  chars.forEach((c, i) => { out[c] = [xStart + i * xStep, y]; });
  return out;
}
const KEY_TYPEWRITER_PCT = {
  ...row(['q','w','e','r','t','y','u','i','o','p'], 0.46, 0.115, 0.073),
  ...row(['a','s','d','f','g','h','j','k','l'],     0.58, 0.150, 0.073),
  ...row(['z','x','c','v','b','n','m'],             0.70, 0.190, 0.073),
  ',': [0.700, 0.70],
  '.': [0.770, 0.70],
  ' ': [0.500, 0.84],
};

const _kpVec = { _v: null };
function _vec3() {
  if (!_kpVec._v) _kpVec._v = new THREE.Vector3();
  return _kpVec._v;
}

function getTypewriterScreenBounds() {
  if (!typewriterRoot) return null;
  const box = new THREE.Box3().setFromObject(typewriterRoot);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const v = _vec3();
  const corners = [
    [box.min.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.min.z],
    [box.min.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.min.z],
    [box.min.x, box.min.y, box.max.z], [box.max.x, box.min.y, box.max.z],
    [box.min.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.max.z],
  ];
  for (const [x, y, z] of corners) {
    v.set(x, y, z).project(camera);
    const sx = (v.x + 1) / 2 * window.innerWidth;
    const sy = (-v.y + 1) / 2 * window.innerHeight;
    if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

// Calibrated key positions (from /?calibrate=1) override the defaults.
function loadKeyCalibration() {
  try {
    const raw = localStorage.getItem('keyCalibration');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}
let _calibratedPositions = loadKeyCalibration();

function getKeyPct(c) {
  return (_calibratedPositions && _calibratedPositions[c]) || KEY_TYPEWRITER_PCT[c];
}

function flashKey(c) {
  const lower = String(c).toLowerCase();
  const pct = getKeyPct(lower);
  if (!pct) return;
  const b = getTypewriterScreenBounds();
  if (!b) return;
  const x = b.left + pct[0] * b.width;
  const y = b.top + pct[1] * b.height;

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
const SCROLL_GLB_PATH = 'assets/scrolls.glb';
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
renderer.localClippingEnabled = true;

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

// scrollOffset: post-letter UI state. Positive = paper pulled down so
// older lines (originally clipped above) come into view at the type
// position. Only adjustable after letterCompleted = true.
let scrollOffset = 0;
let letterCompleted = false;

function repaintPaper() {
  paintPaperBackground();
  pctx.font = `${FONT_SIZE}px "Special Elite", monospace`;
  pctx.fillStyle = '#1f1610';
  pctx.textBaseline = 'top';

  const lines = wordWrap(textBuffer, MAX_TEXT_WIDTH);
  // Render so the LAST line sits at TYPE_LINE_Y, plus scrollOffset
  // (post-letter scrollback). Earlier lines stack upward.
  for (let i = 0; i < lines.length; i++) {
    const y = TYPE_LINE_Y - (lines.length - 1 - i) * LINE_HEIGHT + scrollOffset;
    if (y < -LINE_HEIGHT) continue;
    if (y > PAPER_HEIGHT_PX) break;
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
  // Audible for ~120ms then fades out — short enough that stacked clicks
  // at typing speed don't pile into background noise.
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.55, now);
  gain.gain.setValueAtTime(0.55, now + 0.09);
  gain.gain.linearRampToValueAtTime(0, now + 0.18);
  src.connect(gain).connect(audioCtx.destination);
  src.start();
  src.stop(now + 0.2);
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
let scrollRoot = null;      // 3D scroll model for PDF transition
const keyNodes = {};        // populated from KEYMAP after GLB loads
let carriageRoot = null;    // for thunk-shake fallback

const loader = new GLTFLoader();

// Refs to specific meshes inside the scroll GLB
let scrollOpenMesh = null;     // the unrolled / open scroll surface
let scrollClosedMeshes = [];   // the rolled-up scrolls

// Scroll crop bounds (world coords) — saved from /scroll-cal
function loadScrollCrop() {
  try {
    const raw = localStorage.getItem('scrollCrop');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function applyScrollCrop(p1, p2) {
  if (!scrollRoot) return;
  const minX = Math.min(p1[0], p2[0]);
  const maxX = Math.max(p1[0], p2[0]);
  const minY = Math.min(p1[1], p2[1]);
  const maxY = Math.max(p1[1], p2[1]);
  const planes = [
    new THREE.Plane(new THREE.Vector3( 1,  0, 0), -minX),
    new THREE.Plane(new THREE.Vector3(-1,  0, 0),  maxX),
    new THREE.Plane(new THREE.Vector3( 0,  1, 0), -minY),
    new THREE.Plane(new THREE.Vector3( 0, -1, 0),  maxY),
  ];
  scrollRoot.traverse(n => {
    if (n.material) {
      n.material.clippingPlanes = planes;
      n.material.clipShadows = true;
      n.material.side = THREE.DoubleSide; // both sides of the cut visible
    }
  });
  renderer.localClippingEnabled = true;
}

function loadScroll() {
  return new Promise((resolve) => {
    loader.load(
      SCROLL_GLB_PATH,
      (gltf) => {
        scrollRoot = gltf.scene;

        // Inventory all named meshes — we want to find the OPEN one (likely
        // larger/flatter) so we can project the letter text onto it.
        const meshes = [];
        scrollRoot.traverse((n) => {
          if (n.isMesh) {
            const b = new THREE.Box3().setFromObject(n);
            const sz = b.getSize(new THREE.Vector3());
            meshes.push({
              node: n, name: n.name,
              w: sz.x, h: sz.y, d: sz.z,
              flatness: Math.max(sz.x, sz.z) / Math.max(sz.y, 0.001),
            });
          }
        });
        console.log('=== SCROLL GLB MESHES ===');
        console.table(meshes.map(m => ({
          name: m.name, w: m.w.toFixed(2), h: m.h.toFixed(2), d: m.d.toFixed(2),
          flatness: m.flatness.toFixed(2),
        })));

        // Pick the flattest mesh (largest x*z relative to y) as the OPEN scroll
        meshes.sort((a, b) => b.flatness - a.flatness);
        scrollOpenMesh = meshes[0]?.node || null;
        scrollClosedMeshes = meshes.slice(1).map(m => m.node);
        console.log('Open scroll:', scrollOpenMesh?.name);
        console.log('Closed scrolls:', scrollClosedMeshes.map(m => m.name));

        // Rotate to vertical — scroll lies on a surface in the GLB,
        // tilt it up to face camera so the open parchment is readable.
        scrollRoot.rotation.x = -Math.PI / 2;

        // Auto-fit AFTER rotation so bounding box reflects the new orientation
        const box = new THREE.Box3().setFromObject(scrollRoot);
        const size = box.getSize(new THREE.Vector3());
        const targetHeight = 2.4;
        const scale = targetHeight / Math.max(size.y, 0.01);
        scrollRoot.scale.setScalar(scale);
        const c = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        scrollRoot.position.set(-c.x, -c.y, -c.z);

        scrollRoot.visible = false;
        scene.add(scrollRoot);

        // Apply saved transform FIRST (so world-space crop bounds line up)
        try {
          const t = JSON.parse(localStorage.getItem('scrollTransform') || 'null');
          if (t) {
            scrollRoot.rotation.set(t.rx, t.ry, t.rz);
            scrollRoot.position.set(t.px, t.py, t.pz);
            scrollRoot.scale.set(t.sx, t.sy, t.sz);
          } else {
            // Backwards compat: old rotation-only key
            const r = JSON.parse(localStorage.getItem('scrollRotation') || 'null');
            if (r) scrollRoot.rotation.set(r.x, r.y, r.z);
          }
        } catch {}

        // Then apply saved crop
        const savedCrop = loadScrollCrop();
        if (savedCrop && savedCrop.length === 2) {
          applyScrollCrop(savedCrop[0], savedCrop[1]);
        }

        // Expose for debugging
        window.scrollDebug = { root: scrollRoot, open: scrollOpenMesh, closed: scrollClosedMeshes, meshes };

        resolve(scrollRoot);
      },
      undefined,
      () => {
        console.warn('No scroll GLB at', SCROLL_GLB_PATH);
        resolve(null);
      }
    );
  });
}

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

    if (c === '\n') {
      flashKey('newline');
      playDing();
    } else if (c !== ' ') {
      pressKey(c);
      playClick();
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
const isTestMode = new URLSearchParams(location.search).has('test')
  || location.pathname.startsWith('/test');
const _calibrateParam = new URLSearchParams(location.search).get('calibrate');
const isCalibrate = _calibrateParam !== null
  || location.pathname.startsWith('/calibrate');
const calibrateOnlyKey = (_calibrateParam && _calibrateParam !== '1' && _calibrateParam !== '')
  ? _calibrateParam : null;

const isScrollCal = new URLSearchParams(location.search).has('scrollcal')
  || location.pathname.startsWith('/scroll-cal');

// Order in which calibration prompts each key
const CALIBRATE_KEYS = [
  '1','2','3','4','5','6','7','8','9','0',
  'q','w','e','r','t','y','u','i','o','p',
  'a','s','d','f','g','h','j','k','l',
  'z','x','c','v','b','n','m',
  ',','.',' ','newline','backspace',
];

function startCalibration(onlyKey = null) {
  // If onlyKey is set, calibrate just that one key and merge with existing
  const keysToCalibrate = onlyKey ? [onlyKey] : CALIBRATE_KEYS;
  const merging = !!onlyKey;

  const ui = document.createElement('div');
  ui.id = 'calibrate-ui';
  ui.innerHTML = `
    <div class="cal-prompt">
      <div class="cal-line">Click on the <span id="cal-key">Q</span> ${merging ? 'position' : 'key'}</div>
      <div class="cal-progress"><span id="cal-done">0</span> / ${keysToCalibrate.length}</div>
    </div>
    <button id="cal-skip" class="cal-btn">Skip this key</button>
    <button id="cal-undo" class="cal-btn">Undo last</button>
    <div id="cal-output" class="cal-output hidden"></div>
  `;
  document.body.appendChild(ui);

  let idx = 0;
  const captured = {};
  const order = [];

  function keyLabel(k) {
    if (k === ' ') return '␣ (spacebar)';
    if (k === 'newline') return '⏎ (Return / carriage return lever)';
    if (k === 'backspace') return '⌫ (Backspace position on typewriter)';
    return k.toUpperCase();
  }

  function update() {
    if (idx >= keysToCalibrate.length) {
      const code = formatCalibrateOutput(captured);
      const out = document.getElementById('cal-output');
      out.innerHTML = `
        <div class="cal-line">Calibration complete (${Object.keys(captured).length} keys).</div>
        <textarea readonly>${code}</textarea>
        <div class="cal-actions">
          <button id="cal-save" class="cal-btn primary">Save & apply</button>
          <button id="cal-restart" class="cal-btn">Restart</button>
        </div>
      `;
      out.classList.remove('hidden');
      document.querySelector('.cal-prompt').style.display = 'none';
      document.getElementById('cal-skip').style.display = 'none';
      document.getElementById('cal-undo').style.display = 'none';
      document.getElementById('cal-save').addEventListener('click', () => {
        // Merge with existing if calibrating just one key
        let toSave = captured;
        if (merging) {
          const existing = JSON.parse(localStorage.getItem('keyCalibration') || '{}');
          toSave = { ...existing, ...captured };
        }
        localStorage.setItem('keyCalibration', JSON.stringify(toSave));
        location.href = '/';
      });
      document.getElementById('cal-restart').addEventListener('click', () => location.reload());
      return;
    }
    document.getElementById('cal-key').textContent = keyLabel(keysToCalibrate[idx]);
    document.getElementById('cal-done').textContent = idx;
  }
  update();

  function captureClick(e) {
    if (idx >= keysToCalibrate.length) return;
    if (e.target.closest('#calibrate-ui')) return;
    const b = getTypewriterScreenBounds();
    if (!b) return;
    const pctX = (e.clientX - b.left) / b.width;
    const pctY = (e.clientY - b.top) / b.height;
    const key = keysToCalibrate[idx];
    captured[key] = [+pctX.toFixed(3), +pctY.toFixed(3)];
    order.push(key);
    // Show a pulse where they clicked (so they see what was captured)
    const layer = document.getElementById('key-overlay');
    if (layer) {
      const dot = document.createElement('div');
      dot.className = 'key-pulse';
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
      layer.appendChild(dot);
      setTimeout(() => dot.remove(), 380);
    }
    idx++;
    update();
  }
  document.addEventListener('click', captureClick);

  document.getElementById('cal-skip').addEventListener('click', () => {
    if (idx >= keysToCalibrate.length) return;
    idx++;
    update();
  });
  document.getElementById('cal-undo').addEventListener('click', () => {
    if (order.length === 0) return;
    const last = order.pop();
    delete captured[last];
    idx--;
    update();
  });
}

function startScrollCalibration() {
  if (!scrollRoot) { alert('Scroll model not loaded'); return; }

  // Hide typewriter for this page
  if (typewriterRoot) typewriterRoot.visible = false;

  // Show scroll big & centered, no clipping
  scrollRoot.visible = true;
  scrollRoot.traverse(n => {
    if (n.material) {
      n.material.transparent = false;
      n.material.opacity = 1;
      n.material.clippingPlanes = null;
    }
  });
  renderer.localClippingEnabled = false;

  // Reset to default orientation; user can rotate via buttons
  const restRotX = scrollRoot.rotation.x;
  const restRotY = scrollRoot.rotation.y;
  const restRotZ = scrollRoot.rotation.z;

  const restPos = scrollRoot.position.clone();
  const restScale = scrollRoot.scale.clone();

  // Step state (must be declared early so handlers below can reference it)
  let step = 1;
  let cropBoxScreen = null;
  let textBoxScreen = null;

  const ui = document.createElement('div');
  ui.id = 'scrollcal-ui';
  ui.innerHTML = `
    <div class="prompt">
      <div id="sc-step" class="cal-line">Step 1: drag the scroll to rotate. Use buttons to move/zoom.</div>
      <div class="rot-row">
        <button class="cal-btn" data-act="up">⬆</button>
        <button class="cal-btn" data-act="down">⬇</button>
        <button class="cal-btn" data-act="left">⬅</button>
        <button class="cal-btn" data-act="right">➡</button>
        <button class="cal-btn" data-act="zin">＋</button>
        <button class="cal-btn" data-act="zout">－</button>
        <button class="cal-btn" data-act="reset">reset</button>
      </div>
      <div class="cal-actions">
        <button id="sc-next1" class="cal-btn primary">Next: draw OPEN scroll box</button>
      </div>
    </div>
  `;
  document.body.appendChild(ui);

  const MOVE = 0.15;
  const ZOOM = 1.15;
  ui.querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.act;
      if (k === 'up') scrollRoot.position.y += MOVE;
      else if (k === 'down') scrollRoot.position.y -= MOVE;
      else if (k === 'left') scrollRoot.position.x -= MOVE;
      else if (k === 'right') scrollRoot.position.x += MOVE;
      else if (k === 'zin') scrollRoot.scale.multiplyScalar(ZOOM);
      else if (k === 'zout') scrollRoot.scale.multiplyScalar(1 / ZOOM);
      else if (k === 'reset') {
        scrollRoot.rotation.set(restRotX, restRotY, restRotZ);
        scrollRoot.position.copy(restPos);
        scrollRoot.scale.copy(restScale);
      }
    });
  });

  // Drag to rotate (only during step 1)
  let rotDrag = null;
  function rotDown(e) {
    if (step !== 1) return;
    if (e.target.closest('#scrollcal-ui')) return;
    rotDrag = { x: e.clientX, y: e.clientY, rx: scrollRoot.rotation.x, ry: scrollRoot.rotation.y };
  }
  function rotMove(e) {
    if (!rotDrag) return;
    const dx = (e.clientX - rotDrag.x) / 200;
    const dy = (e.clientY - rotDrag.y) / 200;
    scrollRoot.rotation.y = rotDrag.ry + dx;
    scrollRoot.rotation.x = rotDrag.rx + dy;
  }
  function rotUp() { rotDrag = null; }
  document.addEventListener('mousedown', rotDown);
  document.addEventListener('mousemove', rotMove);
  document.addEventListener('mouseup', rotUp);

  // Drag-to-draw box overlay
  const dragBox = document.createElement('div');
  dragBox.id = 'sc-dragbox';
  dragBox.style.cssText = 'position:fixed;border:2px dashed #f4d76a;background:rgba(244,215,106,0.12);z-index:48;pointer-events:none;display:none;';
  document.body.appendChild(dragBox);

  let dragStart = null;
  function onDown(e) {
    if (e.target.closest('#scrollcal-ui')) return;
    dragStart = { x: e.clientX, y: e.clientY };
    dragBox.style.display = 'block';
    dragBox.style.left = e.clientX + 'px';
    dragBox.style.top = e.clientY + 'px';
    dragBox.style.width = '0px';
    dragBox.style.height = '0px';
  }
  function onMove(e) {
    if (!dragStart) return;
    const x = Math.min(e.clientX, dragStart.x);
    const y = Math.min(e.clientY, dragStart.y);
    const w = Math.abs(e.clientX - dragStart.x);
    const h = Math.abs(e.clientY - dragStart.y);
    dragBox.style.left = x + 'px';
    dragBox.style.top = y + 'px';
    dragBox.style.width = w + 'px';
    dragBox.style.height = h + 'px';
  }

  // (step/cropBoxScreen/textBoxScreen declared earlier)

  function screenToWorldOnScroll(sx, sy) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((sx - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((sy - rect.top) / rect.height) * 2 - 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObject(scrollRoot, true);
    if (hits.length > 0) return hits[0].point.clone();
    // Fallback at scroll center depth
    const c = new THREE.Vector3();
    new THREE.Box3().setFromObject(scrollRoot).getCenter(c);
    const pt = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
    pt.z = c.z;
    return pt;
  }

  function onUp(e) {
    if (!dragStart) return;
    const x = Math.min(e.clientX, dragStart.x);
    const y = Math.min(e.clientY, dragStart.y);
    const w = Math.abs(e.clientX - dragStart.x);
    const h = Math.abs(e.clientY - dragStart.y);
    dragStart = null;
    if (w < 10 || h < 10) { dragBox.style.display = 'none'; return; }
    const screenBox = { x, y, w, h };

    if (step === 2) {
      cropBoxScreen = screenBox;
      // Apply crop (raycast 4 corners)
      const tl = screenToWorldOnScroll(x, y);
      const br = screenToWorldOnScroll(x + w, y + h);
      applyScrollCrop([tl.x, tl.y, tl.z], [br.x, br.y, br.z]);
      dragBox.style.display = 'none';
      step = 3;
      ui.querySelector('.prompt').innerHTML = `
        <div class="cal-line">Step 3: drag a box around the FLAT OPEN AREA where text goes</div>
        <div class="cal-actions">
          <button id="sc-skip-text" class="cal-btn">Skip (use whole crop)</button>
        </div>
      `;
      ui.querySelector('#sc-skip-text').addEventListener('click', () => {
        textBoxScreen = cropBoxScreen;
        finish();
      });
    } else if (step === 3) {
      textBoxScreen = screenBox;
      dragBox.style.display = 'none';
      finish();
    }
  }

  function finish() {
    step = 4;
    // Compute text region as screen-space % of viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    const textRegionPct = {
      left: textBoxScreen.x / vw,
      top: textBoxScreen.y / vh,
      width: textBoxScreen.w / vw,
      height: textBoxScreen.h / vh,
    };
    ui.querySelector('.prompt').innerHTML = `
      <div class="cal-line">Save crop + text region + orientation?</div>
      <div class="cal-actions">
        <button id="sc-save" class="cal-btn primary">Save & exit</button>
        <button id="sc-restart" class="cal-btn">Restart</button>
        <button id="sc-clear" class="cal-btn">Clear saved</button>
      </div>
    `;
    ui.querySelector('#sc-save').addEventListener('click', () => {
      const tl = screenToWorldOnScroll(cropBoxScreen.x, cropBoxScreen.y);
      const br = screenToWorldOnScroll(cropBoxScreen.x + cropBoxScreen.w, cropBoxScreen.y + cropBoxScreen.h);
      localStorage.setItem('scrollCrop', JSON.stringify([
        [tl.x, tl.y, tl.z], [br.x, br.y, br.z],
      ]));
      localStorage.setItem('scrollTextRegion', JSON.stringify(textRegionPct));
      // Save FULL transform — clip bounds are world-space, so the scroll
      // must come back to the exact same position/scale/rotation
      localStorage.setItem('scrollTransform', JSON.stringify({
        rx: scrollRoot.rotation.x, ry: scrollRoot.rotation.y, rz: scrollRoot.rotation.z,
        px: scrollRoot.position.x, py: scrollRoot.position.y, pz: scrollRoot.position.z,
        sx: scrollRoot.scale.x,    sy: scrollRoot.scale.y,    sz: scrollRoot.scale.z,
      }));
      location.href = '/';
    });
    ui.querySelector('#sc-restart').addEventListener('click', () => location.reload());
    ui.querySelector('#sc-clear').addEventListener('click', () => {
      localStorage.removeItem('scrollCrop');
      localStorage.removeItem('scrollTextRegion');
      localStorage.removeItem('scrollRotation');
      localStorage.removeItem('scrollTransform');
      location.href = '/';
    });
  }

  document.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  // Step 1 → Step 2 transition
  document.getElementById('sc-next1').addEventListener('click', () => {
    step = 2;
    ui.querySelector('.prompt').innerHTML = `
      <div class="cal-line">Step 2: drag a box around the WHOLE open scroll (crops out the closed scrolls)</div>
    `;
  });
}

function formatCalibrateOutput(captured) {
  const lines = [];
  for (const key of CALIBRATE_KEYS) {
    if (!captured[key]) continue;
    let k;
    if (key === ' ') k = "' '";
    else if (key === 'newline' || key === 'backspace') k = `'${key}'`;
    else k = `'${key}'`;
    lines.push(`  ${k}: [${captured[key][0]}, ${captured[key][1]}],`);
  }
  return 'const KEY_TYPEWRITER_PCT = {\n' + lines.join('\n') + '\n};';
}

function skipToEnd() {
  for (const s of scenes) {
    if (s.polaroid) showPolaroid(s.polaroid);
    if (s.doodle) showDoodle(s.doodle);
    let para = s.paragraph || '';
    if (!para.endsWith('\n\n')) para = para.replace(/\n*$/, '') + '\n\n';
    textBuffer += para;
  }
  repaintPaper();
  document.getElementById('post-actions')?.classList.add('visible');
  letterCompleted = true;
  document.body.style.setProperty('--paper-cursor', 'grab');
}

// =============================================================
// PDF transition: rip the paper off the typewriter, roll it into a
// scroll, unfurl into a print-ready letter document, then offer print.
// =============================================================

function playRip() {
  if (!audioCtx) return;
  const dur = 0.5;
  const sampleRate = audioCtx.sampleRate;
  const buf = audioCtx.createBuffer(1, dur * sampleRate, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    // White noise with sharp attack and exponential decay
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4) * (1 - Math.exp(-t * 30));
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3200;
  filter.Q.value = 1.2;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.22;
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start();
}

function buildPdfContent(container) {
  // Render scenes as a flat printable letter
  for (const scene of scenes) {
    if (scene.paragraph) {
      const p = document.createElement('div');
      p.className = 'pdf-para';
      p.textContent = scene.paragraph;
      container.appendChild(p);
    }
    if (scene.polaroid) {
      const row = document.createElement('div');
      row.className = 'pdf-photo-row';
      const ph = document.createElement('div');
      ph.className = 'pdf-photo';
      ph.style.setProperty('--tilt', `${scene.polaroid.tilt ?? 0}deg`);
      const img = document.createElement('img');
      img.src = scene.polaroid.src;
      img.onerror = () => { img.style.background = '#c9a987'; img.removeAttribute('src'); };
      ph.appendChild(img);
      if (scene.polaroid.caption) {
        const cap = document.createElement('div');
        cap.className = 'pdf-photo-caption';
        cap.textContent = scene.polaroid.caption;
        ph.appendChild(cap);
      }
      row.appendChild(ph);
      container.appendChild(row);
    }
  }
}

// Draw a dotted/perforated tear line that progressively appears across
// the paper canvas. Used during the rip phase before the paper lifts off.
function drawTearLine(progress) {
  const tearY = Math.round(PAPER_HEIGHT_PX * 0.55) + 10; // just below the type line
  const dashLength = 14;
  const gapLength = 6;
  const totalDashes = Math.floor(PAPER_WIDTH_PX / (dashLength + gapLength));
  const dashesToDraw = Math.floor(totalDashes * progress);
  pctx.fillStyle = '#1a1410';
  for (let i = 0; i < dashesToDraw; i++) {
    const x = i * (dashLength + gapLength);
    // Slight vertical wobble per dash for a hand-torn feel
    const yJitter = ((i * 37) % 5) - 2;
    pctx.fillRect(x, tearY + yJitter, dashLength, 3);
  }
  paperTexture.needsUpdate = true;
}

async function runPdfTransition() {
  if (!window.gsap) return;
  if (!scrollRoot) {
    console.warn('No scroll model loaded; opening print view directly');
    window.open('letter-print.html', '_blank');
    return;
  }

  // ===========================================================
  // PHASE 1 — TEAR: dotted perforation appears across the paper,
  //           then the paper lifts away as if torn off.
  // ===========================================================
  paperPlane.material.transparent = true;
  const paperBaseY = paperPlane.userData._restY ?? paperPlane.position.y;
  if (paperPlane.userData._restY === undefined) paperPlane.userData._restY = paperBaseY;

  // Draw the perforation line progressively (left → right)
  await gsap.to({}, {
    duration: 0.7,
    ease: 'power1.inOut',
    onUpdate: function () { drawTearLine(this.progress()); },
  });

  // Brief pause once the line is fully drawn
  await gsap.to({}, { duration: 0.15 });

  // Rip sound + lift the paper away with a slight tilt
  playRip();
  await gsap.timeline()
    .to(paperPlane.rotation, { z: 0.08, duration: 0.5, ease: 'power3.in' }, 0)
    .to(paperPlane.position, { y: paperBaseY + 1.4, duration: 0.55, ease: 'power3.in' }, 0)
    .to(paperPlane.material, { opacity: 0, duration: 0.35, ease: 'power1.in' }, 0.2)
    .then(() => {
      paperPlane.visible = false;
      paperPlane.rotation.z = 0;
      paperPlane.position.y = paperBaseY;
      paperPlane.material.opacity = 1;
    });

  // ===========================================================
  // PHASE 2 — VERTICAL SCROLL FADES IN as backdrop, then PDF text
  //           overlays directly on the open scroll's parchment surface.
  //           Text appears via center-out clip-path reveal with blur.
  // ===========================================================
  scrollRoot.visible = true;
  scrollRoot.traverse(n => {
    if (n.material) {
      n.material.transparent = true;
      n.material.opacity = 0;
    }
  });

  // Build text overlay positioned over the visible scroll area
  const pdfOverlay = document.createElement('div');
  pdfOverlay.className = 'pdf-transition scroll-mode';
  pdfOverlay.innerHTML = `
    <div class="scroll-text-region">
      <div class="pdf-content"></div>
      <div class="scroll-blur"></div>
    </div>
    <div class="pdf-actions">
      <button id="pdf-print-btn">Print / Save as PDF</button>
      <button id="pdf-back-btn">Back to letter</button>
    </div>
  `;
  document.body.appendChild(pdfOverlay);

  const textRegion = pdfOverlay.querySelector('.scroll-text-region');
  const pdfContent = pdfOverlay.querySelector('.pdf-content');
  const blur = pdfOverlay.querySelector('.scroll-blur');
  const pdfActions = pdfOverlay.querySelector('.pdf-actions');

  buildPdfContent(pdfContent);

  // If a text region was calibrated via /scroll-cal, position the
  // text-region element to match. Otherwise it uses CSS defaults.
  try {
    const r = JSON.parse(localStorage.getItem('scrollTextRegion') || 'null');
    if (r) {
      textRegion.style.position = 'absolute';
      textRegion.style.left = (r.left * 100) + 'vw';
      textRegion.style.top = (r.top * 100) + 'vh';
      textRegion.style.width = (r.width * 100) + 'vw';
      textRegion.style.height = (r.height * 100) + 'vh';
      textRegion.style.maxWidth = 'none';
      textRegion.style.maxHeight = 'none';
    }
  } catch {}

  // Initial state: overlay invisible, text hidden behind clip + full blur
  gsap.set(pdfOverlay, { opacity: 0 });
  gsap.set(pdfContent, { clipPath: 'inset(0 50% 0 50%)' });
  gsap.set(pdfActions, { opacity: 0, y: 20 });

  // Phase 2a: scroll fades in (3D), backdrop dims
  await gsap.timeline()
    .to({}, {
      duration: 0.8,
      onUpdate: function() {
        const o = this.progress();
        scrollRoot.traverse(n => { if (n.material) n.material.opacity = o; });
      },
    }, 0)
    .to(pdfOverlay, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.3);

  // Phase 2b: text reveals on the scroll, blur recedes from center
  await gsap.timeline()
    .to(pdfContent, {
      clipPath: 'inset(0 0% 0 0%)',
      duration: 1.6,
      ease: 'power2.out',
    }, 0)
    .to({}, {
      duration: 1.6,
      ease: 'power2.out',
      onUpdate: function() {
        const p = 1 - this.progress();
        blur.style.opacity = String(p * 0.55);
        blur.style.transform = `translate(-50%, -50%) scaleX(${0.05 + p * 0.95})`;
      },
    }, 0)
    .to(pdfActions, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.3');

  // ===========================================================
  // Wire up the print + close buttons
  // ===========================================================
  document.getElementById('pdf-print-btn').addEventListener('click', () => {
    document.body.classList.add('printing');
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('printing'), 100);
    });
  });
  document.getElementById('pdf-back-btn').addEventListener('click', () => {
    gsap.to(pdfOverlay, {
      opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: () => {
        pdfOverlay.remove();
        // Restore typewriter scene state
        paperPlane.material.opacity = 1;
        paperPlane.position.y = paperBaseY;
        paperPlane.visible = true;
      },
    });
  });
}

async function runLetter() {
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (s.polaroid) showPolaroid(s.polaroid);
    if (s.doodle) showDoodle(s.doodle);
    await sleep(700);

    let para = s.paragraph || '';
    if (i < scenes.length - 1 && !para.endsWith('\n\n')) {
      para = para.replace(/\n*$/, '') + '\n\n';
    }
    await typeParagraph(para);
  }
  document.getElementById('post-actions')?.classList.add('visible');
  letterCompleted = true;
  document.body.style.setProperty('--paper-cursor', 'grab');
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

// Two-finger scroll over the paper to scroll back through the typed
// letter. Only enabled after letter completes.
const _paperCorners = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
];
function isOverPaper(mx, my) {
  if (!paperPlane) return false;
  const w = paperPlane.geometry.parameters.width / 2;
  const h = paperPlane.geometry.parameters.height / 2;
  _paperCorners[0].set(-w, -h, 0);
  _paperCorners[1].set( w, -h, 0);
  _paperCorners[2].set( w,  h, 0);
  _paperCorners[3].set(-w,  h, 0);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of _paperCorners) {
    v.applyMatrix4(paperPlane.matrixWorld).project(camera);
    const sx = (v.x + 1) / 2 * window.innerWidth;
    const sy = (-v.y + 1) / 2 * window.innerHeight;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  return mx >= minX && mx <= maxX && my >= minY && my <= maxY;
}

window.addEventListener('wheel', (e) => {
  if (!letterCompleted) return;
  if (!isOverPaper(e.clientX, e.clientY)) return;
  e.preventDefault();
  const lines = wordWrap(textBuffer, MAX_TEXT_WIDTH);
  const maxScroll = Math.max(0, (lines.length - 1) * LINE_HEIGHT);
  scrollOffset = Math.max(0, Math.min(maxScroll, scrollOffset - e.deltaY * 0.5));
  repaintPaper();
}, { passive: false });

// After the letter completes, the user can keep typing on the paper.
// Real keyboard input is captured and appended to the text buffer.
window.addEventListener('keydown', (e) => {
  if (!letterCompleted) return;
  // Skip if user is typing in an input/textarea elsewhere
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  // Ignore modifier-only or function keys (let browser handle)
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  let c = null;
  if (e.key === 'Enter') c = '\n';
  else if (e.key === 'Backspace') {
    if (textBuffer.length > 0) {
      e.preventDefault();
      textBuffer = textBuffer.slice(0, -1);
      scrollOffset = 0;
      repaintPaper();
      flashKey('backspace');
      playClick();
    }
    return;
  }
  else if (e.key.length === 1) c = e.key;

  if (c) {
    e.preventDefault();
    textBuffer += c;
    scrollOffset = 0;
    repaintPaper();
    if (c === '\n') {
      flashKey('newline');
      playDing();
    } else if (c !== ' ') {
      flashKey(c);
      playClick();
    } else {
      flashKey(' ');
      playClick();
    }
  }
});

// =============================================================
// Boot
// =============================================================
async function boot() {
  animate();

  const [_, __, click, ding] = await Promise.all([
    loadTypewriter(),
    loadScroll(),
    loadAudio(CLICK_PATH),
    loadAudio(DING_PATH),
  ]);
  clickBuffer = click;
  dingBuffer = ding;

  document.getElementById('loading').classList.add('gone');

  if (isScrollCal) {
    const overlay = document.getElementById('start-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('start-button').textContent = 'Crop scroll (fullscreen)';
    document.querySelector('.start-hint').textContent = '(click top-left and bottom-right of the open scroll)';
    document.getElementById('start-button').addEventListener('click', async () => {
      try { await document.documentElement.requestFullscreen?.(); } catch {}
      requestAnimationFrame(() => requestAnimationFrame(() => {
        overlay.classList.add('hidden');
        startScrollCalibration();
      }));
    }, { once: true });
    return;
  }

  if (isCalibrate) {
    const overlay = document.getElementById('start-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('start-button').textContent = 'Calibrate (fullscreen)';
    document.querySelector('.start-hint').textContent = '(click each key as prompted)';
    if (calibrateOnlyKey) {
      document.getElementById('start-button').textContent = `Calibrate ${calibrateOnlyKey} (fullscreen)`;
    }
    document.getElementById('start-button').addEventListener('click', async () => {
      try { await document.documentElement.requestFullscreen?.(); } catch {}
      requestAnimationFrame(() => requestAnimationFrame(() => {
        overlay.classList.add('hidden');
        startCalibration(calibrateOnlyKey);
      }));
    }, { once: true });
    return;
  }

  document.getElementById('start-overlay').classList.remove('hidden');

  document.getElementById('start-button').addEventListener('click', async () => {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    document.getElementById('start-overlay').classList.add('hidden');
    runLetter();
  });

  // Inject Skip-to-end button in test mode
  if (isTestMode) {
    const overlay = document.getElementById('start-overlay');
    if (overlay && !document.getElementById('skip-end-btn')) {
      const skip = document.createElement('button');
      skip.id = 'skip-end-btn';
      skip.textContent = 'Skip to end';
      skip.style.cssText = 'margin-top:14px;padding:14px 28px;font-family:Special Elite,monospace;font-size:1.1rem;background:transparent;color:#f4ead4;border:1px solid #8b7355;border-radius:6px;cursor:pointer;';
      skip.addEventListener('click', async () => {
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        document.getElementById('start-overlay').classList.add('hidden');
        skipToEnd();
      });
      overlay.appendChild(skip);
    }
  }

  document.getElementById('save-pdf-btn')?.addEventListener('click', () => {
    runPdfTransition();
  });

  // Replay
  document.getElementById('replay-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
}

boot();
