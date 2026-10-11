/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SFXEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private pcmCache: Map<string, AudioBuffer> = new Map();
  private waveformCache: Map<string, number[]> = new Map();

  public getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Decodes an audio or video URL into raw PCM AudioBuffer
   */
  public async decodeAudio(url: string): Promise<AudioBuffer | null> {
    if (this.pcmCache.has(url)) {
      return this.pcmCache.get(url)!;
    }

    const ctx = this.getContext();
    if (!ctx) return null;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decodedData = await ctx.decodeAudioData(arrayBuffer);
      this.pcmCache.set(url, decodedData);
      return decodedData;
    } catch (err) {
      console.warn('Web Audio PCM Decoding error for:', url, err);
      return null;
    }
  }

  /**
   * Generates normalized peak amplitudes (0.0 to 1.0) for canvas waveform rendering
   */
  public generateWaveformFromPCM(buffer: AudioBuffer, numSamples = 80): number[] {
    const rawData = buffer.getChannelData(0); // Primary channel
    const blockSize = Math.floor(rawData.length / numSamples);
    const samples: number[] = [];

    for (let i = 0; i < numSamples; i++) {
      const start = i * blockSize;
      let max = 0;
      for (let j = 0; j < blockSize; j++) {
        const absVal = Math.abs(rawData[start + j] || 0);
        if (absVal > max) max = absVal;
      }
      samples.push(Math.min(1.0, max * 1.2)); // Scale for visibility
    }

    return samples;
  }

  /**
   * Retrieves or computes cached waveform samples for a media URL
   */
  public async getWaveformForUrl(url: string, numSamples = 80): Promise<number[]> {
    const cacheKey = `${url}_${numSamples}`;
    if (this.waveformCache.has(cacheKey)) {
      return this.waveformCache.get(cacheKey)!;
    }

    const buffer = await this.decodeAudio(url);
    if (buffer) {
      const samples = this.generateWaveformFromPCM(buffer, numSamples);
      this.waveformCache.set(cacheKey, samples);
      return samples;
    }

    // Default synthetic fallback peaks if URL cannot be fetched directly
    const fallback = Array.from({ length: numSamples }, (_, i) =>
      Math.abs(Math.sin(i * 0.3) * 0.7 + Math.cos(i * 0.8) * 0.3)
    );
    return fallback;
  }

  /**
   * Returns current stereo audio peak amplitude for live VU meters (0.0 to 1.0)
   */
  public getLiveAudioPeak(): number {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    return Math.min(1.0, avg / 180);
  }

  public play(sfxId: string, volume = 1.0, sourceUrl?: string) {
    if (sourceUrl) {
      try {
        const audio = new Audio(sourceUrl);
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback to synth
      }
    }

    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    const soundGain = ctx.createGain();
    soundGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, volume)), ctx.currentTime);
    soundGain.connect(this.masterGain);

    switch (sfxId) {
      case 'vine_boom':
        this.playVineBoom(ctx, soundGain);
        break;
      case 'cash_register':
        this.playCashRegister(ctx, soundGain);
        break;
      case 'chime':
        this.playChime(ctx, soundGain);
        break;
      case 'pop':
        this.playPop(ctx, soundGain);
        break;
      case 'whoosh':
        this.playWhoosh(ctx, soundGain);
        break;
      case 'glitch':
        this.playGlitch(ctx, soundGain);
        break;
      default:
        this.playPop(ctx, soundGain);
        break;
    }
  }

  private playVineBoom(ctx: AudioContext, destination: GainNode) {
    const now = ctx.currentTime;

    // Sub-bass oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.8);

    oscGain.gain.setValueAtTime(1.0, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    // Distortion shaper
    const distortion = ctx.createWaveShaper();
    distortion.curve = this.makeDistortionCurve(20);
    distortion.oversample = '4x';

    osc.connect(distortion);
    distortion.connect(oscGain);
    oscGain.connect(destination);

    osc.start(now);
    osc.stop(now + 1.25);

    // Transient thud
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(destination);

    noise.start(now);
  }

  private playCashRegister(ctx: AudioContext, destination: GainNode) {
    const now = ctx.currentTime;

    // First bell
    [1600, 2400].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0.4, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now + idx * 0.04);
      osc.stop(now + 0.65);
    });

    // Mechanical tray sliding click
    setTimeout(() => {
      if (ctx.state === 'closed') return;
      const t = ctx.currentTime;
      const click = ctx.createOscillator();
      const clickGain = ctx.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(400, t);
      click.frequency.exponentialRampToValueAtTime(100, t + 0.15);

      clickGain.gain.setValueAtTime(0.5, t);
      clickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

      click.connect(clickGain);
      clickGain.connect(destination);

      click.start(t);
      click.stop(t + 0.16);
    }, 120);
  }

  private playChime(ctx: AudioContext, destination: GainNode) {
    const now = ctx.currentTime;
    const chord = [1046.5, 1318.5, 1567.98, 2093.0]; // C6, E6, G6, C7

    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);

      gain.gain.setValueAtTime(0.25, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now + idx * 0.03);
      osc.stop(now + 0.95);
    });
  }

  private playPop(ctx: AudioContext, destination: GainNode) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.09);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  private playWhoosh(ctx: AudioContext, destination: GainNode) {
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.35;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.0, now);
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.18);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.6, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(now);
  }

  private playGlitch(ctx: AudioContext, destination: GainNode) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.setValueAtTime(740, now + 0.05);
    osc.frequency.setValueAtTime(180, now + 0.1);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.setValueAtTime(0.05, now + 0.04);
    gain.gain.setValueAtTime(0.5, now + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
}

export const sfxEngine = new SFXEngine();
