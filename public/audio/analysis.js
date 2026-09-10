// Offline analysis of a decoded AudioBuffer: extracts control-rate envelopes
// (amplitude, spectral brightness) used to modulate the FM engine's
// secondary targets. Runs once per generated clip, not in the audio thread.

function mixToMono(buffer) {
  const { numberOfChannels, length } = buffer;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numberOfChannels;
  }
  return mono;
}

function nextPow2(n) {
  return 1 << Math.ceil(Math.log2(Math.max(1, n)));
}

// Iterative in-place radix-2 Cooley-Tukey FFT. `re`/`im` are same-length
// Float64Arrays sized to a power of two.
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const bIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + half] = aRe - bRe;
        im[i + k + half] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

function normalize(values) {
  let max = 0;
  for (const v of values) max = Math.max(max, v);
  if (max <= 0) return values;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] / max;
  return out;
}

/** Windowed RMS amplitude envelope, normalized 0..1. */
export function computeRmsEnvelope(buffer, hopSize = 2048) {
  const mono = mixToMono(buffer);
  const hops = Math.max(1, Math.ceil(mono.length / hopSize));
  const env = new Float32Array(hops);

  for (let h = 0; h < hops; h++) {
    const start = h * hopSize;
    const end = Math.min(start + hopSize, mono.length);
    let sumSq = 0;
    for (let i = start; i < end; i++) sumSq += mono[i] * mono[i];
    env[h] = Math.sqrt(sumSq / Math.max(1, end - start));
  }

  return normalize(env);
}

/**
 * Short-time spectral centroid envelope, normalized 0..1 as a fraction of
 * Nyquist (i.e. a "brightness" curve — 0 is bass-heavy, 1 is treble-heavy).
 */
export function computeSpectralCentroidEnvelope(buffer, fftSize = 2048, hopSize = 1024) {
  const mono = mixToMono(buffer);
  const n = nextPow2(fftSize);
  const nyquist = buffer.sampleRate / 2;
  const hops = Math.max(1, Math.ceil(mono.length / hopSize));
  const env = new Float32Array(hops);

  const window = new Float64Array(n);
  for (let i = 0; i < n; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));

  const re = new Float64Array(n);
  const im = new Float64Array(n);

  for (let h = 0; h < hops; h++) {
    const start = h * hopSize;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n; i++) {
      const sampleIdx = start + i;
      re[i] = sampleIdx < mono.length ? mono[sampleIdx] * window[i] : 0;
    }

    fft(re, im);

    let weightedSum = 0;
    let magSum = 0;
    const half = n / 2;
    for (let bin = 0; bin < half; bin++) {
      const mag = Math.hypot(re[bin], im[bin]);
      weightedSum += bin * mag;
      magSum += mag;
    }

    const centroidBin = magSum > 0 ? weightedSum / magSum : 0;
    const centroidHz = (centroidBin * buffer.sampleRate) / n;
    env[h] = Math.min(1, centroidHz / nyquist);
  }

  return env;
}
