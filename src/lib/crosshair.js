// Decode a Valorant crosshair profile code into the numbers that draw it.
//
// The code is Riot's exported crosshair profile: `;`-separated tokens where the
// first is the profile version and `P` / `A` / `S` / `d` open the primary, ADS,
// sniper-scope and sniper-dot sections. A section body is a flat list of
// `key;value` pairs. Keys are namespaced by scope:
//
//   0l 0o 0a 0f   primary inner lines: length, offset, opacity, firing error
//   0t 0v 0g 0m   ...plus thickness, fixed-length, fixed-thickness, split
//   1l 1t 1o 1a   primary outer lines, the same block (1b is their on/off)
//   c u           colour preset (0-8) and custom colour hex
//   h b           outline switch and outline thickness
//   d z           centre dot switch and dot size
//   a             overall opacity, e firing-error multiplier, s/a/y movement
//
// 0l is written for a plain crosshair and 0b only rarely, so presence of the
// 0 namespace is read from its geometry keys and presence of the 1 namespace
// from `1b`, which is written even when its value is 0.
//
// Unknown or malformed input returns null, never a half-drawn shape: a wrong
// crosshair is worse than none.

const HEX = /^[0-9a-fA-F]{6,8}$/
// The key set is closed; any other token is a value, including the bare numbers
// Riot writes (`c;5` is a key and a value, not two keys).
const KEY = /^(c|u|a|d|z|e|y|h|o|b|p|s|m|n|f|t|l|v|g|[01][a-zA-Z])$/

export const PRESET_COLOURS = [
  { value: 0, hex: '#ffffff', label: '白' },
  { value: 1, hex: '#00ff00', label: '绿' },
  { value: 2, hex: '#7fff00', label: '黄绿' },
  { value: 3, hex: '#dfff00', label: '绿黄' },
  { value: 4, hex: '#ffff00', label: '黄' },
  { value: 5, hex: '#00ffff', label: '青' },
  { value: 6, hex: '#ff00ff', label: '粉' },
  { value: 7, hex: '#ff0000', label: '红' },
  { value: 8, hex: null, label: '自定义' },
]

const PRESET_BY_VALUE = new Map(PRESET_COLOURS.map((entry) => [entry.value, entry]))

function customColour(token) {
  if (!token || !HEX.test(token)) return null
  return {
    hex: `#${token.slice(0, 6).toLowerCase()}`,
    alpha: token.length === 8 ? parseInt(token.slice(6, 8), 16) / 255 : 1,
  }
}

const number = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const on = (value) => value === true || value === '1'

function readFlags(tokens) {
  const flags = {}
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (HEX.test(token)) {
      flags.u = token
      continue
    }
    if (!KEY.test(token)) continue
    const value = tokens[i + 1]
    if (value === undefined) {
      flags[token] = true
    } else if (HEX.test(value) || !KEY.test(value)) {
      flags[token] = value
      i += 1
    } else {
      flags[token] = true
    }
  }
  return flags
}

/**
 * One group of lines.
 *
 * Two separate questions, and both need an answer before anything is drawn:
 *
 *  1. Does the group exist? The export only writes the groups it uses. `1b` is
 *     the outer group's switch, and it appears as 0 either way — TenZ and aspas
 *     write `1b;0` because they have no outer lines, while Jinggg writes
 *     `1t;1;1l;4` with no `1b` at all because he does. So the switch is trusted
 *     when it says 1 and the geometry is trusted when it is written.
 *  2. Is it visible? A group with zero length or zero thickness is hidden in
 *     game: Jinggg's inner lines are `0t;3;0l;0`, and bdog's are `0t;0;0l;0`.
 *     Both draw outer lines only, which is exactly what their published settings
 *     say. Checking geometry is what turns "has an outer block" into "has outer
 *     lines".
 */
