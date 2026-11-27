import { ADAPTATIONS, adaptationsFor, clampToRow, inRange } from '../src/coding/adaptations';
import { ALL_ITEMS, CodingItem, codingItemsFor, fitsStyle, isOn, itemApplies, withItem } from '../src/coding/items';

// The codings read from the owner's 2007 SEAT Leon Cupra on 27 Nov 2026.
const C09 = [0xa3, 0x0e, 0x1e, 0x07, 0x00, 0x04, 0x10, 0x01, 0x50, 0x32, 0x00, 0x32, 0x32, 0x00, 0x00, 0x00, 0x00, 0x41, 0xff, 0x07, 0x32, 0x40, 0x00];
const C46 = [0x90, 0x80, 0x08, 0x00, 0x7f, 0x83, 0xcc, 0x7f, 0x00, 0x06, 0x0f, 0x0f, 0xe0, 0x08, 0xdf, 0x84, 0x10, 0x5c, 0x80];
const C17 = [0x00, 0x11, 0x31]; // 0004401

const item = (id: string): CodingItem => {
  const i = ALL_ITEMS.find((x) => x.id === id);
  if (!i) throw new Error(`missing ${id}`);
  return i;
};

// [id, coding, state on this car, byte that changes, byte value after the flip]
const CASES: [string, number[], boolean, number, number][] = [
  ['pq35-bulb-brake', C09, true, 18, 0xfd],
  ['pq35-bulb-rear-fog', C09, true, 18, 0xf7],
  ['pq35-bulb-reverse', C09, true, 18, 0xbf],
  ['pq35-bulb-number-plate', C09, true, 18, 0xfe],
  ['pq35-bulb-high-beam', C09, true, 18, 0xef],
  ['pq35-bulb-check-all', C09, true, 2, 0x1a],
  ['pq35-drl-fog', C09, false, 17, 0x51],
  ['pq35-extra-high-beam', C09, true, 17, 0x43],
  ['pq35-us-side-markers-off', C09, true, 17, 0x01],
  ['pq35-rear-wiper-continuous', C09, false, 1, 0x8e],
  ['pq35-rear-wiper-interval', C09, false, 2, 0x1f],
  ['pq35-comfort-close-remote', C46, true, 6, 0x8c],
  ['pq35-windows-after-door', C46, false, 6, 0x4c],
  ['pq35-confirm-unlock-key-flash', C46, true, 10, 0x0e],
  ['pq35-confirm-unlock-key-horn', C46, true, 10, 0x0d],
  ['pq35-confirm-unlock-remote-flash', C46, true, 10, 0x0b],
  ['pq35-confirm-unlock-remote-horn', C46, true, 10, 0x07],
  ['pq35-confirm-lock-key-flash', C46, true, 11, 0x0e],
  ['pq35-confirm-lock-key-horn', C46, true, 11, 0x0d],
  ['pq35-confirm-lock-remote-flash', C46, true, 11, 0x0b],
  ['pq35-confirm-lock-remote-horn', C46, true, 11, 0x07],
];

