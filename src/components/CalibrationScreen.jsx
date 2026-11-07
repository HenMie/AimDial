import { useEffect, useMemo, useRef, useState } from 'react'
import { useCalibration } from '../hooks/useCalibration.js'
import { BOTS_PER_RUN, parseKills } from '../lib/rangeCalibration.js'
import { KillBar, Dial } from './instrument.jsx'

/**
 * A label for what the search is doing right now. There are only two states
 * now — the opening sweep and the fitted proposals — because the search no
 * longer has phases to advance between.
 */
function phaseLabel(plan) {
  return plan.phase === 'seed' ? '起点' : '继续找'
}

/**
 * Ten-key pad. The digit keys are the fast path for a phone; typing on a
 * hardware keyboard works because the pad listens for digits, Backspace and
 * Enter on the wrapper as well.
 */
function KillPad({ value, onDigit, onClear, onSubmit, busy }) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  // The pad takes digits straight off the document, so a player entering
  // numbers on a desktop never has to hunt for the field; typing in some other
  // real field still wins, which is why editable targets are skipped.
  useEffect(() => {
    const handler = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return
      if (/^\d$/.test(event.key)) {
        event.preventDefault()
        onDigit(event.key)
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        onClear()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        onSubmit()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })
  return (
    <div className="pad">
      <div className="pad-display" aria-live="polite">
        <output data-empty={value === ''} aria-label="本轮击杀数">
          {value === '' ? '—' : value}
        </output>
        <span>/ {BOTS_PER_RUN}</span>
      </div>
      <p className="pad-note">点数字，或者直接用键盘打。</p>
      <div className="pad-keys">
        {digits.map((digit) => (
          <button key={digit} type="button" onClick={() => onDigit(digit)} aria-label={`输入 ${digit}`}>
            {digit}
          </button>
        ))}
        <button type="button" data-role="clear" onClick={onClear} aria-label="清除输入">
          清除
        </button>
        <button type="button" onClick={() => onDigit('0')} aria-label="输入 0">
          0
        </button>
        <button
          type="button"
          data-role="clear"
          onClick={() => onDigit(String(BOTS_PER_RUN))}
          aria-label={`填入 ${BOTS_PER_RUN}`}
        >
          30
        </button>
      </div>
      <button type="button" className="primary" onClick={onSubmit} disabled={busy}>
        记录本轮
      </button>
    </div>
  )
}

