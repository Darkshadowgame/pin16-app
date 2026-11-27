jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import * as fs from 'fs';
import * as path from 'path';
import { ADAPTATIONS, adaptationKey, adaptationsFor, isWideRow, typedValueCheck, valueHex } from '../src/coding/adaptations';
import { dedupeItems } from '../src/coding/categories';
import { ALL_ITEMS, CodingItem, codingItemsFor, FitContext, isOn, itemApplies, NUMERIC_BYTES, whyNotOffered, withItem } from '../src/coding/items';
import { adaptValuesFromCache, codingsFromCache, offeredSettings } from '../src/coding/offered';
import { searchEverything } from '../src/kb';
import { toHex } from '../src/obd/uds';

// The codings read from the owner's 2007 SEAT Leon Cupra on 27 Nov 2026.
const hex = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16));
const C09 = hex('A30E1E070004100150320032320000000041FF07324000'); // 23 bytes
const C46 = hex('908008007F83CC7F00060F0FE008DF84105C80'); // 19 bytes
const C17 = [0x00, 0x11, 0x31]; // short 0004401
const C42 = [0x00, 0x02, 0xb0]; // short 0000688
const C52 = [0x00, 0x00, 0x90]; // short 0000144
const C19 = hex('7D3F034007000203'); // gateway, 8 bytes

const CODINGS: Record<string, number[]> = { 'vag-09': C09, 'vag-46': C46, 'vag-17': C17, 'vag-42': C42, 'vag-52': C52, 'vag-19': C19 };
const STYLE: Record<string, string> = { 'vag-09': 'long', 'vag-46': 'long', 'vag-17': 'short', 'vag-42': 'short', 'vag-52': 'short', 'vag-19': 'long' };
const ctxOf = (id: string): FitContext => ({ style: STYLE[id], part: '' });

const allAdaptValues = () => Object.fromEntries(adaptationsFor('vag', 'PQ35').map((a) => [adaptationKey(a), a.min]));
const car = () => offeredSettings({ group: 'vag', platform: 'PQ35', codings: CODINGS, ctxOf, adaptValues: allAdaptValues() });
const bits = (n: number) => n.toString(2).replace(/0/g, '').length;
const shortNumber = (c: number[]) => c[0] * 65536 + c[1] * 256 + c[2];

