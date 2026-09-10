require('dotenv').config();

const path = require('path');
const express = require('express');

const PORT = process.env.PORT || 3000;
const ENV_API_KEY = process.env.STABILITY_API_KEY;
const GENERATE_URL = 'https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio';
const RESULTS_URL = 'https://api.stability.ai/v2beta/audio/results';

if (!ENV_API_KEY) {
  console.warn('No STABILITY_API_KEY set in .env — the app will expect a key entered in the browser instead.');
}

// A key typed into the browser (sent per-request via this header) takes
// priority over .env, so the UI field always works even if .env is unset.
function resolveApiKey(req) {
  return req.get('x-stability-key') || ENV_API_KEY || null;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate', async (req, res) => {
  const {
    prompt,
    duration = 12,
    seed = 0,
    steps = 8,
    cfgScale = 1,
    outputFormat = 'mp3',
  } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(400).json({ error: 'No Stability API key. Enter one in the UI or set STABILITY_API_KEY in .env.' });
  }

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('model', 'stable-audio-3');
  form.append('duration', String(duration));
  form.append('seed', String(seed));
  form.append('steps', String(steps));
  form.append('cfg_scale', String(cfgScale));
  form.append('output_format', outputFormat);

  try {
    const upstream = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'audio/*',
      },
      body: form,
    });

    if (upstream.status !== 202) {
      const body = await upstream.text();
      return res.status(upstream.status).send(body);
    }

    const json = await upstream.json();
    return res.status(202).json(json);
  } catch (err) {
    console.error('generate proxy error:', err);
    return res.status(502).json({ error: 'Failed to reach Stability API' });
  }
});

app.get('/api/status/:id', async (req, res) => {
  const { id } = req.params;

  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return res.status(400).json({ error: 'No Stability API key. Enter one in the UI or set STABILITY_API_KEY in .env.' });
  }

  try {
    const upstream = await fetch(`${RESULTS_URL}/${encodeURIComponent(id)}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'audio/*',
      },
    });

    if (upstream.status === 202) {
      return res.status(202).json({ status: 'pending' });
    }

    if (upstream.status === 200) {
      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.set('Content-Type', contentType);
      return res.send(buf);
    }

    const body = await upstream.text();
    return res.status(upstream.status).send(body);
  } catch (err) {
    console.error('status proxy error:', err);
    return res.status(502).json({ error: 'Failed to reach Stability API' });
  }
});

app.listen(PORT, () => {
  console.log(`FM oscillator server running at http://localhost:${PORT}`);
});
