// Fixes from the 23 Nov 2026 reviews: a failed read is not "nothing stored",
// a link never writes to the car, the car is checked before a write, and the
// Send findings switch stops uploads.
const mockStore: Record<string, string> = {};
const mockSetItem = jest.fn(async (k: string, v: string) => {
  mockStore[k] = v;
});
const mockGetItem = jest.fn(async (k: string): Promise<string | null> => mockStore[k] ?? null);
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: (k: string) => mockGetItem(k), setItem: (k: string, v: string) => mockSetItem(k, v) },
}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-mail-composer', () => ({ isAvailableAsync: async () => false, composeAsync: async () => ({ status: 'cancelled' }) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => undefined }));
jest.mock('../src/share/secrets', () => ({ getSecret: async () => 'test-value' }));

import fs from 'fs';
import path from 'path';
import { adaptRestoreMessage } from '../src/coding/restoreLink';
import { addDiary, loadDiary, removeDiary } from '../src/diary';
import { addHistory, loadHistory, removeHistory, updateHistory } from '../src/history';
import { loadDiscovery, saveDiscovery } from '../src/discover';
import { cleanKbEntry, loadKb, saveKb } from '../src/kb';
import { maskPrivate, trafficLog } from '../src/obd/trafficLog';
import { flushOutbox, outbox, scrubForUpload, sendBack, setSendFindings } from '../src/share/sendBack';
import { acceptCarVin, carMismatch, NO_VIN_KEY, startVinCheck } from '../src/vehicle/identity';
import { loadDraft, saveDraft } from '../src/mot/store';
import { loadRegens, saveRegens } from '../src/monitors/dpfStore';
import { addRun, loadRuns } from '../src/monitors/store';

const failNextRead = () => mockGetItem.mockRejectedValueOnce(new Error('storage busy'));
const reset = () => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockSetItem.mockClear();
  mockGetItem.mockClear();
};

describe('a failed read is not taken for nothing stored', () => {
  beforeEach(reset);

  it('History: add, update and remove leave the stored list alone', async () => {
    const id = await addHistory({ vin: 'V1', kind: 'scan', title: 'Health check' });
    await addHistory({ vin: 'V1', kind: 'clear', title: 'Faults cleared' });
    const stored = mockStore['caristini.history.v1'];
    mockSetItem.mockClear();
    failNextRead();
    await addHistory({ vin: 'V1', kind: 'change', title: 'Setting changed' });
    failNextRead();
    await removeHistory(id);
    failNextRead();
    await updateHistory(id, { title: 'Renamed' });
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockStore['caristini.history.v1']).toBe(stored);
    // Nothing stored is not a failure: the first entry is saved.
    delete mockStore['caristini.history.v1'];
    await addHistory({ vin: 'V1', kind: 'scan', title: 'First' });
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect((await loadHistory()).map((e) => e.title)).toEqual(['First']);
  });

  it('History: damaged stored text is copied aside before it is replaced', async () => {
    mockStore['caristini.history.v1'] = '{not json';
    await addHistory({ vin: 'V1', kind: 'scan', title: 'After damage' });
    expect(mockStore['caristini.history.v1.damaged']).toBe('{not json');
    expect((await loadHistory()).length).toBe(1);
  });

  it('Diary: a failed read saves nothing and says so', async () => {
    const entry = { vin: 'V1', vehicleName: 'Leon', date: '2026-11-01', kind: 'Oil service', mileage: null, notes: 'a' };
    expect(await addDiary(entry)).toBe(true);
    const stored = mockStore['gauge.diary.v1'];
    mockSetItem.mockClear();
    failNextRead();
    expect(await addDiary({ ...entry, notes: 'b' })).toBe(false);
    const [first] = await loadDiary();
    failNextRead();
    expect(await removeDiary(first.id)).toBe(false);
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockStore['gauge.diary.v1']).toBe(stored);
    // A refused write is reported too.
    mockSetItem.mockRejectedValueOnce(new Error('full'));
    expect(await addDiary({ ...entry, notes: 'c' })).toBe(false);
  });

  it('Diary: two quick saves both keep', async () => {
    const e = (n: string) => ({ vin: null, vehicleName: 'Car', date: '2026-11-02', kind: 'Other', mileage: null, notes: n });
    await Promise.all([addDiary(e('one')), addDiary(e('two'))]);
    expect((await loadDiary()).map((x) => x.notes).sort()).toEqual(['one', 'two']);
  });

  it('other stores skip the write after a failed read', async () => {
    await saveDraft({ vin: 'V1', answers: {}, read: null } as never);
    await addRun({ vin: 'V1', testId: 't', label: 'l', seconds: 1, plusMinus: null, rate: 1, samples: 1, at: 1 });
    await saveRegens('V1', [{ at: 1 } as never]);
    const before = { ...mockStore };
    mockSetItem.mockClear();
    failNextRead();
    await saveDraft({ vin: 'V2', answers: {}, read: null } as never);
    failNextRead();
    await addRun({ vin: 'V1', testId: 't2', label: 'l', seconds: 2, plusMinus: null, rate: 1, samples: 1, at: 2 });
    failNextRead();
    await saveRegens('V1', [{ at: 2 } as never]);
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockStore).toEqual(before);
    expect(await loadDraft('V1')).not.toBeNull();
    expect((await loadRuns('V1')).length).toBe(1);
    expect((await loadRegens('V1')).length).toBeGreaterThan(0);
  });

  it('the outbox is not overwritten after a failed read', async () => {
    setSendFindings(false);
    // Items are queued only when sending is on; put one there directly.
    mockStore['caristini.outbox.v1'] = JSON.stringify([{ path: 'p', name: 'n', text: 't', message: 'm', error: 'e', at: 1 }]);
    setSendFindings(true);
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => '' }));
    failNextRead();
    const r = await sendBack('sensors', 'WVWZZZ1KZ6W000001', { a: 1 });
    expect(r.via).toBe('none');
    expect(mockStore['caristini.outbox.v1']).toContain('"path":"p"');
    expect((await outbox()).length).toBe(1);
  });
});

