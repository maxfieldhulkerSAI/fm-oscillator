import { midiToFreq, freqToMidi, midiToNoteName } from './notes.js';

// Standard "QWERTY piano" layout: bottom row is white/black keys starting
// at C, continuing onto the row above for the next few keys.
//   A  W  S  E  D  F  T  G  Y  H  U  J  K  O  L  P  ;
//   C  C# D  D# E  F  F# G  G# A  A# B  C  C# D  D# E
const KEY_TO_SEMITONE = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7,
  y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};

function isTypingTarget(target) {
  const tag = target && target.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || (target && target.isContentEditable);
}

/**
 * Wires the computer keyboard to the FM engine's carrier: monophonic,
 * last-note priority, with Z/X shifting octave down/up.
 *
 * @param {import('./fmEngine.js').FmEngine} engine
 * @param {{getVolume: () => number, ensureEngine?: () => void, onNoteChange?: (note: string|null) => void, onOctaveChange?: (octave: number) => void}} opts
 */
export function attachKeyboardPlay(engine, { getVolume, ensureEngine, onNoteChange, onOctaveChange } = {}) {
  let octave = 4; // 'a' = C4
  const held = [];

  const baseMidiForOctave = () => 12 * (octave + 1);
  const freqForKey = (key) => midiToFreq(baseMidiForOctave() + KEY_TO_SEMITONE[key]);

  function playFreq(freq) {
    engine.setCarrierFrequency(freq);
    onNoteChange?.(midiToNoteName(freqToMidi(freq)), freq);
  }

  function noteOn(key) {
    if (held.includes(key)) return;
    held.push(key);
    ensureEngine?.();
    if (held.length === 1) engine.play(getVolume());
    playFreq(freqForKey(key));
  }

  function noteOff(key) {
    const idx = held.indexOf(key);
    if (idx === -1) return;
    held.splice(idx, 1);
    if (held.length === 0) {
      engine.stop();
      onNoteChange?.(null);
    } else {
      playFreq(freqForKey(held[held.length - 1]));
    }
  }

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();

    if (key === 'z') {
      octave = Math.max(0, octave - 1);
      onOctaveChange?.(octave);
      return;
    }
    if (key === 'x') {
      octave = Math.min(8, octave + 1);
      onOctaveChange?.(octave);
      return;
    }
    if (e.repeat) return;
    if (KEY_TO_SEMITONE[key] !== undefined) {
      e.preventDefault();
      noteOn(key);
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (KEY_TO_SEMITONE[key] !== undefined) noteOff(key);
  });

  onOctaveChange?.(octave);
}
