import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// A source-level guard, because the failure this protects against is structural:
// two hairlines a few pixels apart, which no unit test of a pure function can see.
//
// The section mark draws the divider for its group. A list or a disclosure placed
// directly under one therefore must not draw its own opening edge as well — that
// is what produced a doubled rule under 测试过程 and 逐轮成绩.
const css = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8')

/** The declarations of the first rule whose selector list matches exactly. */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  return match ? match[2] : null
}

describe('one rule per section group', () => {
  it('strips the opening edge from a list or fold that follows a section mark', () => {
    const body = rule('.mark + .steps-list,\n.mark + .history-list,\n.mark + .pros-table,\n.mark + .ledger ol,\n.mark + .fold')
    expect(body).not.toBeNull()
    expect(body).toMatch(/border-top:\s*0/)
  })

  it('targets the ledger list, not just its wrapper', () => {
    // The ledger's rule lives on `.ledger ol`. Zeroing `.ledger` alone left the
    // second hairline in place, which is exactly the bug this test pins.
    const noTop = rule('.ledger ol')
    expect(noTop).not.toBeNull()
    expect(noTop).toMatch(/border-top:\s*1px/)
    // ...and a mark above it must cancel that one.
    const group = css.slice(css.indexOf('.mark + .steps-list'))
    expect(group).toContain('.mark + .ledger ol')
  })

  it('keeps a fold that stands alone with its own opening edge', () => {
    // The run screen has folds with no mark above them; removing the edge from
    // every fold would leave those floating without a divider.
    const fold = rule('.fold')
    expect(fold).not.toBeNull()
    expect(fold).toMatch(/border-top:\s*1px/)
  })
})
