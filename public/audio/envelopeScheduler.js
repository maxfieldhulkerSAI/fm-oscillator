// Schedules a normalized 0..1 control curve onto an AudioParam in sync with
// a looping AudioBufferSourceNode, re-arming itself at each loop boundary.
//
// The curve is mapped to the param's actual range via `mapFn`. `loopStartTime`
// (set once, at construction) is the fixed phase origin — every full-cycle
// schedule lands on loopStartTime + k*loopDuration, so the envelope always
// stays locked to the audio-rate modulator's loop even after live edits.
//
// Calling setCurve/setMapFn applies the change immediately: it splices the
// updated curve into whatever's left of the *current* cycle (via a shorter
// setValueCurveAtTime covering just the remaining time), then resumes full
// loopDuration cycles from the next true boundary onward. That's what makes
// dragging a slider/pad while a clip is looping (which can run up to 60s)
// actually audible right away instead of waiting for the loop to wrap.
export class LoopEnvelope {
  constructor(audioContext, param, { curve, mapFn, loopDuration, loopStartTime }) {
    this.ctx = audioContext;
    this.param = param;
    this.curve = curve;
    this.mapFn = mapFn;
    this.loopDuration = loopDuration;
    this.loopStartTime = loopStartTime;
    this._timer = null;
    this._stopped = false;
    this._armLoop(loopStartTime);
  }

  setCurve(curve) {
    this.curve = curve;
    this._rescheduleNow();
  }

  setMapFn(mapFn) {
    this.mapFn = mapFn;
    this._rescheduleNow();
  }

  _mappedValues() {
    const out = new Float32Array(this.curve.length);
    for (let i = 0; i < this.curve.length; i++) out[i] = this.mapFn(this.curve[i]);
    return out;
  }

  // Schedules the full curve starting at a true loop boundary (`cycleStart`)
  // and arms a timer to repeat at the next one.
  _armLoop(cycleStart) {
    if (this._stopped) return;
    if (this._timer) clearTimeout(this._timer);

    const values = this._mappedValues();
    if (values.length >= 2) {
      try {
        this.param.cancelScheduledValues(cycleStart);
        this.param.setValueCurveAtTime(values, cycleStart, this.loopDuration);
      } catch (err) {
        console.warn('LoopEnvelope: failed to schedule value curve', err);
      }
    }

    const leadSeconds = 0.05;
    const msUntilNextLoop = Math.max(0, (cycleStart + this.loopDuration - this.ctx.currentTime - leadSeconds) * 1000);
    this._timer = setTimeout(() => {
      this._armLoop(cycleStart + this.loopDuration);
    }, msUntilNextLoop);
  }

  // Applies the current curve/mapFn right now, mid-cycle, then falls back to
  // normal full-cycle scheduling from the next boundary onward.
  _rescheduleNow() {
    if (this._stopped) return;
    if (this._timer) clearTimeout(this._timer);

    const now = this.ctx.currentTime;
    const cyclesElapsed = Math.floor((now - this.loopStartTime) / this.loopDuration);
    const cycleStart = this.loopStartTime + cyclesElapsed * this.loopDuration;
    const phaseElapsed = now - cycleStart;
    const remaining = this.loopDuration - phaseElapsed;

    const values = this._mappedValues();
    const sliceStart = Math.min(values.length - 2, Math.floor((phaseElapsed / this.loopDuration) * values.length));
    const slice = values.slice(Math.max(0, sliceStart));

    try {
      this.param.cancelScheduledValues(now);
      if (slice.length >= 2 && remaining > 0.02) {
        this.param.setValueCurveAtTime(slice, now, remaining);
      } else {
        this.param.setValueAtTime(values[values.length - 1], now);
      }
    } catch (err) {
      console.warn('LoopEnvelope: failed to reschedule value curve', err);
    }

    const nextCycleStart = cycleStart + this.loopDuration;
    const leadSeconds = 0.05;
    const msUntilNextLoop = Math.max(0, (nextCycleStart - this.ctx.currentTime - leadSeconds) * 1000);
    this._timer = setTimeout(() => {
      this._armLoop(nextCycleStart);
    }, msUntilNextLoop);
  }

  stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
  }
}