describe('the 1 function that decides whether an item applies to a coding', () => {
  const offered = car().items;

  it('offers settings on the car, and none limited to a 30-byte coding', () => {
    expect(offered.length).toBeGreaterThan(40);
    expect(offered.filter((i) => i.length === 30)).toEqual([]);
    for (const i of offered) {
      const c = CODINGS[i.module];
      if (i.length != null) expect(c.length).toBe(i.length);
      expect(c.length).toBeGreaterThan(i.short ? 2 : i.byte);
    }
    // The 4 facelift items the review found offered on the 23-byte 09.
    const ids = offered.map((i) => i.id);
    for (const id of ['cat-leon-drl-separate', 'cat-leon-fog-cornering', 'cat-leon-drl-off-indicating', 'cat-leon-low-beam-always', 'cat-leon-drl-position']) expect(ids).not.toContain(id);
  });

  it('never offers a switch on a byte the report describes as a number on the 23-byte 09 (bytes 8 to 16 and 20)', () => {
    for (const i of offered.filter((x) => x.module === 'vag-09' && !x.short)) {
      expect([8, 9, 10, 11, 12, 13, 14, 15, 16, 20]).not.toContain(i.byte);
    }
    // 50 and 32 hex are percentages and times on this car.
    expect([C09[8], C09[9], C09[20]]).toEqual([0x50, 0x32, 0x32]);
    expect(NUMERIC_BYTES.find((n) => n.module === 'vag-09' && n.length === 23)?.bytes).toEqual(expect.arrayContaining([8, 9, 10, 11, 12, 13, 14, 15, 16, 20]));
  });

  it('the rule refuses a switch on a numeric byte even for an item that has no length', () => {
    const rogue: CodingItem = { id: 'rogue', title: 'Rogue', summary: 'x', category: 'Lights', platforms: ['PQ35'], module: 'vag-09', byte: 8, bits: [7], confidence: 'high', sources: [] };
    expect(itemApplies(rogue, C09, ctxOf('vag-09'))).toBe(false);
    expect(whyNotOffered(rogue, C09, ctxOf('vag-09'))).toMatch(/holds a number/);
    // The same bit on another layout is not a number byte.
    expect(itemApplies({ ...rogue, byte: 18 }, C09, ctxOf('vag-09'))).toBe(true);
    expect(itemApplies(rogue, [...C09, 0], ctxOf('vag-09'))).toBe(true);
  });

  it('toggling each offered item away and back returns the exact original coding', () => {
    for (const i of offered) {
      const c = CODINGS[i.module];
      const now = isOn(i, c);
      const flipped = withItem(i, c, !now);
      expect(isOn(i, flipped)).toBe(!now);
      expect(withItem(i, flipped, now)).toEqual(c);
      // On then off from the original, both the same length and byte values 0 to 255.
      const onOff = withItem(i, withItem(i, c, true), false);
      expect(onOff.length).toBe(c.length);
      expect(onOff.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
      if (!now) expect(onOff).toEqual(c);
    }
  });

  it('each toggle changes exactly 1 bit, or the documented short coding flag', () => {
    for (const i of offered) {
      const c = CODINGS[i.module];
      const flipped = withItem(i, c, !isOn(i, c));
      expect(flipped.length).toBe(c.length);
      if (i.short) {
        const { divisor, modulo, flag } = i.short;
        expect(Math.abs(shortNumber(flipped) - shortNumber(c))).toBe(flag * divisor);
        // Every other digit stays: the part under the divisor and above the pair.
        expect(shortNumber(flipped) % divisor).toBe(shortNumber(c) % divisor);
        expect(Math.floor(shortNumber(flipped) / (divisor * modulo))).toBe(Math.floor(shortNumber(c) / (divisor * modulo)));
      } else {
        const changed = flipped.map((b, k) => bits(b ^ c[k])).reduce((a, b) => a + b, 0);
        expect([i.id, changed]).toEqual([i.id, 1]);
      }
    }
  });

  it('an item that changes several bits at once is held back', () => {
    const windows = ALL_ITEMS.find((i) => i.id === 'cat-leon-comfort-windows-remote')!;
    expect(windows.bits.length).toBeGreaterThan(1);
    expect(windows.held).toBeTruthy();
    expect(offered.map((i) => i.id)).not.toContain(windows.id);
  });

  it('short items need a short style and a 3-byte code, long items the reverse', () => {
    const belt = ALL_ITEMS.find((i) => i.id === 'pq35-seat-belt-warning')!;
    const bulb = ALL_ITEMS.find((i) => i.id === 'pq35-bulb-brake')!;
    expect(itemApplies(belt, C17, { style: 'short' })).toBe(true);
    expect(itemApplies(belt, C17, { style: 'long' })).toBe(false);
    expect(itemApplies(belt, C09, { style: 'short' })).toBe(false);
    expect(itemApplies(bulb, C09, { style: 'long' })).toBe(true);
    expect(itemApplies(bulb, C09, { style: 'short' })).toBe(false);
    expect(itemApplies(bulb, C17, { style: 'long' })).toBe(false);
    expect(itemApplies(bulb, C09.slice(0, 20), { style: 'long' })).toBe(false);
    expect(itemApplies(bulb, null, { style: 'long' })).toBe(false);
  });

  it('a length that differs, in either direction, is refused with a plain message', () => {
    const bulb = ALL_ITEMS.find((i) => i.id === 'pq35-bulb-brake')!;
    const long = [...C09, 0, 0, 0, 0, 0, 0, 0];
    const why = whyNotOffered(bulb, long, ctxOf('vag-09'));
    expect(why).toBe('This setting is for a 23-byte coding, and this module has 30 bytes.');
    expect(why).not.toMatch(/\u2014/);
    const facelift = ALL_ITEMS.find((i) => i.id === 'cat-leon-drl-off-indicating')!;
    expect(whyNotOffered(facelift, C09, ctxOf('vag-09'))).toBe('This setting is for a 30-byte coding, and this module has 23 bytes.');
    expect(itemApplies(facelift, long, ctxOf('vag-09'))).toBe(true);
  });

  it('a module part family is enforced, and an unread part number is not guessed', () => {
    const bcm = ALL_ITEMS.find((i) => i.parts?.includes('1K0937087'));
    const old = ALL_ITEMS.find((i) => i.parts?.includes('3C0937049'));
    expect(bcm).toBeTruthy();
    expect(old).toBeTruthy();
    const coding = new Array(30).fill(0);
    expect(itemApplies(bcm!, coding, { style: 'long', part: '1K0 937 087 G' })).toBe(true);
    expect(itemApplies(bcm!, coding, { style: 'long', part: '3AA937087B' })).toBe(true);
    expect(itemApplies(bcm!, coding, { style: 'long', part: '3C0 937 049 AE' })).toBe(false);
    expect(itemApplies(bcm!, coding, { style: 'long', part: '' })).toBe(false);
    expect(itemApplies(old!, coding, { style: 'long', part: '3C0-937-049-E' })).toBe(true);
    // The only Leon item that names a part family is the boot opener, which needs the part read.
    expect(ALL_ITEMS.filter((i) => i.platforms.includes('PQ35') && i.parts).map((i) => i.id)).toEqual(['cat-leon-tailgate-soft-touch']);
  });
});

describe('items held back are not offered anywhere', () => {
  const heldIds = ['cat-leon-lock-horn-remote', 'cat-leon-unlock-horn-remote', 'cat-leon-lock-flash-remote', 'cat-leon-unlock-flash-remote', 'cat-leon-mirror-sync', 'cat-leon-rls-installed', 'cat-leon-comfort-windows-remote'];

  it('each has a plain reason, is refused by the gate and is not offered', () => {
    const ids = car().items.map((i) => i.id);
    for (const id of heldIds) {
      const i = ALL_ITEMS.find((x) => x.id === id)!;
      expect(i.held).toBeTruthy();
      expect(whyNotOffered(i, CODINGS[i.module], ctxOf(i.module))).toBe(i.held);
      expect(ids).not.toContain(id);
    }
    expect(ALL_ITEMS.find((x) => x.id === 'cat-leon-rls-installed')!.held).toBe('This says what is fitted to the car. It is not a setting.');
    expect(ALL_ITEMS.find((x) => x.id === 'cat-leon-mirror-sync')!.held).toBe('A better source puts this elsewhere on this module.');
  });

  it('search never lists them, with or without a cached coding', () => {
    const base = { brand: 'SEAT', model: 'Leon', platform: 'PQ35' };
    const cache = { 'vag-46': toHex(C46), 'vag-09': toHex(C09) };
    for (const v of [base, { ...base, codingCache: cache }]) {
      const out = searchEverything([], v, '', 'setting').join(' ');
      for (const id of heldIds) expect(out).not.toContain(`[built-in setting ${id}]`);
    }
  });

  it('search with a cached coding lists the same settings as the offered list', () => {
    const cache = { 'vag-46': toHex(C46), 'vag-09': toHex(C09), 'vag-17': toHex(C17), 'vag-42': toHex(C42), 'vag-52': toHex(C52), 'vag-19': toHex(C19) };
    const out = searchEverything([], { brand: 'SEAT', model: 'Leon', platform: 'PQ35', codingCache: cache, modulePart: () => '' }, '', 'setting');
    const listed = out.map((l) => /\[built-in setting ([^\]]+)\]/.exec(l)![1]).filter((id) => ALL_ITEMS.find((x) => x.id === id)!.platforms.includes('PQ35'));
    expect(listed.sort()).toEqual(car().items.map((i) => i.id).sort());
  });
});

