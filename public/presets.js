// Curated prompts for Stable Audio 3, chosen to produce modulator clips with
// distinct sonic character — different flavors of audio-rate FM and
// different amplitude/brightness envelope shapes to drive the X/Y pads.

export const PRESET_GROUPS = [
  {
    label: 'Rhythmic',
    presets: [
      {
        label: 'Percussive Pulse',
        prompt: 'tight rhythmic percussion hits with sharp transients and silence between hits, no melody, no pitched instruments',
        duration: 8,
      },
      {
        label: 'Deep Sub Pulse',
        prompt: 'deep sub-bass pulsing rhythm, low frequency throb, four-on-the-floor feel, no highs',
        duration: 10,
      },
      {
        label: 'Arpeggiated Pluck',
        prompt: 'fast arpeggiated plucked synth notes in a repeating pattern, bright and rhythmic',
        duration: 8,
      },
      {
        label: 'Glitch Stutter',
        prompt: 'glitchy stuttering electronic artifacts, sudden silences and bursts, IDM style',
        duration: 8,
      },
    ],
  },
  {
    label: 'Textural / Noise',
    presets: [
      {
        label: 'Granular Texture',
        prompt: 'granular metallic textures with chaotic micro-rhythms and constant motion',
        duration: 12,
      },
      {
        label: 'White Noise Wash',
        prompt: 'continuous white noise textured wash, no pitch, no rhythm, evenly dense',
        duration: 10,
      },
      {
        label: 'Organic Field Recording',
        prompt: 'organic field recording ambience, wind and distant birds, natural evolving texture',
        duration: 15,
      },
    ],
  },
  {
    label: 'Tonal / Smooth',
    presets: [
      {
        label: 'Smooth Drone',
        prompt: 'a single sustained smooth sine-like drone tone, no rhythm, slowly evolving timbre',
        duration: 15,
      },
      {
        label: 'Rising Sweep',
        prompt: 'a single continuous rising pitch sweep from low to high, no rhythm, no percussion',
        duration: 10,
      },
      {
        label: 'Bright Shimmer',
        prompt: 'bright shimmering high-frequency bell-like textures with long decay, ethereal',
        duration: 12,
      },
    ],
  },
];
