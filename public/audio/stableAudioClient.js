// Stable Audio 3 client. Two modes, picked automatically at startup:
//
// - proxy:  the page is served by server.js, so requests go to /api/* and the
//           server adds the API key (from .env, or from the UI field via the
//           x-stability-key header).
// - direct: the page is served statically (GitHub Pages, any file host), so
//           the browser calls api.stability.ai itself with the key from the
//           UI field. The API allows cross-origin requests, so no proxy is
//           needed. Nothing is stored anywhere except this browser's
//           localStorage.
//
// Generation is asynchronous in both modes: submit, then poll until ready.

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // ~5 minutes ceiling

const STABILITY_GENERATE_URL = 'https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio';
const STABILITY_RESULTS_URL = 'https://api.stability.ai/v2beta/audio/results';

const DEFAULTS = { duration: 12, seed: 0, steps: 8, cfgScale: 1, outputFormat: 'mp3' };

let modePromise = null;

/**
 * Resolves to 'proxy' when server.js is answering, otherwise 'direct'.
 * Probed once and cached.
 * @returns {Promise<'proxy'|'direct'>}
 */
export function getMode() {
  if (!modePromise) {
    modePromise = fetch('api/health', { cache: 'no-store' })
      .then((res) => (res.ok ? 'proxy' : 'direct'))
      .catch(() => 'direct');
  }
  return modePromise;
}

async function submitViaProxy(params, apiKey) {
  const keyHeaders = apiKey ? { 'x-stability-key': apiKey } : {};
  const res = await fetch('api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...keyHeaders },
    body: JSON.stringify(params),
  });
  return { res, poll: (id) => fetch(`api/status/${encodeURIComponent(id)}`, { headers: keyHeaders }) };
}

async function submitDirect(params, apiKey) {
  if (!apiKey) {
    throw new Error('Enter your Stability API key above. This hosted version talks to the API straight from your browser.');
  }
  const p = { ...DEFAULTS, ...params };
  const form = new FormData();
  form.append('prompt', p.prompt);
  form.append('model', 'stable-audio-3');
  form.append('duration', String(p.duration));
  form.append('seed', String(p.seed));
  form.append('steps', String(p.steps));
  form.append('cfg_scale', String(p.cfgScale));
  form.append('output_format', p.outputFormat);

  const headers = { authorization: `Bearer ${apiKey}`, accept: 'audio/*' };
  const res = await fetch(STABILITY_GENERATE_URL, { method: 'POST', headers, body: form });
  return { res, poll: (id) => fetch(`${STABILITY_RESULTS_URL}/${encodeURIComponent(id)}`, { headers }) };
}

/**
 * @param {{prompt: string, duration?: number, seed?: number, steps?: number, cfgScale?: number, outputFormat?: string}} params
 * @param {{onStatus?: (status: string, info?: object) => void, apiKey?: string}} [callbacks]
 * @returns {Promise<Blob>}
 */
export async function generateClip(params, { onStatus, apiKey } = {}) {
  onStatus?.('submitting');

  const mode = await getMode();
  const { res: genRes, poll } = mode === 'proxy'
    ? await submitViaProxy(params, apiKey)
    : await submitDirect(params, apiKey);

  if (genRes.status !== 202) {
    const errText = await genRes.text();
    throw new Error(`Generate request failed (${genRes.status}): ${errText}`);
  }

  const { id } = await genRes.json();
  onStatus?.('pending', { id, elapsedMs: 0 });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusRes = await poll(id);

    if (statusRes.status === 202) {
      onStatus?.('pending', { id, elapsedMs: (attempt + 1) * POLL_INTERVAL_MS });
      continue;
    }

    if (statusRes.status === 200) {
      onStatus?.('ready', { id });
      return await statusRes.blob();
    }

    const errText = await statusRes.text();
    throw new Error(`Generation failed (${statusRes.status}): ${errText}`);
  }

  throw new Error('Timed out waiting for generation to complete');
}