describe('every item that fits the car is listed exactly once', () => {
  it('dedupeItems drops only true duplicates, so no distinct setting disappears', () => {
    const all = codingItemsFor('vag', 'PQ35');
    expect(dedupeItems(all).length).toBe(all.length);
    const ids = dedupeItems(all).map((i) => i.id);
    for (const id of ['pq35-seat-belt-warning', 'pq35-brake-pad-warning', 'pq35-washer-warning']) expect(ids).toContain(id);
  });

  it('keeps items that share a short code or a byte but differ in flag, bits or field', () => {
    const base = { module: 'vag-17', byte: 0, bits: [] as number[] };
    const a = { ...base, short: { divisor: 1000, modulo: 100, flag: 1 } };
    expect(dedupeItems([a, { ...a, short: { ...a.short, flag: 2 } }, { ...a, short: { ...a.short, flag: 4 } }])).toHaveLength(3);
    const f = { module: 'vag-46', byte: 6, bits: [] as number[], field: { mask: 0x80, on: 0, off: 0x80 } };
    expect(dedupeItems([f, { ...f, field: { mask: 0x80, on: 0x80, off: 0 } }])).toHaveLength(2);
    expect(dedupeItems([{ module: 'm', byte: 1, bits: [2] }, { module: 'm', byte: 1, bits: [2, 3] }])).toHaveLength(2);
    expect(dedupeItems([{ module: 'm', byte: 1, bits: [2], length: 23 }, { module: 'm', byte: 1, bits: [2], length: 30 }])).toHaveLength(2);
  });

  it('removes a real duplicate: same module, byte, bits, flag and effect', () => {
    const a = { module: 'vag-17', byte: 0, bits: [] as number[], short: { divisor: 1000, modulo: 100, flag: 2 } };
    expect(dedupeItems([a, { ...a, short: { ...a.short } }])).toHaveLength(1);
    expect(dedupeItems([{ module: 'm', byte: 1, bits: [2] }, { module: 'm', byte: 1, bits: [2] }])).toHaveLength(1);
  });

  it('every item that fits the car appears exactly once, with nothing else', () => {
    const fits = codingItemsFor('vag', 'PQ35').filter((i) => itemApplies(i, CODINGS[i.module], ctxOf(i.module)));
    const listed = car().items.map((i) => i.id);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(fits.map((i) => i.id).sort());
    for (const id of ['pq35-brake-pad-warning', 'pq35-washer-warning', 'pq35-seat-belt-warning']) expect(listed.filter((x) => x === id)).toHaveLength(1);
  });

  it('prints the number offered to the car by confidence', () => {
    const items = car().items;
    const by = (c: string) => items.filter((i) => i.confidence === c).length;
    // eslint-disable-next-line no-console
    console.log(`OFFERED coding items ${items.length}: high ${by('high')}, medium ${by('medium')}, low ${by('low')}; adaptation rows ${car().adapts.length} (high)`);
    expect(items.length).toBe(by('high') + by('medium') + by('low'));
  });
});

