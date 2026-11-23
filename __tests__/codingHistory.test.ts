import { addCoding, changeLine, checkTypedWhen, droppedByCap, CodingEntry, CodingHistory, diffCodings, diffLines, MAX_PER_MODULE, parseWhen, shortNumber, validateCodingHex } from '../src/coding/history';

const A = 'E3 0E 1E 0F 00 04 10 00 50 32 00 32 32 00 00 00 00 41 7F 07 32 40 00';
const B = 'A3 0E 1E 07 00 04 10 01 50 32 00 32 32 00 00 00 00 41 FF 07 32 40 00';

describe('addCoding', () => {
  it('adds the first coding, upper case with no spaces', () => {
    const h = addCoding({}, 'engine', '98 80 08', 1000, 'read');
    expect(h.engine).toEqual([{ hex: '988008', at: 1000, source: 'read' }]);
  });

  it('adds nothing when the coding is the same as the newest', () => {
    const one = addCoding({}, 'engine', '988008', 1000, 'read');
    const two = addCoding(one, 'engine', '98 80 08', 2000, 'written');
    expect(two).toBe(one);
    expect(two.engine).toHaveLength(1);
  });

  it('keeps newest first and adds a changed coding', () => {
    let h: CodingHistory = addCoding({}, 'engine', '988008', 1000, 'read');
    h = addCoding(h, 'engine', '908008', 2000, 'written', ' after the change ');
    expect(h.engine.map((e) => e.hex)).toEqual(['908008', '988008']);
    expect(h.engine[0].note).toBe('after the change');
  });

  it('keeps modules apart', () => {
    let h: CodingHistory = addCoding({}, 'engine', '988008', 1000, 'read');
    h = addCoding(h, 'gearbox', '988008', 1000, 'read');
    expect(Object.keys(h)).toEqual(['engine', 'gearbox']);
  });

  it('keeps the newest 30', () => {
    let h: CodingHistory = {};
    for (let i = 0; i < 35; i++) h = addCoding(h, 'engine', i.toString(16).padStart(4, '0'), 1000 + i, 'read');
    expect(h.engine).toHaveLength(MAX_PER_MODULE);
    expect(h.engine[0].hex).toBe('0022');
    expect(h.engine[29].hex).toBe('0005');
  });

  it('puts a typed older entry at the right place in time', () => {
    let h: CodingHistory = addCoding({}, 'engine', '0001', 1000, 'read');
    h = addCoding(h, 'engine', '0003', 3000, 'written');
    h = addCoding(h, 'engine', '0002', 2000, 'typed', 'from a log');
    expect(h.engine.map((e) => e.hex)).toEqual(['0003', '0002', '0001']);
    expect(h.engine[1].source).toBe('typed');
  });

  it('drops a typed entry older than all 30, and places one in the middle', () => {
    let h: CodingHistory = {};
    for (let i = 1; i <= 30; i++) h = addCoding(h, 'engine', i.toString(16).padStart(4, '0'), 1000 * i, 'read');
    h = addCoding(h, 'engine', 'FFFF', 10, 'typed');
    expect(h.engine).toHaveLength(30);
    expect(h.engine.some((e) => e.hex === 'FFFF')).toBe(false);
    h = addCoding(h, 'engine', 'EEEE', 5500, 'typed');
    expect(h.engine).toHaveLength(30);
    expect(h.engine[25].hex).toBe('EEEE');
    expect(h.engine[24].at).toBe(6000);
    expect(h.engine[26].at).toBe(5000);
  });
});

