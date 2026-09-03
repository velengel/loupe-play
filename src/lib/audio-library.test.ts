import { describe, expect, it, vi } from 'vitest'

import { isSupportedAudioPath, scanAudioFolder } from './audio-library'

describe('isSupportedAudioPath', () => {
  it.each(['song.wav', 'song.MP3', 'song.FlAc'])('accepts %s', (path) => {
    expect(isSupportedAudioPath(path)).toBe(true)
  })

  it.each(['cover.jpg', 'notes.txt', 'song.wav.bak'])('rejects %s', (path) => {
    expect(isSupportedAudioPath(path)).toBe(false)
  })
})

describe('scanAudioFolder', () => {
  it('returns canonical relative paths without following symlinks', async () => {
    const readDirectory = vi.fn(async (path: string) => {
      if (path === 'C:\\Music') {
        return [
          {
            name: 'drum.MP3',
            isDirectory: false,
            isFile: true,
            isSymlink: false,
          },
          {
            name: 'notes.txt',
            isDirectory: false,
            isFile: true,
            isSymlink: false,
          },
          {
            name: 'session',
            isDirectory: true,
            isFile: false,
            isSymlink: false,
          },
          {
            name: 'outside',
            isDirectory: true,
            isFile: false,
            isSymlink: true,
          },
        ]
      }

      if (path === 'C:\\Music\\session') {
        return [
          {
            name: 'take.FLAC',
            isDirectory: false,
            isFile: true,
            isSymlink: false,
          },
          {
            name: 'room.wav',
            isDirectory: false,
            isFile: true,
            isSymlink: false,
          },
        ]
      }

      throw new Error(`unexpected directory: ${path}`)
    })
    const joinPath = vi.fn(async (...parts: string[]) => parts.join('\\'))

    await expect(
      scanAudioFolder('C:\\Music', { joinPath, readDirectory }),
    ).resolves.toEqual({
      completeness: 'complete',
      issues: [],
      tracks: [
        {
          name: 'drum.MP3',
          path: 'C:\\Music\\drum.MP3',
          relativePath: 'drum.MP3',
        },
        {
          name: 'room.wav',
          path: 'C:\\Music\\session\\room.wav',
          relativePath: 'session/room.wav',
        },
        {
          name: 'take.FLAC',
          path: 'C:\\Music\\session\\take.FLAC',
          relativePath: 'session/take.FLAC',
        },
      ],
    })
    expect(readDirectory).not.toHaveBeenCalledWith('C:\\Music\\outside')
  })

  it('marks a scan partial when a nested directory cannot be read', async () => {
    const readDirectory = vi.fn(async (path: string) => {
      if (path === '/Music') {
        return [
          {
            name: 'locked',
            isDirectory: true,
            isFile: false,
            isSymlink: false,
          },
          {
            name: 'song.wav',
            isDirectory: false,
            isFile: true,
            isSymlink: false,
          },
        ]
      }

      throw new Error('permission denied')
    })
    const joinPath = vi.fn(async (...parts: string[]) => parts.join('/'))

    await expect(
      scanAudioFolder('/Music', { joinPath, readDirectory }),
    ).resolves.toEqual({
      completeness: 'partial',
      issues: [
        {
          kind: 'directory-unreadable',
          relativePath: 'locked',
        },
      ],
      tracks: [
        {
          name: 'song.wav',
          path: '/Music/song.wav',
          relativePath: 'song.wav',
        },
      ],
    })
  })

  it('surfaces an error when the selected root cannot be read', async () => {
    const readDirectory = vi.fn().mockRejectedValue(new Error('permission denied'))
    const joinPath = vi.fn(async (...parts: string[]) => parts.join('/'))

    await expect(
      scanAudioFolder('/Music', { joinPath, readDirectory }),
    ).rejects.toThrow('permission denied')
  })
})
