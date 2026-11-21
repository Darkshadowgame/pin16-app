import { kwpReadAdaptation, kwpReadFaultDetail, kwpRunBasicSetting, kwpSaveAdaptation } from '../src/obd/kwpAdapt';
import { Tp20Session } from '../src/obd/tp20';

// A scripted TP2.0 module. The tester's frames are put together into KWP
// requests; `answer` gives the messages the module sends back (each a list of
// bytes), which go out as TP2.0 frames after the module's ACK. Bytes in the
// tests are those of the Leon recording of 21 Nov 2026.
const hx = (b: number[]) => b.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
const bytes = (s: string) => s.trim().split(/\s+/).map((x) => parseInt(x, 16));

function fakeModule(address: number, answer: (req: string) => string[]) {
  const requests: string[] = [];
  let body: number[] = [];
  let length = -1;
  let moduleSeq = 0;
  const send = async (c: string): Promise<string> => {
    let r = '';
    if (c === `${hx([address])}C000100003011`) r = `${(0x200 + address).toString(16).toUpperCase()}00D00003390301`;
    else if (c === 'A00F8AFF32FF1') r = '300A10F8AFF4AFF';
    else if (c.startsWith('AT')) r = 'OK';
    else if (/^[12][0-9A-F]([0-9A-F]{2})+$/.test(c)) {
      const d = bytes(c.replace(/(..)/g, '$1 '));
      if (length < 0) {
        length = (d[1] << 8) | d[2];
        body = d.slice(3);
      } else body.push(...d.slice(1));
      if (d[0] >> 4 === 1) {
        const payload = body.slice(0, length);
        length = -1;
        const req = hx(payload).replace(/(..)(?=.)/g, '$1 ');
        requests.push(req);
        const lines = [`300B${(((d[0] & 0x0f) + 1) & 0x0f).toString(16).toUpperCase()}`];
        for (const m of answer(req).map(bytes)) {
          const msg = [m.length >> 8, m.length & 0xff, ...m];
          for (let i = 0; i < msg.length; i += 7) {
            const chunk = msg.slice(i, i + 7);
            const last = i + 7 >= msg.length;
            lines.push(`300${hx([(last ? 0x10 : 0x20) | (moduleSeq++ & 0x0f)])}${hx(chunk)}`);
          }
        }
        r = lines.join('\r');
      }
    }
    return `${r || 'NO DATA'}\r\r>`;
  };
  return { session: new Tp20Session(send, '6'), requests };
}

// Adaptation module: channels hold values; 31 BA shows the selected one.
function adaptationModule(address: number, channels: Record<number, number>, opts: { save?: string[]; missing?: string[]; ident?: string | null } = {}) {
  const wsc = '0B 7D B1 A4 12 9D';
  const stored = { ...channels };
  let selected = -1;
  let shown = 0;
  const m = fakeModule(address, (req) => {
    const d = bytes(req);
    if (req === '1A 9B' && opts.ident === null) return ['7F 1A 11'];
    if (req === '1A 9B' && opts.ident) return [opts.ident];
    if (req === '1A 9B') return [`5A 9B 31 50 30 39 30 37 31 31 35 43 20 20 30 34 32 32 03 00 19 01 ${wsc} 4A 35`];
    if (req === '10 89') return ['50 89'];
    if (req === '31 B8 01 03') return ['71 B8 01 03'];
    if (req === '32 B8 01 03') {
      selected = -1;
      return ['72 B8 01 03 62'];
    }
    if (req === '31 BA 01 03') {
      if (selected < 0) return ['71 BA 01 03 81'];
      return [`71 BA 01 03 82 03 ${(shown >> 8).toString(16).padStart(2, '0')} ${(shown & 0xff).toString(16).padStart(2, '0')} 0D 25 00 8B FF`];
    }
    if (d[0] === 0x31 && d[1] === 0xb9 && d.length === 5) {
      if (!(d[4] in stored)) return opts.missing ?? ['7F 31 31'];
      selected = d[4];
      shown = stored[selected];
      return ['71 B9 01 03'];
    }
    if (d[0] === 0x31 && d[1] === 0xb9 && d.length === 6) {
      shown = (d[4] << 8) | d[5];
      return ['71 B9 01 03'];
    }
    if (d[0] === 0x31 && d[1] === 0xbb) {
      if (opts.save) return opts.save;
      stored[selected] = (d[4] << 8) | d[5];
      return ['7F 31 78', '7F 31 78', '7F 31 78', '71 BB 01 03'];
    }
    return ['7F 31 11'];
  });
  return m;
}

