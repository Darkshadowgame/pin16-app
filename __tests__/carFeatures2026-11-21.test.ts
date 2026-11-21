import { ADAPTATIONS, adaptationKey, adaptationResultText, adaptationsFor, canStep, clampToRow, formatAdaptation, inRange, isAdaptationKey, itemForKey, stepValue, valueFromHex, valueHex } from '../src/coding/adaptations';
import { faultDetailLines, forgetDetails, knownDetail, needsDetailRead, settleDetail } from '../src/diag/faultDetail';
import { MODULES } from '../src/obd/modules';
import { CALIBRATIONS, CALIBRATIONS_NOTE, clock, didNotStart, endText, englishFor, historyFor, reportLines } from '../src/service/calibrations';
import { OIL_RESET, oilResetFits, oilResetWording } from '../src/service/oilReset';

describe('adjustable values list', () => {
  it('has unique module and channel pairs', () => {
    const pairs = ADAPTATIONS.map((a) => `${a.module}/${a.channel}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
  it('has min below max, a positive step and a real module', () => {
    for (const a of ADAPTATIONS) {
      expect(a.min).toBeLessThan(a.max);
      expect(a.step).toBeGreaterThan(0);
      expect(MODULES.some((m) => m.id === a.module)).toBe(true);
      expect(a.confidence).toBe('high');
    }
  });
  it('gives every row a source with a link', () => {
    for (const a of ADAPTATIONS) {
      expect(a.sources.length).toBeGreaterThan(0);
      for (const s of a.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });
  it('named choices cover min to max and sit on the values', () => {
    for (const a of ADAPTATIONS.filter((x) => x.choices)) {
      const values = a.choices!.map((c) => c.value);
      expect(Math.min(...values)).toBe(a.min);
      expect(Math.max(...values)).toBe(a.max);
    }
  });
  it('leaves out the risky and unlisted channels', () => {
    const has = (m: string, c: number) => ADAPTATIONS.some((a) => a.module === m && a.channel === c);
    expect(has('vag-46', 0)).toBe(false);
    expect(has('vag-46', 1)).toBe(false);
    expect(has('vag-46', 13)).toBe(false);
    expect(has('vag-09', 6)).toBe(false);
    expect(has('vag-17', 2)).toBe(false);
    expect(ADAPTATIONS.length).toBe(14);
  });
  it('copies the source ranges', () => {
    const a = (m: string, c: number) => ADAPTATIONS.find((x) => x.module === m && x.channel === c)!;
    expect([a('vag-09', 1).min, a('vag-09', 1).max, a('vag-09', 1).step]).toEqual([10, 60, 10]);
    expect([a('vag-09', 2).min, a('vag-09', 2).max, a('vag-09', 2).step]).toEqual([10, 60, 10]);
    expect([a('vag-09', 3).min, a('vag-09', 3).max]).toEqual([1, 254]);
    expect([a('vag-09', 5).min, a('vag-09', 5).max]).toEqual([20, 100]);
    expect(a('vag-46', 7).choices!.map((c) => c.label)).toEqual(['None', 'Flash', 'Horn', 'Both']);
  });
  it('is offered on PQ35 VW group cars only', () => {
    expect(adaptationsFor('vag', 'PQ35').length).toBe(ADAPTATIONS.length);
    expect(adaptationsFor('vag', 'MQB')).toEqual([]);
    expect(adaptationsFor('vag', null)).toEqual([]);
    expect(adaptationsFor('ford', 'PQ35')).toEqual([]);
  });
});

describe('adjustable value formatting and steps', () => {
  const coming = ADAPTATIONS.find((a) => a.module === 'vag-09' && a.channel === 1)!;
  const confirm = ADAPTATIONS.find((a) => a.module === 'vag-46' && a.channel === 7)!;
  it('formats a value with its unit or its name', () => {
    expect(formatAdaptation(coming, 20)).toBe('20 s');
    expect(formatAdaptation(confirm, 3)).toBe('Both');
    expect(formatAdaptation(confirm, 9)).toBe('9');
  });
  it('steps on the grid and stops at the ends', () => {
    expect(stepValue(coming, 20, 1)).toBe(30);
    expect(stepValue(coming, 20, -1)).toBe(10);
    expect(stepValue(coming, 10, -1)).toBe(10);
    expect(stepValue(coming, 60, 1)).toBe(60);
    expect(stepValue(coming, 15, 1)).toBe(20);
    expect(stepValue(coming, 15, -1)).toBe(10);
  });
  it('knows what is in range', () => {
    expect(inRange(coming, 20)).toBe(true);
    expect(inRange(coming, 70)).toBe(false);
    expect(inRange(confirm, 4)).toBe(false);
  });
  it('keeps the original under a key that is never a module', () => {
    const key = adaptationKey(coming);
    expect(key).toBe('vag-09:ADAPT01');
    expect(isAdaptationKey(key)).toBe(true);
    expect(isAdaptationKey('vag-09')).toBe(false);
    expect(isAdaptationKey('vag-09:0600')).toBe(false);
    expect(itemForKey(key)).toBe(coming);
    expect(valueHex(20)).toBe('0014');
    expect(valueFromHex('0014')).toBe(20);
  });
  it('says whether a save took', () => {
    expect(adaptationResultText(coming, 30, { accepted: true, ok: true, before: 20, after: 30 }).text).toBe('Coming home time is now 30 s (was 20 s). Switch the ignition off and on to see it.');
    const bad = adaptationResultText(coming, 30, { accepted: false, ok: false, before: 20, after: 20, reason: 'The module refused.' });
    expect(bad.ok).toBe(false);
    expect(bad.text).toBe('Did not take. The module refused. The module reads 20 s.');
    expect(adaptationResultText(coming, 30, null).ok).toBe(false);
  });
});

describe('oil service reset', () => {
  it('fits PQ35 VW group cars only', () => {
    expect(oilResetFits({ group: 'vag', platform: 'PQ35' })).toBe(true);
    expect(oilResetFits({ group: 'vag', platform: 'MQB' })).toBe(false);
    expect(oilResetFits({ group: 'vag', platform: null })).toBe(false);
    expect(oilResetFits({ group: 'ford', platform: 'PQ35' })).toBe(false);
    expect(oilResetFits(null)).toBe(false);
  });
  it('saves channel 2 as 0 on the cluster', () => {
    expect([OIL_RESET.module, OIL_RESET.channel, OIL_RESET.value]).toEqual(['vag-17', 2, 0]);
    expect(OIL_RESET.source).toBe('Seen working on this car, Listen recording of 21 Nov 2026');
  });
  it('names what it writes plainly', () => {
    expect(OIL_RESET.writes).toBe("Sets the cluster's service reminder to 0");
  });
  it('says the cluster accepted it when 71 BB came and the value changed', () => {
    const w = oilResetWording({ accepted: true, ok: true, before: 1, after: 0 });
    expect(w.took).toBe(true);
    expect(w.text).toBe('The cluster accepted the reset. The reminder read 1 before and reads 0 now.');
  });
  it('says the reminder was already 0 and that the read-back alone proves nothing', () => {
    const w = oilResetWording({ accepted: true, ok: true, before: 0, after: 0 });
    expect(w.took).toBe(true);
    expect(w.text).toContain('accepted the reset');
    expect(w.text).toContain('already at 0');
    expect(w.text).toContain('does not prove a change');
  });
  it('counts a save as accepted only when the module answered 71 BB', () => {
    const w = oilResetWording({ accepted: false, ok: false, before: 1, after: 0, reason: 'Refused: not supported.' });
    expect(w.took).toBe(false);
    expect(w.tone).toBe('danger');
    expect(w.text).toBe('The cluster did not accept it. Refused: not supported. Check the service display.');
    expect(oilResetWording({ accepted: false, ok: false, before: 5, after: 5, reason: 'Refused: not supported.' }).text).toContain('Nothing was changed.');
  });
  it('says so when it accepted but the check afterwards failed', () => {
    const w = oilResetWording({ accepted: true, ok: false, before: 1, after: 1, reason: 'The module reads back 1 instead of 0.' });
    expect(w.took).toBe(false);
    expect(w.text).toContain('accepted the save, but the check afterwards failed');
  });
  it('handles a cluster that did not answer', () => {
    expect(oilResetWording(null).took).toBe(false);
    expect(oilResetWording({ accepted: false, ok: false, before: null, after: null, reason: 'No answer.' }).text).toContain('did not accept it. No answer.');
  });
});

describe('calibrations', () => {
  it('lists the two runs with the maximum run times', () => {
    expect(CALIBRATIONS.map((c) => [c.module, c.group, c.maxSeconds])).toEqual([
      ['vag-08', 1, 45],
      ['engine', 60, 150],
    ]);
    expect(CALIBRATIONS_NOTE).not.toMatch(/21 Nov/);
  });
  it('keeps group numbers and hex out of the main text and says nothing the sources do not', () => {
    for (const c of CALIBRATIONS) {
      expect(c.summary).not.toMatch(/group|0x|basic setting|climate module/i);
      expect(c.technical).toMatch(/group \d+/);
      expect(JSON.stringify(c)).not.toMatch(/usual way|keep off the pedals/);
    }
    expect(CALIBRATIONS[1].technical).toContain('0x3C');
  });
  it('logs a run that failed to start as did not start, with the reason and no run time', () => {
    expect(didNotStart(null)).toBe(true);
    expect(didNotStart('refused')).toBe(true);
    expect(didNotStart('wrongModule')).toBe(true);
    expect(didNotStart('failed')).toBe(false);
    const h = historyFor('Heater flap calibration', null, endText(null, 45), 0, []);
    expect(h.title).toBe('Heater flap calibration: did not start');
    expect(h.detail).not.toMatch(/Ran/);
    expect(historyFor('X', 'cancelled', 'You finished the run.', 61_000, ['20 %']).detail).toBe('You finished the run. Ran 1:01. Last report: 20 %.');
    expect(historyFor('X', 'time', 'Stopped.', 1000, []).detail).not.toMatch(/Ran/);
    expect(endText('wrongModule', 45)).toContain('Nothing was started');
  });
  it('adds an English line for the German text, shown beside it as sent', () => {
    expect(englishFor('Endanschlaege lernen')).toBe('Learning the end stops');
    expect(englishFor('  endanschlaege  LERNEN ')).toBe('Learning the end stops');
    expect(englishFor('Something else')).toBeNull();
    expect(reportLines('Endanschlaege lernen')).toEqual(['Endanschlaege lernen']);
    expect(reportLines([{ formula: 1, value: 20, unit: '%', known: true }])).toEqual(['20 %']);
  });
  it('counts time and words how a run ended', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(75_000)).toBe('1:15');
    expect(endText('time', 45)).toContain('45 seconds');
    expect(endText(null, 45)).toContain('could not reach');
    expect(endText('cancelled', 45)).toContain('finished');
  });
});

describe('fault detail', () => {
  it('shows mileage in km, the count and the priority', () => {
    expect(faultDetailLines({ km: 123456, frequency: 3, priority: 2 }, false)).toEqual(['Logged at 123,456 km', 'Happened 3 times', 'Priority 2']);
  });
  it('uses miles when set and says 1 time', () => {
    expect(faultDetailLines({ km: 160934, frequency: 1, priority: 4 }, true)).toEqual(['Logged at 100,000 mi', 'Happened 1 time', 'Priority 4']);
  });
});

describe('adjustable value limits', () => {
  const coming = ADAPTATIONS.find((a) => a.module === 'vag-09' && a.channel === 1)!;
  it('does not step away from the range', () => {
    expect(stepValue(coming, 0, -1)).toBe(0);
    expect(stepValue(coming, 0, 1)).toBe(10);
    expect(stepValue(coming, 80, 1)).toBe(80);
    expect(stepValue(coming, 80, -1)).toBe(60);
    expect(canStep(coming, 0, -1)).toBe(false);
    expect(canStep(coming, 10, -1)).toBe(false);
    expect(canStep(coming, 10, 1)).toBe(true);
  });
  it('clamps a typed value to min, max and the step, and rejects the rest', () => {
    expect(clampToRow(coming, 5)).toBe(10);
    expect(clampToRow(coming, 100)).toBe(60);
    expect(clampToRow(coming, 24)).toBe(20);
    expect(clampToRow(coming, 1.5)).toBeNull();
    expect(clampToRow(coming, -1)).toBeNull();
    expect(clampToRow(coming, 65536)).toBeNull();
    expect(clampToRow(coming, NaN)).toBeNull();
  });
  it('gives every row plain wording with the byte and bit only in the needs line', () => {
    for (const a of ADAPTATIONS) {
      expect(a.summary).not.toMatch(/byte|bit |source says|^\d is /i);
      expect(a.title).not.toMatch(/, (remote|key)$/);
    }
    expect(coming.needs).toContain('byte 0 bit 7');
  });
});

describe('fault detail memory', () => {
  beforeEach(() => forgetDetails());
  it('does not keep a failed read, so it is read again', () => {
    expect(settleDetail('car|20|00906', null)).toBe('failed');
    expect(knownDetail('car|20|00906')).toBeUndefined();
    expect(needsDetailRead('failed')).toBe(true);
    expect(needsDetailRead(undefined)).toBe(true);
  });
  it('keeps only a module that says it does not support it', () => {
    expect(settleDetail('car|20|02071', 'unsupported')).toBe('unsupported');
    expect(knownDetail('car|20|02071')).toBe('unsupported');
    expect(needsDetailRead('unsupported')).toBe(false);
  });
  it('does not keep a read that worked', () => {
    const d = { status: 1, priority: 2, frequency: 3, resetCounter: 4, km: 5, raw: [] };
    expect(settleDetail('car|20|00906', d)).toBe(d);
    expect(knownDetail('car|20|00906')).toBeUndefined();
    expect(needsDetailRead(d)).toBe(false);
  });
});
