const mockStore: Record<string, string> = {};
const mockSetItem = jest.fn(async (k: string, v: string) => {
  mockStore[k] = v;
});
const mockGetItem = jest.fn(async (k: string): Promise<string | null> => mockStore[k] ?? null);
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: (k: string) => mockGetItem(k), setItem: (k: string, v: string) => mockSetItem(k, v) },
}));

import { loadValueNames, saveValueName } from '../src/data/valueNamesStore';

describe('value names store', () => {
  it('saves a name and reads it back', async () => {
    await saveValueName('VIN1', 'engine:1:2', 'Boot handle pressed');
    expect((await loadValueNames('VIN1'))['engine:1:2'].name).toBe('Boot handle pressed');
  });

  it('does not write over the stored names when a read fails', async () => {
    await saveValueName('VIN2', 'engine:1:1', 'First');
    const stored = mockStore['pin16.valueNames.VIN2'];
    mockSetItem.mockClear();
    mockGetItem.mockRejectedValueOnce(new Error('storage busy'));
    await saveValueName('VIN2', 'engine:1:2', 'Second');
    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockStore['pin16.valueNames.VIN2']).toBe(stored);
  });
});
