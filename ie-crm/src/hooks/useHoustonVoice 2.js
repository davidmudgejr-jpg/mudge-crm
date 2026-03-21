// useHoustonVoice — ElevenLabs Conversational AI WebSocket hook for Houston
// Cloned from Elowen's useConvAI.js, simplified for the war room context.
//
// Flow: Browser mic → WebSocket → ElevenLabs STT → ElevenLabs calls our
// /api/houston/completions (Custom LLM) → Claude + RAG → OpenAI SSE back
// → ElevenLabs TTS → WebSocket audio → AudioWorklet → Speaker
//
// All audio is base64 JSON over WebSocket (no binary frames).

import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Delivery cues are for TTS — strip from displayed text
const DELIVERY_CUE_RE = /\[(playfully|warmly|matter-of-fact|gently|confidently|urgently|thoughtfully|reassuringly)\]\s*/gi;

function stripCues(text) {
  return text.replace(DELIVERY_CUE_RE, '');
}

export default function useHoustonVoice() {
  const [state, setState] = useState('idle'); // idle | connecting | listening | processing | speaking
  const [houstonText, setHoustonText] = useState('');
  const [userText, setUserText] = useState('');
  const [error, setError] = useState(null);

  const activeRef = useRef(false);
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const playbackNodeRef = useRef(null);
  const captureNodeRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const stopRef = useRef(null);

  const getAnalyser = useCallback(() => analyserRef.current, []);

  // ─── Cleanup ───────────────────────────────────────────────
  const cleanupAudio = useCallback(() => {
    if (captureNodeRef.current) {
      try { captureNodeRef.current.disconnect(); } catch {}
      captureNodeRef.current = null;
    }
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch {}
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (playbackNodeRef.current) {
      try { playbackNodeRef.current.disconnect(); } catch {}
      playbackNodeRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
  }, []);

  // ─── Stop (deactivate) ────────────────────────────────────
  const deactivate = useCallback(() => {
    activeRef.current = false;
    if (wsRef.current) {
      try { wsRef.current.close(1000); } catch {}
      wsRef.current = null;
    }
    cleanupAudio();
    setState('idle');
    setHoustonText('');
    setUserText('');
    setError(null);
  }, [cleanupAudio]);

  stopRef.current = deactivate;

  // ─── Interrupt (clear playback, go back to listening) ─────
  const interrupt = useCallback(() => {
    if (playbackNodeRef.current) {
      playbackNodeRef.current.port.postMessage('clear');
    }
    setState('listening');
  }, []);

  // ─── Activate (start voice mode) ─────────────────────────
  const activate = useCallback(async () => {
    setState('connecting');
    setHoustonText('');
    setUserText('');
    setError(null);

    try {
      // 1. Get signed WebSocket URL from our server
      const res = await fetch(`${API_BASE}/api/houston/signed-url`);
      if (!res.ok) throw new Error('Failed to get signed URL');
      const { url: signedUrl } = await res.json();

      // 2. Create AudioContext at 44.1kHz
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100,
      });
      audioCtxRef.current = audioCtx;

      // 3. Load AudioWorklet
      await audioCtx.audioWorklet.addModule('/pcm-worklet.js');

      // 4. Analyser for orb visualization
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // 5. Playback worklet → analyser → speakers
      const playbackNode = new AudioWorkletNode(audioCtx, 'pcm-playback');
      playbackNodeRef.current = playbackNode;
      playbackNode.connect(analyser);
      analyser.connect(audioCtx.destination);

      playbackNode.port.onmessage = (e) => {
        if (e.data?.type === 'status') {
          setState(e.data.playing ? 'speaking' : 'listening');
        }
      };

      // 6. Mic input
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = micStream;

      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSourceRef.current = micSource;

      const captureNode = new AudioWorkletNode(audioCtx, 'pcm-capture');
      captureNodeRef.current = captureNode;
      micSource.connect(captureNode);

      // 7. Open WebSocket to ElevenLabs
      const ws = new WebSocket(signedUrl);
      wsRef.current = ws;

      let lastInterruptId = 0;

      ws.onopen = () => {
        console.log('[houston] WebSocket connected');
        activeRef.current = true;
        setState('listening');

        // Send init data — no auth needed for Houston (public CRM tool)
        ws.send(JSON.stringify({
          type: 'conversation_initiation_client_data',
          custom_llm_extra_body: {},
        }));

        // Forward mic PCM as base64 JSON
        captureNode.port.onmessage = (e) => {
          if (ws.readyState === WebSocket.OPEN && e.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(e.data);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            ws.send(JSON.stringify({ user_audio_chunk: btoa(binary) }));
          }
        };
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'audio': {
              const audioEvt = msg.audio_event;
              if (audioEvt && parseInt(audioEvt.event_id) > lastInterruptId) {
                const b64 = audioEvt.audio_base_64;
                const binaryStr = atob(b64);
                const len = binaryStr.length;
                const buffer = new ArrayBuffer(len);
                const view = new Uint8Array(buffer);
                for (let i = 0; i < len; i++) {
                  view[i] = binaryStr.charCodeAt(i);
                }
                if (playbackNodeRef.current) {
                  playbackNodeRef.current.port.postMessage(buffer);
                }
              }
              break;
            }

            case 'user_transcript': {
              const transcript = msg.user_transcription_event?.user_transcript || '';
              setUserText(transcript);
              if (msg.user_transcription_event?.is_final) {
                setState('processing');
              }
              break;
            }

            case 'agent_response': {
              const raw = msg.agent_response_event?.agent_response || '';
              const display = stripCues(raw);
              if (display) setHoustonText(prev => prev + display);
              break;
            }

            case 'agent_response_correction': {
              const corrected = msg.agent_response_correction_event?.agent_response || '';
              setHoustonText(stripCues(corrected));
              break;
            }

            case 'interruption': {
              const intEvt = msg.interruption_event;
              if (intEvt?.event_id) lastInterruptId = parseInt(intEvt.event_id);
              if (playbackNodeRef.current) {
                playbackNodeRef.current.port.postMessage('clear');
              }
              setState('listening');
              break;
            }

            case 'turn_started':
              setHoustonText('');
              setState('speaking');
              break;

            case 'turn_ended':
              setState('listening');
              break;

            case 'conversation_initiation_metadata':
              console.log('[houston] ConvAI session:', msg.conversation_initiation_metadata_event?.conversation_id);
              break;

            case 'ping':
              if (msg.ping_event?.event_id) {
                ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event.event_id }));
              }
              break;

            case 'error':
              setError(msg.error_event?.message || 'ConvAI error');
              break;
          }
        } catch (parseErr) {
          console.warn('[houston] Parse error:', parseErr);
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
      };

      ws.onclose = (e) => {
        console.warn('[houston] WebSocket closed:', e.code, e.reason);
        if (activeRef.current) {
          activeRef.current = false;
          cleanupAudio();
          setState('idle');
          setError(e.reason || `Connection closed (${e.code})`);
          wsRef.current = null;
        }
      };

    } catch (err) {
      console.error('[houston] Activate error:', err);
      setError(err.message || 'Failed to start voice mode');
      cleanupAudio();
      setState('idle');
    }
  }, [cleanupAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeRef.current) stopRef.current?.();
    };
  }, []);

  return {
    state,
    houstonText,
    userText,
    error,
    activate,
    deactivate,
    interrupt,
    getAnalyser,
  };
}
