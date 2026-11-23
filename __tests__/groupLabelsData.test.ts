import { GROUP_LABELS } from '../src/data/groupLabels';

describe('groupLabels data', () => {
  for (const [moduleCode, groups] of Object.entries(GROUP_LABELS)) {
    it(`module ${moduleCode}: group numbers are unique integers and labels are strings or null`, () => {
      const numbers = Object.keys(groups).map(Number);
      expect(new Set(numbers).size).toBe(numbers.length);
      for (const n of numbers) {
        expect(Number.isInteger(n)).toBe(true);
        const fields = groups[n];
        expect(fields.length).toBeGreaterThan(0);
        let named = 0;
        for (const f of fields) {
          if (f === null) continue;
          expect(typeof f).toBe('string');
          expect(f.trim().length).toBeGreaterThan(0);
          named++;
        }
        expect(named).toBeGreaterThan(0);
      }
    });
  }
});
