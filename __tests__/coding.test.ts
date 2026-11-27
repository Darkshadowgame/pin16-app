import { CODING_ITEMS, codingItemsFor, isOn, withItem } from '../src/coding/items';
import { ElmClient } from '../src/obd/elm';
import { MODULES } from '../src/obd/modules';
import { DEMO_CARS, DemoCar, SimTransport } from '../src/obd/simTransport';

const a6 = DEMO_CARS.find((c) => c.id === 'a6')!;
const cluster = MODULES.find((m) => m.id === 'vag-17')!;
const sweep = CODING_ITEMS.find((i) => i.id === 'c7-needle-sweep')!;

describe('coding items', () => {
  it('are offered per VW group platform, and not for other makes', () => {
    expect(codingItemsFor('vag', 'MLB').length).toBeGreaterThan(1);
    expect(codingItemsFor('vag', 'MQB').map((i) => i.id)).toEqual(expect.arrayContaining(['mqb-needle-sweep', 'mqb-lap-timer']));
    expect(codingItemsFor('vag', 'PQ35').every((i) => i.platforms.includes('PQ35'))).toBe(true);
    // No setting is offered twice for the same bits.
    for (const p of ['MLB', 'MQB', 'PQ35', 'PQ46', 'MLB evo']) {
      const keys = codingItemsFor('vag', p).map((i) => `${i.module}|${i.byte}|${i.bits.join()}|${i.field?.mask ?? ''}|${i.field?.on ?? ''}|${i.short?.flag ?? ''}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(codingItemsFor('ford', null)).toEqual([]);
  });

  it('set and clear only their own bits', () => {
    const coding = [0x13, 0x03, 0x08, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(isOn(sweep, coding)).toBe(true);
    const off = withItem(sweep, coding, false);
    expect(off[1]).toBe(0x02);
    expect(off.filter((_, i) => i !== 1)).toEqual(coding.filter((_, i) => i !== 1));
    expect(withItem(sweep, off, true)).toEqual(coding);
  });
});

describe('coding writes on the demo A6', () => {
  it('writes, reads back and keeps the change', async () => {
    const c = new ElmClient(new SimTransport(a6, 0));
    await c.initialise();
    const before = (await c.readCoding(cluster))!;
    expect(before).toHaveLength(11);
    const after = withItem(sweep, before, false);
    const res = await c.writeCoding(cluster, before, after);
    expect(res.ok).toBe(true);
    expect(await c.readCoding(cluster)).toEqual(after);
    expect((await c.readStatus()).storedCount).toBeGreaterThanOrEqual(0);
  });

  it('refuses when the coding changed since it was read', async () => {
    const c = new ElmClient(new SimTransport(a6, 0));
    await c.initialise();
    const before = (await c.readCoding(cluster))!;
    const stale = withItem(sweep, before, false);
    await expect(c.writeCoding(cluster, stale, withItem(sweep, stale, true))).rejects.toThrow('changed since it was read');
  });

  it('reports a write the module did not keep, with the original still in place', async () => {
    const odd: DemoCar = JSON.parse(JSON.stringify(a6));
    odd.modules['714'].ignoresWrites = true;
    const c = new ElmClient(new SimTransport(odd, 0));
    await c.initialise();
    const before = (await c.readCoding(cluster))!;
    const res = await c.writeCoding(cluster, before, withItem(sweep, before, false));
    expect(res.ok).toBe(false);
    expect(res.restored).toBe(true);
    expect(await c.readCoding(cluster)).toEqual(before);
  });
});

describe('adaptation values', () => {
  const fresh = () => {
    const car = structuredClone(DEMO_CARS.find((c) => c.id === 'a6')!);
    return new ElmClient(new SimTransport(car, 0));
  };

  it('finds values with a sweep', async () => {
    const c = fresh();
    await c.initialise();
    const found = await c.sweepDids(cluster, 0x0100, 0x0500);
    expect(found).toEqual({ '0123': '01', '0456': '0032' });
  });

  it('asks for a login code, then writes with it and reads back', async () => {
    const c = fresh();
    await c.initialise();
    await expect(c.writeDid(cluster, '0456', [0x00, 0x32], [0x00, 0x40])).rejects.toThrow(/login code/);
    await expect(c.writeDid(cluster, '0456', [0x00, 0x32], [0x00, 0x40], 11111)).rejects.toThrow(/refused/);
    const ok = await c.writeDid(cluster, '0456', [0x00, 0x32], [0x00, 0x40], 20103);
    expect(ok).toMatchObject({ ok: true, coding: [0x00, 0x40] });
  });
});

describe('multi-bit fields', () => {
  it('sets and reads a field value without touching other bits', () => {
    const item = { ...sweep, id: 'x', byte: 0, bits: [], field: { mask: 0x1c, on: 0x08, off: 0x04 } };
    const coding = [0b1110_0101];
    expect(isOn(item, coding)).toBe(true === ((coding[0] & 0x1c) === 0x08));
    const on = withItem(item, coding, true);
    expect(on[0]).toBe(0b1110_1001);
    expect(isOn(item, on)).toBe(true);
    expect(withItem(item, on, false)[0]).toBe(0b1110_0101);
  });
});

describe('PQ35 items seen on the owner car', () => {
  const belt = CODING_ITEMS.find((i) => i.id === 'pq35-seat-belt-warning')!;
  const bulb = CODING_ITEMS.find((i) => i.id === 'pq35-rear-side-bulb-check')!;
  const { fitsStyle } = jest.requireActual('../src/coding/items') as typeof import('../src/coding/items');

  it('seat belt warning reads and writes the short code', () => {
    expect(isOn(belt, [0x00, 0x19, 0x01])).toBe(true); // 6401
    expect(isOn(belt, [0x00, 0x11, 0x31])).toBe(false); // 4401
    expect(withItem(belt, [0x00, 0x19, 0x01], false)).toEqual([0x00, 0x11, 0x31]);
    expect(withItem(belt, [0x00, 0x11, 0x31], true)).toEqual([0x00, 0x19, 0x01]);
    // Other digits stay as they are: 6401 off then on is 6401 again.
    expect(withItem(belt, withItem(belt, [0x00, 0x19, 0x01], false), true)).toEqual([0x00, 0x19, 0x01]);
    expect(withItem(belt, [0x00, 0x19, 0x01], true)).toEqual([0x00, 0x19, 0x01]);
    const off = withItem(belt, [0x00, 0x19, 0x01], false);
    expect(off[0] * 65536 + off[1] * 256 + off[2]).toBe(4401);
  });

  it('seat belt warning guards the length', () => {
    expect(withItem(belt, [1, 2], true)).toEqual([1, 2]);
    expect(isOn(belt, [1, 2])).toBe(false);
    expect(isOn(belt, [0xff, 0xff, 0xff])).toBe(false);
  });

  it('short items are offered only on short-coded modules and the reverse', () => {
    expect(fitsStyle(belt, 'short')).toBe(true);
    expect(fitsStyle(belt, 'long')).toBe(false);
    expect(fitsStyle(belt, 'uds')).toBe(false);
    expect(fitsStyle(bulb, 'short')).toBe(false);
    expect(fitsStyle(bulb, 'long')).toBe(true);
    expect(fitsStyle(bulb, 'uds')).toBe(true);
    expect(codingItemsFor('vag', 'PQ35').map((i) => i.id)).toEqual(expect.arrayContaining([belt.id, bulb.id]));
  });

  it('rear side bulb check is byte 18 bit 7 of the 23-byte coding', () => {
    const c = [0xe3, 0x0e, 0x1e, 0x0f, 0x00, 0x04, 0x10, 0x00, 0x50, 0x32, 0x00, 0x32, 0x32, 0x00, 0x00, 0x00, 0x00, 0x41, 0x7f, 0x07, 0x32, 0x40, 0x00];
    expect(c.length).toBe(23);
    expect(isOn(bulb, c)).toBe(false);
    const on = withItem(bulb, c, true);
    expect(on[18]).toBe(0xff);
    expect(on.filter((_, i) => i !== 18)).toEqual(c.filter((_, i) => i !== 18));
    expect(withItem(bulb, on, false)).toEqual(c);
  });
});
