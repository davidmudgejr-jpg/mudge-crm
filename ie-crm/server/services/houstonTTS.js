// Houston TTS Service — ElevenLabs voice synthesis
// Cloned from Elowen's ttsService.js, adapted for Houston

const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');

let client;
function getClient() {
  if (!client) {
    client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return client;
}

const VOICE_ID = process.env.HOUSTON_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v3';

// Voice settings tuned for Houston — authoritative, clear, direct
const VOICE_SETTINGS = {
  stability: 0.45,         // Slightly more stable than Elowen (0.35) — Houston is measured
  similarity_boost: 0.8,
  style: 0.4,              // Less expressive than Elowen (0.6) — military briefing tone
  use_speaker_boost: true,
};

// Strip reaction tags that v3 reads literally, keep delivery cues
function preprocessText(text) {
  return text
    .replace(/\[laughs\]|\[sighs\]|\[pauses\]|\[chuckles\]/gi, '')
    .trim();
}

// Stream TTS — returns async iterable of audio chunks
async function streamSpeech(text) {
  const ttsText = preprocessText(text);
  if (!ttsText) return null;

  const el = getClient();
  const stream = await el.textToSpeech.stream(VOICE_ID, {
    text: ttsText,
    model_id: MODEL,
    output_format: 'mp3_44100_128',
    voice_settings: VOICE_SETTINGS,
  });

  return stream;
}

// Full TTS — returns complete audio buffer (for short responses like greetings)
async function textToSpeech(text) {
  const ttsText = preprocessText(text);
  if (!ttsText) return null;

  const el = getClient();
  const audio = await el.textToSpeech.convert(VOICE_ID, {
    text: ttsText,
    model_id: MODEL,
    output_format: 'mp3_44100_128',
    voice_settings: VOICE_SETTINGS,
  });

  // Collect all chunks into a single buffer
  const chunks = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { streamSpeech, textToSpeech };
