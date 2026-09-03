import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react'

import {
  PLAYBACK_RATES,
  applyPlaybackRate,
  applyVolume,
  audioSessionReducer,
  createAudioSessionState,
  enforceLoopBoundary,
  formatPlaybackTime,
  seekBySeconds,
  seekToSeconds,
} from '../lib/audio-session'
import type { LibraryTrack } from '../lib/library-ui-state'
import type { ListenQueueDirection } from '../lib/listen-queue'
import type { MarkerGateway } from '../lib/marker-repository'
import type { NoteGateway } from '../lib/note-repository'
import {
  createPlaybackRecorder,
  type PlaybackSnapshot,
} from '../lib/playback-recorder'
import type {
  PlayEvent,
  PlayEventCloseReason,
  PlayEventRepository,
} from '../lib/play-event-repository'
import MarkerPanel from './MarkerPanel'
import NotePanel from './NotePanel'

export interface ListenPlaybackRequest {
  id: number
  intent: 'pause' | 'play'
  focusPlayback: boolean
}

export interface ListenSeekRequest {
  id: number
  trackId: string
  positionMs: number
}

interface ListenPlayerProps {
  track: LibraryTrack
  sourceUrl: string
  playbackRequest: ListenPlaybackRequest
  hasPrevious: boolean
  hasNext: boolean
  onMove: (
    direction: ListenQueueDirection,
    continuePlayback: boolean,
  ) => void
  onEnded: () => void
  onModeChange?: (mode: PlayerMode) => void
  markerGateway?: MarkerGateway
  historyGateway?: PlayEventRepository
  noteGateway?: NoteGateway
  seekRequest?: ListenSeekRequest | null
}

export type PlayerMode = 'listen' | 'practice'
type RateFailure = 'change' | 'listen-return'

interface RateFailureState {
  sourceKey: string
  kind: RateFailure
}

interface PendingLoopLanding {
  sourceKey: string
  target: number
}

const LOOP_SEEK_TARGET_TOLERANCE_SECONDS = 0.001

function displayTitle(track: LibraryTrack): string {
  const title = track.title?.trim()

  if (title) {
    return title
  }

  const extensionStart = track.fileName.lastIndexOf('.')
  return extensionStart > 0
    ? track.fileName.slice(0, extensionStart)
    : track.fileName
}

function formatLoopPoint(position: number | null): string {
  if (position === null || !Number.isFinite(position) || position < 0) {
    return '—'
  }

  const wholeSeconds = Math.floor(position)
  const hundredths = Math.floor((position - wholeSeconds) * 100 + 1e-7)
  return `${formatPlaybackTime(wholeSeconds)}.${String(hundredths).padStart(2, '0')}`
}

function diagnosticValue(value: number | null): string {
  return value === null ? '—' : String(Math.round(value))
}

