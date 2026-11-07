import { describe, expect, it } from 'vitest'
import { decodeCrosshair, describeCrosshair, PRESET_COLOURS } from './crosshair.js'

// Every code below was captured from ValorantHub on 2026-11-08, and the expected
// readings were checked against each player's own published crosshair settings
// on the same day. They pin the decoder to the format the game really exports,
// including the three cases that are easy to get wrong.

const JINGGG = '0;s;1;P;c;5;o;1;f;0;m;1;0t;3;0l;0;0v;1;0g;1;0o;0;0a;1;0f;0;1t;1;1l;4;1g;1;1o;0;1a;1;1m;0;1f;0;S;c;5;o;1'
const BDOG = '0;s;1;P;c;1;o;1;f;0;0t;0;0l;0;0o;0;0a;1;0f;0;1t;1;1l;3;1o;3;1a;1;1m;0;1f;0;S;s;0.85'
const TEN_Z = '0;s;1;P;c;5;o;1;f;0;0l;5;0v;0;0g;1;0a;1;0f;0;1l;0;1v;4;1g;1;1o;2;1a;1;1m;0;1f;0;S;c;5;o;1'
const TEN_Z_OFF = '0;s;1;P;c;5;o;0;f;0;0l;2;0v;2;0g;1;0o;1;0a;1;0f;0;1b;0'
const ASPAS = '0;P;h;0;0l;4;0o;0;0a;1;0f;0;1b;0'
const ZMJJKK = '0;P;h;0;d;1;f;0;0l;2;0v;2;0g;1;0o;1;0f;0;1b;0'
const AUTUMN = '0;s;1;P;c;5;o;1;f;0;0b;0;1b;0;S;c;1;o;1'

describe('crosshair code decoding', () => {
  it('refuses an empty or malformed profile instead of drawing a guess', () => {
    expect(decodeCrosshair('')).toBeNull()
    expect(decodeCrosshair('0')).toBeNull()
    expect(decodeCrosshair(null)).toBeNull()
    expect(decodeCrosshair('not;a;code')).toBeNull()
  })

  it('reads the colour preset a code names', () => {
    expect(decodeCrosshair(TEN_Z).primary.colourName).toBe('青')
    expect(decodeCrosshair(TEN_Z).primary.colourHex).toBe('#00ffff')
    expect(decodeCrosshair(BDOG).primary.colourName).toBe('绿')
    expect(decodeCrosshair('0;s;1;P;c;8;u;000000FF;h;0;b;1;f;0;0l;4;0o;0;0a;1;0f;0;1b;0').primary.colourHex)
      .toBe('#000000')
  })

  it('reads a zero-length group as off, not as present', () => {
    // Jinggg's published settings: outer lines 4 long, inner lines 0 long. The
    // export writes the inner geometry anyway, so presence cannot decide it.
    const jinggg = decodeCrosshair(JINGGG).primary
    expect(jinggg.inner.length).toBe(0)
    expect(jinggg.inner.on).toBe(false)
    expect(jinggg.outer.on).toBe(true)
    expect(jinggg.outer.length).toBe(4)

    // bdog: both inner length and thickness are 0.
    const bdog = decodeCrosshair(BDOG).primary
    expect(bdog.inner.on).toBe(false)
    expect(bdog.outer.on).toBe(true)
    expect(bdog.outer.offset).toBe(3)
  })

  it('treats 1b;0 as the outer group being off', () => {
    // TenZ and aspas both carry an outer block whose only content is 1b;0.
    for (const code of [TEN_Z, ASPAS]) {
      const p = decodeCrosshair(code).primary
      expect(p.inner.on).toBe(true)
      expect(p.outer.on).toBe(false)
    }
  })

  it('reads the outline from o, not from h', () => {
    // Jinggg's outlined crosshair writes h;0 with o;1, so h cannot be the switch.
    expect(decodeCrosshair(JINGGG).primary.outline.on).toBe(true)
    expect(decodeCrosshair(TEN_Z_OFF).primary.outline.on).toBe(false)
  })

  it('does not draw a blank glyph for a profile with nothing in it', () => {
    // autumn's primary carries no line geometry and no centre dot; the game
    // still shows its default dot, and so must this.
    const autumn = decodeCrosshair(AUTUMN).primary
    expect(autumn.inner.on).toBe(true)
    expect(describeCrosshair(decodeCrosshair(AUTUMN)).shape).not.toBe('空')
  })

  it('keeps the centre dot separate from the lines', () => {
    expect(decodeCrosshair(ZMJJKK).primary.centreDot.on).toBe(true)
    expect(decodeCrosshair(TEN_Z).primary.centreDot.on).toBe(false)
  })

  it('splits ADS and sniper sections without leaking them into the primary', () => {
    const demon = decodeCrosshair('0;p;0;s;1;P;o;1;f;0;0t;1;0l;3;0o;2;0a;1;0f;0;1b;0;A;o;1;0t;1;0l;3;0o;2;0a;1;0f;0;1b;0;S;c;1;o;1')
    expect(demon.ads).not.toBeNull()
    expect(demon.sniper).not.toBeNull()
    expect(demon.primary.inner.length).toBe(3)
    // Lowercase `d` is the centre-dot switch, not a section marker: a code that
    // contains it must still decode the whole primary section.
    expect(decodeCrosshair(ZMJJKK).primary.inner.length).toBe(2)
  })

  it('names the shape in words that match the numbers', () => {
    // aspas: inner lines on, outer block explicitly off -> one layer.
    expect(describeCrosshair(decodeCrosshair(ASPAS)).shape).toBe('单层十字')
    expect(describeCrosshair(decodeCrosshair(TEN_Z)).shape).toBe('单层十字')
    // A dot-only crosshair is a dot, not an empty cross: the inner group is
    // written with zero geometry, which is how the game hides it.
    expect(describeCrosshair(decodeCrosshair('0;P;d;1;z;3;0l;0;0t;0;1b;0')).shape).toBe('一个点')
    // Lines plus a dot say both.
    expect(describeCrosshair(decodeCrosshair(ZMJJKK)).shape).toBe('单层十字＋中心点')
    // Both line groups drawing is the two-layer case.
    expect(describeCrosshair(decodeCrosshair(JINGGG)).shape).toBe('单层十字')
    expect(describeCrosshair(decodeCrosshair('0;P;0l;4;0o;1;0a;1;1l;4;1o;2;1a;1;1b;1')).shape).toBe('双层十字')
  })

  it('exposes every preset the game ships', () => {
    expect(PRESET_COLOURS).toHaveLength(9)
    expect(PRESET_COLOURS[8].hex).toBeNull()
    for (const preset of PRESET_COLOURS.slice(0, 8)) {
      expect(preset.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
