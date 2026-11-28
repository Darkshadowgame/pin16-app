jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import * as fs from 'fs';
import * as path from 'path';
import { dedupeItems, settingCategory } from '../src/coding/categories';
import { ALL_ITEMS, CodingItem, currentValue, FitContext, formatValue, isOn, isValueItem, itemApplies, pickProblem, pickValue, placeLabel, stateText, valueProblem, whyNotOffered, withItem, withPick, withValue } from '../src/coding/items';
import { offeredSettings } from '../src/coding/offered';
import { searchEverything } from '../src/kb';
import { toHex } from '../src/obd/uds';

const hex = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16));
const C09 = hex('A30E1E070004100150320032320000000041FF07324000');
const C46 = hex('908008007F83CC7F00060F0FE008DF84105C80');
const C17 = [0x00, 0x11, 0x31]; // 0004401
const item = (id: string) => ALL_ITEMS.find((i) => i.id === id)!;
const long: FitContext = { style: 'long', part: '1K0959433BT' };
const region = item('cat-leon-cluster-region');

describe('number rows from the 28 Nov research', () => {
  const rows: [string, number, string, number][] = [
    ['cat-leon-side-marker-brightness', 7, 'high', 1],
    ['cat-leon-drl-brightness', 8, 'high', 80],
    ['cat-leon-brake-as-tail-brightness', 9, 'medium', 50],
    ['cat-leon-rear-fog-as-tail-brightness', 10, 'medium', 0],
    ['cat-leon-front-parking-brightness', 11, 'medium', 50],
    ['cat-leon-rear-parking-brightness', 12, 'medium', 50],
    ['cat-leon-front-fog-brightness', 20, 'high', 50],
  ];
  it.each(rows)('%s reads the car value, is Lights, 0 to 100 %% and offered on the 23-byte 09', (id, byte, conf, value) => {
    const i = item(id);
    expect([i.module, i.length, i.byte, i.confidence, i.bits, i.number]).toEqual(['vag-09', 23, byte, conf, [], { min: 0, max: 100, step: 1, unit: '%' }]);
    expect(settingCategory(i)).toBe('Lights');
    expect(currentValue(i, C09)).toBe(value);
    expect(itemApplies(i, C09, { style: 'long' })).toBe(true);
    expect(i.sources.some((s) => s.label.startsWith('VAGData'))).toBe(true);
  });

  it('the byte 7 row is retitled and keeps its capture note', () => {
    const i = item('cat-leon-side-marker-brightness');
    expect(i.title).toBe('Front indicators as parking lights, brightness');
    expect(i.summary).toBe('How brightly the front indicators glow as parking lights, from 0 to 100 %. 0 is off.');
    expect(i.note).toContain('00 to 64 hex for 100 %');
    expect(i.note).toContain('The car reads 01 now');
    expect(i.sources.map((s) => s.label)).toEqual(expect.arrayContaining(['VAGData: Passat B6 (3C) coding tables (same module family)', 'vag-coding.net: Golf 5 (1K) turn signals in US mode']));
  });

  it('the front fog row notes the 1 to 99 % range of one source and keeps the Golf 5 source', () => {
    const i = item('cat-leon-front-fog-brightness');
    expect(i.note).toContain('1 to 99 %');
    expect(i.sources.map((s) => s.label)).toContain('vag-coding.net: Golf 5 (1K) daytime running lights with fog lights');
  });
});

