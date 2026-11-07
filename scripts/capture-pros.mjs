// Rebuild src/lib/prosData.js from ValorantHub.
//
//   node scripts/capture-pros.mjs            # refresh everything
//   node scripts/capture-pros.mjs --dry-run  # fetch, report, write nothing
//
// Two passes over the source:
//   1. the public table (10 pages) gives name, team, country, DPI, sensitivity
//      and the player's page slug;
//   2. each player's page gives their crosshair profile code, which the app
//      decodes at runtime rather than trusting a picture.
//
// Rows without a published DPI and sensitivity are dropped: eDPI is DPI x sens,
// and a row missing either is not a data point. Captures are cached under tmp/
// so an interrupted run resumes instead of starting over; only non-empty results
// are cached, because an empty page may just be rate limiting.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import * as cheerio from 'cheerio'
import { decodeCrosshair } from '../src/lib/crosshair.js'

const dryRun = process.argv.includes('--dry-run')
const PAGES = 10
const CONCURRENCY = 6
const UA = 'Mozilla/5.0 (compatible; AimDial data capture; +https://github.com/HenMie)'

const tmp = new URL('../tmp/', import.meta.url)
mkdirSync(tmp, { recursive: true })
const rowsCache = new URL('pros-rows.json', tmp)
const codeCache = new URL('pros-crosshairs.json', tmp)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function get(url, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (error) {
      if (attempt === attempts - 1) throw error
      await sleep(1200 * (attempt + 1))
    }
  }
  return ''
}

async function captureTable() {
  if (existsSync(rowsCache) && !process.argv.includes('--refresh')) {
    console.log('table: using cached tmp/pros-rows.json')
    return JSON.parse(readFileSync(rowsCache, 'utf8'))
  }
  const rows = []
  for (let page = 1; page <= PAGES; page += 1) {
    const url = page === 1 ? 'https://valoranthub.com/proplayers' : `https://valoranthub.com/proplayers?page=${page}`
    const $ = cheerio.load(await get(url))
    const headers = $('table thead th').map((_, el) => $(el).text().trim().toLowerCase()).get()
    const at = (name) => headers.indexOf(name)
    $('table tbody tr').each((_, tr) => {
      const cells = $(tr).find('td')
      const text = (index) => (index >= 0 ? $(cells[index]).text().trim() : '')
      rows.push({
        player: text(at('player')),
        team: text(at('team')),
        country: text(at('country')),
        dpi: Number(text(at('dpi'))),
        sens: Number(text(at('sens'))),
        slug: ($(tr).find('a[href^="/proplayers/"]').attr('href') ?? '').replace('/proplayers/', '') || null,
      })
    })
    console.log(`table: page ${page}, ${rows.length} rows`)
  }
  writeFileSync(rowsCache, JSON.stringify(rows, null, 1))
  return rows
}

async function captureCodes(rows) {
  const cached = existsSync(codeCache) ? JSON.parse(readFileSync(codeCache, 'utf8')) : {}
  const codes = Object.fromEntries(Object.entries(cached).filter(([, value]) => value))
  const queue = rows.filter((row) => row.slug && codes[row.slug] === undefined)
  console.log(`crosshairs: ${queue.length} of ${rows.length} to fetch`)
  let done = 0

  async function worker() {
    while (queue.length > 0) {
      const row = queue.shift()
      try {
        const html = await get(`https://valoranthub.com/proplayers/${row.slug}`)
        // Pages with no code still carry a reference record whose "code" is a
        // framework pointer such as "$L18c"; a real profile starts with "0".
        const match = html.replaceAll('\\\\"', '"').replaceAll('\\"', '"').match(/"code":"(0;[^"]*|0)"/)
        codes[row.slug] = match ? match[1] : ''
      } catch {
        codes[row.slug] = ''
      }
      done += 1
      if (done % 40 === 0) {
        writeFileSync(codeCache, JSON.stringify(codes, null, 1))
        console.log(`crosshairs: ${done} fetched, ${queue.length} left`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  writeFileSync(codeCache, JSON.stringify(codes, null, 1))
  return codes
}

const ENTITIES = { '&#x27;': "'", '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' }
const clean = (value) => String(value ?? '').replace(/&#x27;|&amp;|&quot;|&lt;|&gt;/g, (m) => ENTITIES[m]).trim()

function build(rows, codes) {
  const seen = new Set()
  const out = []
  const skipped = []
  for (const row of rows) {
    const name = clean(row.player)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) { skipped.push(`${name} (duplicate)`); continue }
    if (!Number.isFinite(row.dpi) || !Number.isFinite(row.sens) || row.dpi <= 0 || row.sens <= 0) {
      skipped.push(`${name} (no published setup)`)
      continue
    }
    seen.add(key)
    // "0" is a valid export of the default profile but carries no geometry, so
    // it is not a crosshair: storing it would put a blank glyph in the list.
    const raw = codes[row.slug] ?? ''
    const code = raw && decodeCrosshair(raw) ? raw : ''
    out.push({
      n: name,
      t: clean(row.team),
      c: clean(row.country),
      ...(code ? { x: code } : {}),
      d: row.dpi,
      s: row.sens,
    })
  }
  out.sort((a, b) => a.n.toLowerCase().localeCompare(b.n.toLowerCase()))
  return { rows: out, skipped }
}

function render(rows) {
  const withCode = rows.filter((row) => row.x).length
  const body = rows.map((row) => `  ${JSON.stringify(row)},`).join('\n')
  // Local date, not UTC: a capture made in the evening in UTC+8 would otherwise
  // be stamped with yesterday.
  const captured = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  return `// Published pro mouse setups, one entry per player.
//
// Source: ValorantHub's public pro pages, captured ${captured}:
// ${rows.length} players with a published DPI and in-game sensitivity, ${withCode} of whom also
// publish a crosshair profile code.
//
// Keys are short because this file ships to the browser:
//   n=name, t=team, c=country, x=crosshair code, d=DPI, s=in-game sensitivity.
// eDPI is derived at runtime from d and s, so the displayed figure can never
// diverge from the sourced pair. The crosshair is decoded at runtime from x by
// lib/crosshair.js, so the glyph is never a hand-drawn guess.
export default [
${body}
]
`
}

const rows = await captureTable()
const codes = await captureCodes(rows)
const { rows: built, skipped } = build(rows, codes)
let undecodable = 0
for (const row of built) {
  if (row.x && !decodeCrosshair(row.x)) undecodable += 1
}
console.log(`built ${built.length} rows, ${built.filter((r) => r.x).length} with a crosshair, ${skipped.length} skipped, ${undecodable} undecodable codes`)
if (skipped.length) console.log('skipped:', skipped.join(', '))
if (dryRun) {
  console.log('dry run: nothing written')
} else {
  writeFileSync(new URL('../src/lib/prosData.js', import.meta.url), render(built))
  console.log('wrote src/lib/prosData.js')
}
