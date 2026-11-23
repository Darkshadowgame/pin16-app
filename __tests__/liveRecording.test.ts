jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { summarise, toCsv, MAX_REC_ROWS } from '../src/live/recording';
import { createRateStore } from '../src/live/rateStore';

const pids: any[] = [
  { pid: 0x0c, label: 'RPM', unit: 'rpm', decimals: 0 },
  { pid: 0x05, label: 'Coolant', unit: '°C', decimals: 0 },
];
const settings: any = { speed: 'km/h', temp: '°C' };

describe('live recording', () => {
  it('summarises min, max and average per value in first-seen order', () => {
    const rows = [
      { t: 0, pid: 5, v: 80 },
      { t: 100, pid: 12, v: 1000 },
      { t: 200, pid: 5, v: 90 },
      { t: 300, pid: 12, v: 3000 },
    ];
    expect(summarise(rows)).toEqual([
      { pid: 5, min: 80, max: 90, avg: 85 },
      { pid: 12, min: 1000, max: 3000, avg: 2000 },
    ]);
  });

  it('handles more rows than a spread can take', () => {
    const rows = Array.from({ length: 300000 }, (_, i) => ({ t: i, pid: 12, v: i }));
    const [s] = summarise(rows);
    expect(s.min).toBe(0);
    expect(s.max).toBe(299999);
    expect(MAX_REC_ROWS).toBe(180000);
  });

  it('writes a CSV with the last value carried forward', () => {
    const csv = toCsv(
      [
        { t: 0, pid: 12, v: 800 },
        { t: 500, pid: 5, v: 70 },
      ],
      pids,
      settings,
    );
    expect(csv.split('\n')).toEqual(['Time (s),RPM (rpm),Coolant (°C)', '0.00,800,', '0.50,800,70']);
  });

  it('tells subscribers when the rate changes', () => {
    const store = createRateStore();
    const fn = jest.fn();
    const off = store.subscribe(fn);
    store.set({ readings: 5, updates: 2 });
    expect(store.get()).toEqual({ readings: 5, updates: 2 });
    off();
    store.set(null);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