describe('adaptation read (Leon recording of 21 Nov 2026)', () => {
  it('reads central electronics channel 1 as 20 and sends the leave command', async () => {
    const { session, requests } = adaptationModule(0x20, { 1: 0x14, 2: 0x0a });
    expect(await session.open(0x20)).toBe(true);
    const got = await kwpReadAdaptation(session, 1);
    expect(got?.channel).toBe(1);
    expect(got?.value).toBe(20);
    expect(got?.raw.slice(0, 8)).toEqual([0x71, 0xba, 0x01, 0x03, 0x82, 0x03, 0x00, 0x14]);
    expect(requests).toEqual(['31 B8 01 03', '31 BA 01 03', '31 B9 01 03 01', '31 BA 01 03', '32 B8 01 03']);
  });

  it('gives null for a channel the module does not have, and still leaves', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f });
    expect(await session.open(0x07)).toBe(true);
    expect(await kwpReadAdaptation(session, 0x35)).toBeNull();
    expect(requests[requests.length - 1]).toBe('32 B8 01 03');
  });

  it('takes 7F 31 78 then 7F 31 31 as a missing channel', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f }, { missing: ['7F 31 78', '7F 31 31'] });
    expect(await session.open(0x07)).toBe(true);
    expect(await kwpReadAdaptation(session, 0x35)).toBeNull();
    expect(requests[requests.length - 1]).toBe('32 B8 01 03');
  });
});

describe('adaptation save: the oil service reset on the cluster', () => {
  it('sends the save once with the workshop code, waits through 7F 31 78 and reads back 0', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f });
    expect(await session.open(0x07)).toBe(true);
    const res = await kwpSaveAdaptation(session, 2, 0);
    expect(res).toEqual({ accepted: true, ok: true, before: 0x9f, after: 0 });
    expect(requests.filter((r) => r.startsWith('31 BB'))).toEqual(['31 BB 01 03 00 00 0B 7D B1 A4 12 9D']);
    expect(requests).toContain('31 B9 01 03 00 00');
    // Read back after the first leave: enter, select, read, leave.
    const firstLeave = requests.indexOf('32 B8 01 03');
    expect(requests.slice(firstLeave + 1)).toEqual(['31 B8 01 03', '31 BA 01 03', '31 B9 01 03 02', '31 BA 01 03', '32 B8 01 03']);
  });

  it('reports a refusal, leaves, and sends the save only once', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f }, { save: ['7F 31 33'] });
    expect(await session.open(0x07)).toBe(true);
    const res = await kwpSaveAdaptation(session, 2, 0);
    expect(res.ok).toBe(false);
    expect(res.accepted).toBe(false);
    expect(res.before).toBe(0x9f);
    expect(res.after).toBe(0x9f);
    expect(res.reason).toMatch(/security login/);
    expect(requests.filter((r) => r.startsWith('31 BB'))).toHaveLength(1);
    const save = requests.findIndex((r) => r.startsWith('31 BB'));
    expect(requests[save + 1]).toBe('32 B8 01 03');
  });

  it('does not save to a channel the module does not have', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f });
    expect(await session.open(0x07)).toBe(true);
    const res = await kwpSaveAdaptation(session, 0x35, 0);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no adaptation channel/);
    expect(requests.some((r) => r.startsWith('31 BB'))).toBe(false);
    expect(requests).toContain('32 B8 01 03');
  });
});

