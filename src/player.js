// Official, visible YouTube playback. The iframe API is requested only by play().
// https://developers.google.com/youtube/iframe_api_reference
const apiLoads = new WeakMap();
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LOAD_TIMEOUT = 20000;

function validAnchors(anchors) {
  return Array.isArray(anchors) && anchors.length >= 2 && anchors.every((anchor, i) =>
    anchor && Number.isFinite(anchor.beat) && Number.isFinite(anchor.seconds)
    && anchor.seconds >= 0
    && (i === 0 || (anchor.beat > anchors[i - 1].beat && anchor.seconds > anchors[i - 1].seconds)));
}

function interpolate(anchors, value, from, to) {
  if (!validAnchors(anchors) || !Number.isFinite(value)
    || value < anchors[0][from] || value > anchors.at(-1)[from]) return null;
  for (let i = 1; i < anchors.length; i += 1) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (value <= b[from]) return a[to] + (value - a[from]) / (b[from] - a[from]) * (b[to] - a[to]);
  }
  return null;
}

/** Piecewise linear interpolation between documented anchors; never extrapolates. */
export function beatToSeconds(anchors, beat) {
  return interpolate(anchors, beat, 'beat', 'seconds');
}

export function secondsToBeat(anchors, seconds) {
  return interpolate(anchors, seconds, 'seconds', 'beat');
}

/** Throws when a clip has no usable recording-specific alignment. */
export function getClipBounds(recording, entry) {
  if (!recording || !VIDEO_ID.test(recording.youtubeId ?? '')) {
    throw new Error('This recording does not have a valid YouTube video ID.');
  }
  if (!['source-aligned', 'estimated'].includes(recording.alignment?.status)) {
    throw new Error('Timing alignment is unavailable for this recording. Open it on YouTube to listen.');
  }
  if (!validAnchors(recording.alignment.anchors)) {
    throw new Error('Timing anchors must contain at least two finite, strictly increasing beat and second values.');
  }
  if (!entry || !Number.isFinite(entry.start) || !Number.isFinite(entry.end) || entry.end <= entry.start) {
    throw new Error('Select a segment with a valid start and end beat.');
  }
  const startSeconds = beatToSeconds(recording.alignment.anchors, entry.start);
  const endSeconds = beatToSeconds(recording.alignment.anchors, entry.end);
  if (startSeconds === null || endSeconds === null) {
    throw new Error('This segment is outside the recording’s available timing alignment.');
  }
  return { startSeconds, endSeconds };
}

/** True only when this exact entry is covered by a usable timing map. */
export function canPlayEntry(recording, entry) {
  try { return Boolean(getClipBounds(recording, entry)); } catch { return false; }
}

export function hasPlayableEntries(piece) {
  return piece.recordings.some(recording => piece.entries.some(entry => canPlayEntry(recording, entry)));
}

export function playbackStatus(piece) {
  if (hasPlayableEntries(piece)) return 'synchronized';
  return piece.recordings.length ? 'manual-timing' : 'analysis-only';
}

export function loadYouTubeAPI(win, doc) {
  if (win.YT?.Player) return Promise.resolve(win.YT);
  if (apiLoads.has(win)) return apiLoads.get(win);
  let script;
  const promise = new Promise((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady;
    let timeout;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timeout);
      script?.removeEventListener('error', onError);
      if (win.onYouTubeIframeAPIReady === ready) win.onYouTubeIframeAPIReady = previous;
      if (error) {
        apiLoads.delete(win);
        script?.remove();
        reject(error);
      } else resolve(win.YT);
    };
    const onError = () => finish(new Error('YouTube could not load. Check your connection or open the recording on YouTube.'));
    const ready = () => {
      try { if (typeof previous === 'function') previous(); } finally {
        if (win.YT?.Player) finish();
        else onError();
      }
    };
    win.onYouTubeIframeAPIReady = ready;
    script = doc.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const isNew = !script;
    if (isNew) {
      script = doc.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
    }
    script.addEventListener('error', onError, { once: true });
    timeout = win.setTimeout(onError, LOAD_TIMEOUT);
    if (isNew) doc.head.append(script);
  });
  apiLoads.set(win, promise);
  return promise;
}

const errorMessages = {
  2: 'YouTube could not recognize this recording.',
  5: 'This browser could not play the YouTube recording.',
  100: 'This recording is private, removed, or unavailable on YouTube.',
  101: 'The recording owner does not allow embedded playback.',
  150: 'The recording owner does not allow embedded playback.',
  153: 'YouTube could not verify this website for embedded playback.',
};