describe('the Send findings switch', () => {
  beforeEach(() => {
    reset();
    setSendFindings(true);
  });
  afterAll(() => setSendFindings(true));

  it('off: nothing is sent or queued, and waiting files stay', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 201, text: async () => '' }));
    (global as { fetch?: unknown }).fetch = fetchMock;
    mockStore['caristini.outbox.v1'] = JSON.stringify([{ path: 'p', name: 'n', text: 't', message: 'm', error: 'e', at: 1 }]);
    setSendFindings(false);
    for (const kind of ['sensors', 'listen', 'learn-compare', 'learned', 'names', 'discover', 'learn', 'saved']) {
      const r = await sendBack(kind, 'WVWZZZ1KZ6W000001', { x: 1 });
      expect(r.via).toBe('none');
    }
    const flushed = await flushOutbox();
    expect(flushed).toEqual({ sent: 0, left: 1, error: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await outbox()).length).toBe(1);
  });

  it('off: a send the owner starts still goes', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 201, text: async () => '' }));
    (global as { fetch?: unknown }).fetch = fetchMock;
    setSendFindings(false);
    const r = await sendBack('saved', 'WVWZZZ1KZ6W000001', { x: 1 }, { manual: true });
    expect(r.via).toBe('github');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on: sends, with the VIN encoded and no personal fields', async () => {
    const fetchMock = jest.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 201, text: async () => '' }));
    (global as { fetch?: unknown }).fetch = fetchMock;
    const r = await sendBack('discover', 'WVW?#ZZZ1KZ6W0001', { car: { title: 'My nickname', brand: 'SEAT' }, ids: { codes: { registration: { value: 'AB12 CDE' } }, modules: [], notes: 'private' } });
    expect(r.via).toBe('github');
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).not.toMatch(/[?#]/);
    const body = Buffer.from(JSON.parse(init.body).content, 'base64').toString();
    expect(body).not.toMatch(/nickname|AB12|private/);
    expect(body).toContain('SEAT');
  });

  it('a 422 counts as sent only when the file is already there', async () => {
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 422, text: async () => '{"message":"Invalid request.\\n\\n\\"sha\\" wasn\'t supplied."}' }));
    expect((await sendBack('sensors', 'WVWZZZ1KZ6W000001', {})).via).toBe('github');
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 422, text: async () => '{"message":"content is too large"}' }));
    const r = await sendBack('sensors', 'WVWZZZ1KZ6W000001', {});
    expect(r.via).toBe('none');
    expect((await outbox()).length).toBe(1);
  });

  it('scrubForUpload drops registration, notes and the nickname only', () => {
    const out = scrubForUpload({ car: { title: 'Nick', brand: 'SEAT' }, title: 'keep', note: 'kept', ids: { codes: { registration: { value: 'X' }, paintCode: { value: 'LY9B' } }, notes: 'drop' } }) as Record<string, any>;
    expect(out.car).toEqual({ brand: 'SEAT' });
    expect(out.title).toBe('keep');
    expect(out.note).toBe('kept');
    expect(out.ids.codes).toEqual({ paintCode: { value: 'LY9B' } });
    expect(out.ids.notes).toBeUndefined();
  });
});

