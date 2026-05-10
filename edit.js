// =============================================================
// edit.js — letter scene editor.
// Persists to localStorage. card.js reads from there if present,
// otherwise falls back to letter.js placeholder.
// =============================================================

import { scenes as defaultScenes } from './letter.js';

const STORAGE_KEY = 'letterScenes';
const DOODLE_OPTIONS = ['', 'assets/doodles/heart.svg', 'assets/doodles/flower.svg', 'assets/doodles/sun.svg', 'assets/doodles/star.svg'];

// =============================================================
// State + persistence
// =============================================================

function loadScenes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Bad localStorage scenes — falling back to defaults', e);
  }
  // Deep-clone defaults so editing doesn't mutate the import
  return JSON.parse(JSON.stringify(defaultScenes));
}

function saveScenes(scenes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
  localStorage.setItem(STORAGE_KEY + ':savedAt', String(Date.now()));
  showSavedIndicator();
}

let _savedTimer = null;
function showSavedIndicator() {
  const el = document.getElementById('saved-indicator');
  if (!el) return;
  el.textContent = '✓ Saved';
  el.classList.add('visible');
  clearTimeout(_savedTimer);
  _savedTimer = setTimeout(() => {
    el.classList.remove('visible');
    el.textContent = 'Auto-saving';
  }, 1200);
}

// Scroll position persistence
const SCROLL_KEY = 'letterScenes:scrollY';
window.addEventListener('scroll', () => {
  sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
});
window.addEventListener('load', () => {
  const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10);
  if (y > 0) window.scrollTo(0, y);
});

let scenes = loadScenes();

// =============================================================
// Render the form
// =============================================================

const scenesEl = document.getElementById('scenes');

function render() {
  scenesEl.innerHTML = '';
  scenes.forEach((scene, idx) => {
    scenesEl.appendChild(renderScene(scene, idx));
  });
}

function renderScene(scene, idx) {
  const card = document.createElement('section');
  card.className = 'scene-card';
  card.dataset.idx = idx;

  card.innerHTML = `
    <div class="scene-header">
      <h3>Paragraph ${idx + 1}</h3>
      <button class="btn-danger" data-action="delete">Delete</button>
    </div>

    <div class="field">
      <label>Text — what gets typed onto the paper</label>
      <textarea data-field="paragraph" placeholder="Mom, I wanted to say...">${escapeHtml(scene.paragraph || '')}</textarea>
    </div>

    <div class="field-group">
      <div class="field-group-header">
        <h4>Polaroid photo</h4>
      </div>
      <div class="toggle-line">
        <input type="checkbox" id="poloff-${idx}" data-toggle="polaroid" ${scene.polaroid ? 'checked' : ''}>
        <label for="poloff-${idx}">Show a polaroid with this paragraph</label>
      </div>
      <div class="polaroid-fields ${scene.polaroid ? '' : 'collapsed'}">
        <div class="field">
          <label>Image path or URL</label>
          <input type="text" data-field="polaroid.src" value="${escapeAttr(scene.polaroid?.src || 'assets/photos/photo1.jpg')}" placeholder="assets/photos/photo1.jpg">
        </div>
        <div class="field">
          <label>Caption (handwritten under photo)</label>
          <input type="text" data-field="polaroid.caption" value="${escapeAttr(scene.polaroid?.caption || '')}" placeholder="first day at UCSD">
        </div>
        <div class="field-row">
          <div class="field">
            <label>X position (0-1)</label>
            <input type="text" data-field="polaroid.position.x" value="${scene.polaroid?.position?.x ?? 0.85}">
          </div>
          <div class="field">
            <label>Y position (0-1)</label>
            <input type="text" data-field="polaroid.position.y" value="${scene.polaroid?.position?.y ?? 0.4}">
          </div>
          <div class="field">
            <label>Tilt (degrees)</label>
            <input type="text" data-field="polaroid.tilt" value="${scene.polaroid?.tilt ?? -4}">
          </div>
        </div>
      </div>
    </div>

    <div class="field-group">
      <div class="field-group-header">
        <h4>Doodle</h4>
      </div>
      <div class="toggle-line">
        <input type="checkbox" id="dodoff-${idx}" data-toggle="doodle" ${scene.doodle ? 'checked' : ''}>
        <label for="dodoff-${idx}">Show a self-drawing doodle</label>
      </div>
      <div class="doodle-fields ${scene.doodle ? '' : 'collapsed'}">
        <div class="field">
          <label>Doodle</label>
          <select data-field="doodle.src">
            ${DOODLE_OPTIONS.map(o => `<option value="${o}" ${(scene.doodle?.src || '') === o ? 'selected' : ''}>${o ? o.split('/').pop().replace('.svg','') : '(none)'}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>X position (0-1)</label>
            <input type="text" data-field="doodle.position.x" value="${scene.doodle?.position?.x ?? 0.12}">
          </div>
          <div class="field">
            <label>Y position (0-1)</label>
            <input type="text" data-field="doodle.position.y" value="${scene.doodle?.position?.y ?? 0.55}">
          </div>
          <div class="field">
            <label>Rotation (degrees)</label>
            <input type="text" data-field="doodle.rotation" value="${scene.doodle?.rotation ?? -8}">
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire up handlers
  card.addEventListener('input', (e) => onFieldChange(idx, e));
  card.addEventListener('change', (e) => onFieldChange(idx, e));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteScene(idx));
  return card;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// =============================================================