describe('Leon mods added on 27 Nov 2026 (coding bits)', () => {
  it.each(CASES)('%s reads the car and flips only its own bit', (id, coding, state, byte, after) => {
    const it_ = item(id);
    expect(it_.platforms).toContain('PQ35');
    expect(it_.length).toBe(coding.length);
    expect(['high', 'medium']).toContain(it_.confidence);
    expect(it_.sources.length).toBeGreaterThan(0);
    expect(it_.summary).not.toMatch(/\u{2014}/u);
    expect(codingItemsFor('vag', 'PQ35').map((i) => i.id)).toContain(id);
    expect(isOn(it_, coding)).toBe(state);
    const flipped = withItem(it_, coding, !state);
    expect(flipped[byte]).toBe(after);
    expect(flipped.filter((_, i) => i !== byte)).toEqual(coding.filter((_, i) => i !== byte));
    expect(isOn(it_, flipped)).toBe(!state);
    expect(withItem(it_, flipped, state)).toEqual(coding);
  });

  it('are on coding-length styles that fit, never the short ones', () => {
    for (const [id] of CASES) expect(fitsStyle(item(id), 'short')).toBe(false);
  });

  it('cluster short coding: brake pad warning is +01 and washer warning is +04 of digits 3 and 4', () => {
    const pad = item('pq35-brake-pad-warning');
    const washer = item('pq35-washer-warning');
    expect(fitsStyle(pad, 'short')).toBe(true);
    expect(fitsStyle(washer, 'short')).toBe(true);
    expect(isOn(pad, C17)).toBe(false);
    expect(isOn(washer, C17)).toBe(true);
    const number = (c: number[]) => c[0] * 65536 + c[1] * 256 + c[2];
    expect(number(withItem(pad, C17, true))).toBe(5401);
    expect(number(withItem(washer, C17, false))).toBe(401);
    // Both together, then back: the other digits (4 and 01) stay.
    expect(number(withItem(washer, withItem(pad, C17, true), false))).toBe(1401);
    expect(withItem(pad, [0, 0x11, 0x31], true).length).toBe(3);
  });

  it('the seen-on-car setting readings still hold for the original coding', () => {
    // 21 Nov factory 09 coding: bit 7 of byte 18 was clear, so the rear side check was off.
    const factory = [0xe3, 0x0e, 0x1e, 0x0f, 0x00, 0x04, 0x10, 0x00, 0x50, 0x32, 0x00, 0x32, 0x32, 0x00, 0x00, 0x00, 0x00, 0x41, 0x7f, 0x07, 0x32, 0x40, 0x00];
    expect(isOn(item('pq35-rear-side-bulb-check'), factory)).toBe(false);
    // The other bulb checks added here were on at the factory read as well.
    for (const id of ['pq35-bulb-brake', 'pq35-bulb-rear-fog', 'pq35-bulb-reverse', 'pq35-bulb-number-plate', 'pq35-bulb-high-beam']) expect(isOn(item(id), factory)).toBe(true);
  });
});

