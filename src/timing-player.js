import { loadYouTubeAPI } from './player.js';
import { recordingCueSeconds, formatTime } from './model.js';

// Continuous playback for barline capture. Capture uses getCurrentTime(), never
// elapsed wall-clock time, so pauses, buffering and playback speed cannot drift.
// https://developers.google.com/youtube/iframe_api_reference
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LOAD_TIMEOUT = 20000;
const errors = {
  2: 'YouTube could not recognize this recording.',
  5: 'This browser could not play the recording.',
  100: 'This recording is private, removed, or unavailable on YouTube.',
  101: 'The recording owner does not allow embedded playback.',
  150: 'The recording owner does not allow embedded playback.',
  153: 'YouTube could not verify this website for embedded playback.',
};

export class TimingPlayer {
  constructor({ container, onState = () => {}, onTime = () => {}, onStatus = () => {} }) {
    if (!container?.ownerDocument) throw new TypeError('TimingPlayer needs a DOM container.');
    this.container = container;
    this.doc = container.ownerDocument;
    this.win = this.doc.defaultView;
    this.onState = onState;
    this.onTime = onTime;
    this.onStatus = onStatus;
    this.state = 'paused';
    this.player = null;
    this.ready = false;
    this.destroyed = false;
    this.generation = 0;
    this.timer = null;
    this.readyTimeout = null;
    this.rejectReady = null;
    this.stage = this.doc.createElement('div');
    this.stage.className = 'timing-player-frame';
    Object.assign(this.stage.style, { width: '100%', minWidth: '200px', minHeight: '200px', aspectRatio: '16 / 9' });
    this.stage.textContent = 'Load the recording to begin.';
    this.container.replaceChildren(this.stage);
  }

  get isPlaying() { return !this.destroyed && this.ready && this.state === 'playing'; }

  _state(state) {
    if (state !== this.state) { this.state = state; this.onState(state); }
  }

  _status(message, type = 'info') { this.onStatus({ message, type }); }

  _dispose() {
    if (this.timer !== null) this.win.clearInterval(this.timer);
    if (this.readyTimeout !== null) this.win.clearTimeout(this.readyTimeout);
    this.timer = this.readyTimeout = null;
    const reject = this.rejectReady;
    this.rejectReady = null;
    this.ready = false;
    const player = this.player;
    this.player = null;
    reject?.(new Error('Recording loading was cancelled.'));
    try { player?.destroy(); } catch { /* Already removed by the provider. */ }
  }

  _fail(error) {
    this.generation += 1;
    this._dispose();
    this._state('error');
    this._status(error.message || 'The recording could not be loaded. Try loading it again.', 'error');
  }

  _reportTime() {
    const seconds = this.currentTime();
    if (seconds === null) return;
    let duration = null;
    try {
      const value = this.player.getDuration();
      if (Number.isFinite(value) && value > 0) duration = value;
    } catch { /* Duration may not be available until playback begins. */ }
    this.onTime({ seconds, duration });
  }

  /** Loads a visible player without playing. A newer load cancels the old one. */
  async load(recording) {
    if (this.destroyed) return false;
    const generation = ++this.generation;
    this._dispose();
    this.stage.replaceChildren();
    if (!VIDEO_ID.test(recording?.youtubeId || '')) {
      this._state('error');
      this._status('Barline capture currently needs a linked YouTube recording.', 'error');
      return false;
    }
    this._state('loading');
    this._status('Loading the recording…');
    const current = () => !this.destroyed && this.generation === generation;
    try {
      const YT = await loadYouTubeAPI(this.win, this.doc);
      if (!current()) return false;
      const mount = this.doc.createElement('div');
      this.stage.replaceChildren(mount);
      await new Promise((resolve, reject) => {
        const finish = (error) => {
          if (this.readyTimeout !== null) this.win.clearTimeout(this.readyTimeout);
          this.readyTimeout = null;
          this.rejectReady = null;
          if (error) reject(error); else resolve();
        };
        this.rejectReady = reject;
        this.readyTimeout = this.win.setTimeout(() => {
          finish(new Error('The YouTube player took too long to respond. Load the recording again.'));
        }, LOAD_TIMEOUT);
        const origin = this.win.location?.origin;
        this.player = new YT.Player(mount, {
          width: '100%', height: '100%',
          videoId: recording.youtubeId,
          playerVars: {
            enablejsapi: 1, controls: 1, playsinline: 1, autoplay: 0, disablekb: 1,
            ...(origin && origin !== 'null' ? { origin } : {}),
          },
          events: {
            onReady: event => {
              if (!current()) { event.target.destroy(); return; }
              const iframe = event.target.getIframe?.();
              if (iframe) {
                iframe.title = 'Recording for barline timing';
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                Object.assign(iframe.style, { display: 'block', width: '100%', height: '100%', minWidth: '200px', minHeight: '200px', aspectRatio: '16 / 9' });
              }
              finish();
            },
            onStateChange: event => {
              if (!current() || !this.ready || this.state === 'error') return;
              const state = { '-1': 'ready', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'ready' }[event.data];
              if (state) this._state(state);
              this._reportTime();
            },
            onError: event => {
              if (!current()) return;
              const detail = errors[event.data] || 'YouTube reported a playback error. Load the recording again.';
              const error = new Error(`${detail} (YouTube error ${event.data}.)`);
              if (!this.ready) finish(error); else this._fail(error);
            },
            onAutoplayBlocked: () => {
              if (!current() || !this.ready) return;
              this._state('paused');
              this._status('Press Play in the embedded player, then click the barline capture area to use Space.', 'warning');
            },
          },
        });
      });
      if (!current()) return false;
      this.ready = true;
      this._state('ready');
      const startSeconds = recordingCueSeconds(recording);
      this.player.cueVideoById({ videoId: recording.youtubeId, startSeconds });
      this.timer = this.win.setInterval(() => this._reportTime(), 100);
      this._status(startSeconds > 0
        ? `Ready to play from chapter ${formatTime(startSeconds)}. Press Play, then mark the first barline when you hear it.`
        : 'Recording ready. Play it, then mark each barline.');
      return true;
    } catch (error) {
      if (current()) this._fail(error);
      return false;
    }
  }

  play() {
    if (!this.ready || this.destroyed || this.state === 'error') return false;
    try {
      if (!this.isPlaying) this._state('buffering');
      this.player.playVideo();
      return true;
    } catch (error) { this._fail(error); return false; }
  }

  pause() {
    if (!this.ready || this.destroyed || this.state === 'error') return false;
    // Stop capture immediately, before YouTube's asynchronous state event.
    this._state('paused');
    try { this.player.pauseVideo(); return true; }
    catch (error) { this._fail(error); return false; }
  }

  seek(seconds) {
    if (!this.ready || this.destroyed || this.state === 'error' || !Number.isFinite(seconds) || seconds < 0) return false;
    try {
      const duration = this.player.getDuration();
      if (Number.isFinite(duration) && duration > 0 && seconds > duration) return false;
      if (this.isPlaying) this._state('buffering');
      this.player.seekTo(seconds, true);
      return true;
    } catch (error) { this._fail(error); return false; }
  }

  /** Exact provider timeline, available during review as well as playback. */
  currentTime() {
    if (!this.ready || !this.player || this.destroyed || this.state === 'error') return null;
    try {
      const value = this.player.getCurrentTime();
      return Number.isFinite(value) && value >= 0 ? value : null;
    } catch { return null; }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this._dispose();
    this.stage.replaceChildren();
    this._state('destroyed');
  }
}
