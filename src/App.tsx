import { useEffect, useRef, useState } from 'react'

import HelpDialog from './components/HelpDialog'
import LibraryWorkspace from './components/LibraryWorkspace'
import type { PlayerMode } from './components/ListenPlayer'
import type { FoundationGateway } from './platform/foundation-gateway'
import { unavailableFoundationGateway } from './platform/foundation-gateway'

type DatabaseState = 'checking' | 'pass' | 'fail' | 'desktop-required'
type DatabaseCheckState = Exclude<DatabaseState, 'desktop-required'>
interface AppProps {
  gateway?: FoundationGateway
}

const databaseLabel: Record<DatabaseState, string> = {
  checking: 'ローカル保存を確認中',
  pass: 'ローカル保存を利用できます',
  fail: 'ローカル保存を確認できません',
  'desktop-required': 'デスクトップアプリで利用できます',
}

function App({ gateway = unavailableFoundationGateway }: AppProps) {
  const [databaseCheckState, setDatabaseCheckState] =
    useState<DatabaseCheckState>('checking')
  const [playerMode, setPlayerMode] = useState<PlayerMode>('listen')
  const [helpOpen, setHelpOpen] = useState(false)
  const helpButtonRef = useRef<HTMLButtonElement | null>(null)
  const databaseState: DatabaseState =
    gateway.runtime === 'desktop'
      ? databaseCheckState
      : 'desktop-required'

  useEffect(() => {
    if (gateway.runtime === 'browser') {
      return
    }

    let active = true

    void gateway
      .checkDatabase()
      .then(() => {
        if (active) {
          setDatabaseCheckState('pass')
        }
      })
      .catch(() => {
        if (active) {
          setDatabaseCheckState('fail')
        }
      })

    return () => {
      active = false
    }
  }, [gateway])

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-mark" aria-hidden="true">
            LP
          </span>
          <div>
            <p className="eyebrow">Listen. Loupe. Play.</p>
            <h1>LoupePlay</h1>
            <p className="tagline">音楽を聴く。気になったら、覗き込む。</p>
          </div>
        </div>
        <div className="header-actions">
          <p
            className="storage-status"
            role="status"
            aria-label="ローカル保存"
            aria-live="polite"
            data-state={databaseState}
          >
            <span className="status-dot" aria-hidden="true" />
            {databaseLabel[databaseState]}
          </p>
          <button
            ref={helpButtonRef}
            className="help-button"
            type="button"
            aria-label="ヘルプを開く"
            title="ヘルプを開く"
            onClick={() => setHelpOpen(true)}
          >
            <span aria-hidden="true">?</span>
          </button>
        </div>
      </header>

      <section className="listen-screen" aria-labelledby="player-mode-title">
        <div className="listen-screen-heading">
          <div>
            <p className="eyebrow">Local player</p>
            <h2 id="player-mode-title">
              {playerMode === 'listen' ? 'Listen' : 'Practice'}
            </h2>
          </div>
          {playerMode === 'listen' ? (
            <p>
              手元の音源を選んで、そのまま聴くための画面です。
              音源そのものは保存せず、最近の音楽フォルダを次回も開きます。
            </p>
          ) : (
            <p>
              同じ曲と再生位置のまま、速度と短い区間を詳しく聴く画面です。
              Listenへ戻ると通常速度になり、ループは停止します。
            </p>
          )}
        </div>
        <LibraryWorkspace
          gateway={gateway}
          desktopAvailable={gateway.runtime === 'desktop'}
          onPlayerModeChange={setPlayerMode}
        />
      </section>
      <HelpDialog
        open={helpOpen}
        onClose={() => {
          setHelpOpen(false)
          helpButtonRef.current?.focus({ preventScroll: true })
        }}
      />
    </main>
  )
}

export default App