describe('diffCodings', () => {
  it('98 80 08 against 90 80 08 is byte 0, bit 3 off', () => {
    const d = diffCodings('988008', '908008');
    expect(d.lengthChanged).toBe(false);
    expect(d.changes).toEqual([{ byte: 0, from: 0x98, to: 0x90, bitsOn: [], bitsOff: [3] }]);
    expect(changeLine(d.changes[0])).toBe('Byte 0: 98 to 90 (bit 3 off)');
  });

  it('finds bytes 0, 3, 7 and 18 in the 23-byte codings', () => {
    const d = diffCodings(A, B);
    expect(d.changes.map((c) => c.byte)).toEqual([0, 3, 7, 18]);
    expect(d.changes[0]).toMatchObject({ bitsOff: [6], bitsOn: [] });
    expect(d.changes[1]).toMatchObject({ bitsOff: [3], bitsOn: [] });
    expect(d.changes[2]).toMatchObject({ bitsOn: [0], bitsOff: [] });
    expect(d.changes[3]).toMatchObject({ bitsOn: [7], bitsOff: [] });
  });

  it('reports a length change', () => {
    const d = diffCodings('0102', '010203');
    expect(d).toEqual({ lengthChanged: true, olderLength: 2, newerLength: 3, changes: [] });
    expect(diffLines('0102', '010203')).toEqual(['Length changed: 2 bytes to 3 bytes']);
  });

  it('words several bits, on and off', () => {
    const d = diffCodings('F0', '0F');
    expect(changeLine(d.changes[0])).toBe('Byte 0: F0 to 0F (bits 0, 1, 2, 3 on, bits 4, 5, 6, 7 off)');
  });

  it('has no lines for equal codings', () => {
    expect(diffLines(A, A)).toEqual([]);
  });

  it('shows a short coding as its number too', () => {
    expect(shortNumber('00 19 01')).toBe('0006401');
    expect(shortNumber('0019')).toBeNull();
    expect(diffLines('001901', '001902')).toEqual(['Coding 0006401 to 0006402', 'Byte 2: 01 to 02 (bit 1 on, bit 0 off)']);
  });
});

describe('validateCodingHex', () => {
  it('accepts spaced and lower case hex of the right length', () => {
    expect(validateCodingHex('98 80 08', 3)).toEqual({ ok: true, hex: '988008' });
    expect(validateCodingHex(' e3 0e ', 2)).toEqual({ ok: true, hex: 'E30E' });
  });
  it('refuses empty, odd, wrong characters and wrong length', () => {
    expect(validateCodingHex('  ', 3).ok).toBe(false);
    expect(validateCodingHex('98 80 0', 3).ok).toBe(false);
    expect(validateCodingHex('98 80 0G', 3).ok).toBe(false);
    const r = validateCodingHex('98 80', 3);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toContain('3 bytes');
  });
});

describe('parseWhen', () => {
  it('uses now when empty', () => {
    expect(parseWhen('', 5)).toEqual({ ok: true, at: 5 });
  });
  it('reads a date, with or without a time', () => {
    expect(parseWhen('2026-11-20 14:30', 0)).toEqual({ ok: true, at: new Date(2026, 10, 20, 14, 30).getTime() });
    expect(parseWhen('2026-11-20', 0)).toEqual({ ok: true, at: new Date(2026, 10, 20, 12, 0).getTime() });
  });
  it('refuses a date that does not exist', () => {
    expect(parseWhen('2026-02-30', 0).ok).toBe(false);
    expect(parseWhen('20 Nov', 0).ok).toBe(false);
    expect(parseWhen('2026-11-20 25:00', 0).ok).toBe(false);
  });
});

describe('checkTypedWhen', () => {
  const now = new Date(2026, 10, 22, 10, 0).getTime();
  const entries = (n: number, from: number): CodingEntry[] => Array.from({ length: n }, (_, i) => ({ hex: i % 2 ? 'AA' : 'BB', at: from - i * 1000, source: 'read' as const }));
  it('refuses a date in the future, with a message', () => {
    const r = checkTypedWhen('2026-12-01', now, []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/future/);
    expect(checkTypedWhen('2026-11-22 18:00', now, []).ok).toBe(false);
  });
  it('refuses a date that does not parse', () => {
    expect(checkTypedWhen('22/11/2026', now, []).ok).toBe(false);
  });
  it('takes today with no time as now, and an old date as typed', () => {
    expect(checkTypedWhen('2026-11-22', now, [])).toEqual({ ok: true, at: now });
    expect(checkTypedWhen('2024-01-05', now, [])).toEqual({ ok: true, at: new Date(2024, 0, 5, 12, 0).getTime() });
  });
  it('keeps an old date in time order when the list has room', () => {
    const h = addCoding({ engine: entries(3, now) }, 'engine', 'CC', new Date(2024, 0, 5).getTime(), 'typed');
    expect(h.engine).toHaveLength(4);
    expect(h.engine[3].hex).toBe('CC');
  });
  it('says so when the cap of 30 would drop the date', () => {
    const full = entries(MAX_PER_MODULE, now - 40 * 86400000);
    expect(droppedByCap(full, now - 1e12)).toBe(true);
    expect(droppedByCap(full, now)).toBe(false);
    const r = checkTypedWhen('2020-01-01', now, full);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/dropped/);
    expect(checkTypedWhen('2026-11-22 09:59', now, full).ok).toBe(true);
  });
});