describe('car identity before a write', () => {
  const SAVED = 'VSSZZZ5FZ7R100001';
  const OTHER = 'VSSZZZ5FZ7R123456';
  const client = (modules: string | null) => ({
    supportsModules: true,
    readVin: jest.fn(async () => null as string | null),
    readVinFromModules: jest.fn(async () => modules),
    whenIdle: jest.fn(async () => undefined),
  });

  it('a VIN read from the car or its modules in this connection needs no second read', async () => {
    const c = client(OTHER);
    expect(await carMismatch(c, SAVED, 'car')).toBeNull();
    expect(await carMismatch(c, SAVED, 'modules')).toBeNull();
    expect(c.readVin).not.toHaveBeenCalled();
    expect(c.readVinFromModules).not.toHaveBeenCalled();
  });

  it('a write never waits for the background read and never asks the car with 09 02', async () => {
    let finish: (v: string | null) => void = () => undefined;
    const c = client(null);
    c.readVinFromModules = jest.fn(() => new Promise<string | null>((r) => (finish = r)));
    const reading = startVinCheck(c);
    // Not finished: the write goes ahead at once.
    expect(await carMismatch(c, SAVED, 'remembered')).toBeNull();
    finish(OTHER);
    await reading;
    expect(await carMismatch(c, SAVED, 'remembered')).toMatch(/not the car Pin16 has saved/);
    expect(c.readVin).not.toHaveBeenCalled();
    expect(c.whenIdle).toHaveBeenCalledTimes(1);
  });

  it('starts one background read at a time, when the adapter is idle', async () => {
    const c = client(SAVED);
    const one = startVinCheck(c);
    const two = startVinCheck(c);
    expect(two).toBe(one);
    await one;
    expect(c.readVinFromModules).toHaveBeenCalledTimes(1);
    expect(await carMismatch(c, SAVED, 'owner')).toBeNull();
    expect(await carMismatch(c, SAVED, 'owner')).toBeNull();
    expect(c.readVinFromModules).toHaveBeenCalledTimes(1);
  });

  it('refuses a remembered VIN that does not match, with both tails', async () => {
    const c = client(OTHER);
    await startVinCheck(c);
    const text = await carMismatch(c, SAVED, 'remembered');
    expect(text).toMatch(/not the car Pin16 has saved/);
    expect(text).toMatch(/123456/);
    expect(text).toMatch(/100001/);
    expect(text).toMatch(/Nothing was written/);
    expect(text).toMatch(/This is the right car/);
  });

  it('one tap accepts the car for this connection only', async () => {
    const c = client(OTHER);
    await startVinCheck(c);
    expect(await carMismatch(c, SAVED, 'remembered')).not.toBeNull();
    acceptCarVin(c);
    expect(await carMismatch(c, SAVED, 'remembered')).toBeNull();
    // Another connection (a new client) is checked again.
    const next = client(OTHER);
    await startVinCheck(next);
    expect(await carMismatch(next, SAVED, 'remembered')).not.toBeNull();
  });

  it('lets a car that gives no VIN through, and ignores a bad VIN', async () => {
    const none = client(null);
    await startVinCheck(none);
    expect(await carMismatch(none, SAVED, 'remembered')).toBeNull();
    const bad = client('?#???????????????');
    await startVinCheck(bad);
    expect(await carMismatch(bad, SAVED, 'owner')).toBeNull();
    const failing = { supportsModules: true, readVinFromModules: jest.fn(async () => Promise.reject(new Error('link lost'))) };
    await startVinCheck(failing);
    expect(await carMismatch(failing, SAVED, 'unknown')).toBeNull();
    // No saved VIN to compare with.
    expect(await carMismatch(client(OTHER), NO_VIN_KEY, 'remembered')).toBeNull();
  });

  describe('a failed or empty read is not kept', () => {
    afterEach(() => jest.restoreAllMocks());

    it('is tried again at the next check, at most once per 60 seconds', async () => {
      let clock = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => clock);
      const c = client(null);
      await startVinCheck(c);
      expect(c.readVinFromModules).toHaveBeenCalledTimes(1);
      // Within 60 seconds: no new read.
      clock += 59_000;
      expect(await carMismatch(c, SAVED, 'remembered')).toBeNull();
      expect(c.readVinFromModules).toHaveBeenCalledTimes(1);
      // After 60 seconds the check starts a new read, and the write does not wait for it.
      clock += 2_000;
      c.readVinFromModules.mockImplementation(async () => OTHER);
      expect(await carMismatch(c, SAVED, 'remembered')).toBeNull();
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      expect(c.readVinFromModules).toHaveBeenCalledTimes(2);
      expect(await carMismatch(c, SAVED, 'remembered')).toMatch(/not the car/);
      // A good read is kept: no more reads.
      clock += 120_000;
      await carMismatch(c, SAVED, 'remembered');
      expect(c.readVinFromModules).toHaveBeenCalledTimes(2);
    });

    it('a thrown read is not kept either', async () => {
      let clock = 5_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => clock);
      const c = client(null);
      c.readVinFromModules.mockImplementationOnce(async () => Promise.reject(new Error('link lost')));
      await startVinCheck(c);
      clock += 61_000;
      c.readVinFromModules.mockImplementation(async () => OTHER);
      await carMismatch(c, SAVED, 'owner');
      await new Promise((r) => setImmediate(r));
      expect(await carMismatch(c, SAVED, 'owner')).toMatch(/not the car/);
    });
  });
});