function ListenPlayer({
  track,
  sourceUrl,
  playbackRequest,
  hasPrevious,
  hasNext,
  onMove,
  onEnded,
  onModeChange,
  markerGateway,
  historyGateway,
  noteGateway,
  seekRequest = null,
}: ListenPlayerProps) {
  const sourceKey = `${playbackRequest.id}:${track.id}`
  const [state, dispatch] = useReducer(
    audioSessionReducer,
    sourceKey,
    createAudioSessionState,
  )
  const [volume, setVolume] = useState(1)
  const [mode, setMode] = useState<PlayerMode>('listen')
  const [rateFailure, setRateFailure] = useState<RateFailureState | null>(null)
  const [retryingSourceKey, setRetryingSourceKey] = useState<string | null>(
    null,
  )
  const [historyErrorSourceKey, setHistoryErrorSourceKey] = useState<
    string | null
  >(null)
  const [latestPlayEvent, setLatestPlayEvent] = useState<PlayEvent | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playButtonRef = useRef<HTMLButtonElement | null>(null)
  const activeSourceRef = useRef(sourceKey)
  const stateRef = useRef(state)
  const modeRef = useRef<PlayerMode>('listen')
  const loopActiveRef = useRef(false)
  const volumeRef = useRef(volume)
  const playbackIntentRef = useRef<ListenPlaybackRequest['intent']>(
    playbackRequest.intent,
  )
  const playRequestSequenceRef = useRef(0)
  const handledEndedSourceRef = useRef<string | null>(null)
  const consumedPlaybackRequestRef = useRef<number | null>(null)
  const consumedSeekRequestRef = useRef<number | null>(null)
  const pendingLoopLandingRef = useRef<PendingLoopLanding | null>(null)
  const onModeChangeRef = useRef(onModeChange)
  const confirmedPlayingRef = useRef(false)
  const renderedSourceKeyRef = useRef(sourceKey)
  const renderedTrackIdRef = useRef(track.id)
  const recorderOwnerRef = useRef<{
    gateway: PlayEventRepository
    recorder: ReturnType<typeof createPlaybackRecorder>
  } | null>(null)

  renderedSourceKeyRef.current = sourceKey
  renderedTrackIdRef.current = track.id

  if (
    historyGateway &&
    recorderOwnerRef.current?.gateway !== historyGateway
  ) {
    recorderOwnerRef.current = {
      gateway: historyGateway,
      recorder: createPlaybackRecorder(historyGateway, {
        onStarted: (event) => {
          if (renderedTrackIdRef.current === event.trackId) {
            setLatestPlayEvent(event)
          }
          setHistoryErrorSourceKey(null)
        },
        onError: () =>
          setHistoryErrorSourceKey(renderedSourceKeyRef.current),
      }),
    }
  }
  if (!historyGateway) {
    recorderOwnerRef.current = null
  }
  const historyRecorder = recorderOwnerRef.current?.recorder ?? null

  const currentState =
    state.sourceKey === sourceKey ? state : createAudioSessionState(sourceKey)
  const title = displayTitle(track)
  const artist = track.artist?.trim() || null
  const album = track.album?.trim() || null
  const canPlay = currentState.loadState === 'ready'
  const canSeek = canPlay && currentState.duration !== null
  const retrying = retryingSourceKey === sourceKey
  const currentRateFailure =
    rateFailure?.sourceKey === sourceKey ? rateFailure.kind : null
  const hasLoopRange =
    currentState.loop.start !== null && currentState.loop.end !== null
  const historyError = historyErrorSourceKey === sourceKey
  const latestPlayEventId =
    latestPlayEvent?.trackId === track.id ? latestPlayEvent.id : null

  useEffect(() => {
    stateRef.current = currentState
    loopActiveRef.current =
      modeRef.current === 'practice' && currentState.loop.enabled
  }, [currentState])

  useEffect(() => {
    onModeChangeRef.current = onModeChange
  }, [onModeChange])

  useEffect(
    () => () => {
      onModeChangeRef.current?.('listen')
    },
    [],
  )

  useLayoutEffect(() => {
    const audio = audioRef.current
    activeSourceRef.current = sourceKey
    playRequestSequenceRef.current += 1
    playbackIntentRef.current = playbackRequest.intent
    handledEndedSourceRef.current = null
    pendingLoopLandingRef.current = null
    loopActiveRef.current = false
    confirmedPlayingRef.current = false
    dispatch({ type: 'source-changed', sourceKey })

    if (audio) {
      applyVolume(audio, volumeRef.current)

      try {
        applyPlaybackRate(audio, 1)
      } catch {
        dispatch({ type: 'rate-rejected', sourceKey })
      }
    }

    if (playbackRequest.focusPlayback) {
      playButtonRef.current?.focus({ preventScroll: true })
    }

    return () => {
      const endPositionMs = positionMilliseconds(audio)
      const reason: PlayEventCloseReason =
        renderedSourceKeyRef.current === sourceKey
          ? 'unmount'
          : 'track-change'
      if (endPositionMs !== null) {
        void historyRecorder?.close(endPositionMs, reason)
      }
      confirmedPlayingRef.current = false
      if (audio && !audio.paused) {
        audio.pause()
      }
    }
  }, [
    historyRecorder,
    playbackRequest.focusPlayback,
    playbackRequest.intent,
    sourceKey,
  ])

  function positionMilliseconds(
    audio: HTMLAudioElement | null = audioRef.current,
  ): number | null {
    if (!audio || !Number.isFinite(audio.currentTime)) {
      return null
    }
    const maximum =
      Number.isFinite(audio.duration) && audio.duration >= 0
        ? audio.duration
        : Number.POSITIVE_INFINITY
    const milliseconds = Math.round(
      Math.max(0, Math.min(audio.currentTime, maximum)) * 1_000,
    )
    return Number.isSafeInteger(milliseconds) ? milliseconds : null
  }

  function loopMilliseconds(
    session = stateRef.current,
    requestedMode: PlayerMode = modeRef.current,
    enabled = session.loop.enabled,
  ): { loopStartMs: number | null; loopEndMs: number | null } {
    if (
      requestedMode !== 'practice' ||
      !enabled ||
      session.loop.start === null ||
      session.loop.end === null ||
      session.loop.start >= session.loop.end
    ) {
      return { loopStartMs: null, loopEndMs: null }
    }
    return {
      loopStartMs: Math.round(session.loop.start * 1_000),
      loopEndMs: Math.round(session.loop.end * 1_000),
    }
  }

  function playbackSnapshot(
    overrides: Partial<PlaybackSnapshot> = {},
  ): PlaybackSnapshot | null {
    const positionMs = positionMilliseconds()
    if (positionMs === null) {
      return null
    }
    const loop = loopMilliseconds(
      stateRef.current,
      overrides.mode ?? modeRef.current,
    )
    return {
      trackId: track.id,
      positionMs,
      mode: modeRef.current,
      playbackRate: stateRef.current.rate,
      ...loop,
      ...overrides,
    }
  }

  function splitHistory(
    reason: PlayEventCloseReason,
    overrides: Partial<PlaybackSnapshot> = {},
  ) {
    if (!confirmedPlayingRef.current || !historyRecorder) {
      return
    }
    const endPositionMs = positionMilliseconds()
    const next = playbackSnapshot(overrides)
    if (endPositionMs === null || !next) {
      return
    }
    void historyRecorder.split(endPositionMs, reason, next)
  }

  const observeLoopBoundary = useCallback(() => {
    const audio = audioRef.current
    const session = stateRef.current

    if (
      modeRef.current !== 'practice' ||
      !loopActiveRef.current ||
      playbackIntentRef.current !== 'play' ||
      !audio ||
      activeSourceRef.current !== session.sourceKey ||
      session.playbackState !== 'playing'
    ) {
      return
    }

    const observation = enforceLoopBoundary(audio, session.loop)

    if (!observation) {
      return
    }

    pendingLoopLandingRef.current = {
      sourceKey: session.sourceKey,
      target: observation.target,
    }
    dispatch({
      type: 'loop-wrapped',
      sourceKey: session.sourceKey,
      overshootMilliseconds: observation.overshootMilliseconds,
    })
  }, [])

  useEffect(() => {
    if (
      mode !== 'practice' ||
      currentState.playbackState !== 'playing' ||
      !currentState.loop.enabled ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      return
    }

    let frameId: number | null = null

    const tick = () => {
      if (modeRef.current !== 'practice' || !loopActiveRef.current) {
        return
      }

      observeLoopBoundary()

      if (modeRef.current === 'practice' && loopActiveRef.current) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [
    currentState.loop.enabled,
    currentState.playbackState,
    mode,
    observeLoopBoundary,
    sourceKey,
  ])

  async function requestPlay(
    audio: HTMLAudioElement,
    requestSourceKey: string,
  ) {
    const playRequestId = ++playRequestSequenceRef.current

    if (activeSourceRef.current === requestSourceKey) {
      playbackIntentRef.current = 'play'
    }

    try {
      await audio.play()

      if (
        activeSourceRef.current !== requestSourceKey ||
        playRequestSequenceRef.current !== playRequestId
      ) {
        return
      }

      dispatch({ type: 'play-started', sourceKey: requestSourceKey })
    } catch {
      if (
        activeSourceRef.current !== requestSourceKey ||
        playRequestSequenceRef.current !== playRequestId
      ) {
        return
      }

      playbackIntentRef.current = 'pause'
      dispatch({ type: 'play-rejected', sourceKey: requestSourceKey })
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current
    const session = stateRef.current

    if (!audio || session.loadState !== 'ready') {
      return
    }

    if (session.playbackState === 'playing') {
      playRequestSequenceRef.current += 1
      playbackIntentRef.current = 'pause'
      audio.pause()
      return
    }

    await requestPlay(audio, session.sourceKey)
  }

  function seekTo(position: number) {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    const previousPositionMs = positionMilliseconds(audio)
    pendingLoopLandingRef.current = null
    const nextPosition = seekToSeconds(audio, position)

    if (nextPosition !== null) {
      if (
        confirmedPlayingRef.current &&
        previousPositionMs !== null &&
        historyRecorder
      ) {
        const next = playbackSnapshot({
          positionMs: Math.round(nextPosition * 1_000),
        })
        if (next) {
          void historyRecorder.split(
            previousPositionMs,
            'manual-seek',
            next,
          )
        }
      }
      dispatch({
        type: 'position-changed',
        sourceKey,
        position: nextPosition,
      })
    }
  }

  function movePosition(seconds: number) {
    const audio = audioRef.current

    if (!audio || !canSeek) {
      return
    }

    const previousPositionMs = positionMilliseconds(audio)
    pendingLoopLandingRef.current = null
    const nextPosition = seekBySeconds(audio, seconds)

    if (nextPosition !== null) {
      if (
        confirmedPlayingRef.current &&
        previousPositionMs !== null &&
        historyRecorder
      ) {
        const next = playbackSnapshot({
          positionMs: Math.round(nextPosition * 1_000),
        })
        if (next) {
          void historyRecorder.split(
            previousPositionMs,
            'manual-seek',
            next,
          )
        }
      }
      dispatch({
        type: 'position-changed',
        sourceKey,
        position: nextPosition,
      })
    }
  }

  function changeRate(rate: number) {
    const audio = audioRef.current

    if (!audio || !canPlay) {
      return
    }

    try {
      applyPlaybackRate(audio, rate)
      splitHistory('rate-change', { playbackRate: rate })
      setRateFailure(null)
      dispatch({ type: 'rate-changed', sourceKey, rate })
    } catch {
      setRateFailure({ sourceKey, kind: 'change' })
      dispatch({ type: 'rate-rejected', sourceKey })
    }
  }

  function setLoopStart() {
    if (!canSeek) {
      return
    }

    const session = stateRef.current

    if (session.loop.enabled) {
      splitHistory('loop-change', {
        loopStartMs: null,
        loopEndMs: null,
      })
    }
    pendingLoopLandingRef.current = null
    loopActiveRef.current = false
    dispatch({
      type: 'loop-start-set',
      sourceKey,
      position: audioRef.current?.currentTime ?? session.position,
    })
  }

  function setLoopEnd() {
    if (!canSeek) {
      return
    }

    const session = stateRef.current

    if (session.loop.enabled) {
      splitHistory('loop-change', {
        loopStartMs: null,
        loopEndMs: null,
      })
    }
    pendingLoopLandingRef.current = null
    loopActiveRef.current = false
    dispatch({
      type: 'loop-end-set',
      sourceKey,
      position: audioRef.current?.currentTime ?? session.position,
    })
  }

  function toggleLoop() {
    const session = stateRef.current
    const validRange =
      session.loop.start !== null &&
      session.loop.end !== null &&
      session.loop.start < session.loop.end

    if (!validRange) {
      return
    }

    pendingLoopLandingRef.current = null
    const enabling = !session.loop.enabled
    const nextLoop = loopMilliseconds(session, modeRef.current, enabling)
    splitHistory('loop-change', nextLoop)
    loopActiveRef.current = !session.loop.enabled
    dispatch({ type: 'loop-toggled', sourceKey })
  }

  function clearLoop() {
    if (
      stateRef.current.loop.start === null &&
      stateRef.current.loop.end === null
    ) {
      return
    }

    if (stateRef.current.loop.enabled) {
      splitHistory('loop-change', {
        loopStartMs: null,
        loopEndMs: null,
      })
    }
    pendingLoopLandingRef.current = null
    loopActiveRef.current = false
    dispatch({ type: 'loop-cleared', sourceKey })
  }

  function switchMode() {
    if (modeRef.current === 'listen') {
      splitHistory('mode-change', {
        mode: 'practice',
        loopStartMs: null,
        loopEndMs: null,
      })
      modeRef.current = 'practice'
      setMode('practice')
      onModeChange?.('practice')
      return
    }

    const audio = audioRef.current

    if (!audio) {
      return
    }

    try {
      applyPlaybackRate(audio, 1)
    } catch {
      setRateFailure({ sourceKey, kind: 'listen-return' })
      dispatch({ type: 'rate-rejected', sourceKey })
      return
    }

    pendingLoopLandingRef.current = null
    splitHistory('mode-change', {
      mode: 'listen',
      playbackRate: 1,
      loopStartMs: null,
      loopEndMs: null,
    })
    loopActiveRef.current = false
    modeRef.current = 'listen'
    setRateFailure(null)
    dispatch({ type: 'listen-mode-entered', sourceKey })
    setMode('listen')
    onModeChange?.('listen')
  }

  function changeVolume(requestedVolume: number) {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    const nextVolume = applyVolume(audio, requestedVolume)
    volumeRef.current = nextVolume
    setVolume(nextVolume)
  }

  function handleLoadedMetadata(audio: HTMLAudioElement) {
    if (
      activeSourceRef.current !== sourceKey ||
      !Number.isFinite(audio.duration) ||
      audio.duration < 0
    ) {
      return
    }

    let position = audio.currentTime
    if (
      seekRequest &&
      seekRequest.trackId === track.id &&
      consumedSeekRequestRef.current !== seekRequest.id &&
      Number.isSafeInteger(seekRequest.positionMs) &&
      seekRequest.positionMs >= 0
    ) {
      const appliedPosition = seekToSeconds(
        audio,
        seekRequest.positionMs / 1_000,
      )
      if (appliedPosition !== null) {
        consumedSeekRequestRef.current = seekRequest.id
        position = appliedPosition
      }
    }

    dispatch({
      type: 'metadata-loaded',
      sourceKey,
      duration: audio.duration,
      position,
    })
  }

  function handleCanPlay(audio: HTMLAudioElement) {
    dispatch({ type: 'media-ready', sourceKey })
    setRetryingSourceKey(null)

    if (
      playbackRequest.intent !== 'play' ||
      consumedPlaybackRequestRef.current === playbackRequest.id ||
      activeSourceRef.current !== sourceKey
    ) {
      return
    }

    consumedPlaybackRequestRef.current = playbackRequest.id
    void requestPlay(audio, sourceKey)
  }

  function handleMediaFailure(audio: HTMLAudioElement) {
    const endPositionMs = positionMilliseconds(audio)
    if (endPositionMs !== null) {
      void historyRecorder?.close(endPositionMs, 'load-failure')
    }
    confirmedPlayingRef.current = false
    playRequestSequenceRef.current += 1
    pendingLoopLandingRef.current = null
    loopActiveRef.current = false
    setRateFailure(null)
    setRetryingSourceKey(null)
    if (activeSourceRef.current === sourceKey) {
      playbackIntentRef.current = 'pause'
    }
    try {
      applyPlaybackRate(audio, 1)
      applyVolume(audio, volumeRef.current)
    } catch {
      // The classified load failure remains the actionable error.
    }

    dispatch({ type: 'media-failed', sourceKey })
  }

  function retryAudio() {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (retrying) {
      return
    }

    const endPositionMs = positionMilliseconds(audio)
    if (endPositionMs !== null) {
      void historyRecorder?.close(endPositionMs, 'retry')
    }
    confirmedPlayingRef.current = false

    playRequestSequenceRef.current += 1
    pendingLoopLandingRef.current = null
    loopActiveRef.current = false
    setRateFailure(null)
    setRetryingSourceKey(sourceKey)
    dispatch({ type: 'retry-requested', sourceKey })

    if (!audio.paused) {
      audio.pause()
    }

    try {
      applyPlaybackRate(audio, 1)
      applyVolume(audio, volumeRef.current)
    } catch {
      dispatch({ type: 'rate-rejected', sourceKey })
    }

    audio.load()
  }

  function requestMove(
    direction: ListenQueueDirection,
    available: boolean,
  ) {
    if (!available) {
      return
    }

    onMove(direction, playbackIntentRef.current === 'play')
  }

  function handleEnded() {
    const session = stateRef.current
    const practiceLoopOwnsEnd =
      modeRef.current === 'practice' &&
      activeSourceRef.current === sourceKey &&
      session.sourceKey === sourceKey &&
      session.loop.enabled &&
      session.loop.start !== null &&
      session.loop.end !== null &&
      session.loop.start < session.loop.end

    if (practiceLoopOwnsEnd) {
      observeLoopBoundary()
      return
    }

    if (
      activeSourceRef.current !== sourceKey ||
      handledEndedSourceRef.current === sourceKey
    ) {
      return
    }

    handledEndedSourceRef.current = sourceKey
    const endPositionMs = positionMilliseconds()
    if (endPositionMs !== null) {
      void historyRecorder?.close(endPositionMs, 'ended')
    }
    confirmedPlayingRef.current = false
    playRequestSequenceRef.current += 1
    pendingLoopLandingRef.current = null
    loopActiveRef.current = false
    playbackIntentRef.current = 'pause'
    dispatch({ type: 'playback-paused', sourceKey })
    onEnded()
  }

  function handlePaused() {
    if (activeSourceRef.current !== sourceKey) {
      return
    }

    const pendingLoopLanding = pendingLoopLandingRef.current
    if (
      modeRef.current === 'practice' &&
      pendingLoopLanding?.sourceKey === sourceKey &&
      stateRef.current.loop.enabled
    ) {
      return
    }

    const endPositionMs = positionMilliseconds()
    if (endPositionMs !== null) {
      void historyRecorder?.close(endPositionMs, 'pause')
    }
    confirmedPlayingRef.current = false
    playRequestSequenceRef.current += 1
    loopActiveRef.current = false
    playbackIntentRef.current = 'pause'
    dispatch({ type: 'playback-paused', sourceKey })
  }

  function handlePlaying() {
    if (activeSourceRef.current !== sourceKey) {
      return
    }

    playbackIntentRef.current = 'play'
    confirmedPlayingRef.current = true
    loopActiveRef.current =
      modeRef.current === 'practice' && stateRef.current.loop.enabled
    dispatch({ type: 'play-started', sourceKey })
    const snapshot = playbackSnapshot()
    if (snapshot) {
      void historyRecorder?.start(snapshot)
    }
  }

  function handleTimeUpdate(audio: HTMLAudioElement) {
    observeLoopBoundary()
    dispatch({
      type: 'position-changed',
      sourceKey,
      position: audio.currentTime,
    })
  }

  function handleSeeking(audio: HTMLAudioElement) {
    const pending = pendingLoopLandingRef.current

    if (
      pending &&
      (pending.sourceKey !== sourceKey ||
        !Number.isFinite(audio.currentTime) ||
        Math.abs(audio.currentTime - pending.target) >
          LOOP_SEEK_TARGET_TOLERANCE_SECONDS)
    ) {
      pendingLoopLandingRef.current = null
    }

    dispatch({ type: 'seeking-changed', sourceKey, seeking: true })
  }

  function handleSeeked(audio: HTMLAudioElement) {
    dispatch({ type: 'seeking-changed', sourceKey, seeking: false })
    dispatch({
      type: 'position-changed',
      sourceKey,
      position: audio.currentTime,
    })

    const pending = pendingLoopLandingRef.current
    const session = stateRef.current

    if (
      modeRef.current !== 'practice' ||
      !pending ||
      pending.sourceKey !== sourceKey ||
      !session.loop.enabled ||
      session.loop.start !== pending.target
    ) {
      pendingLoopLandingRef.current = null
      return
    }

    pendingLoopLandingRef.current = null
    dispatch({
      type: 'loop-landed',
      sourceKey,
      landingErrorMilliseconds:
        Math.abs(audio.currentTime - pending.target) * 1_000,
    })
  }

  const formattedPosition = formatPlaybackTime(currentState.position)
  const formattedDuration = formatPlaybackTime(
    currentState.duration ?? Number.NaN,
  )
  const formattedTime = `${formattedPosition} / ${formattedDuration}`

  return (
    <section
      className="listen-player"
      aria-label={`${title} の${mode === 'listen' ? 'Listen' : 'Practice'}プレイヤー`}
    >
      <audio
        key={sourceKey}
        ref={audioRef}
        data-testid="listen-audio"
        aria-hidden="true"
        preload="metadata"
        src={sourceUrl}
        onCanPlay={(event) => handleCanPlay(event.currentTarget)}
        onDurationChange={(event) => handleLoadedMetadata(event.currentTarget)}
        onEnded={handleEnded}
        onError={(event) => handleMediaFailure(event.currentTarget)}
        onLoadedMetadata={(event) =>
          handleLoadedMetadata(event.currentTarget)
        }
        onLoadStart={() => dispatch({ type: 'load-started', sourceKey })}
        onPause={handlePaused}
        onPlaying={handlePlaying}
        onSeeking={(event) => handleSeeking(event.currentTarget)}
        onSeeked={(event) => handleSeeked(event.currentTarget)}
        onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
      />

      <div className="listen-now-playing">
        <div className="listen-now-playing-copy">
          <p className="card-kicker">
            {mode === 'listen' ? 'Listen' : 'Practice'}
          </p>
          <p
            className="listen-current-status"
            role="status"
            aria-label="現在曲"
            aria-live="polite"
            aria-atomic="true"
          >
            現在曲: {title}
          </p>
          <h5 title={title}>{title}</h5>
          {artist || album ? (
            <p className="listen-track-meta">
              {artist ? <span>{artist}</span> : null}
              {album ? <span>{album}</span> : null}
            </p>
          ) : null}
        </div>
        <div
          className="listen-time-readout"
          role="group"
          aria-label="再生時刻"
        >
          <span className="listen-time-label" aria-hidden="true">
            再生時刻
          </span>
          <span className="listen-time-current">{formattedPosition}</span>
          <span className="listen-time-separator" aria-hidden="true">
            {' / '}
          </span>
          <span className="listen-time-duration">{formattedDuration}</span>
        </div>
      </div>

      <button
        className="player-mode-switch"
        type="button"
        onClick={switchMode}
      >
        <span aria-hidden="true">◎</span>
        <span>
          {mode === 'listen' ? 'Practiceへ切り替える' : 'Listenへ戻る'}
        </span>
      </button>

      <label className="seek-control listen-seek-control">
        <span>再生位置</span>
        <input
          type="range"
          aria-label="再生位置"
          aria-valuetext={formattedTime}
          min="0"
          max={currentState.duration ?? 0}
          step="0.01"
          value={currentState.position}
          disabled={!canSeek}
          onChange={(event) => seekTo(Number(event.currentTarget.value))}
        />
      </label>

      <div
        className="listen-transport"
        role="group"
        aria-label={`${mode === 'listen' ? 'Listen' : 'Practice'}再生操作`}
      >
        <button
          type="button"
          aria-label="前の曲"
          aria-disabled={!hasPrevious}
          onClick={() => requestMove('previous', hasPrevious)}
        >
          <span className="transport-symbol" aria-hidden="true">
            ⏮
          </span>
          <span>前の曲</span>
        </button>
        <button
          ref={playButtonRef}
          className="transport-primary"
          type="button"
          aria-disabled={!canPlay}
          onClick={() => void togglePlayback()}
        >
          <span className="transport-symbol" aria-hidden="true">
            {currentState.playbackState === 'playing' ? '⏸' : '▶'}
          </span>
          <span>
            {currentState.playbackState === 'playing' ? '一時停止' : '再生'}
          </span>
        </button>
        <button
          type="button"
          aria-label="次の曲"
          aria-disabled={!hasNext}
          onClick={() => requestMove('next', hasNext)}
        >
          <span className="transport-symbol" aria-hidden="true">
            ⏭
          </span>
          <span>次の曲</span>
        </button>
      </div>

      <label className="listen-volume-control">
        <span>
          <span>
            <span aria-hidden="true">🔊 </span>
            音量
          </span>
          <span>{Math.round(volume * 100)}%</span>
        </span>
        <input
          type="range"
          aria-label="音量"
          aria-valuetext={`${Math.round(volume * 100)}%`}
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(event) =>
            changeVolume(Number(event.currentTarget.value))
          }
        />
      </label>

      {mode === 'practice' ? (
        <>
          <div className="practice-controls">
            <div className="practice-transport-controls">
              <div
                className="practice-seek-controls"
                role="group"
                aria-label="5秒移動"
              >
                <button
                  type="button"
                  aria-disabled={!canSeek}
                  onClick={() => movePosition(-5)}
                >
                  5秒戻る
                </button>
                <button
                  type="button"
                  aria-disabled={!canSeek}
                  onClick={() => movePosition(5)}
                >
                  5秒進む
                </button>
              </div>

              <label className="rate-control">
                <span>再生速度</span>
                <select
                  aria-label="再生速度"
                  value={currentState.rate}
                  disabled={!canPlay}
                  onChange={(event) =>
                    changeRate(Number(event.currentTarget.value))
                  }
                >
                  {PLAYBACK_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate.toFixed(2)}x
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="practice-loop-panel">
              <div className="loop-point-readout" aria-label="A-B地点">
                <span>A {formatLoopPoint(currentState.loop.start)}</span>
                <span>B {formatLoopPoint(currentState.loop.end)}</span>
              </div>
              <div
                className="practice-loop-controls"
                role="group"
                aria-label="A-Bループ操作"
              >
                <button
                  type="button"
                  aria-disabled={!canSeek}
                  onClick={setLoopStart}
                >
                  A地点を設定
                </button>
                <button
                  type="button"
                  aria-disabled={!canSeek}
                  onClick={setLoopEnd}
                >
                  B地点を設定
                </button>
                <button
                  type="button"
                  aria-disabled={!hasLoopRange}
                  aria-pressed={currentState.loop.enabled}
                  onClick={toggleLoop}
                >
                  {currentState.loop.enabled
                    ? 'A-Bループを停止'
                    : 'A-Bループを開始'}
                </button>
                <button
                  type="button"
                  aria-disabled={
                    currentState.loop.start === null &&
                    currentState.loop.end === null
                  }
                  onClick={clearLoop}
                >
                  A-Bをクリア
                </button>
              </div>
              <p
                className="loop-diagnostics"
                role="note"
                aria-label="ループ診断値"
              >
                周回 {currentState.diagnostics.wrapCount} · 境界超過{' '}
                {diagnosticValue(
                  currentState.diagnostics.lastOvershootMilliseconds,
                )}{' '}
                ms · 着地点誤差{' '}
                {diagnosticValue(
                  currentState.diagnostics.lastLandingErrorMilliseconds,
                )}{' '}
                ms
              </p>
            </div>
          </div>

          {markerGateway ? (
            <MarkerPanel
              trackId={track.id}
              gateway={markerGateway}
              mediaReady={canSeek}
              maximumPositionSeconds={currentState.duration ?? undefined}
              getCurrentPositionSeconds={() =>
                audioRef.current?.currentTime ?? stateRef.current.position
              }
              onSelectPositionMs={(positionMs) =>
                seekTo(positionMs / 1_000)
              }
            />
          ) : null}
        </>
      ) : null}

      <p className="audio-status">
        {retrying
          ? `${title} を読み込み直しています…`
          : currentState.loadState === 'ready'
          ? `${title} を再生できます。`
          : `${title} を読み込んでいます…`}
      </p>

      {currentState.error === 'load' || retrying ? (
        <div className="audio-feedback">
          {!retrying ? (
            <p
              className="inline-error"
              role="alert"
              aria-label="音源の読み込みエラー"
            >
              {title} を読み込めませんでした。別の音源を選ぶか、もう一度読み込んでください。
            </p>
          ) : null}
          <button
            className="retry-button"
            type="button"
            aria-disabled={retrying}
            onClick={retryAudio}
          >
            音源を再読み込み
          </button>
        </div>
      ) : null}

      {currentState.error === 'play' ? (
        <p className="inline-error" role="alert" aria-label="再生エラー">
          再生を始められませんでした。もう一度、再生を押してください。
        </p>
      ) : null}

      {mode === 'practice' && currentState.error === 'rate' ? (
        <p
          className="inline-error"
          role="alert"
          aria-label="速度変更エラー"
        >
          {currentRateFailure === 'listen-return'
            ? '通常速度へ戻せませんでした。Practiceのまま、もう一度試してください。'
            : '再生速度を変更できませんでした。別の速度を選んでください。'}
        </p>
      ) : null}

      {mode === 'practice' && currentState.error === 'loop-order' ? (
        <p
          className="inline-error"
          role="alert"
          aria-label="A-Bループエラー"
        >
          A地点より後の位置へB地点を設定してください。
        </p>
      ) : null}
      {noteGateway ? (
        <NotePanel
          key={track.id}
          trackId={track.id}
          latestPlayEventId={latestPlayEventId}
          gateway={noteGateway}
          onSelectPositionMs={
            canSeek ? (positionMs) => seekTo(positionMs / 1_000) : undefined
          }
        />
      ) : null}
      {historyError ? (
        <p className="inline-error" role="alert" aria-label="再生履歴エラー">
          再生履歴を保存できませんでした。音声操作は続けられます。
        </p>
      ) : null}
    </section>
  )
}

export default ListenPlayer
