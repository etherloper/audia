import { convertFileSrc } from "@tauri-apps/api/core";

export type AudioEventCallback = () => void;
export type AudioTimeCallback = (currentTime: number, duration: number) => void;

/**
 * Voice boost: Web Audio graph  element → compressor → make-up gain → volume → out.
 * Built lazily the first time boost is turned on. An element can't be un-routed
 * from Web Audio once routed, so "off" just bypasses the compressor.
 */
interface BoostGraph {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  compressor: DynamicsCompressorNode;
  makeup: GainNode;
  volume: GainNode;
}

class AudioEngine {
  private audio: HTMLAudioElement;
  private _onTimeUpdate: AudioTimeCallback | null = null;
  private _onEnded: AudioEventCallback | null = null;
  private _onPlay: AudioEventCallback | null = null;
  private _onPause: AudioEventCallback | null = null;
  private _onLoaded: AudioEventCallback | null = null;

  private graph: BoostGraph | null = null;
  private boostOn = false;
  private _volume = 1;
  /** Set if a file failed to load in CORS mode; Web Audio can't process the audio then. */
  private corsUnavailable = false;
  /** Called if voice boost had to be switched off because the audio can't be processed. */
  onBoostUnavailable: AudioEventCallback | null = null;

  constructor() {
    this.audio = new Audio();
    // CORS mode lets Web Audio (voice boost) read the samples. The asset protocol
    // sends Access-Control-Allow-Origin for the app's own origin.
    this.audio.crossOrigin = "anonymous";

    this.audio.addEventListener("timeupdate", () => {
      this._onTimeUpdate?.(this.audio.currentTime, this.audio.duration || 0);
    });

    this.audio.addEventListener("ended", () => {
      this._onEnded?.();
    });

    this.audio.addEventListener("play", () => {
      this._onPlay?.();
    });

    this.audio.addEventListener("pause", () => {
      this._onPause?.();
    });

    this.audio.addEventListener("loadedmetadata", () => {
      this._onLoaded?.();
    });
  }

  async loadFile(filePath: string): Promise<void> {
    const src = convertFileSrc(filePath);
    try {
      await this.loadSrc(src);
    } catch (e) {
      if (this.audio.crossOrigin === null) throw e;
      // Retry without CORS: playback matters more than voice boost
      this.audio.crossOrigin = null;
      this.corsUnavailable = true;
      await this.loadSrc(src);
      if (this.boostOn) {
        this.setVoiceBoost(false);
        this.onBoostUnavailable?.();
      }
    }
  }

  private loadSrc(src: string): Promise<void> {
    this.audio.src = src;
    this.audio.load();
    return new Promise((resolve, reject) => {
      const onLoaded = () => {
        this.audio.removeEventListener("loadedmetadata", onLoaded);
        this.audio.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        this.audio.removeEventListener("loadedmetadata", onLoaded);
        this.audio.removeEventListener("error", onError);
        reject(new Error(`Failed to load audio: ${src}`));
      };
      this.audio.addEventListener("loadedmetadata", onLoaded);
      this.audio.addEventListener("error", onError);
    });
  }

  play(): void {
    // A context created outside a user gesture starts suspended
    if (this.graph?.ctx.state === "suspended") this.graph.ctx.resume().catch(() => {});
    this.audio.play().catch(() => {});
  }

  pause(): void {
    this.audio.pause();
  }

  get isPlaying(): boolean {
    return !this.audio.paused;
  }

  get currentTime(): number {
    return this.audio.currentTime;
  }

  get duration(): number {
    return this.audio.duration || 0;
  }

  seek(time: number): void {
    this.audio.currentTime = Math.max(0, Math.min(time, this.duration));
  }

  skipForward(seconds: number = 30): void {
    this.seek(this.currentTime + seconds);
  }

  skipBackward(seconds: number = 30): void {
    this.seek(this.currentTime - seconds);
  }

  setPlaybackRate(rate: number): void {
    this.audio.playbackRate = rate;
  }

  get playbackRate(): number {
    return this.audio.playbackRate;
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    // Once routed through Web Audio, volume lives in the graph
    if (this.graph) this.graph.volume.gain.value = this._volume;
    else this.audio.volume = this._volume;
  }

  get volume(): number {
    return this._volume;
  }

  /** False if the audio had to be loaded without CORS, which Web Audio can't process. */
  get voiceBoostAvailable(): boolean {
    return !this.corsUnavailable && typeof AudioContext !== "undefined";
  }

  /** Turn voice boost on or off. Returns whether it's on afterwards. */
  setVoiceBoost(on: boolean): boolean {
    if (on && !this.voiceBoostAvailable) on = false;
    this.boostOn = on;
    if (!on && !this.graph) return false;

    if (!this.graph) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(this.audio);
      // Gentle speech compression: lifts quiet passages, tames loud ones
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.25;
      const makeup = ctx.createGain();
      makeup.gain.value = 1.8; // ≈ +5 dB to bring the compressed level back up
      const volume = ctx.createGain();
      volume.gain.value = this._volume;
      compressor.connect(makeup);
      volume.connect(ctx.destination);
      this.audio.volume = 1;
      this.graph = { ctx, source, compressor, makeup, volume };
    }

    const { ctx, source, compressor, makeup, volume } = this.graph;
    source.disconnect();
    makeup.disconnect();
    if (on) {
      source.connect(compressor);
      makeup.connect(volume);
    } else {
      source.connect(volume);
    }
    if (!this.audio.paused && ctx.state === "suspended") ctx.resume().catch(() => {});
    return on;
  }

  fadeVolume(targetVolume: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startVolume = this._volume;
      const steps = 30;
      const stepDuration = durationMs / steps;
      const volumeStep = (targetVolume - startVolume) / steps;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        if (step >= steps) {
          this.setVolume(targetVolume);
          clearInterval(interval);
          resolve();
        } else {
          this.setVolume(startVolume + volumeStep * step);
        }
      }, stepDuration);
    });
  }

  set onTimeUpdate(cb: AudioTimeCallback | null) {
    this._onTimeUpdate = cb;
  }
  set onEnded(cb: AudioEventCallback | null) {
    this._onEnded = cb;
  }
  set onPlay(cb: AudioEventCallback | null) {
    this._onPlay = cb;
  }
  set onPause(cb: AudioEventCallback | null) {
    this._onPause = cb;
  }
  set onLoaded(cb: AudioEventCallback | null) {
    this._onLoaded = cb;
  }
}

export const audioEngine = new AudioEngine();
