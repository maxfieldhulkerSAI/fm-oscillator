import { FmEngine } from './audio/fmEngine.js';
import { generateClip } from './audio/stableAudioClient.js';
import { attachKeyboardPlay } from './audio/keyboardPlay.js';
import { freqToMidi, midiToNoteName, quantizeFreqToNote } from './audio/notes.js';
import { createXYPad } from './xyPad.js';
import { PRESET_GROUPS } from './presets.js';

const engine = new FmEngine();
const clipHistory = []; // { prompt, blob, buffer, _url? }

const el = (id) => document.getElementById(id);

const expScale = (t, min, max) => min * Math.pow(max / min, t);

function ensureEngine() {
  if (!engine.ctx) engine.init();
}

function setStatus(text, kind = '') {
  const status = el('status');
  status.textContent = text;
  status.className = `status ${kind}`;
}

// --- API key ---------------------------------------------------------------

const API_KEY_STORAGE_KEY = 'stabilityApiKey';
const apiKeyInput = el('apiKey');
const toggleKeyBtn = el('toggleKeyBtn');

try {
  const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (savedKey) apiKeyInput.value = savedKey;
} catch {
  // localStorage unavailable (private browsing, etc.) — just skip persistence.
}

apiKeyInput.addEventListener('input', () => {
  try {
    if (apiKeyInput.value) localStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.value);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // ignore
  }
});

toggleKeyBtn.addEventListener('click', () => {
  const showing = apiKeyInput.type === 'text';
  apiKeyInput.type = showing ? 'password' : 'text';
  toggleKeyBtn.textContent = showing ? 'Show' : 'Hide';
});

// --- Modulation source ---------------------------------------------------

const durationInput = el('duration');
const durationVal = el('durationVal');
durationInput.addEventListener('input', () => {
  durationVal.textContent = durationInput.value;
});

const crossfadeInput = el('crossfade');
const crossfadeVal = el('crossfadeVal');
crossfadeInput.addEventListener('input', () => {
  crossfadeVal.textContent = Number(crossfadeInput.value).toFixed(1);
  ensureEngine();
  engine.setCrossfadeTime(Number(crossfadeInput.value));
});

const presetSelect = el('presetSelect');
const promptInput = el('prompt');

PRESET_GROUPS.forEach((group) => {
  const optgroup = document.createElement('optgroup');
  optgroup.label = group.label;
  group.presets.forEach((preset) => {
    const opt = document.createElement('option');
    opt.value = preset.label;
    opt.textContent = preset.label;
    optgroup.appendChild(opt);
  });
  presetSelect.appendChild(optgroup);
});

const allPresets = PRESET_GROUPS.flatMap((g) => g.presets);

presetSelect.addEventListener('change', () => {
  const preset = allPresets.find((p) => p.label === presetSelect.value);
  if (!preset) return;
  promptInput.value = preset.prompt;
  durationInput.value = String(preset.duration);
  durationVal.textContent = String(preset.duration);
});

const clipPreview = el('clipPreview');

function showPreview(entry) {
  if (!entry._url) entry._url = URL.createObjectURL(entry.blob);
  clipPreview.src = entry._url;
  clipPreview.style.display = 'block';
}

const historySelect = el('history');
historySelect.addEventListener('change', () => {
  const idx = Number(historySelect.value);
  if (Number.isInteger(idx) && clipHistory[idx]) {
    ensureEngine();
    engine.loadClip(clipHistory[idx].buffer);
    showPreview(clipHistory[idx]);
    setStatus(`Loaded from history: "${clipHistory[idx].prompt}"`, 'ready');
  }
});

function addToHistory(prompt, blob, buffer) {
  clipHistory.unshift({ prompt, blob, buffer });
  if (clipHistory.length > 8) {
    const evicted = clipHistory.pop();
    if (evicted._url) URL.revokeObjectURL(evicted._url);
  }

  historySelect.innerHTML = '';
  clipHistory.forEach((clip, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = clip.prompt.slice(0, 48) + (clip.prompt.length > 48 ? '…' : '');
    historySelect.appendChild(opt);
  });
  historySelect.value = '0';
}