describe('Leon bulb checks and locking bits upgraded on 27 Nov 2026', () => {
  it('bulb check rows now carry the grade their sources earn', () => {
    expect(item('cat-leon-cold-check-indicators').confidence).toBe('high');
    expect(item('cat-leon-cold-check-front-side').confidence).toBe('high');
    expect(item('cat-leon-cold-check-rear-side').confidence).toBe('high');
    expect(item('cat-leon-cold-check-low-beam').confidence).toBe('medium');
    expect(item('cat-leon-cold-check-front-fog').confidence).toBe('medium');
    expect(isOn(item('cat-leon-cold-check-rear-side'), C09)).toBe(true);
    expect(isOn(item('cat-leon-cold-check-indicators'), C09)).toBe(true);
  });

  it('auto lock and auto unlock are byte 0 bits 4 and 3 of the 19-byte comfort coding', () => {
    const lock = item('cat-leon-auto-lock');
    const unlock = item('cat-leon-auto-unlock');
    expect(lock.confidence).toBe('medium');
    expect(unlock.confidence).toBe('medium');
    expect(isOn(lock, C46)).toBe(true);
    expect(isOn(unlock, C46)).toBe(false);
    // 21 Nov factory coding had auto unlock on (byte 0 = 0x98).
    expect(isOn(unlock, [0x98, ...C46.slice(1)])).toBe(true);
    expect(withItem(unlock, C46, true)[0]).toBe(0x98);
  });

  it('the older-layout confirmation bits in bytes 6 and 7 and the mirror sync are held back with a plain reason', () => {
    for (const id of ['cat-leon-lock-horn-remote', 'cat-leon-unlock-horn-remote', 'cat-leon-lock-flash-remote', 'cat-leon-unlock-flash-remote', 'cat-leon-mirror-sync']) {
      expect(item(id).confidence).toBe('low');
      expect(item(id).held).toBe('A better source puts this elsewhere on this module.');
      expect(itemApplies(item(id), C46, { style: 'long' })).toBe(false);
    }
    expect(item('cat-leon-rls-installed').held).toBe('This says what is fitted to the car. It is not a setting.');
  });

  it('the boot opener is byte 2 bit 3 of a 19-byte Comfort coding on 1K0959433 and nothing else', () => {
    const boot = item('cat-leon-tailgate-soft-touch');
    expect([boot.byte, boot.bits, boot.length, boot.parts, boot.confidence, boot.held]).toEqual([2, [3], 19, ['1K0959433'], 'low', undefined]);
    expect(boot.title).toBe('Boot opens from the key button');
    expect(boot.sources).toEqual([{ label: 'vag-coding.net: Golf 5 automatic tailgate opening', url: 'https://www.vag-coding.net/vw/golf-5-1k/golf-5-1k-automatic-tailgate-opening-retrofit' }]);
    const ctx = { style: 'long', part: '1K0959433BT' };
    expect(itemApplies(boot, C46, ctx)).toBe(true);
    expect(isOn(boot, C46)).toBe(true);
    const off = withItem(boot, C46, false);
    const hexOf = (c: number[]) => c.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
    expect(hexOf(C46)).toBe('908008007F83CC7F00060F0FE008DF84105C80');
    expect(hexOf(off)).toBe('908000007F83CC7F00060F0FE008DF84105C80');
    expect(itemApplies(boot, C46, { style: 'long', part: '' })).toBe(false);
    expect(itemApplies(boot, C46, { style: 'long', part: '3C0937049' })).toBe(false);
    expect(itemApplies(boot, [...C46, 0], ctx)).toBe(false);
  });

  it('facelift-only 09 bits are held to a 30-byte coding, where bytes 14, 15 and 24 are not percentage values', () => {
    for (const id of ['cat-leon-drl-separate', 'cat-leon-drl-position', 'cat-leon-fog-cornering']) expect(item(id).length).toBe(30);
    // The same predicate the screen uses (itemApplies), not a filter of the test's own.
    const ids = codingItemsFor('vag', 'PQ35').filter((i) => i.module === 'vag-09' && itemApplies(i, C09, { style: 'long' })).map((i) => i.id);
    expect(ids).not.toEqual(expect.arrayContaining(['cat-leon-drl-separate']));
    // On this car byte 8 is the daytime light level, 0x50 = 80 percent, so no switch may touch it.
    expect(C09[8]).toBe(80);
    for (const id of ['cat-leon-drl-separate', 'cat-leon-drl-position', 'cat-leon-fog-cornering', 'cat-leon-drl-off-indicating', 'cat-leon-low-beam-always']) expect(ids).not.toContain(id);
    for (const i of codingItemsFor('vag', 'PQ35').filter((x) => x.module === 'vag-09' && itemApplies(x, C09, { style: 'long' }))) {
      expect([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).not.toContain(i.byte);
    }
  });

  it('no two settings share a place', () => {
    const keys = codingItemsFor('vag', 'PQ35').map((i) => `${i.module}|${i.length ?? ''}|${i.byte}|${i.bits.join()}|${i.field?.mask ?? ''}|${i.short?.flag ?? ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Leon adaptation rows added on 27 Nov 2026', () => {
  const row = (module: string, channel: number) => {
    const r = ADAPTATIONS.find((a) => a.module === module && a.channel === channel);
    if (!r) throw new Error(`missing ${module}:${channel}`);
    return r;
  };

  it('are offered on the PQ35 and have unique ids', () => {
    const ids = adaptationsFor('vag', 'PQ35').map((a) => a.id);
    for (const id of ['vag-09:4', 'vag-09:7', 'vag-09:8', 'vag-17:3', 'vag-17:4']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('headlight washer time is 50 to 10000 ms in steps of 50', () => {
    const r = row('vag-09', 4);
    expect([r.min, r.max, r.step, r.unit]).toEqual([50, 10000, 50, 'ms']);
    expect(clampToRow(r, 1234)).toBe(1250);
    expect(inRange(r, 40)).toBe(false);
  });

  it('automatic headlight delay is 0 to 10200 ms in steps of 40, and the high beam row is on or off', () => {
    const r = row('vag-09', 8);
    expect([r.min, r.max, r.step]).toEqual([0, 10200, 40]);
    expect(clampToRow(r, 10230)).toBe(10200);
    expect(row('vag-09', 7).choices?.map((c) => c.value)).toEqual([0, 1]);
  });

  it('consumption correction is 85 to 115 percent, and the language row names 8 values', () => {
    const c = row('vag-17', 3);
    expect([c.min, c.max, c.step, c.unit]).toEqual([85, 115, 1, '%']);
    expect(inRange(c, 100)).toBe(true);
    expect(inRange(c, 84)).toBe(false);
    const l = row('vag-17', 4);
    expect(l.choices?.map((x) => x.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(l.choices?.find((x) => x.value === 2)?.label).toBe('English');
    expect(inRange(l, 0)).toBe(false);
  });

  it('every row has sources and a plain summary', () => {
    for (const r of ADAPTATIONS) {
      expect(r.sources.length).toBeGreaterThan(0);
      expect(r.summary).not.toMatch(/\u{2014}/u);
    }
  });
});
