import { computeRmsEnvelope, computeSpectralCentroidEnvelope } from './analysis.js';
import { LoopEnvelope } from './envelopeScheduler.js';

// c = normalized 0..1 curve value, amt = 0..1 amount slider, base = center value.
// amt=0 always collapses to `base` regardless of c.
const multiplicativeMap = (c, amt, base) => base * (1 - amt + amt * c);
const panMap = (c, amt, base) => Math.max(-1, Math.min(1, base + amt * (c * 2 - 1)));
const depthMap = (c, amt, base) => Math.max(0, multiplicativeMap(c, amt, base));
const filterMap = (c, amt, base) => Math.max(40, multiplicativeMap(c, amt, base));

// Binds an extracted envelope curve to an AudioParam, with a base value and
// an "amount" that blends between a constant base (amount=0) and the base
// fully following the curve (amount=1). Lazily (re)creates a LoopEnvelope
// whenever a curve is attached or the amount goes from 0 to non-zero.
class MetaModTarget {
  constructor(param, mapFn, base) {
    this.param = param;
    this.mapFn = mapFn;
    this.base = base;
    this.amount = 0;
    this.envelope = null;
    this._clip = null;
  }

  _currentMapFn() {
    return (c) => this.mapFn(c, this.amount, this.base);
  }

  setBase(base) {
    this.base = base;
    if (this.envelope) this.envelope.setMapFn(this._currentMapFn());
    else this.param.value = base;
  }

  setAmount(amount) {
    this.amount = amount;
    if (amount <= 0) {
      if (this.envelope) {
        this.envelope.stop();
        this.envelope = null;
      }
      this.param.value = this.base;
      return;
    }
    if (this.envelope) {
      this.envelope.setMapFn(this._currentMapFn());
    } else if (this._clip) {
      this._startEnvelope(this._clip.ctx, this._clip.curve, this._clip.loopDuration, this._clip.loopStartTime0);
    }
  }

  attachCurve(ctx, curve, loopDuration, loopStartTime0) {
    this._clip = { ctx, curve, loopDuration, loopStartTime0 };
    if (this.envelope) {
      this.envelope.stop();
      this.envelope = null;
    }
    if (this.amount > 0) {
      this._startEnvelope(ctx, curve, loopDuration, loopStartTime0);
    } else {
      this.param.value = this.base;
    }
  }

  // Finds the next true loop boundary at/after `now` so the scheduled curve
  // stays phase-locked to loopStartTime0 + k*loopDuration forever, even if
  // this target's envelope is (re)started mid-loop.
  _startEnvelope(ctx, curve, loopDuration, loopStartTime0) {
    const now = ctx.currentTime;
    const cyclesElapsed = Math.max(0, Math.ceil((now - loopStartTime0) / loopDuration));
    const alignedStart = loopStartTime0 + cyclesElapsed * loopDuration;
    this.envelope = new LoopEnvelope(ctx, this.param, {
      curve,
      mapFn: this._currentMapFn(),
      loopDuration,
      loopStartTime: alignedStart,
    });
  }
}

export class FmEngine {
  constructor() {
    this.ctx = null;
    this.currentClip = null;
    this._chainA = null;
    this._chainB = null;
    this._activeChain = null;
    this.crossfadeTime = 1.5;
  }

  init() {
    if (this.ctx) return;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = 220;

    const modSum = ctx.createGain();
    modSum.gain.value = 1;

    const modIndexGain = ctx.createGain();
    modIndexGain.gain.value = 300;
    modSum.connect(modIndexGain);
    modIndexGain.connect(carrier.frequency);

    this._chainA = { gain: ctx.createGain(), source: null };
    this._chainB = { gain: ctx.createGain(), source: null };
    this._chainA.gain.gain.value = 0;
    this._chainB.gain.gain.value = 0;
    this._chainA.gain.connect(modSum);
    this._chainB.gain.connect(modSum);
    this._activeChain = this._chainA;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.7;

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;

    carrier.connect(filter);
    filter.connect(panner);
    panner.connect(masterGain);
    masterGain.connect(ctx.destination);

    carrier.start();

    this.carrier = carrier;
    this.filter = filter;
    this.panner = panner;
    this.masterGain = masterGain;
    this.modIndexGain = modIndexGain;

    this.depthTarget = new MetaModTarget(modIndexGain.gain, depthMap, 300);
    this.filterTarget = new MetaModTarget(filter.frequency, filterMap, 2000);
    this.panTarget = new MetaModTarget(panner.pan, panMap, 0);
  }