describe('the cluster region choice (a digit of the short code)', () => {
  it('is a high row on the cluster, a short-code place, with the verbatim choices', () => {
    expect([region.module, region.confidence, region.byte, region.bits, region.length, region.parts]).toEqual(['vag-17', 'high', 0, [], undefined, undefined]);
    expect(region.pick!.options.map((o) => `${o.value} ${o.label}`)).toEqual(['1 Europe (EU)', '2 USA (US)', '3 Canada (CDN)', '4 Great Britain (GB)', '5 Japan (JP)', '6 Saudi Arabia (SA)', '7 Australia (AUS)']);
    expect(region.summary).toContain('This also changes how the outside lights behave.');
    expect(region.sources.map((s) => s.label)).toEqual(['Ross-Tech wiki: SEAT Leon (1P) instrument cluster', 'Shown by another tool on this car, screen recording of 15 Nov 2026']);
    expect(settingCategory(region)).toBe('Instruments');
  });

  it('reads 4 (Great Britain) from 0004401 and shows its name', () => {
    expect(pickValue(region, C17)).toBe(4);
    expect(currentValue(region, C17)).toBe(4);
    expect(formatValue(region, 4)).toBe('Great Britain (GB)');
    expect(stateText(region, false, 4)).toMatch(/^Now Great Britain \(GB\)\. /);
    expect(isOn(region, C17)).toBe(false);
    expect(withItem(region, C17, true)).toEqual(C17);
    expect(placeLabel(region)).toBe('digit 5 of the 7-digit short code');
  });

  it('changes only that digit, round-trips, and refuses a value not in the list', () => {
    const num = (c: number[]) => c[0] * 65536 + c[1] * 256 + c[2];
    for (const v of [1, 2, 3, 5, 6, 7]) {
      const next = withPick(region, C17, v)!;
      expect(num(next)).toBe(4401 + (v - 4) * 100);
      expect(pickValue(region, next)).toBe(v);
      expect(next.length).toBe(3);
      expect(withPick(region, next, 4)).toEqual(C17);
    }
    expect(num(withValue(region, C17, 2)!)).toBe(4401 - 200);
    for (const bad of [0, 8, 9, 10, -1, 4.5, NaN]) {
      expect(withPick(region, C17, bad)).toBeNull();
      expect(valueProblem(region, bad)).toBeTruthy();
    }
    expect(pickProblem(region, 8)).toBe('8 is not one of the choices: Europe (EU), USA (US), Canada (CDN), Great Britain (GB), Japan (JP), Saudi Arabia (SA), Australia (AUS).');
  });

  it('a value outside the list is shown as its number and can still be changed to a listed one', () => {
    const code = 4901; // digit 5 is 9, which is not a listed choice
    const c = [(code >> 16) & 255, (code >> 8) & 255, code & 255];
    expect(pickValue(region, c)).toBe(9);
    expect(formatValue(region, 9)).toBe('9');
    expect(withPick(region, c, 4)).toEqual(C17);
  });

  it('is offered only on a 3-byte short code, and refused on a long coding or a bad short code', () => {
    expect(whyNotOffered(region, C17, { style: 'short' })).toBeNull();
    expect(itemApplies(region, C17, { style: 'long' })).toBe(false);
    expect(itemApplies(region, C09, { style: 'short' })).toBe(false);
    expect(itemApplies(region, [0xff, 0xff, 0xff], { style: 'short' })).toBe(false);
    expect(itemApplies(region, null, { style: 'short' })).toBe(false);
    // Same fit rule as the seat belt row.
    const belt = item('pq35-seat-belt-warning');
    for (const c of [C17, C09]) for (const style of ['short', 'long']) expect(itemApplies(region, c, { style })).toBe(itemApplies(belt, c, { style }));
    // A malformed choice row is refused.
    const bad: CodingItem = { ...region, id: 'bad', pick: { divisor: 100, modulo: 10, options: [{ value: 3, label: 'A' }, { value: 3, label: 'B' }] } };
    expect(itemApplies(bad, C17, { style: 'short' })).toBe(false);
    expect(itemApplies({ ...region, id: 'bits', bits: [1] }, C17, { style: 'short' })).toBe(false);
    expect(itemApplies({ ...region, id: 'num', number: { min: 0, max: 9, step: 1, unit: '' } }, C17, { style: 'short' })).toBe(false);
  });

  it('is counted with the real codings, found by search, and never merged with a switch or a number', () => {
    const o = offeredSettings({ group: 'vag', platform: 'PQ35', codings: { 'vag-17': C17 }, ctxOf: () => ({ style: 'short' }), adaptValues: {} });
    expect(o.items.map((i) => i.id)).toContain('cat-leon-cluster-region');
    expect(o.items.every((i) => isValueItem(i) || !!i.short)).toBe(true);
    const v = { brand: 'SEAT', model: 'Leon', platform: 'PQ35', codingCache: { 'vag-17': toHex(C17) }, modulePart: () => '' };
    const hit = searchEverything([], v, 'cluster region', 'setting').join('\n');
    expect(hit).toContain('[built-in setting cat-leon-cluster-region]');
    expect(dedupeItems([region, { ...region, id: 'sw', pick: undefined }])).toHaveLength(2);
    expect(dedupeItems([region, { ...region, id: 'copy' }])).toHaveLength(1);
    const keys = ALL_ITEMS.filter((i) => i.pick).map((i) => `${i.platforms.join()}|${i.module}|${i.pick!.divisor}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the write path checks the choice itself, and Customise lists the row as a value row', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/customise/index.tsx'), 'utf8');
    expect(src).toMatch(/valueProblem\(p\.item, p\.value\)/);
    expect(src).toMatch(/withValue\(p\.item, before, p\.value\)/);
    expect(src).toMatch(/currentValue\(i, origValues\[i\.module\]\) !== currentValue\(i, codings\[i\.module\]\)/);
  });
});

describe('Comfort switches from the Passat table', () => {
  const rows: [string, number, number, boolean][] = [
    ['cat-leon-alarm-siren', 16, 4, true],
    ['cat-leon-sync-mirrors-b14', 14, 6, true],
    ['cat-leon-mirror-dip-reverse', 14, 7, true],
    ['cat-leon-remote-ignition-on', 13, 1, false],
    ['cat-leon-alarm-arm-flash', 13, 6, false],
    ['cat-leon-alarm-arm-horn', 13, 7, false],
    ['cat-leon-alarm-auto-arm', 15, 5, false],
    ['cat-leon-boot-central-locking', 1, 7, true],
    ['cat-leon-boot-contact', 1, 5, false],
    ['cat-leon-boot-soft-touch', 1, 4, false],
  ];
  it.each(rows)('%s sits at byte %i bit %i, low, with the Comfort fit rules, and reads as expected', (id, byte, bit, on) => {
    const i = item(id);
    expect([i.module, i.length, i.parts, i.byte, i.bits, i.confidence, i.held]).toEqual(['vag-46', 19, ['1K0959433'], byte, [bit], 'low', undefined]);
    expect(i.sources.some((s) => s.label.startsWith('VAGData'))).toBe(true);
    expect(i.note).toContain('gives no coding length');
    expect(itemApplies(i, C46, long)).toBe(true);
    expect(itemApplies(i, C46, { style: 'long', part: '' })).toBe(false);
    expect(itemApplies(i, [...C46, 0], long)).toBe(false);
    expect(isOn(i, C46)).toBe(on);
    const flipped = withItem(i, C46, !on);
    flipped.forEach((b, k) => expect(b).toBe(k === byte ? C46[k] ^ (1 << bit) : C46[k]));
  });

  it('carries the verbatim labels and the categories asked for', () => {
    expect(item('cat-leon-alarm-siren').note).toContain('"DWA-Sirenen Schnittstelle aktiv"');
    expect(item('cat-leon-alarm-siren').note).toContain('fault 01134, alarm horn (H12)');
    expect(item('cat-leon-alarm-siren').summary).toBe('An alarm siren is fitted. Off stops the car checking for it, so the alarm cannot sound it.');
    expect(item('cat-leon-mirror-dip-reverse').note).toContain('only with seat memory');
    expect(item('cat-leon-sync-mirrors-b14').sources.map((s) => s.label)).toEqual(['VAGData: Passat B6 (3C) coding tables (same module family)', 'igorweb.org: VCDS coding list']);
    for (const id of ['cat-leon-sync-mirrors-b14', 'cat-leon-mirror-dip-reverse']) expect(settingCategory(item(id))).toBe('Windows and mirrors');
    for (const id of ['cat-leon-alarm-siren', 'cat-leon-remote-ignition-on', 'cat-leon-alarm-arm-flash', 'cat-leon-alarm-arm-horn', 'cat-leon-alarm-auto-arm', 'cat-leon-boot-central-locking', 'cat-leon-boot-contact', 'cat-leon-boot-soft-touch']) expect(settingCategory(item(id))).toBe('Locking');
    // The older held mirror row stays held, and the byte 1 bit 6 row names the second label.
    expect(item('cat-leon-mirror-sync').held).toBeTruthy();
  });

  it('no 2 rows claim the same bit of the same module on a coding length they share', () => {
    const bitsOf = (i: CodingItem) => (i.field ? [0, 1, 2, 3, 4, 5, 6, 7].filter((b) => (i.field!.mask >> b) & 1) : i.bits);
    const list = ALL_ITEMS.filter((x) => x.platforms.includes('PQ35') && !x.short && !x.pick && !x.number);
    const clashes: string[] = [];
    list.forEach((a, n) => {
      for (const b of list.slice(n + 1)) {
        // A row with no length applies to any length, so it shares a length with every row of its module.
        if (a.module !== b.module || a.byte !== b.byte || (a.length != null && b.length != null && a.length !== b.length)) continue;
        if (bitsOf(a).some((x) => bitsOf(b).includes(x))) clashes.push(`${a.id} and ${b.id}`);
      }
    });
    expect(clashes).toEqual([]);
  });

  it('every offered Comfort row, with the part read, changes exactly 1 bit', () => {
    const o = offeredSettings({ group: 'vag', platform: 'PQ35', codings: { 'vag-46': C46 }, ctxOf: () => long, adaptValues: {} });
    const ids = o.items.map((i) => i.id);
    for (const [id] of rows) expect(ids).toContain(id);
    for (const i of o.items.filter((x) => rows.some(([id]) => id === x.id))) {
      const f = withItem(i, C46, !isOn(i, C46));
      expect(f.map((b, k) => (b ^ C46[k]).toString(2).replace(/0/g, '').length).reduce((a, b) => a + b, 0)).toBe(1);
    }
  });
});
