/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates an in-memory 16-bit PCM RIFF WAV audio file buffer
 * from synthetic audio generator algorithms for use in FFmpeg virtual FS.
 */
function createWavFile(sampleRate: number, numChannels: number, samples: Float32Array): Uint8Array {
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples as 16-bit PCM integers
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Generates synthetic SFX WAV buffers for bundling into FFmpeg FS
 */
export function generateSyntheticSfxWav(sfxId: string): Uint8Array {
  const sampleRate = 44100;

  switch (sfxId) {
    case 'vine_boom': {
      const duration = 1.2;
      const totalSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(totalSamples);

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        // Sub-bass frequency drop from 110Hz to 32Hz
        const freq = 110 * Math.exp(-t * 2.2) + 32;
        const phase = 2 * Math.PI * freq * t;
        const envelope = Math.exp(-t * 2.5);
        let val = Math.sin(phase) * envelope * 1.2;

        // Add soft distortion
        val = Math.tanh(val * 2.2);

        // Add transient noise thud in first 80ms
        if (t < 0.08) {
          const noise = (Math.random() * 2 - 1) * Math.exp(-t * 35) * 0.4;
          val += noise;
        }

        samples[i] = val;
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'cash_register': {
      const duration = 0.9;
      const totalSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(totalSamples);

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let val = 0;

        // Dual bell chime (1600Hz + 2400Hz)
        if (t >= 0 && t < 0.6) {
          const env = Math.exp(-t * 6);
          val += (Math.sin(2 * Math.PI * 1600 * t) + Math.sin(2 * Math.PI * 2400 * t) * 0.7) * 0.4 * env;
        }

        // Cash drawer mechanical latch click at 0.12s
        if (t >= 0.12 && t < 0.3) {
          const dt = t - 0.12;
          const clickEnv = Math.exp(-dt * 25);
          val += Math.sin(2 * Math.PI * 450 * dt) * 0.5 * clickEnv;
        }

        samples[i] = val;
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'chime': {
      const duration = 1.0;
      const totalSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(totalSamples);
      const chord = [1046.5, 1318.5, 1567.98, 2093.0]; // C6, E6, G6, C7

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let val = 0;

        chord.forEach((freq, idx) => {
          const noteStart = idx * 0.04;
          if (t >= noteStart) {
            const dt = t - noteStart;
            const env = Math.exp(-dt * 4.5);
            val += Math.sin(2 * Math.PI * freq * dt) * 0.25 * env;
          }
        });

        samples[i] = val;
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'pop': {
      const duration = 0.15;
      const totalSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(totalSamples);

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        // Pitch drop from 900Hz to 120Hz
        const freq = 900 * Math.exp(-t * 28) + 120;
        const env = Math.exp(-t * 30);
        samples[i] = Math.sin(2 * Math.PI * freq * t) * 0.8 * env;
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'whoosh': {
      const duration = 0.4;
      const totalSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(totalSamples);

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        // Modulated bandpass noise sweep
        const sweepCenter = 400 + 1800 * Math.sin((t / duration) * Math.PI);
        const noise = Math.random() * 2 - 1;
        const env = Math.sin((t / duration) * Math.PI);
        // Simple resonance modulation
        samples[i] = noise * env * 0.5 * Math.sin(2 * Math.PI * sweepCenter * t);
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'glitch': {
      const duration = 0.22;
      const totalSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(totalSamples);

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const freq = (i % 300 < 150 ? 540 : 180) + (Math.random() * 80);
        const env = Math.exp(-t * 12);
        // Sawtooth-like stepped burst
        const phase = (t * freq) % 1;
        samples[i] = (phase * 2 - 1) * env * 0.6;
      }
      return createWavFile(sampleRate, 1, samples);
    }

    default: {
      // Basic 800Hz notification beep
      const duration = 0.2;
      const totalSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        samples[i] = Math.sin(2 * Math.PI * 800 * t) * Math.exp(-t * 15) * 0.6;
      }
      return createWavFile(sampleRate, 1, samples);
    }
  }
}

/**
 * Generates synthetic looping background music WAV buffers for bundling into FFmpeg FS
 */
export function generateSyntheticBgmWav(bgmId: string, durationSec = 30): Uint8Array {
  const sampleRate = 22050; // 22.05kHz keeps memory and processing lean in WebAssembly
  const totalSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(totalSamples);

  switch (bgmId) {
    case 'chill_tozen':
    case 'lofi_chill': {
      // 82 BPM Lo-Fi chord loop (Dm9 -> G13 -> Cmaj7 -> Am9)
      const chords = [
        [146.83, 174.61, 220.0, 261.63, 329.63], // Dm9
        [98.0, 146.83, 196.0, 246.94, 329.63], // G13
        [130.81, 164.81, 196.0, 246.94, 293.66], // Cmaj7
        [110.0, 130.81, 164.81, 220.0, 261.63], // Am9
      ];
      const chordLenSec = (60 / 82) * 4; // 1 measure per chord

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const chordIdx = Math.floor((t / chordLenSec) % chords.length);
        const chord = chords[chordIdx];
        const chordTime = t % chordLenSec;
        const decay = Math.exp(-chordTime * 0.8) * 0.7 + 0.3;

        let val = 0;
        for (const freq of chord) {
          const detune = Math.sin(t * 2.5) * 0.003;
          val += Math.sin(2 * Math.PI * freq * (1 + detune) * t) * (0.35 / chord.length);
        }
        val *= decay;

        // Soft kick / snare beat
        const beatTime = t % (60 / 82);
        if (beatTime < 0.1) {
          const kick = Math.sin(2 * Math.PI * (120 * Math.exp(-beatTime * 30)) * beatTime) * Math.exp(-beatTime * 20);
          val += kick * 0.4;
        }

        // Soft vinyl crackle
        if (Math.random() < 0.005) {
          val += (Math.random() * 2 - 1) * 0.04;
        }

        samples[i] = Math.tanh(val * 0.85);
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'upbeat_creator': {
      // 120 BPM energetic rhythm
      const beatLen = 60 / 120;
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const beatNum = Math.floor((t / beatLen) % 4);
        const beatTime = t % beatLen;

        let val = 0;
        // Walking bass
        const bassFreq = beatNum === 0 ? 110 : beatNum === 1 ? 130.8 : beatNum === 2 ? 146.8 : 164.8;
        val += Math.sin(2 * Math.PI * bassFreq * t) * Math.exp(-beatTime * 4) * 0.45;

        // Upbeat chords
        if (beatTime > beatLen * 0.4 && beatTime < beatLen * 0.9) {
          val += (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 554.37 * t)) * 0.15;
        }

        samples[i] = Math.tanh(val * 0.9);
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'viral_pulse': {
      // 105 BPM driving pulse
      const pulseLen = 60 / 105;
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const pulseTime = t % pulseLen;
        // 808 Sub drop
        const sub = Math.sin(2 * Math.PI * (90 * Math.exp(-pulseTime * 8) + 40) * pulseTime) * Math.exp(-pulseTime * 3);
        const hihat = Math.random() < 0.1 ? (Math.random() * 2 - 1) * Math.exp(-pulseTime * 40) * 0.1 : 0;
        samples[i] = Math.tanh((sub * 0.5 + hihat) * 1.1);
      }
      return createWavFile(sampleRate, 1, samples);
    }

    case 'cinematic_ambient':
    default: {
      // Atmospheric ambient chords
      const freqs = [110.0, 164.81, 220.0, 277.18, 329.63];
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let val = 0;
        for (let j = 0; j < freqs.length; j++) {
          const lfo = 1 + Math.sin(t * 0.4 + j) * 0.004;
          val += Math.sin(2 * Math.PI * freqs[j] * lfo * t) * (0.3 / freqs.length);
        }
        samples[i] = Math.tanh(val);
      }
      return createWavFile(sampleRate, 1, samples);
    }
  }
}