describe('basic setting', () => {
  const text = '71 BA 00 01 06 5F 14 45 6E 64 61 6E 73 63 68 6C 61 65 67 65 20 6C 65 72 6E 65 6E';
  const basicModule = (address: number, group: number, polls: string[]) => {
    let n = 0;
    const hexGroup = group.toString(16).toUpperCase().padStart(2, '0');
    return fakeModule(address, (req) => {
      if (req === `31 B8 00 ${hexGroup}`) return [`71 B8 00 ${hexGroup}`];
      if (req === `31 B9 00 ${hexGroup}`) return [`71 B9 00 ${hexGroup}`];
      if (req === `31 BA 00 ${hexGroup}`) return [polls[Math.min(n++, polls.length - 1)]];
      if (req === `32 B8 00 ${hexGroup}`) return [`72 B8 00 ${hexGroup} 62`];
      return ['7F 31 11'];
    });
  };

  it('polls the climate module text, stops when cancelled and ends the group', async () => {
    const { session, requests } = basicModule(0x2c, 1, [text]);
    expect(await session.open(0x2c)).toBe(true);
    const seen: Array<string | object> = [];
    const end = await kwpRunBasicSetting(session, 1, {
      onUpdate: (v) => seen.push(v),
      cancelled: () => seen.length >= 3,
      maxMs: 30000,
      pollMs: 10,
    });
    expect(end).toBe('cancelled');
    expect(seen).toEqual(['Endanschlaege lernen', 'Endanschlaege lernen', 'Endanschlaege lernen']);
    expect(requests.slice(0, 2)).toEqual(['31 B8 00 01', '31 B9 00 01']);
    expect(requests[requests.length - 1]).toBe('32 B8 00 01');
  });

  it('parses the throttle body cells of group 3C and ends on the time limit', async () => {
    const polls = ['71 BA 00 3C 07 17 64 26 17 64 D9 36 00 05 25 00 01', '71 BA 00 3C 07 17 64 29 17 64 D7 36 00 08 25 00 02'];
    const { session, requests } = basicModule(0x01, 0x3c, polls);
    expect(await session.open(0x01)).toBe(true);
    const seen: any[] = [];
    const end = await kwpRunBasicSetting(session, 0x3c, { onUpdate: (v) => seen.push(v), cancelled: () => false, maxMs: 150, pollMs: 20 });
    expect(end).toBe('time');
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[0]).toHaveLength(4);
    expect(seen[0][0].unit).toBe('%');
    expect(seen[0][0].value).toBeCloseTo((0x26 / 256) * 0x64);
    expect(seen[0][2]).toMatchObject({ formula: 0x36, value: 5, unit: 'count' });
    expect(seen[1][2]).toMatchObject({ value: 8 });
    expect(requests[requests.length - 1]).toBe('32 B8 00 3C');
  });

  it('ends the group when the module refuses to start it', async () => {
    const { session, requests } = fakeModule(0x01, (req) => (req.startsWith('32') ? ['72 B8 00 3C 62'] : ['7F 31 22']));
    expect(await session.open(0x01)).toBe(true);
    expect(await kwpRunBasicSetting(session, 0x3c, { onUpdate: () => undefined, cancelled: () => false, maxMs: 1000, pollMs: 10 })).toBe('refused');
    expect(requests[requests.length - 1]).toBe('32 B8 00 3C');
  });
});

describe('fault detail', () => {
  const module = () =>
    fakeModule(0x20, (req) => {
      if (req === '12 00 04 03 8A') return ['52 00 6C 01 29 02 01 C7 02 55 EB 00 00 16 5B FF FF 25 00 88 67 05 92 25 00 88 25 00 87 25 00 88 25 00 88 25 00 88 04 03 8A'];
      if (req === '12 00 04 05 18') return ['52 00 6C 01 24 02 01 C8 02 56 46 00 00 00 01 59 2D 04 05 18'];
      return ['7F 12 11'];
    });

  it('parses faults 038A (00906) and 0518 (01304)', async () => {
    const { session, requests } = module();
    expect(await session.open(0x20)).toBe(true);
    const a = await kwpReadFaultDetail(session, '00906');
    expect(requests[0]).toBe('12 00 04 03 8A');
    expect(a).toMatchObject({ status: 0x29, priority: 2, frequency: 1, resetCounter: 0xc7, km: 153067 });
    const b = await kwpReadFaultDetail(session, '01304');
    expect(b).toMatchObject({ status: 0x24, priority: 2, frequency: 1, resetCounter: 0xc8, km: 153158 });
    expect((b as { raw: number[] }).raw.slice(0, 11)).toEqual([0x52, 0x00, 0x6c, 0x01, 0x24, 0x02, 0x01, 0xc8, 0x02, 0x56, 0x46]);
  });

  it('gives unsupported when the module does not support it', async () => {
    const { session } = module();
    expect(await session.open(0x20)).toBe(true);
    expect(await kwpReadFaultDetail(session, '02071')).toBe('unsupported');
  });
});

// The 1A 9B answers of the 21 Nov 2026 recording (2026-11-21T12-38-24.dec).
const CLIMATE_ID = '5A 9B 31 50 30 39 30 37 30 34 34 20 20 20 B0 35 30 32 00 00 00 00 00 00 00 00 00 00 43 6C 69 6D 61 74 72 6F 6E 69 63 50 51 33 35 20 30 31 30 20';
const ENGINE_ID = '5A 9B 31 50 30 39 30 37 31 31 35 43 20 20 30 30 32 30 10 00 00 00 01 DC 5A 10 00 BF 32 2E 30 6C 20 52 34 2F 34 56 20 54 46 53 49 20 20 20 20 20';
const ENGINE_EXPECT = /1P0907115|R4\/4V TFSI/i;

