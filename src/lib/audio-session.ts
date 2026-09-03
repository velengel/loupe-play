export const PLAYBACK_RATES = [
  0.5,
  0.6,
  0.7,
  0.75,
  0.8,
  0.85,
  0.9,
  0.95,
  1,
] as const

export type AudioLoadState = 'loading' | 'ready' | 'error'
export type AudioPlaybackState = 'paused' | 'playing'
export type AudioSessionError = 'load' | 'play' | 'loop-order' | 'rate'

export interface AudioLoopState {
  start: number | null
  end: number | null
  enabled: boolean
}

export interface AudioLoopDiagnostics {
  wrapCount: number
  lastOvershootMilliseconds: number | null
  maxOvershootMilliseconds: number | null
  lastLandingErrorMilliseconds: number | null
  maxLandingErrorMilliseconds: number | null
}

export interface AudioSessionState {
  sourceKey: string
  loadState: AudioLoadState
  playbackState: AudioPlaybackState
  position: number
  duration: number | null
  rate: number
  seeking: boolean
  loop: AudioLoopState
  diagnostics: AudioLoopDiagnostics
  error: AudioSessionError | null
}

interface SourceScopedAction {
  sourceKey: string
}

export type AudioSessionAction =
  | ({ type: 'source-changed' } & SourceScopedAction)
  | ({ type: 'load-started' } & SourceScopedAction)
  | ({
      type: 'metadata-loaded'
      duration: number
      position: number
    } & SourceScopedAction)
  | ({ type: 'media-ready' } & SourceScopedAction)
  | ({ type: 'play-started' } & SourceScopedAction)
  | ({ type: 'playback-paused' } & SourceScopedAction)
  | ({ type: 'play-rejected' } & SourceScopedAction)
  | ({ type: 'position-changed'; position: number } & SourceScopedAction)
  | ({ type: 'seeking-changed'; seeking: boolean } & SourceScopedAction)
  | ({ type: 'media-failed' } & SourceScopedAction)
  | ({ type: 'retry-requested' } & SourceScopedAction)
  | ({ type: 'rate-changed'; rate: number } & SourceScopedAction)
  | ({ type: 'rate-rejected' } & SourceScopedAction)
  | ({ type: 'listen-mode-entered' } & SourceScopedAction)
  | ({ type: 'loop-start-set'; position: number } & SourceScopedAction)
  | ({ type: 'loop-end-set'; position: number } & SourceScopedAction)
  | ({ type: 'loop-toggled' } & SourceScopedAction)
  | ({ type: 'loop-cleared' } & SourceScopedAction)
  | ({
      type: 'loop-wrapped'
      overshootMilliseconds: number
    } & SourceScopedAction)
  | ({
      type: 'loop-landed'
      landingErrorMilliseconds: number
    } & SourceScopedAction)

const emptyLoop = (): AudioLoopState => ({
  start: null,
  end: null,
  enabled: false,
})

const emptyDiagnostics = (): AudioLoopDiagnostics => ({
  wrapCount: 0,
  lastOvershootMilliseconds: null,
  maxOvershootMilliseconds: null,
  lastLandingErrorMilliseconds: null,
  maxLandingErrorMilliseconds: null,
})

export function createAudioSessionState(sourceKey: string): AudioSessionState {
  return {
    sourceKey,
    loadState: 'loading',
    playbackState: 'paused',
    position: 0,
    duration: null,
    rate: 1,
    seeking: false,
    loop: emptyLoop(),
    diagnostics: emptyDiagnostics(),
    error: null,
  }
}

function clampPosition(position: number, duration: number | null): number | null {
  if (!Number.isFinite(position)) {
    return null
  }

  const nonNegativePosition = Math.max(0, position)

  return duration === null
    ? nonNegativePosition
    : Math.min(nonNegativePosition, duration)
}

function isFiniteDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration >= 0
}

function isValidRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0
}

