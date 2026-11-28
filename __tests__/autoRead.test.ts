jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: () => Promise.resolve(), deactivateKeepAwake: () => Promise.resolve() }));
jest.mock('../src/learn/runLearn', () => ({ ...jest.requireActual('../src/learn/runLearn'), runLearn: jest.fn() }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allowSleep, heldTags, stayAwake } from '../src/keepAwake';
import {
  autoReadLabel,
  claimClient,
  claimCooldown,
  COOLDOWN_MS,
  getAutoReadProgress,
  isBusy,
  LEARN_RETRIES,
  onAutoReadProgress,
  planAutoRead,
  resetAutoRead,
  runAutoLearn,
  runAutoRead,
  setAutoReadProgress,
} from '../src/learn/autoRead';
import { runLearn } from '../src/learn/runLearn';
import { ElmClient } from '../src/obd/elm';
import { DEMO_CARS, DemoCar, SimTransport } from '../src/obd/simTransport';
import { vinVerified } from '../src/vehicle/identity';
import { Vehicle } from '../src/vehicle/garage';

const leonCar = DEMO_CARS.find((c) => c.id === 'leon')!;

function memoryGarage(cars: Vehicle[]) {
  let list = cars.map((c) => ({ ...c }));
  return {
    get vehicles() {
      return list;
    },
    latest: (vin: string) => list.find((v) => v.vin === vin),
    update: async (vin: string, patch: Partial<Vehicle>) => {
      list = list.map((v) => (v.vin === vin ? { ...v, ...patch } : v));
    },
  };
}

const vehicleOf = (car: DemoCar, patch: Partial<Vehicle> = {}): Vehicle => ({
  vin: car.vin,
  group: 'vag',
  brand: 'SEAT / Cupra',
  model: 'Leon II',
  platform: 'PQ35',
  year: 2007,
  fuel: car.diesel ? 'Diesel' : 'Petrol',
  nickname: '',
  edited: false,
  lastSeen: Date.now(),
  lastMilOn: false,
  lastCodes: [],
  ...patch,
});

// A car connected through the simulated adapter, with every request logged and
// every method that changes the car watched.
async function connect(car: DemoCar, platform = 'PQ35') {
  const sim = new SimTransport(car, 0);
  const client = new ElmClient(sim);
  await client.initialise();
  client.setMake('vag', platform);
  const sent: string[] = [];
  const send = sim.send.bind(sim);
  sim.send = (cmd: string) => {
    sent.push(cmd.replace(/\s/g, '').toUpperCase());
    return send(cmd);
  };
  const changes = (['clearFaultCodes', 'clearModuleFaults', 'clearTp20', 'writeCoding', 'writeDid', 'runServiceReset', 'saveAdaptation', 'runBasicSetting'] as const).map((m) => jest.spyOn(client, m));
  // OBD clear (04), UDS clear (14), write data (2E), IO control (3B) and the
  // adaptation save (31 BB).
  const writes = () => [...sent.filter((x) => x === '04' || /^(14FFFFFF|2E|3B|31BB)/.test(x)), ...changes.filter((c) => c.mock.calls.length).map((c) => c.getMockName())];
  return { client, writes, sent };
}

const noWait = () => Promise.resolve();
const known = () => vehicleOf(leonCar, { learnFullAt: Date.now() - 86400000, modulesSeen: ['engine', 'gearbox', 'vag-03', 'vag-17', 'vag-19'] });
const baseDeps = (client: ElmClient, garage: ReturnType<typeof memoryGarage>) => ({ client, vin: leonCar.vin, garage, busy: () => false, cancelled: () => false, sleep: noWait });

beforeEach(async () => {
  await AsyncStorage.clear();
  resetAutoRead();
});

describe('what auto read does for each car', () => {
  it('plans a Learn for a car never learnt, a refresh for a repeat, and nothing when off', () => {
    expect(planAutoRead(vehicleOf(leonCar), { autoRead: true })).toBe('learn');
    expect(planAutoRead(vehicleOf(leonCar, { learnFullAt: 1 }), { autoRead: true })).toBe('refresh');
    expect(planAutoRead(vehicleOf(leonCar), { autoRead: false })).toBe('skip');
    expect(planAutoRead(vehicleOf(leonCar, { learnFullAt: 1 }), { autoRead: false })).toBe('skip');
    expect(planAutoRead(vehicleOf(leonCar), { autoRead: true }, false)).toBe('skip');
    expect(planAutoRead(undefined, { autoRead: true })).toBe('skip');
  });

  it('says the progress in one line', () => {
    expect(autoReadLabel(4, 12)).toBe('Reading modules, 4 of 12');
    expect(autoReadLabel(0, 0)).toBe('Reading modules');
    expect(autoReadLabel(20, 12)).toBe('Reading modules, 12 of 12');
  });

  it('tells subscribers when the progress changes', () => {
    const seen: (string | undefined)[] = [];
    const off = onAutoReadProgress(() => seen.push(getAutoReadProgress()?.label));
    setAutoReadProgress({ vin: 'X', done: 1, total: 2, label: autoReadLabel(1, 2) });
    setAutoReadProgress(null);
    off();
    setAutoReadProgress({ vin: 'X', done: 2, total: 2, label: 'later' });
    expect(seen).toEqual(['Reading modules, 1 of 2', undefined]);
  });
});

describe('guards', () => {
  it('runs once for each connection', () => {
    const a = {};
    const b = {};
    expect(claimClient(a)).toBe(true);
    expect(claimClient(a)).toBe(false);
    expect(claimClient(b)).toBe(true);
  });

  it('keeps a 10-minute cooldown for each car', () => {
    expect(claimCooldown('V1', 1000)).toBe(true);
    expect(claimCooldown('V1', 1000 + COOLDOWN_MS - 1)).toBe(false);
    expect(claimCooldown('V2', 1005)).toBe(true);
    expect(claimCooldown('V1', 1000 + COOLDOWN_MS)).toBe(true);
  });

  it('waits for the car’s own VIN before anything is saved under a remembered one', () => {
    const c = {};
    expect(vinVerified(c, 'WVWZZZ1KZ7W000001', 'car')).toBe('yes');
    expect(vinVerified(c, 'WVWZZZ1KZ7W000001', 'modules')).toBe('yes');
    expect(vinVerified(c, 'WVWZZZ1KZ7W000001', 'remembered')).toBe('unknown');
    expect(vinVerified(c, 'WVWZZZ1KZ7W000001', 'owner')).toBe('unknown');
    expect(vinVerified(c, 'NO-VIN-REPORTED', 'unknown')).toBe('unknown');
  });
});

describe('busy', () => {
  const idle = { moduleBusy: false, queuedJobs: 0, waitingJobs: 0 };
  afterEach(() => {
    while (heldTags().length) for (const t of heldTags()) allowSleep(t);
  });

  it('is false with nothing else running', () => {
    expect(isBusy(idle)).toBe(false);
  });

  it('is true while another job holds the screen awake, and not for its own tag', () => {
    stayAwake('live');
    expect(isBusy(idle)).toBe(true);
    allowSleep('live');
    expect(isBusy(idle)).toBe(false);
    stayAwake('auto-read');
    expect(isBusy(idle)).toBe(false);
  });

  it('is true while the client has queued jobs or a module conversation', () => {
    expect(isBusy({ ...idle, queuedJobs: 1 })).toBe(true);
    expect(isBusy({ ...idle, moduleBusy: true })).toBe(true);
  });

  it('while learning counts only jobs waiting behind Learn’s own', () => {
    expect(isBusy({ moduleBusy: true, queuedJobs: 1, waitingJobs: 0 }, { learning: true })).toBe(false);
    expect(isBusy({ moduleBusy: true, queuedJobs: 2, waitingJobs: 1 }, { learning: true })).toBe(true);
    expect(isBusy(idle, { learning: true, tags: () => ['workshop-live'] })).toBe(true);
  });

  it('counts the client’s queued jobs while conversations run and is clear after', async () => {
    const { client } = await connect(leonCar);
    expect(client.queuedJobs).toBe(0);
    const a = client.readCoding(client.moduleById('engine')!);
    const b = client.readCoding(client.moduleById('vag-03')!);
    expect(client.queuedJobs).toBeGreaterThan(0);
    expect(client.waitingJobs).toBe(client.queuedJobs - 1);
    await Promise.all([a, b]);
    await client.whenIdle();
    expect(client.queuedJobs).toBe(0);
    expect(client.waitingJobs).toBe(0);
  });
});

describe('refresh of a known car', () => {
  it('reads each module, saves it at once and sends no write', async () => {
    const { client, writes } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    const steps: [number, number][] = [];
    const r = await runAutoRead({ ...baseDeps(client, garage), onProgress: (d, t) => steps.push([d, t]) });
    expect(r.total).toBeGreaterThan(0);
    expect(r.read).toBeGreaterThan(0);
    expect(r.read + r.skipped).toBe(r.total);
    expect(r.stopped).toBe(false);
    expect(steps[0]).toEqual([0, r.total]);
    expect(steps[steps.length - 1]).toEqual([r.total, r.total]);
    expect(garage.latest(leonCar.vin)!.ids?.modules?.length).toBeGreaterThan(0);
    expect(writes()).toEqual([]);
  });

  it('does not keep a TP2.0 module coding in the saved codings, and still records it to history', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    await runAutoRead(baseDeps(client, garage));
    const cache = garage.latest(leonCar.vin)!.codingCache ?? {};
    const older = ['engine', 'gearbox', 'vag-03', 'vag-17', 'vag-19'].filter((id) => client.routeOf({ id } as never) === 'tp20');
    expect(older.length).toBeGreaterThan(0);
    for (const id of older) expect(cache[id]).toBeUndefined();
  });

  it('waits while busy and carries on at the same module', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    const asked: string[] = [];
    const real = client.readModuleDetails.bind(client);
    jest.spyOn(client, 'readModuleDetails').mockImplementation(async (def, restore) => {
      asked.push(def.id);
      return real(def, restore);
    });
    // Busy for 4 checks once the first module has been read.
    let busyChecks = 0;
    let slept = 0;
    const busy = () => {
      if (asked.length === 1 && busyChecks < 4) {
        busyChecks++;
        return true;
      }
      return false;
    };
    const r = await runAutoRead({ ...baseDeps(client, garage), busy, sleep: async () => void slept++ });
    expect(slept).toBe(4);
    // No module was asked twice, and none was missed because of the wait.
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.length).toBe(r.total);
  });

  it('skips a module that does not answer, with no throw', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    const real = client.readModuleDetails.bind(client);
    let calls = 0;
    jest.spyOn(client, 'readModuleDetails').mockImplementation(async (def, restore) => {
      calls++;
      if (calls === 1) throw new Error('no answer');
      if (calls === 2) return { def, responded: false, partNumber: null, software: null, vin: null, hardware: null, systemName: null, serial: null, coding: null };
      return real(def, restore);
    });
    const r = await runAutoRead(baseDeps(client, garage));
    expect(r.skipped).toBeGreaterThanOrEqual(2);
    expect(r.read).toBe(r.total - r.skipped);
    expect(r.lost).toBe(false);
  });

  it('stops cleanly when cancelled and keeps what was saved', async () => {
    const { client, writes } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    let done = 0;
    const r = await runAutoRead({ ...baseDeps(client, garage), cancelled: () => done >= 2, onProgress: (d) => (done = d) });
    expect(r.stopped).toBe(true);
    expect(r.read + r.skipped).toBe(2);
    expect(r.read + r.skipped).toBeLessThan(r.total);
    expect(writes()).toEqual([]);
  });

  it('does not start when cancelled while it waits', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    let n = 0;
    const r = await runAutoRead({ ...baseDeps(client, garage), busy: () => true, cancelled: () => n++ > 3 });
    expect(r).toMatchObject({ stopped: true, read: 0, skipped: 0 });
  });

  it('throws a result away when Customise read the module meanwhile', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    const real = client.readModuleDetails.bind(client);
    let first: string | null = null;
    jest.spyOn(client, 'readModuleDetails').mockImplementation(async (def, restore) => {
      const m = await real(def, restore);
      if (!first) {
        first = def.id;
        // Customise wrote or re-read this module during auto read's read.
        client.sessionValues.set(def.id, [1, 2, 3]);
      }
      return m;
    });
    const r = await runAutoRead(baseDeps(client, garage));
    expect(first).not.toBeNull();
    expect(client.sessionValues.get(first!)).toEqual([1, 2, 3]);
    expect(garage.latest(leonCar.vin)?.codingCache?.[first!]).toBeUndefined();
    expect(garage.latest(leonCar.vin)?.ids?.modules?.some((m) => m.id === first)).toBeFalsy();
    expect(r.skipped).toBeGreaterThanOrEqual(1);
  });

  it('leaves a value Customise already holds for this connection as it is', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([known()]);
    client.sessionValues.set('vag-17', [9, 9]);
    const r = await runAutoRead(baseDeps(client, garage));
    expect(r.read).toBeGreaterThan(0);
    expect(client.sessionValues.get('vag-17')).toEqual([9, 9]);
  });
});