describe('identity check before a write', () => {
  const sent = (requests: string[]) => requests.filter((r) => /^(10 89|31 B8|31 B9|31 BB)/.test(r));

  it('blocks an adaptation save when another module answers, and sends nothing but the identity read', async () => {
    const { session, requests } = adaptationModule(0x2c, { 2: 0x9f }, { ident: CLIMATE_ID });
    expect(await session.open(0x2c)).toBe(true);
    const res = await kwpSaveAdaptation(session, 2, 0, { expect: ENGINE_EXPECT, moduleName: 'Engine' });
    expect(res.ok).toBe(false);
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('ClimatronicPQ35');
    expect(res.reason).toContain('not Engine');
    expect(res.reason).toContain('Nothing was changed');
    expect(requests).toEqual(['1A 9B']);
  });

  it('lets the save through when the module is the one meant', async () => {
    const { session, requests } = adaptationModule(0x2c, { 2: 0x9f }, { ident: CLIMATE_ID });
    expect(await session.open(0x2c)).toBe(true);
    const res = await kwpSaveAdaptation(session, 2, 0, { expect: /ClimatronicPQ35|1P0907044/i, moduleName: 'Heating and air conditioning' });
    expect(res.ok).toBe(true);
    expect(requests.filter((r) => r.startsWith('31 BB'))).toHaveLength(1);
  });

  it('does not check when no pattern is known for the module', async () => {
    const { session } = adaptationModule(0x07, { 2: 0x9f });
    expect(await session.open(0x07)).toBe(true);
    expect((await kwpSaveAdaptation(session, 2, 0)).ok).toBe(true);
  });

  it('sends nothing when the module gives no workshop code', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f }, { ident: null });
    expect(await session.open(0x07)).toBe(true);
    const res = await kwpSaveAdaptation(session, 2, 0);
    expect(res.ok).toBe(false);
    expect(sent(requests)).toEqual([]);
  });

  it('blocks a basic setting on the wrong module and sends no start or end command', async () => {
    const { session, requests } = fakeModule(0x01, (req) => (req === '1A 9B' ? [CLIMATE_ID] : ['71 B8 00 3C']));
    expect(await session.open(0x01)).toBe(true);
    const end = await kwpRunBasicSetting(session, 0x3c, { onUpdate: () => undefined, cancelled: () => false, maxMs: 500, pollMs: 10, expect: ENGINE_EXPECT });
    expect(end).toBe('wrongModule');
    expect(requests.some((r) => r.startsWith('31') || r.startsWith('32'))).toBe(false);
  });

  it('starts a basic setting on the engine whose recorded text matches', async () => {
    const { session, requests } = fakeModule(0x01, (req) => {
      if (req === '1A 9B') return [ENGINE_ID];
      if (req.startsWith('32')) return ['72 B8 00 3C 62'];
      return ['7F 31 22'];
    });
    expect(await session.open(0x01)).toBe(true);
    const end = await kwpRunBasicSetting(session, 0x3c, { onUpdate: () => undefined, cancelled: () => false, maxMs: 500, pollMs: 10, expect: ENGINE_EXPECT });
    expect(end).toBe('refused');
    expect(requests).toContain('31 B8 00 3C');
  });
});

describe('adaptation value range', () => {
  it.each([-1, 65536, 1.5, NaN, Infinity])('refuses %p before anything is sent', async (value) => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f });
    expect(await session.open(0x07)).toBe(true);
    const res = await kwpSaveAdaptation(session, 2, value);
    expect(res.ok).toBe(false);
    expect(res.accepted).toBe(false);
    expect(res.reason).toContain('Nothing was sent');
    expect(requests).toEqual([]);
  });

  it('refuses a channel outside 0 to 255', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f });
    expect(await session.open(0x07)).toBe(true);
    expect((await kwpSaveAdaptation(session, 256, 0)).ok).toBe(false);
    expect(requests).toEqual([]);
  });

  it('accepts the ends of the range', async () => {
    const { session, requests } = adaptationModule(0x07, { 2: 0x9f });
    expect(await session.open(0x07)).toBe(true);
    await kwpSaveAdaptation(session, 2, 65535);
    expect(requests).toContain('31 B9 01 03 FF FF');
  });
});