describe('a link never writes to the car', () => {
  it('the restore message only points at the Put back control', () => {
    expect(adaptRestoreMessage('Idle speed', 80, 60).text).toMatch(/tap Put back original under Idle speed/);
    expect(adaptRestoreMessage('Idle speed', 60, 60).text).toMatch(/Nothing to put back/);
    expect(adaptRestoreMessage('Idle speed', null, 60).tone).toBe('danger');
  });

  it('Customise does not call the adaptation write from the restore link effect', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'customise', 'index.tsx'), 'utf8');
    const start = src.indexOf('Put back an adjustable value from the change timeline');
    const end = src.indexOf('Put back from the change timeline: once the module has been read');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const effect = src.slice(start, end);
    expect(effect).not.toMatch(/changeAdaptRef|saveAdaptation|writeCoding/);
  });
});

describe('knowledge entries from the repo are checked', () => {
  const good = { id: 'seat-leon-note-x', kind: 'note', car: { make: 'SEAT' }, title: 'T', body: 'B', sources: [{ label: 'Forum', url: 'https://example.org/a' }], addedBy: 'owner', at: 1 };

  it('keeps https sources and drops other schemes', () => {
    const e = cleanKbEntry({ ...good, sources: [...good.sources, { label: 'Call', url: 'tel:+441234' }, { label: 'x', url: 'javascript:1' }] });
    expect(e?.sources).toEqual([{ label: 'Forum', url: 'https://example.org/a' }]);
  });

  it('survives a missing sources array and rejects bad entries', () => {
    expect(cleanKbEntry({ ...good, sources: undefined })?.sources).toEqual([]);
    expect(cleanKbEntry({ ...good, kind: 'unknown' })).toBeNull();
    expect(cleanKbEntry({ ...good, id: '' })).toBeNull();
    expect(cleanKbEntry({ ...good, car: null })).toBeNull();
    expect(cleanKbEntry('text')).toBeNull();
  });
});

