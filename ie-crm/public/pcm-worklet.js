/**
 * AudioWorklet processors for ElevenLabs Conversational AI.
 *
 * Two processors are registered:
 *   - pcm-capture:  Mic input -> 16 kHz int16 PCM chunks -> main thread
 *   - pcm-playback: Main thread int16 PCM buffers -> audio output
 */

const TARGET_SAMPLE_RATE = 16000;

// ---------------------------------------------------------------------------
// 1. pcm-capture — downsample mic input to 16 kHz int16 and post to main thread
// ---------------------------------------------------------------------------
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / TARGET_SAMPLE_RATE;
    this._residual = 0; // fractional sample accumulator for accurate resampling
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const floatSamples = input[0]; // mono channel
    const outLength = Math.floor((floatSamples.length + this._residual) / this._ratio);
    if (outLength <= 0) {
      this._residual += floatSamples.length;
      return true;
    }

    const int16 = new Int16Array(outLength);
    let srcIndex = 0;

    for (let i = 0; i < outLength; i++) {
      const exactIndex = (i * this._ratio) - this._residual;
      srcIndex = Math.min(Math.round(exactIndex), floatSamples.length - 1);
      if (srcIndex < 0) srcIndex = 0;

      // float32 [-1, 1] -> int16 [-32768, 32767]
      const s = Math.max(-1, Math.min(1, floatSamples[srcIndex]));
      int16[i] = s < 0 ? s * 32768 : s * 32767;
    }

    // Track the fractional leftover for the next call
    this._residual = (floatSamples.length + this._residual) - (outLength * this._ratio);

    // Transfer the buffer (zero-copy)
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);

// ---------------------------------------------------------------------------
// 2. pcm-playback — receive int16 PCM from main thread, queue, and play back
// ---------------------------------------------------------------------------
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._queue = []; // Array of Float32Arrays
    this._cursor = 0; // read position within the first queued buffer
    this._playing = false;

    this.port.onmessage = (event) => {
      if (event.data === 'clear') {
        this._queue = [];
        this._cursor = 0;
        this._updateStatus(false);
        return;
      }

      // Expect an ArrayBuffer of int16 PCM
      const int16 = new Int16Array(event.data);
      const float32 = new Float32Array(int16.length);

      for (let i = 0; i < int16.length; i++) {
        // int16 [-32768, 32767] -> float32 [-1, 1]
        float32[i] = int16[i] < 0 ? int16[i] / 32768 : int16[i] / 32767;
      }

      this._queue.push(float32);
      this._updateStatus(true);
    };
  }

  _updateStatus(playing) {
    if (this._playing !== playing) {
      this._playing = playing;
      this.port.postMessage({ type: 'status', playing });
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) {
      return true;
    }

    const channel = output[0];
    let written = 0;

    while (written < channel.length && this._queue.length > 0) {
      const buf = this._queue[0];
      const available = buf.length - this._cursor;
      const needed = channel.length - written;
      const toCopy = Math.min(available, needed);

      for (let i = 0; i < toCopy; i++) {
        channel[written + i] = buf[this._cursor + i];
      }

      written += toCopy;
      this._cursor += toCopy;

      if (this._cursor >= buf.length) {
        this._queue.shift();
        this._cursor = 0;
      }
    }

    // Fill remaining frames with silence
    for (let i = written; i < channel.length; i++) {
      channel[i] = 0;
    }

    // Update playing status when queue drains
    if (this._queue.length === 0 && this._playing) {
      this._updateStatus(false);
    }

    return true;
  }
}

registerProcessor('pcm-playback', PCMPlaybackProcessor);
