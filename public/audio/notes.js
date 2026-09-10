// Equal-temperament note/frequency conversions, shared by the "snap to
// notes" carrier control and the computer-keyboard player.

const A4 = 440;
const A4_MIDI = 69;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToFreq(midi) {
  return A4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function freqToMidi(freq) {
  return A4_MIDI + 12 * Math.log2(freq / A4);
}

export function midiToNoteName(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function quantizeFreqToNote(freq) {
  return midiToFreq(Math.round(freqToMidi(freq)));
}