describe('rejected knowledge entries are kept aside', () => {
  beforeEach(reset);
  const good = { id: 'seat-leon-note-x', kind: 'note', car: { make: 'SEAT' }, title: 'T', body: 'B', sources: [], addedBy: 'owner', at: 1 };

  it('a kind named after an object property is rejected', () => {
    expect(cleanKbEntry({ ...good, kind: 'constructor' })).toBeNull();
    expect(cleanKbEntry({ ...good, kind: 'toString' })).toBeNull();
    expect(cleanKbEntry({ ...good, kind: 'setting' })?.kind).toBe('setting');
  });

  it('a new entry does not drop a rejected one for good', async () => {
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => '' }));
    const bad = { ...good, id: 'bad-1', car: { make: '' } };
    mockStore['caristini.kb.v1'] = JSON.stringify([good, bad]);
    await saveKb({ kind: 'note', car: { make: 'Ford' }, title: 'Fresh', body: 'B', sources: [], addedBy: 'owner' });
    expect(JSON.parse(mockStore['caristini.kb.v1.damaged'])).toEqual([bad]);
    expect((await loadKb()).map((e) => e.id).sort()).toEqual(['ford-all-note-fresh', 'seat-leon-note-x']);
  });

  it('reading for display writes nothing', async () => {
    mockStore['caristini.kb.v1'] = JSON.stringify([good, { id: '' }]);
    mockSetItem.mockClear();
    expect((await loadKb()).length).toBe(1);
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

describe('stored discovery text that cannot be parsed is kept aside', () => {
  beforeEach(reset);

  it('copies it to .damaged before it counts as empty', async () => {
    mockStore['caristini.discover.V1'] = '{broken';
    const d = await loadDiscovery('V1');
    expect(d.modules).toEqual({});
    expect(mockStore['caristini.discover.V1.damaged']).toBe('{broken');
    // The next save replaces the stored text, and the copy stays.
    await saveDiscovery(d);
    expect(JSON.parse(mockStore['caristini.discover.V1']).vin).toBe('V1');
    expect(mockStore['caristini.discover.V1.damaged']).toBe('{broken');
  });

  it('a failed read is still not nothing stored', async () => {
    failNextRead();
    await loadDiscovery('V2');
    mockSetItem.mockClear();
    await saveDiscovery({ vin: 'V2', started: 1, updated: 1, modules: {} });
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});

describe('uploaded adapter log text is masked', () => {
  beforeEach(() => {
    trafficLog.setEnabled(true);
    trafficLog.clear();
  });

  it('keeps the last 8 characters of a VIN and hides UK plates', () => {
    const out = maskPrivate('# Pin16 adapter log, SEAT Leon VSSZZZ5FZ7R100001 on AB12 CDE and R123 ABC and ABC 123D');
    expect(out).toContain('*********' + 'FZ7R100001'.slice(-8));
    expect(out).not.toContain('VSSZZZ5F');
    expect(out).not.toMatch(/AB12|R123|ABC 123D/);
    expect(out).toContain('[plate]');
  });

  it('leaves ordinary adapter lines alone', () => {
    const line = '7E8 10 14 49 02 01 57 56 57 ATSP0 ELM327 v1.5 41 0C 1A F8';
    expect(maskPrivate(line)).toBe(line);
  });

  it('masks the upload text and not the owner copy', () => {
    trafficLog.add('<', 'VIN VSSZZZ5FZ7R100001');
    expect(trafficLog.unsentText('H AB12 CDE')).not.toMatch(/VSSZZZ5F|AB12/);
    expect(trafficLog.unsentText('H')).toContain('*********7R100001');
    expect(trafficLog.text('H')).toContain('VSSZZZ5FZ7R100001');
  });
});