export default function CalibrationScreen({ setup, id, initialSession, initialInput, onFinish, onHome }) {
  const { session, current, record, undo, stop, done, result, kills, setKills, saved, saveError } =
    useCalibration(setup, id, initialSession, initialInput)
  const [error, setError] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const padRef = useRef(null)

  // Focus the top of the step on entry so the run opens on the number to type
  // instead of wherever the previous screen's scroll position was.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const plan = session.plan
  const runs = session.runs
  const latest = runs.at(-1) ?? null
  const base = plan.baseline ?? session.incumbent

  // The dial carries the settings this run has touched plus the one it is about
  // to ask for, so the proposal is visibly a position on a scale rather than a
  // number out of nowhere.
  const markers = useMemo(() => {
    const measured = [...new Set(runs.map((run) => run.sensitivity))]
    const unique = [...new Set([...measured, ...plan.candidates, current].filter((value) => value != null))]
    return unique.map((value) => ({
      value,
      // Only the setting you are about to play is marked red; measured ones keep
      // the ink mark so the history stays readable behind it.
      kind: value === current ? 'active' : value === base ? 'base' : 'candidate',
    }))
  }, [runs, plan.candidates, current, base])

  const pushDigit = (digit) => {
    setError(null)
    setReceipt(null)
    const next = (kills === '' ? '' : kills) + digit
    if (Number(next) > BOTS_PER_RUN) {
      setError(`一轮最多 ${BOTS_PER_RUN} 杀。`)
      return
    }
    setKills(next)
  }

  const submit = () => {
    try {
      const value = parseKills(kills)
      const target = current
      record(value)
      setError(null)
      setReceipt({ sensitivity: target, kills: value })
      // The next setting replaces the one just played, so bring the player
      // back to it rather than leaving them at the keypad.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (reason) {
      if (!(reason instanceof RangeError)) throw reason
      setError(reason.message)
    }
  }

  const undoLast = () => {
    const previous = runs.at(-1)
    undo()
    setError(null)
    setReceipt(null)
    if (previous) setKills(String(previous.kills))
  }

  if (done) {
    return (
      <section className="run" aria-labelledby="log-done">
        <div className="run-top">
          <button type="button" className="back" onClick={onHome}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9.5 3.5 5 8l4.5 4.5" strokeLinecap="square" />
            </svg>
            返回首页
          </button>
        </div>
        <div className="target-value" style={{ gridColumn: '1 / -1' }}>
          <span id="log-done">测试已完成</span>
          <strong className="num">{`${runs.length}`}<span style={{ fontSize: '0.4em', letterSpacing: '0.02em' }}> 轮</span></strong>
          <p>可以查看结果，也可以撤销最后一轮再补一次。</p>
        </div>
        {saveError && <p className="notice" data-tone="error" role="alert">{saveError}</p>}
        <div className="action" style={{ gridColumn: '1 / -1' }}>
          <button type="button" className="primary" onClick={() => onFinish(result)}>
            查看结果
          </button>
          <button type="button" className="quiet" onClick={undoLast}>
            撤销最后一轮
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="run" aria-labelledby="run-title" ref={padRef}>
      <div className="run-top">
        <button type="button" className="back" onClick={onHome}>
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9.5 3.5 5 8l4.5 4.5" strokeLinecap="square" />
          </svg>
          返回首页
        </button>
        <span className="run-badge">
          第 <b className="num">{runs.length + 1}</b> 轮
          <span className="phase" data-phase={plan.phase}>
            {phaseLabel(plan)}
          </span>
        </span>
        <span
          className="save"
          data-state={saveError ? 'error' : saved ? 'saved' : 'pending'}
          role="status"
          aria-live="polite"
        >
          {saveError ? '保存失败' : saved ? '已保存' : '保存中'}
        </span>
        {/* There is no fixed block of rounds any more: each round is its own
            proposal, so the progress meter is replaced by a count. */}
        <span className="mark-note" style={{ marginLeft: 'auto' }}>
          已测 <span className="num">{runs.length}</span> 轮
        </span>
      </div>

      <>
        <div className="run-what">
          <h2 id="run-title" className="target-value">
            <span>把游戏内灵敏度改成</span>
            <strong>{current.toFixed(3)}</strong>
            <p>
              DPI 保持 <span className="num">{setup.dpi}</span> 不变，中等难度靶场打倒{' '}
              <span className="num">{BOTS_PER_RUN}</span> 个 bot，然后回来填写击杀数。
            </p>
          </h2>

          {receipt ? (
            <p className="receipt num" role="status">
              <span>
                已记录 <strong>{receipt.sensitivity.toFixed(3)}</strong> → <strong>{receipt.kills}</strong> 杀
              </span>
              <span>这一轮 {current.toFixed(3)}</span>
            </p>
          ) : latest ? (
            <p className="receipt num">
              <span>
                上一轮 <strong>{latest.sensitivity.toFixed(3)}</strong> → <strong>{latest.kills}</strong> 杀
              </span>
              <span>这一轮 {current.toFixed(3)}</span>
            </p>
          ) : null}

          {/* The decision rule is standing copy, not history: without it a player
              has no idea what the next number is for. Each line is a single JSX
              text run — a source newline inside Chinese copy collapses to a space
              and opens a gap mid-sentence. */}
          <p className="standing-rule">
            {plan.phase === 'seed' ? (
              <>
                {'先从你现在的 '}
                <span className="num">{current.toFixed(3)}</span>
                {' 开始。之后会在它上下各试几个数值，找出最合适的那个。'}
              </>
            ) : plan.why === 'revisit' ? (
              <>
                {'这一轮还是 '}
                <span className="num">{current.toFixed(3)}</span>
                {'：最后几个数值咬得太紧，再打一次才能把它们分开。'}
              </>
            ) : (
              <>
                {'每次的数值都不一样，都是根据前面 '}
                <span className="num">{runs.length}</span>
                {' 轮的成绩挑出来的。'}
              </>
            )}
          </p>
        </div>

        <Dial
          className="is-compact"
          base={base}
          markers={markers}
          readout={current.toFixed(3)}
          readoutCaption={`第 ${runs.length + 1} 轮 · ${phaseLabel(plan)}`}
          referenceTicks={[{ value: base, label: '目前最好' }]}
        />

        {session.warning && (
          <p className="notice" data-tone="error" role="status" style={{ marginTop: 12 }}>
            {session.warning}
          </p>
        )}
        {saveError && (
          <p className="notice" data-tone="error" role="alert" style={{ marginTop: 12 }}>
            {saveError}
          </p>
        )}
      </>

      <KillPad
        value={kills}
        onDigit={pushDigit}
        onClear={() => { setKills(''); setError(null) }}
        onSubmit={submit}
        busy={false}
      />

      {error && (
        <p className="notice" data-tone="error" role="alert" style={{ gridColumn: '1 / -1' }}>
          {error}
        </p>
      )}

      <details className="fold" open>
        <summary>
          本轮说明
          <span className="meta">
            第 {runs.length + 1} 轮
          </span>
        </summary>
        <div className="fold-body">
          <p>{plan.message}</p>
          {/* Kept on one source line: JSX collapses the newline between two text
              lines into a space, which showed up mid-sentence in Chinese. */}
          <p>
            {'目前的成绩受手感波动影响，所以会反复测几轮再下结论，而不是靠一次成绩就换。测试期间请保持 DPI、武器、站位与护甲一致。'}
          </p>
        </div>
      </details>

      {runs.length > 0 && (
        <details className="fold">
          <summary>
            逐轮成绩
            <span className="meta">{runs.length} 轮</span>
          </summary>
          <div className="fold-body">
            {/* The whole run, not the current block: there is no block any more,
                and each round is a proposal derived from all the ones before it. */}
            <ol className="ledger-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {runs.map((run, index) => (
                <li
                  key={`${run.sensitivity}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2.5rem 5.5rem minmax(0,1fr) 3rem',
                    alignItems: 'center',
                    gap: 12,
                    padding: '7px 0',
                    borderBottom: '1px solid var(--rule)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <span className="n num">{index + 1}</span>
                  <span className="s num">{run.sensitivity.toFixed(3)}</span>
                  <KillBar value={run.kills} tone={run.sensitivity === session.incumbent ? 'confirm' : 'ink'} />
                  <span className="k num">{run.kills}</span>
                </li>
              ))}
            </ol>
            <div style={{ marginTop: 14 }}>
              <button type="button" className="quiet" onClick={undoLast}>
                撤销上一轮
              </button>
            </div>
          </div>
        </details>
      )}

      <div className="action end-run">
        <button type="button" className="quiet" disabled={!runs.length} onClick={stop}>
          结束测试，查看当前结果
        </button>
      </div>
    </section>
  )
}