function sanitizeMilliseconds(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

function clearLoopOrderError(
  error: AudioSessionError | null,
): AudioSessionError | null {
  return error === 'loop-order' ? null : error
}

export function audioSessionReducer(
  state: AudioSessionState,
  action: AudioSessionAction,
): AudioSessionState {
  if (action.type === 'source-changed') {
    return createAudioSessionState(action.sourceKey)
  }

  if (action.sourceKey !== state.sourceKey) {
    return state
  }

  switch (action.type) {
    case 'load-started':
    case 'retry-requested':
      return createAudioSessionState(state.sourceKey)

    case 'metadata-loaded': {
      if (!isFiniteDuration(action.duration)) {
        return {
          ...state,
          loadState: 'error',
          playbackState: 'paused',
          position: 0,
          duration: null,
          seeking: false,
          error: 'load',
        }
      }

      return {
        ...state,
        loadState: 'ready',
        position: clampPosition(action.position, action.duration) ?? 0,
        duration: action.duration,
        error: null,
      }
    }

    case 'media-ready':
      return {
        ...state,
        loadState: 'ready',
        error: state.error === 'load' ? null : state.error,
      }

    case 'play-started':
      return {
        ...state,
        playbackState: 'playing',
        error: state.error === 'play' ? null : state.error,
      }

    case 'playback-paused':
      return { ...state, playbackState: 'paused' }

    case 'play-rejected':
      return {
        ...state,
        playbackState: 'paused',
        error: state.error === 'load' ? 'load' : 'play',
      }

    case 'position-changed': {
      const position = clampPosition(action.position, state.duration)

      return position === null ? state : { ...state, position }
    }

    case 'seeking-changed':
      return { ...state, seeking: action.seeking }

    case 'media-failed':
      return {
        ...createAudioSessionState(state.sourceKey),
        loadState: 'error',
        error: 'load',
      }

    case 'rate-changed':
      return isValidRate(action.rate)
        ? {
            ...state,
            rate: action.rate,
            error: state.error === 'rate' ? null : state.error,
          }
        : { ...state, error: 'rate' }

    case 'rate-rejected':
      return {
        ...state,
        error: state.error === 'load' ? 'load' : 'rate',
      }

    case 'listen-mode-entered':
      return {
        ...state,
        rate: 1,
        loop: { ...state.loop, enabled: false },
        error: state.error === 'rate' ? null : state.error,
      }

    case 'loop-start-set': {
      const start = clampPosition(action.position, state.duration)

      if (start === null) {
        return { ...state, error: 'loop-order' }
      }

      const end = state.loop.end !== null && state.loop.end > start
        ? state.loop.end
        : null

      return {
        ...state,
        loop: { start, end, enabled: false },
        error: clearLoopOrderError(state.error),
      }
    }

    case 'loop-end-set': {
      const end = clampPosition(action.position, state.duration)

      if (state.loop.start === null || end === null || end <= state.loop.start) {
        return {
          ...state,
          loop: { ...state.loop, end: null, enabled: false },
          error: 'loop-order',
        }
      }

      return {
        ...state,
        loop: { ...state.loop, end, enabled: false },
        error: clearLoopOrderError(state.error),
      }
    }

    case 'loop-toggled':
      return state.loop.start !== null &&
        state.loop.end !== null &&
        state.loop.start < state.loop.end
        ? {
            ...state,
            loop: { ...state.loop, enabled: !state.loop.enabled },
            error: clearLoopOrderError(state.error),
          }
        : {
            ...state,
            loop: { ...state.loop, enabled: false },
            error: 'loop-order',
          }

    case 'loop-cleared':
      return {
        ...state,
        loop: emptyLoop(),
        diagnostics: emptyDiagnostics(),
        error: clearLoopOrderError(state.error),
      }

    case 'loop-wrapped': {
      const overshoot = sanitizeMilliseconds(action.overshootMilliseconds)

      if (overshoot === null) {
        return state
      }

      return {
        ...state,
        diagnostics: {
          ...state.diagnostics,
          wrapCount: state.diagnostics.wrapCount + 1,
          lastOvershootMilliseconds: overshoot,
          maxOvershootMilliseconds: Math.max(
            state.diagnostics.maxOvershootMilliseconds ?? 0,
            overshoot,
          ),
        },
      }
    }

    case 'loop-landed': {
      const landingError = sanitizeMilliseconds(
        action.landingErrorMilliseconds,
      )

      if (landingError === null) {
        return state
      }

      return {
        ...state,
        diagnostics: {
          ...state.diagnostics,
          lastLandingErrorMilliseconds: landingError,
          maxLandingErrorMilliseconds: Math.max(
            state.diagnostics.maxLandingErrorMilliseconds ?? 0,
            landingError,
          ),
        },
      }
    }
  }
}

export interface SeekableMedia {
  currentTime: number
  duration: number
}

export function seekToSeconds(
  media: SeekableMedia,
  targetSeconds: number,
): number | null {
  if (
    !isFiniteDuration(media.duration) ||
    !Number.isFinite(media.currentTime) ||
    !Number.isFinite(targetSeconds)
  ) {
    return null
  }

  const target = Math.min(Math.max(0, targetSeconds), media.duration)
  media.currentTime = target

  return target
}

export function seekBySeconds(
  media: SeekableMedia,
  deltaSeconds: number,
): number | null {
  if (!Number.isFinite(deltaSeconds)) {
    return null
  }

  return seekToSeconds(media, media.currentTime + deltaSeconds)
}

export interface PlaybackRateMedia {
  playbackRate: number
  preservesPitch?: boolean
  webkitPreservesPitch?: boolean
}

export interface VolumeMedia {
  volume: number
}

export function applyVolume(
  media: VolumeMedia,
  requestedVolume: number,
): number {
  if (!Number.isFinite(requestedVolume)) {
    return media.volume
  }

  const volume = Math.min(Math.max(0, requestedVolume), 1)
  media.volume = volume

  return volume
}

export function applyPlaybackRate(
  media: PlaybackRateMedia,
  rate: number,
): number {
  if (!isValidRate(rate)) {
    throw new RangeError('Playback rate must be a finite positive number')
  }

  if ('preservesPitch' in media) {
    media.preservesPitch = true
  }

  if ('webkitPreservesPitch' in media) {
    media.webkitPreservesPitch = true
  }

  media.playbackRate = rate

  return rate
}

export interface LoopBoundaryMedia {
  currentTime: number
  seeking: boolean
}

export interface LoopBoundaryResult {
  target: number
  overshootMilliseconds: number
}

export function enforceLoopBoundary(
  media: LoopBoundaryMedia,
  loop: AudioLoopState,
): LoopBoundaryResult | null {
  if (
    !loop.enabled ||
    media.seeking ||
    loop.start === null ||
    loop.end === null ||
    !Number.isFinite(loop.start) ||
    !Number.isFinite(loop.end) ||
    loop.start < 0 ||
    loop.end <= loop.start ||
    !Number.isFinite(media.currentTime) ||
    media.currentTime < loop.end
  ) {
    return null
  }

  const overshootMilliseconds = Math.round(
    Math.max(0, media.currentTime - loop.end) * 1_000,
  )
  media.currentTime = loop.start

  return { target: loop.start, overshootMilliseconds }
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '--:--'
  }

  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(
      remainingSeconds,
    ).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}