export class SegmentPlayer {
  constructor({ container, onStatus = () => {}, onTime = () => {}, onState = () => {} }) {
    if (!container?.ownerDocument) throw new TypeError('SegmentPlayer needs a DOM container.');
    this.container = container;
    this.doc = container.ownerDocument;
    this.win = this.doc.defaultView;
    this.onStatus = onStatus;
    this.onTime = onTime;
    this.onState = onState;
    this.player = null;
    this.readyPromise = null;
    this.active = null;
    this.intent = 0;
    this.loadedIntent = 0;
    this.loop = false;
    this.destroyed = false;
    this.playing = false;
    this.timer = null;
    this.state = 'paused';
    this.stage = this.doc.createElement('div');
    this.stage.className = 'segment-player-frame';
    Object.assign(this.stage.style, { minWidth: '200px', minHeight: '200px', width: '100%', aspectRatio: '16 / 9' });
    this.stage.textContent = 'Select a segment to load the YouTube player.';
    this.message = this.doc.createElement('p');
    this.message.className = 'segment-player-message';
    this.message.setAttribute('aria-live', 'polite');
    container.replaceChildren(this.stage, this.message);
  }

  get isPlaying() { return this.playing; }

  _setState(state) {
    this.playing = state === 'playing';
    if (this.state !== state) {
      this.state = state;
      this.onState(state);
    }
  }

