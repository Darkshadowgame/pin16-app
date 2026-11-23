import { trafficLog } from '../src/obd/trafficLog';

describe('trafficLog trimming', () => {
  beforeEach(() => {
    trafficLog.setEnabled(true);
    trafficLog.clear();
  });

  it('shows at most 4000 entries to readers', () => {
    for (let i = 0; i < 4300; i++) trafficLog.add('>', `line${i}`);
    expect(trafficLog.count()).toBe(4000);
    const lines = trafficLog.text('H').split('\n');
    expect(lines.length).toBe(4001);
    expect(lines[1]).toContain('line300');
    expect(lines[lines.length - 1]).toContain('line4299');
  });

  it('keeps the newest entries after a block trim', () => {
    for (let i = 0; i < 4600; i++) trafficLog.add('<', `line${i}`);
    expect(trafficLog.count()).toBe(4000);
    expect(trafficLog.text('H').split('\n')[1]).toContain('line600');
  });

  it('counts unsent lines against the window', () => {
    for (let i = 0; i < 100; i++) trafficLog.add('>', `a${i}`);
    trafficLog.markSent();
    for (let i = 0; i < 4500; i++) trafficLog.add('>', `b${i}`);
    expect(trafficLog.unsentCount()).toBe(4000);
    expect(trafficLog.unsentText('H').split('\n').length).toBe(4001);
  });
});
