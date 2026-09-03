import { useEffect, useRef } from 'react'

interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

function HelpDialog({ open, onClose }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      titleRef.current?.focus({ preventScroll: true })
      return
    }

    if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function closeDialog() {
    dialogRef.current?.close()
  }

  return (
    <dialog
      ref={dialogRef}
      className="help-dialog"
      aria-labelledby="help-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        closeDialog()
      }}
      onClose={onClose}
    >
      <div className="help-dialog-content">
        <header className="help-dialog-header">
          <div>
            <p className="eyebrow">Help</p>
            <h2 ref={titleRef} id="help-dialog-title" tabIndex={-1}>
              LoupePlayの使い方
            </h2>
          </div>
          <button
            className="help-dialog-close"
            type="button"
            aria-label="ヘルプを閉じる"
            title="ヘルプを閉じる"
            onClick={closeDialog}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <section>
          <h3>まず聴く</h3>
          <ol>
            <li>音楽ファイル、または音楽フォルダを選びます。</li>
            <li>曲を選び、再生ボタンで聴き始めます。</li>
          </ol>
          <p>
            <strong>Listen</strong> は、通常の速度で曲を聴く画面です。
          </p>
        </section>

        <section>
          <h3>聴き直す</h3>
          <p>
            <strong>Practice</strong>
            に切り替えると、再生速度の変更と短い区間のループができます。
          </p>
        </section>

        <section>
          <h3>メモを使い分ける</h3>
          <dl>
            <div>
              <dt>Track Note</dt>
              <dd>曲全体について残すメモです。</dd>
            </div>
            <div>
              <dt>Listening Note</dt>
              <dd>そのとき聴いていた再生区間について残すメモです。</dd>
            </div>
            <div>
              <dt>Marker</dt>
              <dd>曲の中の一点に印を付け、そこから聴き直すための目印です。</dd>
            </div>
          </dl>
          <p>検索では、メモの本文から目的の記録を探せます。</p>
        </section>

        <section>
          <h3>保存について</h3>
          <p>
            メモやMarker、最近開いた音源の情報は、この端末のLoupePlay内に保存します。音楽ファイルそのものは複製しません。
          </p>
        </section>
      </div>
    </dialog>
  )
}

export default HelpDialog