  _status(message, type = 'info', recording = this.active?.recording, startSeconds = this.active?.startSeconds) {
    this.message.replaceChildren();
    const text = this.doc.createElement('span');
    text.textContent = message;
    this.message.append(text);
    if (recording && VIDEO_ID.test(recording.youtubeId ?? '')) {
      const link = this.doc.createElement('a');
      const start = Number.isFinite(startSeconds) ? `&t=${Math.floor(startSeconds)}s` : '';
      link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(recording.youtubeId)}${start}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open on YouTube';
      link.className = 'segment-player-fallback';
      this.message.append(this.doc.createTextNode(' '), link);
    }
    this.onStatus({ message, type });
  }

  _clearTimer() {
    if (this.timer !== null) this.win.clearInterval(this.timer);
    this.timer = null;
  }

  _ensurePlayer(YT) {
    if (this.readyPromise) return this.readyPromise;
    const generation = (this.playerGeneration || 0) + 1;
    this.playerGeneration = generation;
    this.stage.replaceChildren();
    const mount = this.doc.createElement('div');
    this.stage.append(mount);
    this.readyPromise = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      const timeout = this.win.setTimeout(() => {
        this.readyTimeout = null;
        this.playerGeneration += 1;
        this.player?.destroy();
        this.player = null;
        reject(new Error('The YouTube player took too long to respond. Try again or open the recording on YouTube.'));
      }, LOAD_TIMEOUT);
      this.readyTimeout = timeout;
      const origin = this.win.location?.origin;
      try {
        this.player = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          playerVars: {
            enablejsapi: 1,
            controls: 1,
            playsinline: 1,
            autoplay: 0,
            ...(origin && origin !== 'null' ? { origin } : {}),
          },
          events: {
            onReady: (event) => {
              this.win.clearTimeout(timeout);
              if (this.destroyed || generation !== this.playerGeneration) {
                event.target.destroy();
                return;
              }
              this.readyTimeout = null;
              this.rejectReady = null;
              const iframe = event.target.getIframe?.();
              if (iframe) {
                iframe.title = 'YouTube recording player';
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                Object.assign(iframe.style, { display: 'block', width: '100%', height: '100%', minWidth: '200px', minHeight: '200px', aspectRatio: '16 / 9' });
              }
              resolve(event.target);
            },
            onStateChange: (event) => {
              if (generation === this.playerGeneration) this._handleState(event.data);
            },
            onError: (event) => {
              if (generation === this.playerGeneration) this._handleError(event.data);
            },
            onAutoplayBlocked: () => {
              if (generation !== this.playerGeneration || !this._isActive()) return;
              this._clearTimer();
              this._setState('paused');
              this._status('Your browser paused playback. Press Play in the visible YouTube player to hear this segment.', 'warning');
            },
          },
        });
      } catch (error) {
        this.win.clearTimeout(timeout);
        this.readyTimeout = null;
        this.rejectReady = null;
        reject(error);
      }
    }).catch((error) => {
      this.readyPromise = null;
      throw error;
    });
    return this.readyPromise;
  }

  _isActive() { return !this.destroyed && this.active && this.loadedIntent === this.intent; }

  /** Call from a user click. Resolves false for validation errors or superseded requests. */
  async play(recording, entry, { loop = false } = {}) {
    if (this.destroyed) return false;
    const intent = ++this.intent;
    this.loadedIntent = 0;
    this._clearTimer();
    this.player?.pauseVideo?.();
    this.active = null;
    let bounds;
    try { bounds = getClipBounds(recording, entry); } catch (error) {
      this._setState('error');
      this._status(error.message, 'error', recording);
      return false;
    }
    this.loop = Boolean(loop);
    this.active = {
      recording,
      anchors: recording.alignment.anchors.map((anchor) => ({ ...anchor })),
      entry: { ...entry },
      ...bounds,
    };
    this._setState('loading');
    this._status('Loading the selected segment in YouTube…');
    try {
      const YT = await loadYouTubeAPI(this.win, this.doc);
      if (this.destroyed || intent !== this.intent) return false;
      await this._ensurePlayer(YT);
      if (this.destroyed || intent !== this.intent) return false;
      this.loadedIntent = intent;
      this._loadClip();
      return true;
    } catch (error) {
      if (this.destroyed || intent !== this.intent) return false;
      this._clearTimer();
      this._setState('error');
      this._status(error.message || 'YouTube playback could not start.', 'error');
      return false;
    }
  }

  _loadClip() {
    if (!this._isActive()) return;
    this.segmentEnded = false;
    this.hasPlayed = false;
    const { recording, startSeconds, endSeconds } = this.active;
    this.player.loadVideoById({ videoId: recording.youtubeId, startSeconds, endSeconds });
    this.onTime({ seconds: startSeconds, beat: this.active.entry.start });
    this._status(recording.alignment.status === 'estimated'
      ? 'Playing with estimated timing; segment boundaries may differ from the score.'
      : 'Segment loaded. Press Play in the YouTube player if playback does not begin.',
    recording.alignment.status === 'estimated' ? 'warning' : 'info');
  }

  _handleState(state) {
    if (!this._isActive()) return;
    // Events from the video that was replaced can arrive after a new load call.
    const actualId = this.player.getVideoData?.()?.video_id;
    if (actualId && actualId !== this.active.recording.youtubeId) return;
    if (state === 1) {
      if (this.segmentEnded) { this._loadClip(); return; }
      this.hasPlayed = true;
      this._setState('playing');
      this._clearTimer();
      this.timer = this.win.setInterval(() => this._tick(), 100);
      this._tick();
    } else if (state === 0 && this.hasPlayed) {
      this._finishSegment();
    } else if (state === 2 && !this.segmentEnded) {
      this._clearTimer();
      this._setState('paused');
    } else if (state === 3 && !this.segmentEnded) {
      this._clearTimer();
      this._setState('loading');
    }
  }

  _tick() {
    if (!this._isActive() || !this.playing) return;
    const seconds = this.player.getCurrentTime?.();
    if (!Number.isFinite(seconds)) return;
    if (seconds >= this.active.endSeconds) { this._finishSegment(); return; }
    this.onTime({ seconds, beat: secondsToBeat(this.active.anchors, seconds) });
  }

  _finishSegment() {
    if (!this._isActive() || this.segmentEnded) return;
    this.segmentEnded = true;
    this._clearTimer();
    this.player.pauseVideo();
    this.onTime({ seconds: this.active.endSeconds, beat: this.active.entry.end });
    if (this.loop) {
      this._setState('loading');
      this._loadClip(); // Reload keeps endSeconds in force; seekTo would discard it.
    } else {
      this._setState('ended');
      this._status('Segment finished. Select a segment to listen again.');
    }
  }

  _handleError(code) {
    if (!this._isActive()) return;
    const actualId = this.player?.getVideoData?.()?.video_id;
    if (actualId && actualId !== this.active.recording.youtubeId) return;
    this._clearTimer();
    this.loadedIntent = 0;
    this.player?.pauseVideo?.();
    this._setState('error');
    this._status(`${errorMessages[code] || 'YouTube could not play this recording.'} Use the YouTube link to continue.`, 'error');
  }

  pause() {
    if (this.destroyed) return;
    const wasLoaded = this.loadedIntent === this.intent;
    this.intent += 1;
    this.loadedIntent = wasLoaded ? this.intent : 0;
    if (!wasLoaded) this.active = null;
    this._clearTimer();
    this.player?.pauseVideo?.();
    this._setState('paused');
  }

  /** Cancels pending API/player loads as well as the current recording. */
  stop() {
    if (this.destroyed) return;
    this.intent += 1;
    this.loadedIntent = 0;
    this.active = null;
    this._clearTimer();
    this.player?.stopVideo?.();
    this._setState('paused');
    this._status('Select a segment to listen.');
  }

  setLoop(loop) { this.loop = Boolean(loop); }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.win.clearTimeout(this.readyTimeout);
    this.rejectReady?.(new Error('Player destroyed.'));
    this.rejectReady = null;
    this.player?.destroy();
    this.player = null;
    this.container.replaceChildren();
  }
}