function lineGroup(flags, prefix, { switchKey = null, geometryKeys }) {
  const mentioned = geometryKeys.some((key) => flags[key] !== undefined)
  const length = number(flags[`${prefix}l`], 1)
  const thickness = number(flags[`${prefix}t`], 1)

  let draws
  if (switchKey) {
    // The outer group is written `1b;0` when it is off (TenZ, aspas: the whole
    // outer block is just that pair) and simply omitted by the players who draw
    // it (Jinggg `1t;1;1l;4`, bdog `1t;1;1l;3`). So an explicit 0 is final, an
    // explicit 1 is on, and an absent switch defers to the geometry. Checked
    // against those four players' published settings on 2026-11-08.
    const switchedOn = on(flags[switchKey])
    draws = (flags[switchKey] === '0' ? false : switchedOn || mentioned) && length > 0 && thickness > 0
  } else if (!mentioned) {
    // Nothing written at all: the empty profile. The game still draws its
    // default dot, so the glyph must not be blank.
    draws = true
  } else {
    // Written, so it is off only when the export says the geometry is zero —
    // Jinggg's `0t;3;0l;0` and bdog's `0t;0;0l;0`. Verified against both
    // players' published settings on 2026-11-08.
    draws = length > 0 && thickness > 0
  }

  return {
    on: draws,
    present: draws,
    length,
    thickness,
    offset: number(flags[`${prefix}o`], 0),
    opacity: flags[`${prefix}a`] === undefined ? 1 : number(flags[`${prefix}a`], 1),
    // v / g = 1 draw that dimension as a fixed single unit ("classic" style).
    lengthIsFixed: on(flags[`${prefix}v`]),
    thicknessIsFixed: on(flags[`${prefix}g`]),
    split: on(flags[`${prefix}m`]),
    firingError: on(flags[`${prefix}f`]),
  }
}

function decodeSection(tokens) {
  const flags = readFlags(tokens)
  const preset = PRESET_BY_VALUE.get(number(flags.c, 1)) ?? PRESET_BY_VALUE.get(1)
  const custom = customColour(flags.u)
  // `c;8` means "custom", but a few exports in the wild carry the index without
  // the `u` value. White is the safe reading: it is visible on the ink ground
  // and never claims a colour the code did not state.
  const colourHex = custom ? custom.hex : (preset.hex ?? '#ffffff')
  return {
    flags,
    colourName: custom ? '自定义' : preset.label,
    colourHex,
    centreDot: { on: on(flags.d), size: number(flags.z, 1) },
    // The outline is its own pair: `o` carries the switch and the opacity
    // together, and an export that writes `o;1` draws it. `h` is not the switch —
    // Jinggg's outlined crosshair writes `h;0` alongside `o;1`. Verified against
    // each player's published settings on 2026-11-08.
    outline: { on: number(flags.o, 0) > 0, opacity: number(flags.o, 0) },
    inner: lineGroup(flags, '0', { geometryKeys: ['0l', '0t'] }),
    outer: lineGroup(flags, '1', { switchKey: '1b', geometryKeys: ['1l', '1t'] }),
    movementError: { on: on(flags.s), multiplier: number(flags.y, 0) },
  }
}

// Sections start with a capital P (primary), A (ADS) or S (sniper). Lowercase
// `d` is the centre-dot switch inside them, not a section of its own — reading it
// as one truncated the primary section at the first `d;1`.
const MARKS = ['P', 'A', 'S']

function slice(tokens) {
  const found = {}
  for (let i = 0; i < tokens.length; i += 1) {
    const mark = tokens[i]
    if (!MARKS.includes(mark)) continue
    const rest = tokens.slice(i + 1)
    const end = rest.findIndex((token, j) => j > 0 && MARKS.includes(token))
    found[mark] = end < 0 ? rest : rest.slice(0, end)
  }
  return found
}

export function decodeCrosshair(code) {
  if (typeof code !== 'string') return null
  const trimmed = code.trim()
  // A bare "0" is a valid export of the default profile, but it says nothing
  // that could be drawn or described.
  if (!trimmed || trimmed === '0') return null
  const tokens = trimmed.split(';').map((token) => token.trim()).filter(Boolean)
  const parts = slice(tokens)
  if (!parts.P || parts.P.length === 0) return null
  return {
    primary: decodeSection(parts.P),
    ads: parts.A ? decodeSection(parts.A) : null,
    sniper: parts.S ? decodeSection(parts.S) : null,
  }
}

/**
 * The crosshair as words: colour, shape family, and whether it is outlined.
 * Everything here is derived from the decoded numbers.
 */
export function describeCrosshair(decoded) {
  if (!decoded?.primary) return null
  const p = decoded.primary
  const { inner, outer, centreDot: dot } = p
  const arms = (inner.on ? 1 : 0) + (outer.on ? 1 : 0)
  let shape
  if (dot.on && arms === 0) shape = '一个点'
  else if (arms === 1) shape = '单层十字'
  else if (arms === 2) shape = '双层十字'
  else shape = '实心方块'
  if (dot.on && arms > 0) shape += '＋中心点'
  const thick = inner.on ? inner.thickness : outer.thickness
  return {
    shape,
    colour: p.colourName,
    colourHex: p.colourHex,
    outline: p.outline.on,
    dot: dot.on,
    innerLength: inner.on ? inner.length : 0,
    outerLength: outer.on ? outer.length : 0,
    thickness: thick,
  }
}

export default decodeCrosshair
