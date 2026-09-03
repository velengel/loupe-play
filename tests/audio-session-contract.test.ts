import { describe, expect, it } from 'vitest'

import {
  PLAYBACK_RATES,
  applyPlaybackRate,
  applyVolume,
  audioSessionReducer,
  createAudioSessionState,
  enforceLoopBoundary,
  formatPlaybackTime,
  seekBySeconds,
} from '../src/lib/audio-session'

const sourceKey = 'track:one'

describe('audio session contract', () => {
  it('starts every source with safe transient defaults', () => {
    expect(createAudioSessionState(sourceKey)).toEqual({
      sourceKey,
      loadState: 'loading',
      playbackState: 'paused',
      position: 0,
      duration: null,
      rate: 1,
      seeking: false,
      loop: {
        start: null,
        end: null,
        enabled: false,
      },
      diagnostics: {
        wrapCount: 0,
        lastOvershootMilliseconds: null,
        maxOvershootMilliseconds: null,
        lastLandingErrorMilliseconds: null,
        maxLandingErrorMilliseconds: null,
      },
      error: null,
    })
  })

  it('accepts finite metadata and clamps reported positions', () => {
    let state = createAudioSessionState(sourceKey)

    state = audioSessionReducer(state, {
      type: 'metadata-loaded',
      sourceKey,
      duration: 125,
      position: 3,
    })
    state = audioSessionReducer(state, {
      type: 'position-changed',
      sourceKey,
      position: 400,
    })

    expect(state.duration).toBe(125)
    expect(state.position).toBe(125)
  })

  it('resets all transient state for a different source', () => {
    let state = createAudioSessionState(sourceKey)
    state = audioSessionReducer(state, {
      type: 'metadata-loaded',
      sourceKey,
      duration: 125,
      position: 10,
    })
    state = audioSessionReducer(state, {
      type: 'rate-changed',
      sourceKey,
      rate: 0.75,
    })
    state = audioSessionReducer(state, {
      type: 'loop-start-set',
      sourceKey,
      position: 10,
    })
    state = audioSessionReducer(state, {
      type: 'loop-end-set',
      sourceKey,
      position: 12,
    })
    state = audioSessionReducer(state, {
      type: 'loop-toggled',
      sourceKey,
    })
    state = audioSessionReducer(state, {
      type: 'play-rejected',
      sourceKey,
    })

    expect(
      audioSessionReducer(state, {
        type: 'source-changed',
        sourceKey: 'track:two',
      }),
    ).toEqual(createAudioSessionState('track:two'))
  })

  it('ignores an asynchronous result from an old source', () => {
    const current = audioSessionReducer(createAudioSessionState(sourceKey), {
      type: 'source-changed',
      sourceKey: 'track:two',
    })

    expect(
      audioSessionReducer(current, {
        type: 'play-rejected',
        sourceKey,
      }),
    ).toBe(current)
  })

  it('records a rejected play request without claiming playback', () => {
    const state = audioSessionReducer(createAudioSessionState(sourceKey), {
      type: 'play-rejected',
      sourceKey,
    })

    expect(state.playbackState).toBe('paused')
    expect(state.error).toBe('play')
  })

  it('keeps a load failure when a pending play request rejects later', () => {
    let state = audioSessionReducer(createAudioSessionState(sourceKey), {
      type: 'media-failed',
      sourceKey,
    })

    state = audioSessionReducer(state, {
      type: 'play-rejected',
      sourceKey,
    })

    expect(state.loadState).toBe('error')
    expect(state.error).toBe('load')
  })

  it('keeps a load failure when restoring playback rate also rejects', () => {
    let state = audioSessionReducer(createAudioSessionState(sourceKey), {
      type: 'media-failed',
      sourceKey,
    })

    state = audioSessionReducer(state, {
      type: 'rate-rejected',
      sourceKey,
    })

    expect(state.loadState).toBe('error')
    expect(state.error).toBe('load')
  })

  it('clears every track-scoped value after media loading fails', () => {
    let state = audioSessionReducer(createAudioSessionState(sourceKey), {
      type: 'metadata-loaded',
      sourceKey,
      duration: 30,
      position: 10,
    })
    state = audioSessionReducer(state, {
      type: 'rate-changed',
      sourceKey,
      rate: 0.75,
    })
    state = audioSessionReducer(state, {
      type: 'loop-start-set',
      sourceKey,
      position: 10,
    })
    state = audioSessionReducer(state, {
      type: 'loop-end-set',
      sourceKey,
      position: 12,
    })
    state = audioSessionReducer(state, {
      type: 'loop-toggled',
      sourceKey,
    })
    state = audioSessionReducer(state, {
      type: 'loop-wrapped',
      sourceKey,
      overshootMilliseconds: 37,
    })
    state = audioSessionReducer(state, {
      type: 'loop-landed',
      sourceKey,
      landingErrorMilliseconds: 11,
    })
    state = audioSessionReducer(state, {
      type: 'play-started',
      sourceKey,
    })
    state = audioSessionReducer(state, {
      type: 'seeking-changed',
      sourceKey,
      seeking: true,
    })

    expect(
      audioSessionReducer(state, {
        type: 'media-failed',
        sourceKey,
      }),
    ).toEqual({
      ...createAudioSessionState(sourceKey),
      loadState: 'error',
      error: 'load',
    })
  })

  it('clamps repeated five-second seeks and refuses an unknown duration', () => {
    const media = {
      currentTime: 3,
      duration: 10,
    }

    expect(seekBySeconds(media, -5)).toBe(0)
    expect(media.currentTime).toBe(0)
    expect(seekBySeconds(media, 5)).toBe(5)
    expect(seekBySeconds(media, 20)).toBe(10)
    expect(media.currentTime).toBe(10)

    const unknownDuration = {
      currentTime: 4,
      duration: Number.NaN,
    }

    expect(seekBySeconds(unknownDuration, 5)).toBeNull()
    expect(unknownDuration.currentTime).toBe(4)
  })

  it('sets pitch preservation before applying a supported rate', () => {
    const writes: string[] = []
    const media = {
      currentTime: 0,
      duration: 10,
      get playbackRate() {
        return 1
      },
      set playbackRate(value: number) {
        writes.push(`rate:${value}`)
      },
      get preservesPitch() {
        return false
      },
      set preservesPitch(value: boolean) {
        writes.push(`pitch:${value}`)
      },
      webkitPreservesPitch: false,
    }

    applyPlaybackRate(media, 0.75)

    expect(writes).toEqual(['pitch:true', 'rate:0.75'])
    expect(media.webkitPreservesPitch).toBe(true)
    expect(() => applyPlaybackRate(media, 0)).toThrow(RangeError)
    expect(() => applyPlaybackRate(media, Number.NaN)).toThrow(RangeError)
  })

  it('clamps finite Listen volume before applying it to the media element', () => {
    const media = { volume: 0.5 }

    expect(applyVolume(media, 0.42)).toBe(0.42)
    expect(media.volume).toBe(0.42)
    expect(applyVolume(media, -2)).toBe(0)
    expect(media.volume).toBe(0)
    expect(applyVolume(media, 4)).toBe(1)
    expect(media.volume).toBe(1)
  })

  it('keeps the last valid Listen volume when a new value is not finite', () => {
    const writes: number[] = []
    const media = {
      get volume() {
        return 0.65
      },
      set volume(value: number) {
        writes.push(value)
      },
    }

    expect(applyVolume(media, Number.NaN)).toBe(0.65)
    expect(applyVolume(media, Number.POSITIVE_INFINITY)).toBe(0.65)
    expect(writes).toEqual([])
  })

  it('offers the product rate presets without skipping normal speed', () => {
    expect(PLAYBACK_RATES).toEqual([
      0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1,
    ])
  })

  it('returns to Listen speed while retaining loop points and measurements', () => {
    let state = audioSessionReducer(createAudioSessionState(sourceKey), {
      type: 'metadata-loaded',
      sourceKey,
      duration: 30,
      position: 12,
    })
    state = audioSessionReducer(state, {
      type: 'rate-changed',
      sourceKey,
      rate: 0.8,
    })
    state = audioSessionReducer(state, {
      type: 'loop-start-set',
      sourceKey,
      position: 8,
    })
    state = audioSessionReducer(state, {
      type: 'loop-end-set',
      sourceKey,
      position: 12,
    })
    state = audioSessionReducer(state, {
      type: 'loop-toggled',
      sourceKey,
    })
    state = audioSessionReducer(state, {
      type: 'loop-wrapped',
      sourceKey,
      overshootMilliseconds: 37,
    })

    state = audioSessionReducer(state, {
      type: 'listen-mode-entered',
      sourceKey,
    })

    expect(state.rate).toBe(1)
    expect(state.loop).toEqual({ start: 8, end: 12, enabled: false })
    expect(state.diagnostics.wrapCount).toBe(1)
    expect(state.position).toBe(12)
  })

  it('rejects B at or before A and only enables a valid loop', () => {
    let state = audioSessionReducer(createAudioSessionState(sourceKey), {
      type: 'metadata-loaded',
      sourceKey,
      duration: 30,
      position: 0,
    })
    state = audioSessionReducer(state, {
      type: 'loop-start-set',
      sourceKey,
      position: 12,
    })
    state = audioSessionReducer(state, {
      type: 'loop-end-set',
      sourceKey,
      position: 12,
    })

    expect(state.loop).toEqual({ start: 12, end: null, enabled: false })
    expect(state.error).toBe('loop-order')

    state = audioSessionReducer(state, {
      type: 'loop-end-set',
      sourceKey,
      position: 14,
    })
    state = audioSessionReducer(state, {
      type: 'loop-toggled',
      sourceKey,
    })

    expect(state.loop).toEqual({ start: 12, end: 14, enabled: true })
    expect(state.error).toBeNull()
  })

  it('returns from B to A and measures the pre-seek overshoot', () => {
    const media = {
      currentTime: 8.037,
      seeking: false,
    }

    expect(
      enforceLoopBoundary(media, {
        start: 4,
        end: 8,
        enabled: true,
      }),
    ).toEqual({
      target: 4,
      overshootMilliseconds: 37,
    })
    expect(media.currentTime).toBe(4)
  })

  it('does not issue another loop seek while a seek is in progress', () => {
    const media = {
      currentTime: 8.037,
      seeking: true,
    }

    expect(
      enforceLoopBoundary(media, {
        start: 4,
        end: 8,
        enabled: true,
      }),
    ).toBeNull()
    expect(media.currentTime).toBe(8.037)
  })

  it('retains last and maximum loop measurements across wraps', () => {
    let state = createAudioSessionState(sourceKey)

    state = audioSessionReducer(state, {
      type: 'loop-wrapped',
      sourceKey,
      overshootMilliseconds: 37,
    })
    state = audioSessionReducer(state, {
      type: 'loop-landed',
      sourceKey,
      landingErrorMilliseconds: 11,
    })
    state = audioSessionReducer(state, {
      type: 'loop-wrapped',
      sourceKey,
      overshootMilliseconds: 15,
    })
    state = audioSessionReducer(state, {
      type: 'loop-landed',
      sourceKey,
      landingErrorMilliseconds: 4,
    })

    expect(state.diagnostics).toEqual({
      wrapCount: 2,
      lastOvershootMilliseconds: 15,
      maxOvershootMilliseconds: 37,
      lastLandingErrorMilliseconds: 4,
      maxLandingErrorMilliseconds: 11,
    })
  })

  it('formats finite media time without exposing invalid values', () => {
    expect(formatPlaybackTime(0)).toBe('0:00')
    expect(formatPlaybackTime(65.9)).toBe('1:05')
    expect(formatPlaybackTime(3661)).toBe('1:01:01')
    expect(formatPlaybackTime(Number.NaN)).toBe('--:--')
  })
})
