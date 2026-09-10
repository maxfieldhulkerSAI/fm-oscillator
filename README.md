# FM Oscillator × Stable Audio 3

A real-time FM synthesizer whose modulator is a generated Stable Audio 3 clip.
The clip drives the carrier two ways at once:

- **Audio-rate**: the raw waveform is looped and fed directly into the
  carrier's `frequency` AudioParam (classic Web Audio FM — no custom DSP).
- **Control-rate**: an RMS amplitude envelope and a spectral-centroid
  ("brightness") envelope are extracted from the clip and used to modulate
  the FM depth, filter cutoff, and stereo pan, phase-locked to the clip's
  loop.

## Setup

```
npm install
cp .env.example .env   # then edit .env and set STABILITY_API_KEY
npm start
```

Open http://localhost:3000.

## How it's wired

- `server.js` — Express static file server + a thin proxy for two Stability
  endpoints (`text-to-audio`, `results/:id`). The API key lives only in
  `.env` on the server; the browser never sees it.
- `public/audio/stableAudioClient.js` — submits a generation request and
  polls until the clip is ready (generation is asynchronous, typically
  several seconds to ~a minute).
- `public/audio/analysis.js` — extracts the RMS and spectral-centroid
  envelopes from the decoded clip.
- `public/audio/envelopeScheduler.js` — schedules those envelopes onto
  AudioParams in sync with the clip's loop boundaries.
- `public/audio/fmEngine.js` — the actual Web Audio graph: carrier
  oscillator, dual crossfading modulator chains (so a new clip fades in
  without clicks), filter, and panner.

## Notes

- Clip length defaults to 12s — short loops make more sense as a modulator
  than the API's 380s ceiling.
- The "amount" sliders blend between a constant base value (0) and the base
  fully tracking the envelope (1). They only take effect once a clip has
  been generated.
- Pad/slider changes to the depth/filter/pan envelopes apply immediately,
  splicing into whatever's left of the current loop rather than waiting for
  it to wrap — see `envelopeScheduler.js`.