  async play(volume) {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(volume, now + 0.2);
  }

  stop() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + 0.2);
  }

  setMasterVolume(volume) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.masterGain.gain.value > 0.0001 || volume === 0) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(volume, now + 0.05);
    }
  }

  setWaveform(type) {
    if (this.carrier) this.carrier.type = type;
  }

  setCarrierFrequency(hz) {
    if (!this.ctx) return;
    this.carrier.frequency.cancelScheduledValues(this.ctx.currentTime);
    this.carrier.frequency.linearRampToValueAtTime(hz, this.ctx.currentTime + 0.05);
  }

  setCrossfadeTime(seconds) {
    this.crossfadeTime = seconds;
  }

  setFmDepth(hz) {
    this.depthTarget?.setBase(hz);
  }

  setFilterBaseCutoff(hz) {
    this.filterTarget?.setBase(hz);
  }

  setPanBase(v) {
    this.panTarget?.setBase(v);
  }

  setDepthEnvAmount(amount) {
    this.depthTarget?.setAmount(amount);
  }

  setFilterEnvAmount(amount) {
    this.filterTarget?.setAmount(amount);
  }

  setPanEnvAmount(amount) {
    this.panTarget?.setAmount(amount);
  }

  _idleChain() {
    return this._activeChain === this._chainA ? this._chainB : this._chainA;
  }

  /** Analyzes a freshly decoded clip and crossfades it in as the new modulator. */
  loadClip(audioBuffer) {
    const ctx = this.ctx;
    const rmsCurve = computeRmsEnvelope(audioBuffer);
    const centroidCurve = computeSpectralCentroidEnvelope(audioBuffer);

    const now = ctx.currentTime;
    const startAt = now + 0.05;
    const xfade = this.crossfadeTime;

    const incoming = this._idleChain();
    const outgoing = this._activeChain;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(incoming.gain);

    incoming.gain.gain.cancelScheduledValues(now);
    incoming.gain.gain.setValueAtTime(0, now);
    incoming.gain.gain.linearRampToValueAtTime(1, startAt + xfade);
    source.start(startAt);
    incoming.source = source;

    if (outgoing && outgoing.source) {
      outgoing.gain.gain.cancelScheduledValues(now);
      outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
      outgoing.gain.gain.linearRampToValueAtTime(0, startAt + xfade);
      const oldSource = outgoing.source;
      setTimeout(() => {
        try {
          oldSource.stop();
        } catch (err) {
          // already stopped, ignore
        }
      }, (xfade + 0.3) * 1000);
    }

    this._activeChain = incoming;

    this.currentClip = {
      rmsCurve,
      centroidCurve,
      loopDuration: audioBuffer.duration,
      loopStartTime: startAt,
    };

    this._applyEnvelopesForCurrentClip();
  }

  _applyEnvelopesForCurrentClip() {
    if (!this.currentClip) return;
    const { rmsCurve, centroidCurve, loopDuration, loopStartTime } = this.currentClip;
    this.depthTarget.attachCurve(this.ctx, rmsCurve, loopDuration, loopStartTime);
    this.filterTarget.attachCurve(this.ctx, centroidCurve, loopDuration, loopStartTime);
    this.panTarget.attachCurve(this.ctx, rmsCurve, loopDuration, loopStartTime);
  }
}