describe('Learn for a car never learnt', () => {
  const summary = { steps: {}, stopped: true, mode: { full: true, why: 'first' as const }, modules: 0, codings: 0, sensors: 0, groupValues: 0, groups: 0, faults: null, sent: null, minutes: 0 };

  it('goes again after stepping aside, at most twice, and sends no write', async () => {
    const { client, writes } = await connect(leonCar);
    const garage = memoryGarage([vehicleOf(leonCar)]);
    const learn = runLearn as jest.Mock;
    learn.mockReset();
    // Every run is cut short because something else started.
    learn.mockImplementation(async (d: { cancelled: () => boolean }) => {
      d.cancelled();
      return summary;
    });
    let running = false;
    const r = await runAutoLearn({
      client,
      vin: leonCar.vin,
      garage,
      isCan: true,
      send: false,
      // Busy while Learn runs, free while auto read waits.
      busy: () => (running = !running),
      cancelled: () => false,
      sleep: noWait,
    });
    expect(r?.stopped).toBe(true);
    expect(learn).toHaveBeenCalledTimes(LEARN_RETRIES + 1);
    expect(writes()).toEqual([]);
  });

  it('does not go again after a run the owner did not interrupt', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([vehicleOf(leonCar)]);
    const learn = runLearn as jest.Mock;
    learn.mockReset();
    learn.mockResolvedValue({ ...summary, stopped: false });
    await runAutoLearn({ client, vin: leonCar.vin, garage, isCan: true, send: false, busy: () => false, cancelled: () => false, sleep: noWait });
    expect(learn).toHaveBeenCalledTimes(1);
    expect(learn.mock.calls[0][0].send).toBe(false);
  });

  it('does not start when cancelled', async () => {
    const { client } = await connect(leonCar);
    const garage = memoryGarage([vehicleOf(leonCar)]);
    const learn = runLearn as jest.Mock;
    learn.mockReset();
    const r = await runAutoLearn({ client, vin: leonCar.vin, garage, isCan: true, send: false, busy: () => false, cancelled: () => true, sleep: noWait });
    expect(r).toBeNull();
    expect(learn).not.toHaveBeenCalled();
  });
});
