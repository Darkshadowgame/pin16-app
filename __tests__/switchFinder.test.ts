import { addReading, baselineReady, cellText, changedFields, newTracker, resetBaseline, SwitchCell } from '../src/diag/switchFinder';

const bits = (v: string): SwitchCell => ({ value: v, unit: 'bits' });
const num = (v: number, unit = 'km/h'): SwitchCell => ({ value: v, unit });

describe('cellText', () => {
  it('shows bits as 8 digits and numbers with their unit', () => {
    expect(cellText(bits('101'))).toBe('00000101');
    expect(cellText(num(12.345, 'V'))).toBe('12.35 V');
    expect(cellText({ value: 7, unit: 'raw' })).toBe('7');
  });
});

describe('switch finder tracker', () => {
  it('takes the first full round as the baseline and lists nothing yet', () => {
    let t = newTracker([1, 2], 0);
    t = addReading(t, 1, [bits('00000000'), num(10)], 100);
    expect(baselineReady(t)).toBe(false);
    t = addReading(t, 2, [num(3, 's')], 200);
    expect(baselineReady(t)).toBe(true);
    expect(t.rounds).toBe(1);
    expect(t.lastRoundMs).toBe(200);
    expect(changedFields(t)).toEqual([]);
  });

  it('lists a changed field with baseline, value now and a count; the latest change first', () => {
    let t = newTracker([1, 2], 0);
    t = addReading(t, 1, [bits('00000000'), num(10)], 100);
    t = addReading(t, 2, [num(3, 's')], 200);
    t = addReading(t, 1, [bits('00000000'), num(10)], 300);
    t = addReading(t, 2, [num(3, 's')], 400);
    expect(changedFields(t)).toEqual([]);
    t = addReading(t, 1, [bits('00001000'), num(10)], 500);
    t = addReading(t, 2, [num(4, 's')], 600);
    t = addReading(t, 1, [bits('00000000'), num(10)], 700);
    const list = changedFields(t);
    expect(list.map((f) => `${f.group}.${f.field}`)).toEqual(['1.1', '2.1']);
    expect(list[0]).toMatchObject({ baseline: '00000000', now: '00000000', changes: 2, isBits: true, lastChangeAt: 700 });
    expect(list[1]).toMatchObject({ baseline: '3 s', now: '4 s', changes: 1 });
  });

  it('never lists a field that does not change', () => {
    let t = newTracker([5], 0);
    for (let i = 1; i <= 4; i++) t = addReading(t, 5, [num(20, '°C')], i * 100);
    expect(t.rounds).toBe(4);
    expect(changedFields(t)).toEqual([]);
  });

  it('counts a field that went on and came back as changed twice', () => {
    let t = newTracker([5], 0);
    t = addReading(t, 5, [bits('00000001')], 10);
    t = addReading(t, 5, [bits('00000011')], 20);
    t = addReading(t, 5, [bits('00000001')], 30);
    expect(changedFields(t)[0].changes).toBe(2);
  });

  it('ignores a group that did not answer, and baselines it when it later does', () => {
    let t = newTracker([1, 2], 0);
    t = addReading(t, 1, null, 10);
    t = addReading(t, 2, [num(1)], 20);
    expect(baselineReady(t)).toBe(true);
    t = addReading(t, 1, [num(5)], 30);
    t = addReading(t, 2, [num(1)], 40);
    expect(changedFields(t)).toEqual([]);
    t = addReading(t, 1, [num(6)], 50);
    expect(changedFields(t)[0]).toMatchObject({ group: 1, baseline: '5 km/h', now: '6 km/h' });
  });

  it('sets the baseline again from the next full round', () => {
    let t = newTracker([1], 0);
    t = addReading(t, 1, [bits('00000000')], 10);
    t = addReading(t, 1, [bits('00000100')], 20);
    expect(changedFields(t)).toHaveLength(1);
    t = resetBaseline(t, 30);
    expect(changedFields(t)).toEqual([]);
    expect(baselineReady(t)).toBe(false);
    t = addReading(t, 1, [bits('00000100')], 40);
    t = addReading(t, 1, [bits('00000100')], 50);
    expect(changedFields(t)).toEqual([]);
    t = addReading(t, 1, [bits('00000000')], 60);
    expect(changedFields(t)[0]).toMatchObject({ baseline: '00000100', now: '00000000', changes: 1 });
  });
});