const generateBtn = el('generateBtn');
generateBtn.addEventListener('click', async () => {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus('Enter a prompt first.', 'error');
    return;
  }

  ensureEngine();
  generateBtn.disabled = true;

  try {
    const blob = await generateClip(
      {
        prompt,
        duration: Number(durationInput.value),
        outputFormat: 'mp3',
      },
      {
        apiKey: apiKeyInput.value.trim(),
        onStatus: (status, info) => {
          if (status === 'submitting') setStatus('Submitting to Stable Audio 3…');
          else if (status === 'pending') {
            const seconds = Math.round((info.elapsedMs || 0) / 1000);
            setStatus(`Generating… ${seconds}s elapsed`);
          } else if (status === 'ready') setStatus('Decoding audio…');
        },
      }
    );

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);

    engine.loadClip(audioBuffer);
    addToHistory(prompt, blob, audioBuffer);
    showPreview(clipHistory[0]);
    setStatus(`Ready: "${prompt}" (${audioBuffer.duration.toFixed(1)}s)`, 'ready');
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, 'error');
  } finally {
    generateBtn.disabled = false;
  }
});

// --- Carrier ---------------------------------------------------------------

el('waveform').addEventListener('change', (e) => {
  ensureEngine();
  engine.setWaveform(e.target.value);
});

const carrierFreqInput = el('carrierFreq');
const carrierFreqVal = el('carrierFreqVal');
const snapToNotesInput = el('snapToNotes');

// Shared by the frequency slider and the computer-keyboard player so both
// keep the display and the underlying AudioParam in sync.
function setCarrierFreq(hz, { syncSlider = false } = {}) {
  ensureEngine();
  engine.setCarrierFrequency(hz);
  carrierFreqVal.textContent = `${Math.round(hz)} Hz (${midiToNoteName(freqToMidi(hz))})`;
  if (syncSlider) {
    const frac = Math.log(hz / 20) / Math.log(2000 / 20);
    carrierFreqInput.value = String(Math.min(1, Math.max(0, frac)));
  }
}

function updateCarrierFreqFromSlider() {
  let hz = expScale(Number(carrierFreqInput.value), 20, 2000);
  if (snapToNotesInput.checked) hz = quantizeFreqToNote(hz);
  setCarrierFreq(hz);
}
carrierFreqInput.addEventListener('input', updateCarrierFreqFromSlider);
snapToNotesInput.addEventListener('change', updateCarrierFreqFromSlider);

// --- FM depth / Filter / Pan — X/Y pads -------------------------------------

createXYPad(el('depthPad'), {
  xMin: 0, xMax: 3000, xLog: false,
  yMin: 0, yMax: 1, yLog: false,
  initialX: 300, initialY: 0,
  formatX: (v) => `${Math.round(v)} Hz`,
  formatY: (v) => v.toFixed(2),
  onChange: (x, y) => {
    ensureEngine();
    engine.setFmDepth(x);
    engine.setDepthEnvAmount(y);
  },
});

createXYPad(el('filterPad'), {
  xMin: 40, xMax: 12000, xLog: true,
  yMin: 0, yMax: 1, yLog: false,
  initialX: 2000, initialY: 0,
  formatX: (v) => `${Math.round(v)} Hz`,
  formatY: (v) => v.toFixed(2),
  onChange: (x, y) => {
    ensureEngine();
    engine.setFilterBaseCutoff(x);
    engine.setFilterEnvAmount(y);
  },
});

createXYPad(el('panPad'), {
  xMin: -1, xMax: 1, xLog: false,
  yMin: 0, yMax: 1, yLog: false,
  initialX: 0, initialY: 0,
  formatX: (v) => v.toFixed(2),
  formatY: (v) => v.toFixed(2),
  onChange: (x, y) => {
    ensureEngine();
    engine.setPanBase(x);
    engine.setPanEnvAmount(y);
  },
});

// --- Output ----------------------------------------------------------------

const volumeInput = el('volume');
const volumeVal = el('volumeVal');
volumeInput.addEventListener('input', () => {
  volumeVal.textContent = Number(volumeInput.value).toFixed(2);
  ensureEngine();
  engine.setMasterVolume(Number(volumeInput.value));
});

el('playBtn').addEventListener('click', async () => {
  ensureEngine();
  await engine.play(Number(volumeInput.value));
});

el('stopBtn').addEventListener('click', () => {
  ensureEngine();
  engine.stop();
});

// --- Keyboard play -----------------------------------------------------------

const activeNoteEl = el('activeNote');
const octaveValEl = el('octaveVal');

attachKeyboardPlay(engine, {
  getVolume: () => Number(volumeInput.value),
  ensureEngine,
  onNoteChange: (note, freq) => {
    activeNoteEl.textContent = note || '—';
    if (note && freq) setCarrierFreq(freq, { syncSlider: true });
  },
  onOctaveChange: (octave) => {
    octaveValEl.textContent = String(octave);
  },
});

// --- Initial sync of derived values (exp-scaled sliders) --------------------

updateCarrierFreqFromSlider();
