import { lookupValueName, nameKey, removeValueName, setValueName, valueLabel, ValueNames } from '../src/data/valueNames';

describe('value names', () => {
  it('adds a name and looks it up by module, group and field', () => {
    const n = setValueName({}, nameKey('engine', 5, 2), '  Boot handle pressed ', ' seen when pressed ', 10);
    expect(lookupValueName(n, 'engine', 5, 2)).toEqual({ name: 'Boot handle pressed', note: 'seen when pressed', at: 10 });
    expect(lookupValueName(n, 'engine', 5, 3)).toBeUndefined();
    expect(lookupValueName(n, 'gearbox', 5, 2)).toBeUndefined();
  });

  it('renames, and keeps the same object when nothing changed', () => {
    const one = setValueName({}, 'a:1:1', 'Door', undefined, 1);
    const two = setValueName(one, 'a:1:1', 'Door', undefined, 2);
    expect(two).toBe(one);
    const three = setValueName(one, 'a:1:1', 'Boot', 'note', 3);
    expect(three['a:1:1']).toEqual({ name: 'Boot', note: 'note', at: 3 });
  });

  it('ignores an empty name', () => {
    const one: ValueNames = {};
    expect(setValueName(one, 'a:1:1', '   ', undefined, 1)).toBe(one);
  });

  it('removes a name', () => {
    const one = setValueName({}, 'a:1:1', 'Door', undefined, 1);
    expect(removeValueName(one, 'a:1:1')).toEqual({});
    expect(removeValueName(one, 'a:1:2')).toBe(one);
  });

  it('the owner name wins over the built-in one', () => {
    const own = { name: 'Boot', at: 1 };
    expect(valueLabel('Engine speed', own)).toEqual({ text: 'Boot', yours: true });
    expect(valueLabel('Engine speed', undefined)).toEqual({ text: 'Engine speed', yours: false });
    expect(valueLabel(null, undefined)).toBeNull();
  });
});