describe('the Car tab count is the Customise list', () => {
  const cacheHex = Object.fromEntries(Object.entries(CODINGS).map(([k, c]) => [k, toHex(c).replace(/ /g, '')]));
  // The adjustable values Customise read, kept with the codings as module:ADAPTnn.
  const withAdapt = { ...cacheHex, ...Object.fromEntries(adaptationsFor('vag', 'PQ35').map((a) => [adaptationKey(a), valueHex(a.min)])) };

  it('is the same number from the saved copy as from the codings Customise holds', () => {
    const customise = offeredSettings({ group: 'vag', platform: 'PQ35', codings: CODINGS, ctxOf, adaptValues: allAdaptValues() });
    const carTab = offeredSettings({ group: 'vag', platform: 'PQ35', codings: codingsFromCache(withAdapt), ctxOf, adaptValues: adaptValuesFromCache(withAdapt) });
    expect(carTab.count).toBe(customise.count);
    expect(carTab.items.map((i) => i.id)).toEqual(customise.items.map((i) => i.id));
    expect(carTab.count).toBe(carTab.items.length + carTab.adapts.length);
  });

  it('counts a setting only when the module answered and has the channel', () => {
    const none = offeredSettings({ group: 'vag', platform: 'PQ35', codings: { 'vag-09': C09 }, ctxOf, adaptValues: {} });
    expect(none.items.every((i) => i.module === 'vag-09')).toBe(true);
    expect(none.adapts).toEqual([]);
    expect(none.count).toBe(none.items.length);
    const some = offeredSettings({ group: 'vag', platform: 'PQ35', codings: { 'vag-09': C09 }, ctxOf, adaptValues: { [adaptationKey(ADAPTATIONS[0])]: 10 } });
    expect(some.count).toBe(none.count + 1);
  });

  it('a car with no codings read has no count and a non-vag car has none', () => {
    expect(offeredSettings({ group: 'vag', platform: 'PQ35', codings: {}, ctxOf, adaptValues: {} }).count).toBe(0);
    expect(offeredSettings({ group: 'ford', platform: null, codings: CODINGS, ctxOf, adaptValues: {} }).count).toBe(0);
  });

  it('both screens call offeredSettings, and the write itself calls the fit rule', () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const customise = read('src/app/customise/index.tsx');
    const carTab = read('src/app/(tabs)/(car)/index.tsx');
    const workshop = read('src/app/workshop/[id].tsx');
    expect(customise).toMatch(/offeredSettings\(/);
    expect(carTab).toMatch(/offeredSettings\(/);
    // A write for an item that does not fit the coding read from the car is refused.
    expect(customise).toMatch(/whyNotOffered\(p\.item, codings\[p\.item\.module\]/);
    expect(workshop).toMatch(/itemApplies\(/);
    // Neither screen decides fit on its own any more.
    expect(customise).not.toMatch(/fitsStyle/);
    expect(carTab).not.toMatch(/dedupeItems|codingItemsFor\(v\.group, v\.platform\)\)\.length/);
  });
});

describe('typed adjustable values use the row own range', () => {
  const row = (module: string, channel: number) => ADAPTATIONS.find((a) => a.module === module && a.channel === channel)!;

  it('accepts the whole range of the 5-digit and 4-digit rows, on the step', () => {
    const delay = row('vag-09', 8);
    const washer = row('vag-09', 4);
    expect(String(delay.max).length).toBe(5);
    expect(typedValueCheck(delay, '10200')).toEqual({ ok: true, value: 10200 });
    expect(typedValueCheck(delay, '0')).toEqual({ ok: true, value: 0 });
    expect(typedValueCheck(delay, '5000')).toEqual({ ok: true, value: 5000 });
    expect(typedValueCheck(washer, '10000')).toEqual({ ok: true, value: 10000 });
    expect(typedValueCheck(washer, '50')).toEqual({ ok: true, value: 50 });
    expect(typedValueCheck(washer, '1000')).toEqual({ ok: true, value: 1000 });
  });

  it('rejects a value outside min and max, or off the step, and says what to type', () => {
    const delay = row('vag-09', 8);
    const washer = row('vag-09', 4);
    expect(typedValueCheck(delay, '10240').ok).toBe(false);
    expect(typedValueCheck(washer, '10050')).toMatchObject({ ok: false, text: '10050 is outside 50 to 10000 ms, in steps of 50.' });
    expect(typedValueCheck(washer, '40').ok).toBe(false);
    expect(typedValueCheck(washer, '1234')).toMatchObject({ ok: false, text: '1234 is not on the steps of 50. The nearest value is 1250.' });
    expect(typedValueCheck(delay, '41').ok).toBe(false);
    for (const bad of ['', 'abc', '12.5', '-40', '1e3', ' ']) expect(typedValueCheck(delay, bad).ok).toBe(false);
  });

  it('the medium tag stays on a setting after it has been tried', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/customise/index.tsx'), 'utf8');
    expect(src).toMatch(/i\.confidence === 'medium' \? <Pill key="m" text="Reported by owners" \/>/);
    expect(src).not.toMatch(/'medium' && !tried/);
  });

  it('every wide row accepts its own min and max, and the field allows as many digits as max has', () => {
    for (const a of ADAPTATIONS.filter((x) => isWideRow(x))) {
      expect(typedValueCheck(a, String(a.min)).ok).toBe(true);
      expect(typedValueCheck(a, String(a.max)).ok || (a.max - a.min) % a.step !== 0).toBe(true);
      expect(String(a.max).length).toBeGreaterThanOrEqual(String(a.min).length);
    }
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/customise/index.tsx'), 'utf8');
    expect(src).toMatch(/slice\(0, String\(pickA\.max\)\.length\)/);
    expect(src).not.toMatch(/slice\(0, 3\)/);
  });
});

describe('the count on the car after the 27 Nov hold-backs', () => {
  it('offers the settings below to the real codings, with the boot opener once the part is read', () => {
    const part = (id: string) => (id === 'vag-46' ? '1K0959433BT' : '');
    const o = offeredSettings({ group: 'vag', platform: 'PQ35', codings: CODINGS, ctxOf: (id) => ({ style: STYLE[id], part: part(id) }), adaptValues: allAdaptValues() });
    const by = (c: string) => o.items.filter((i) => i.confidence === c).length;
    expect([by('high'), by('medium'), by('low'), o.adapts.length, o.count]).toEqual([20, 23, 2, 19, 64]);
    expect(o.items.filter((i) => i.confidence === 'low').map((i) => i.id).sort()).toEqual(['cat-leon-tailgate-remote', 'cat-leon-tailgate-soft-touch']);
  });
});
