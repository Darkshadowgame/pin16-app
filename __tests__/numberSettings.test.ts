jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import * as fs from 'fs';
import * as path from 'path';
import { dedupeItems } from '../src/coding/categories';
import { ALL_ITEMS, CodingItem, FitContext, formatNumber, isOn, itemApplies, numberProblem, numberValue, NUMERIC_BYTES, stateText, whyNotOffered, withItem, withNumber } from '../src/coding/items';
import { offeredSettings } from '../src/coding/offered';
import { searchEverything } from '../src/kb';
import { toHex } from '../src/obd/uds';

// The owner's real 09 coding (23 bytes), read on 27 Nov 2026.
const hex = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16));
const C09 = hex('A30E1E070004100150320032320000000041FF07324000');
const ctx: FitContext = { style: 'long', part: '' };
const ctxOf = () => ctx;
const car = (codings: Record<string, number[]> = { 'vag-09': C09 }) => offeredSettings({ group: 'vag', platform: 'PQ35', codings, ctxOf, adaptValues: {} });

const item = (id: string) => ALL_ITEMS.find((i) => i.id === id)!;
const drl = item('cat-leon-drl-brightness');
const side = item('cat-leon-side-marker-brightness');
const fog = item('cat-leon-rear-fog');
const numbers = () => car().items.filter((i) => !!i.number);

