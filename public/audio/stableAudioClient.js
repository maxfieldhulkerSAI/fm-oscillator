// Talks to our own backend proxy (never the Stability API directly — the
// API key stays server-side). Generation is asynchronous: submit, then poll.

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // ~5 minutes ceiling

/**
 * @param {{prompt: string, duration?: number, seed?: number, steps?: number, cfgScale?: number, outputFormat?: string}} params
 * @param {{onStatus?: (status: string, info?: object) => void, apiKey?: string}} [callbacks]
 * @returns {Promise<Blob>}
 */
export async function generateClip(params, { onStatus, apiKey } = {}) {
  onStatus?.('submitting');

  const keyHeaders = apiKey ? { 'x-stability-key': apiKey } : {};

  const genRes = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...keyHeaders },
    body: JSON.stringify(params),
  });

  if (genRes.status !== 202) {
    const errText = await genRes.text();
    throw new Error(`Generate request failed (${genRes.status}): ${errText}`);
  }

  const { id } = await genRes.json();
  onStatus?.('pending', { id, elapsedMs: 0 });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusRes = await fetch(`/api/status/${encodeURIComponent(id)}`, { headers: keyHeaders });

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
