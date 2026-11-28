import * as fs from 'fs';
import * as path from 'path';
import { MODULES } from '../src/obd/modules';
import { isNumericByte, RAW_REFUSED_MODULES, rawBitLabel, rawByteNumber, rawEditorRefusal, rawWithBit, rawWriteProblem } from '../src/coding/rawBits';
import { CODING_WRITE_REFUSED } from '../src/obd/elm';

const hex = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16));
const C09 = hex('A30E1E070004100150320032320000000041FF07324000');
const C46 = hex('908008007F83CC7F00060F0FE008DF84105C80');
const ones = (n: number) => n.toString(2).replace(/0/g, '').length;

describe('the Every bit editor logic', () => {
  it('is allowed on a long coding of an ordinary module, and refused for short codes and missing codings', () => {
    expect(rawEditorRefusal('vag-46', C46, 'long')).toBeNull();
    expect(rawEditorRefusal('vag-09', C09, 'uds')).toBeNull();
    expect(rawEditorRefusal('vag-17', [0, 0x11, 0x31], 'short')).toMatch(/short code/);
    expect(rawEditorRefusal('vag-46', [1, 2, 3], 'long')).toBeTruthy();
    expect(rawEditorRefusal('vag-46', null)).toBeTruthy();
    expect(rawEditorRefusal('vag-46', [])).toBeTruthy();
  });

  it('refuses the airbag, immobiliser and engine modules, and those ids exist in the module list where the module does', () => {
    for (const id of ['vag-15', 'vag-25', 'engine', 'vag-01']) {
      expect(RAW_REFUSED_MODULES).toContain(id);
      expect(rawEditorRefusal(id, C46, 'long')).toMatch(/not edited bit by bit/);
      expect(rawWriteProblem(id, C46, 1, 1, 'long')).toBeTruthy();
      expect(rawWithBit(id, C46, 1, 1, true, 'long')).toBeNull();
    }
    expect(MODULES.find((m) => m.id === 'vag-15')?.name).toBe('Airbags');
    expect(MODULES.find((m) => m.id === 'engine')).toBeTruthy();
    // Every refused id that is a module names the airbag system, belt tensioners, or an engine.
    for (const id of RAW_REFUSED_MODULES) {
      const m = MODULES.find((x) => x.id === id);
      if (m) expect(m.name).toMatch(/Airbags|Belt tensioner|Engine|Occupant/);
    }
  });

  it('refuses every module that names an airbag, belt tensioner or occupant system', () => {
    const restraint = MODULES.filter((m) => /Airbag|airbag|Belt tensioner|Occupant/.test(m.name));
    expect(restraint.length).toBeGreaterThan(0);
    for (const m of restraint) expect(RAW_REFUSED_MODULES).toContain(m.id);
    for (const id of ['ford-rcm', 'mazda-rcm', 'ford-ocsm']) expect(MODULES.find((m) => m.id === id)).toBeTruthy();
  });

  it('refuses a numeric byte, an out-of-range byte or bit, and a non-whole byte or bit', () => {
    for (const byte of [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 20]) {
      expect(isNumericByte('vag-09', 23, byte)).toBe(true);
      expect(rawWriteProblem('vag-09', C09, byte, 0, 'long')).toMatch(/holds a number/);
      expect(rawWithBit('vag-09', C09, byte, 3, true, 'long')).toBeNull();
    }
    // The same byte on another coding length is not numeric.
    expect(isNumericByte('vag-09', 30, 8)).toBe(false);
    expect(rawWithBit('vag-09', [...C09, 0, 0, 0, 0, 0, 0, 0], 8, 3, true, 'long')).not.toBeNull();
    for (const byte of [-1, 23, 100, 1.5, NaN]) expect(rawWithBit('vag-09', C09, byte, 1, true, 'long')).toBeNull();
    for (const bit of [-1, 8, 99, 0.5, NaN]) expect(rawWithBit('vag-09', C09, 2, bit, true, 'long')).toBeNull();
    expect(rawWriteProblem('vag-09', C09, 23, 0, 'long')).toBe('This coding has 23 bytes, so there is no byte 23.');
    expect(rawWriteProblem('vag-09', C09, 2, 8, 'long')).toBe('A byte has bits 0 to 7, so there is no bit 8.');
  });

  it('changes exactly 1 bit, leaves the input alone, and round-trips', () => {
    for (const [id, c] of [['vag-09', C09], ['vag-46', C46]] as [string, number[]][]) {
      const copy = [...c];
      c.forEach((_, byte) => {
        if (isNumericByte(id, c.length, byte)) return;
        for (let bit = 0; bit < 8; bit++) {
          const on = (c[byte] & (1 << bit)) !== 0;
          const flipped = rawWithBit(id, c, byte, bit, !on, 'long')!;
          expect(flipped.length).toBe(c.length);
          expect(flipped.map((b, k) => ones(b ^ c[k])).reduce((a, b) => a + b, 0)).toBe(1);
          expect(flipped[byte] ^ c[byte]).toBe(1 << bit);
          expect(rawWithBit(id, flipped, byte, bit, on, 'long')).toEqual(c);
          // Setting a bit to the value it has changes nothing.
          expect(rawWithBit(id, c, byte, bit, on, 'long')).toEqual(c);
        }
      });
      expect(c).toEqual(copy);
    }
  });

  it('names the known setting at a place, including held rows, and says Not named otherwise', () => {
    // Held row: the older mirror row at byte 9 bit 6, not hidden by the new one at byte 14 bit 6.
    expect(rawBitLabel('PQ35', 'vag-46', 19, 9, 6)).toMatchObject({ title: 'Synchronised mirror adjustment', held: expect.stringContaining('better source'), unconfirmed: true });
    expect(rawBitLabel('PQ35', 'vag-46', 19, 14, 6)).toMatchObject({ title: 'Mirrors adjust together', unconfirmed: true });
    expect(rawBitLabel('PQ35', 'vag-46', 19, 14, 6).held).toBeUndefined();
    // An inverted field row names every bit of its mask and says so.
    expect(rawBitLabel('PQ35', 'vag-09', 23, 4, 6)).toMatchObject({ title: 'Rear fog light', inverted: true, unconfirmed: false });
    expect(rawBitLabel('PQ35', 'vag-09', 23, 18, 1)).toMatchObject({ title: 'Warn me when a brake light bulb fails', inverted: false });
    // Nothing known, another coding length, another platform, and no platform.
    expect(rawBitLabel('PQ35', 'vag-46', 19, 18, 0)).toEqual({ title: null, unconfirmed: false, inverted: false });
    expect(rawBitLabel('PQ35', 'vag-09', 30, 4, 6).title).toBeNull();
    expect(rawBitLabel('MQB', 'vag-09', 23, 4, 6).title).toBeNull();
    expect(rawBitLabel(null, 'vag-09', 23, 4, 6).title).toBeNull();
    // A number row is not a bit label.
    expect(rawBitLabel('PQ35', 'vag-09', 23, 8, 0).title).toBeNull();
  });

  it('names the number row that owns a numeric byte', () => {
    expect(rawByteNumber('PQ35', 'vag-09', 23, 8)?.title).toBe('Daytime running light brightness');
    expect(rawByteNumber('PQ35', 'vag-09', 23, 13)).toBeNull();
    expect(rawByteNumber('PQ35', 'vag-09', 30, 8)).toBeNull();
  });

  it('the Workshop screen is wired to it: collapsed by default, 8 switches per byte, written by the existing write path', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/workshop/[id].tsx'), 'utf8');
    expect(src).toMatch(/const \[bitsOpen, setBitsOpen\] = useState\(false\)/);
    expect(src).toMatch(/header="Every bit \(advanced\)"/);
    expect(src).toContain("Advanced. Each switch is 1 bit of this module's coding and writes to the car at once. Coding history can put it back.");
    expect(src).toMatch(/rawEditorRefusal\(def\.id, coding, style\)/);
    expect(src).toContain("This module's coding is not edited here.");
    expect(src).toMatch(/\[7, 6, 5, 4, 3, 2, 1, 0\]\.map/);
    expect(src).toMatch(/rawWithBit\(def\.id, coding, byte, bit, on, style\)/);
    expect(src).toMatch(/void writeCoding\(target, `byte \$\{byte\} bit \$\{bit\} set/);
    // Only the opened byte renders its 8 rows, so a 30-byte coding stays light.
    expect(src).toMatch(/open && !numeric/);
  });

  it('the write guard in elm.ts covers exactly the same modules the editor refuses', () => {
    expect([...CODING_WRITE_REFUSED].sort()).toEqual([...RAW_REFUSED_MODULES].sort());
    // So Put back and coding history cannot write a refused module either.
  });
});
