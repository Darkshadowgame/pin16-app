const mockStore: Record<string, string> = {};
const mockSetItem = jest.fn(async (k: string, v: string) => {
  mockStore[k] = v;
});
const mockGetItem = jest.fn(async (k: string): Promise<string | null> => mockStore[k] ?? null);
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: (k: string) => mockGetItem(k), setItem: (k: string, v: string) => mockSetItem(k, v) },
}));

import { loadCodingHistory, recordCodings } from '../src/coding/historyStore';

describe('coding history store', () => {
  it('writes once per changed coding, under a key for the car', async () => {
    await recordCodings('VIN1', [{ key: 'engine', hex: '98 80 08', source: 'read' }], 1000);
    await recordCodings('VIN1', [{ key: 'engine', hex: '988008', source: 'read' }], 2000);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(Object.keys(mockStore)).toEqual(['pin16.codingHistory.VIN1']);
    await recordCodings('VIN1', [{ key: 'engine', hex: '908008', source: 'written' }], 3000);
    expect(mockSetItem).toHaveBeenCalledTimes(2);
    const h = await loadCodingHistory('VIN1');
    expect(h.engine.map((e) => e.hex)).toEqual(['908008', '988008']);
  });

  it('does not write over the stored history when a read fails', async () => {
    await recordCodings('VIN3', [{ key: 'engine', hex: '988008', source: 'read' }], 1000);
    await recordCodings('VIN3', [{ key: 'engine', hex: '908008', source: 'written' }], 2000);
    const stored = mockStore['pin16.codingHistory.VIN3'];
    mockSetItem.mockClear();
    mockGetItem.mockRejectedValueOnce(new Error('storage busy'));
    await recordCodings('VIN3', [{ key: 'engine', hex: '808008', source: 'read' }], 3000);
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockStore['pin16.codingHistory.VIN3']).toBe(stored);
    // Nothing stored is not a failure: the first coding is saved.
    await recordCodings('VIN4', [{ key: 'engine', hex: '988008', source: 'read' }], 1000);
    expect(mockSetItem).toHaveBeenCalledTimes(1);
  });

  it('keeps quick records together and ignores bad hex', async () => {
    await Promise.all([recordCodings('VIN2', [{ key: 'a', hex: '0001', source: 'read' }], 1), recordCodings('VIN2', [{ key: 'b', hex: '0002', source: 'read' }], 2), recordCodings('VIN2', [{ key: 'c', hex: 'ZZ', source: 'read' }], 3)]);
    expect(Object.keys(await loadCodingHistory('VIN2')).sort()).toEqual(['a', 'b']);
  });
});