// Field change handler
// =============================================================

function onFieldChange(idx, e) {
  const target = e.target;

  // Toggle for polaroid/doodle
  if (target.dataset.toggle === 'polaroid') {
    if (target.checked) {
      scenes[idx].polaroid = scenes[idx].polaroid || {
        src: 'assets/photos/photo1.jpg',
        caption: '',
        position: { x: 0.85, y: 0.4 },
        tilt: -4,
      };
    } else {
      scenes[idx].polaroid = null;
    }
    saveScenes(scenes);
    render();
    return;
  }
  if (target.dataset.toggle === 'doodle') {
    if (target.checked) {
      scenes[idx].doodle = scenes[idx].doodle || {
        src: 'assets/doodles/heart.svg',
        position: { x: 0.12, y: 0.55 },
        rotation: -8,
      };
    } else {
      scenes[idx].doodle = null;
    }
    saveScenes(scenes);
    render();
    return;
  }

  if (!target.dataset.field) return;
  const path = target.dataset.field.split('.');
  let val = target.value;
  // Coerce numeric fields
  if (['x', 'y', 'tilt', 'rotation'].includes(path[path.length - 1])) {
    const n = parseFloat(val);
    if (!isNaN(n)) val = n;
  }

  // Walk into the scene object
  let obj = scenes[idx];
  for (let i = 0; i < path.length - 1; i++) {
    if (obj[path[i]] == null) obj[path[i]] = {};
    obj = obj[path[i]];
  }
  obj[path[path.length - 1]] = val;
  saveScenes(scenes);
}

// =============================================================
// Add / delete scenes
// =============================================================

function addScene() {
  scenes.push({
    paragraph: '',
    polaroid: null,
    doodle: null,
  });
  saveScenes(scenes);
  render();
  // Scroll to new scene
  const last = scenesEl.lastElementChild;
  last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function deleteScene(idx) {
  if (!confirm(`Delete paragraph ${idx + 1}?`)) return;
  scenes.splice(idx, 1);
  saveScenes(scenes);
  render();
}

// =============================================================
// Export → letter.js source
// =============================================================

function exportLetterJs() {
  const body = scenes.map(scene => {
    const obj = { paragraph: scene.paragraph };
    if (scene.polaroid) obj.polaroid = scene.polaroid;
    else obj.polaroid = null;
    if (scene.doodle) obj.doodle = scene.doodle;
    else obj.doodle = null;
    return '  ' + JSON.stringify(obj, null, 2).replace(/\n/g, '\n  ');
  }).join(',\n');

  return `// Generated by /edit.html on ${new Date().toISOString()}
export const scenes = [
${body}
];

export const FAST_WORDS = new Set([
  "the", "and", "I", "a", "of", "to", "is", "it", "in", "on", "at",
  "for", "with", "you", "me", "my", "your", "be", "was", "were",
]);
`;
}

// =============================================================
// Toast
// =============================================================

function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

// =============================================================
// Wire up the chrome
// =============================================================

document.getElementById('add-scene').addEventListener('click', addScene);

document.getElementById('preview').addEventListener('click', () => {
  // Just open / — card.js will read localStorage
  window.open('/', '_blank');
});

document.getElementById('export').addEventListener('click', () => {
  document.getElementById('export-text').value = exportLetterJs();
  document.getElementById('export-panel').classList.remove('hidden');
});

document.getElementById('close-export').addEventListener('click', () => {
  document.getElementById('export-panel').classList.add('hidden');
});

document.getElementById('copy-export').addEventListener('click', async () => {
  const text = document.getElementById('export-text').value;
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Press Cmd+C to copy', 3000);
  }
});

// Initial render
render();
