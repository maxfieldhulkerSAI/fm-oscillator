// A generic draggable X/Y pad: horizontal axis controls one parameter,
// vertical axis controls another. Used wherever a panel used to be two
// separate sliders (a base value + a modulation amount).

function toFrac(v, min, max, log) {
  if (log) return Math.log(v / min) / Math.log(max / min);
  return (v - min) / (max - min);
}

function fromFrac(f, min, max, log) {
  const clamped = Math.min(1, Math.max(0, f));
  if (log) return min * Math.pow(max / min, clamped);
  return min + clamped * (max - min);
}

/**
 * @param {HTMLElement} mountEl
 * @param {{
 *   xMin: number, xMax: number, xLog?: boolean,
 *   yMin: number, yMax: number, yLog?: boolean,
 *   initialX: number, initialY: number,
 *   formatX?: (v: number) => string, formatY?: (v: number) => string,
 *   onChange: (x: number, y: number) => void,
 * }} opts
 */
export function createXYPad(mountEl, opts) {
  const {
    xMin, xMax, xLog = false,
    yMin, yMax, yLog = false,
    initialX, initialY,
    formatX = (v) => v.toFixed(2),
    formatY = (v) => v.toFixed(2),
    onChange,
  } = opts;

  mountEl.classList.add('xy-pad');
  mountEl.innerHTML = '';

  const handle = document.createElement('div');
  handle.className = 'xy-pad-handle';
  mountEl.appendChild(handle);

  const readout = document.createElement('div');
  readout.className = 'xy-pad-readout';
  mountEl.appendChild(readout);

  let x = initialX;
  let y = initialY;

  function render() {
    const fx = Math.min(1, Math.max(0, toFrac(x, xMin, xMax, xLog)));
    const fy = Math.min(1, Math.max(0, toFrac(y, yMin, yMax, yLog)));
    handle.style.left = `${fx * 100}%`;
    handle.style.top = `${(1 - fy) * 100}%`;
    readout.textContent = `${formatX(x)}  /  ${formatY(y)}`;
  }

  function setFromEvent(evt) {
    const rect = mountEl.getBoundingClientRect();
    const fx = (evt.clientX - rect.left) / rect.width;
    const fy = 1 - (evt.clientY - rect.top) / rect.height;
    x = fromFrac(fx, xMin, xMax, xLog);
    y = fromFrac(fy, yMin, yMax, yLog);
    render();
    onChange(x, y);
  }

  let dragging = false;
  mountEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    mountEl.setPointerCapture(e.pointerId);
    setFromEvent(e);
  });
  mountEl.addEventListener('pointermove', (e) => {
    if (dragging) setFromEvent(e);
  });
  mountEl.addEventListener('pointerup', () => {
    dragging = false;
  });
  mountEl.addEventListener('pointercancel', () => {
    dragging = false;
  });

  render();

  return {
    setX(v) {
      x = v;
      render();
    },
    setY(v) {
      y = v;
      render();
    },
    getX: () => x,
    getY: () => y,
  };
}