describe('number settings (a whole coding byte)', () => {
  it('reads the value the car holds, with its unit', () => {
    expect(numberValue(drl, C09)).toBe(80);
    expect(numberValue(side, C09)).toBe(1);
    expect(formatNumber(drl.number!, numberValue(drl, C09)!)).toBe('80 %');
    expect(stateText(drl, false, 80)).toMatch(/^Now 80 %\. /);
    expect(numberValue(fog, C09)).toBeNull();
    expect(numberValue(drl, null)).toBeNull();
    expect(numberValue(drl, [1, 2])).toBeNull();
  });

  it('both rows are offered on the real 23-byte coding, in Lights, with no switch semantics', () => {
    expect(numbers().map((i) => i.id).sort()).toEqual(['cat-leon-brake-as-tail-brightness', 'cat-leon-drl-brightness', 'cat-leon-front-fog-brightness', 'cat-leon-front-parking-brightness', 'cat-leon-rear-fog-as-tail-brightness', 'cat-leon-rear-parking-brightness', 'cat-leon-side-marker-brightness']);
    for (const i of numbers()) {
      expect(i.bits).toEqual([]);
      expect(i.category).toBe('Lights');
      expect(i.length).toBe(23);
      expect(itemApplies(i, C09, ctx)).toBe(true);
      expect(NUMERIC_BYTES.find((n) => n.module === i.module && n.length === 23)?.bytes).toContain(i.byte);
      // A number is neither on nor off, and a switch call changes nothing.
      expect(isOn(i, C09)).toBe(false);
      expect(withItem(i, C09, true)).toEqual(C09);
    }
  });

  it('setting a value changes only that byte and round-trips', () => {
    for (const i of numbers()) {
      for (const v of [0, 1, 37, 100]) {
        const next = withNumber(i, C09, v)!;
        expect(next).not.toBeNull();
        expect(next.length).toBe(C09.length);
        expect(numberValue(i, next)).toBe(v);
        next.forEach((b, k) => {
          if (k !== i.byte) expect(b).toBe(C09[k]);
        });
        expect(withNumber(i, next, numberValue(i, C09)!)).toEqual(C09);
      }
    }
  });

  it('refuses a value out of range, off step, not whole, or on a coding without the byte', () => {
    for (const bad of [-1, 101, 255, 1.5, NaN, Infinity]) {
      expect(withNumber(drl, C09, bad)).toBeNull();
      expect(numberProblem(drl, bad)).toBeTruthy();
    }
    const stepped: CodingItem = { ...drl, id: 'stepped', number: { min: 10, max: 60, step: 10, unit: 's' } };
    expect(withNumber(stepped, C09, 30)).not.toBeNull();
    expect(withNumber(stepped, C09, 35)).toBeNull();
    expect(withNumber(stepped, C09, 0)).toBeNull();
    expect(numberProblem(stepped, 35)).toBe('35 is not on the steps of 10. Use 10 to 60 s, in steps of 10.');
    expect(withNumber(drl, C09.slice(0, 8), 50)).toBeNull();
    expect(withNumber(fog, C09, 1)).toBeNull();
  });

  it('a switch on byte 8 is still refused, and a number item on byte 2 is refused', () => {
    const rogueSwitch: CodingItem = { ...drl, id: 'rogue-switch', number: undefined, bits: [7] };
    expect(whyNotOffered(rogueSwitch, C09, ctx)).toMatch(/holds a number/);
    const wrongByte: CodingItem = { ...drl, id: 'wrong-byte', byte: 2 };
    expect(whyNotOffered(wrongByte, C09, ctx)).toMatch(/not known to hold a number/);
    expect(itemApplies({ ...drl, id: 'b18', byte: 18 }, C09, ctx)).toBe(false);
    expect(whyNotOffered({ ...drl, id: 'nolen', length: undefined }, C09, ctx)).toMatch(/does not say how long/);
    expect(itemApplies({ ...drl, id: 'bits', bits: [1] }, C09, ctx)).toBe(false);
    expect(itemApplies({ ...drl, id: 'range', number: { min: 5, max: 1, step: 1, unit: '%' } }, C09, ctx)).toBe(false);
    expect(itemApplies({ ...drl, id: 'wide', number: { min: 0, max: 300, step: 1, unit: '%' } }, C09, ctx)).toBe(false);
    // held, style and parts apply as for other items.
    expect(whyNotOffered({ ...drl, id: 'held', held: 'Kept back.' }, C09, ctx)).toBe('Kept back.');
    expect(itemApplies(drl, C09, { style: 'short' })).toBe(false);
    expect(itemApplies({ ...drl, id: 'part', parts: ['3C0937049'] }, C09, { style: 'long', part: '' })).toBe(false);
  });

  it('neither number row is offered on a 30-byte 09 coding', () => {
    const c30 = [...C09, 0, 0, 0, 0, 0, 0, 0];
    for (const i of [drl, side]) {
      expect(itemApplies(i, c30, ctx)).toBe(false);
      expect(whyNotOffered(i, c30, ctx)).toBe('This setting is for a 23-byte coding, and this module has 30 bytes.');
    }
    expect(car({ 'vag-09': c30 }).items.filter((i) => i.number)).toEqual([]);
  });

  it('rear fog reads on, and turning it off sets only byte 4 bit 6', () => {
    expect(fog.number).toBeUndefined();
    expect(fog.category).toBe('Lights');
    expect(isOn(fog, C09)).toBe(true);
    const off = withItem(fog, C09, false);
    expect(isOn(fog, off)).toBe(false);
    off.forEach((b, k) => expect(b).toBe(k === 4 ? C09[4] | 0x40 : C09[k]));
    expect(withItem(fog, off, true)).toEqual(C09);
    expect(car().items.map((i) => i.id)).toContain('cat-leon-rear-fog');
    // No other setting covers byte 4 bit 6 on this module and layout.
    const same = ALL_ITEMS.filter((i) => i.platforms.includes('PQ35') && i.module === 'vag-09' && (i.length ?? 23) === 23 && !i.short && i.byte === 4 && (i.bits.includes(6) || ((i.field?.mask ?? 0) & 0x40) !== 0));
    expect(same.map((i) => i.id)).toEqual(['cat-leon-rear-fog']);
  });

  it('two number items never share a byte, and a number never dedupes into a switch', () => {
    const nums = ALL_ITEMS.filter((i) => i.number);
    const keys = nums.map((i) => `${i.platforms.join()}|${i.module}|${i.length}|${i.byte}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const n of nums) {
      expect(n.length).toBeDefined();
      expect(NUMERIC_BYTES.some((b) => b.module === n.module && b.length === n.length && b.bytes.includes(n.byte))).toBe(true);
      expect(n.number!.min).toBeLessThanOrEqual(n.number!.max);
    }
    const sw: CodingItem = { ...drl, id: 'sw', number: undefined, bits: [] };
    expect(dedupeItems([drl, sw])).toHaveLength(2);
    expect(dedupeItems([drl, { ...drl, id: 'copy' }])).toHaveLength(1);
  });

  it('search lists the number rows with their range, and only where the coding fits', () => {
    const v = { brand: 'SEAT', model: 'Leon', platform: 'PQ35', codingCache: { 'vag-09': toHex(C09) }, modulePart: () => '' };
    const out = searchEverything([], v, 'brightness', 'setting').join('\n');
    expect(out).toContain('[built-in setting cat-leon-drl-brightness]');
    expect(out).toContain('number 0 to 100 %');
    expect(searchEverything([], v, 'parking lights', 'setting').join('\n')).toContain('[built-in setting cat-leon-side-marker-brightness]');
    const c30 = toHex([...C09, 0, 0, 0, 0, 0, 0, 0]);
    expect(searchEverything([], { ...v, codingCache: { 'vag-09': c30 } }, 'brightness', 'setting')).toEqual([]);
  });

  it('the write path calls the gate and the range check itself', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/customise/index.tsx'), 'utf8');
    expect(src).toMatch(/whyNotOffered\(p\.item, codings\[p\.item\.module\][^\n]*valueProblem\(p\.item, p\.value\)/);
    expect(src).toMatch(/withValue\(p\.item, before, p\.value\)/);
  });
});
