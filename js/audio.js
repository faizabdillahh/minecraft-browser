export class AudioManager {
  #ctx = null;
  #masterGain = null;
  #compressor = null;
  #ambientSrc = null;
  #lastFootstepTime = 0;

  get context() {
    return this.#ctx;
  }

  init() {
    if (this.#ctx) return;
    
    // Explicit resource initiation
    this.#ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    this.#compressor = this.#ctx.createDynamicsCompressor();
    this.#compressor.threshold.value = -24;
    this.#compressor.knee.value = 30;
    this.#compressor.ratio.value = 12;
    this.#compressor.attack.value = 0.003;
    this.#compressor.release.value = 0.25;

    this.#masterGain = this.#ctx.createGain();
    this.#masterGain.gain.value = 0.6; // Master Volume
    
    this.#masterGain.connect(this.#compressor);
    this.#compressor.connect(this.#ctx.destination);
  }

  // Pre-generate white noise buffer
  #createNoiseBuffer(duration) {
    const sampleRate = this.#ctx.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = this.#ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  playBlockBreak(blockId) {
    if (!this.#ctx) return;
    const t = this.#ctx.currentTime;
    const src = this.#ctx.createBufferSource();
    src.buffer = this.#createNoiseBuffer(0.15); // Noise burst
    
    const filter = this.#ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.1);
    
    const gain = this.#ctx.createGain();
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.#masterGain);
    
    src.start(t);
  }

  playBlockPlace(blockId) {
    if (!this.#ctx) return;
    const t = this.#ctx.currentTime;
    
    // Knock sound menggunakan Sine
    const osc = this.#ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
    
    const gain = this.#ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.#masterGain);
    
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playFootstep(blockId) {
    if (!this.#ctx) return;
    const t = this.#ctx.currentTime;
    
    // Debounce manual: footprint tidak overlap dalam 0.4 detik
    if (t - this.#lastFootstepTime < 0.4) return;
    this.#lastFootstepTime = t;
    
    const src = this.#ctx.createBufferSource();
    src.buffer = this.#createNoiseBuffer(0.1);
    
    const filter = this.#ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 250;
    
    const gain = this.#ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.1);
    
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.#masterGain);
    
    src.start(t);
  }

  playPlayerHurt() {
    if (!this.#ctx) return;
    const t = this.#ctx.currentTime;
    
    const osc = this.#ctx.createOscillator();
    osc.type = 'sawtooth';
    // Descending tone klasik damage retro
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.2);
    
    const gain = this.#ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    osc.connect(gain);
    gain.connect(this.#masterGain);
    
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playPlayerSplash() {
    if (!this.#ctx) return;
    const t = this.#ctx.currentTime;
    
    const src = this.#ctx.createBufferSource();
    src.buffer = this.#createNoiseBuffer(0.4);
    
    const filter = this.#ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 350;
    
    const gain = this.#ctx.createGain();
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.#masterGain);
    
    src.start(t);
  }

  playAmbient() {
    if (!this.#ctx || this.#ambientSrc) return;
    
    const src = this.#ctx.createBufferSource();
    src.buffer = this.#createNoiseBuffer(10.0); // 10s base noise buffer
    src.loop = true;
    
    const filter = this.#ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    
    // Slow LFO untuk modulasi filter cutoff (efek hembusan angin)
    const lfo = this.#ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05; 
    
    const lfoGain = this.#ctx.createGain();
    lfoGain.gain.value = 200;
    
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    
    const gain = this.#ctx.createGain();
    gain.gain.value = 0.08; 
    
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.#masterGain);
    
    src.start();
    lfo.start();
    this.#ambientSrc = src;
  }
}
