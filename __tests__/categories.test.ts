import { ADAPTATIONS } from '../src/coding/adaptations';
import { dedupeItems, groupByCategory, isUnconfirmed, SETTING_CATEGORIES, settingCategory } from '../src/coding/categories';
import { ALL_ITEMS, codingItemsFor } from '../src/coding/items';

describe('Customise categories', () => {
  it('places every setting in one of the listed categories', () => {
    for (const i of ALL_ITEMS) expect(SETTING_CATEGORIES).toContain(settingCategory(i));
    for (const a of ADAPTATIONS) expect(SETTING_CATEGORIES).toContain(settingCategory(a));
  });

  it('places known titles', () => {
    expect(settingCategory({ id: 'x', title: 'Coming home lights' })).toBe('Lights');
    expect(settingCategory({ id: 'x', title: 'Mirrors fold on lock (driver door)' })).toBe('Windows and mirrors');
    expect(settingCategory({ id: 'x', title: 'Auto lock when driving' })).toBe('Locking');
    expect(settingCategory({ id: 'x', title: 'Seat belt warning' })).toBe('Warnings and chimes');
    expect(settingCategory({ id: 'x', title: 'Needle sweep' })).toBe('Instruments');
    expect(settingCategory({ id: 'x', title: 'Puddle lights with mirrors folded' })).toBe('Lights');
  });

  it('falls back to the data file category, then Other', () => {
    expect(settingCategory({ id: 'x', title: 'Something new', category: 'Mirrors' })).toBe('Windows and mirrors');
    expect(settingCategory({ id: 'x', title: 'Something new', category: 'Parking' })).toBe('Other');
    expect(settingCategory({ id: 'x', title: 'Something new' })).toBe('Other');
  });

  it('groups in the fixed order and drops empty categories', () => {
    const g = groupByCategory([{ t: 'Needle sweep' }, { t: 'Coming home lights' }], (x) => settingCategory({ id: x.t, title: x.t }));
    expect(g.map((x) => x.category)).toEqual(['Lights', 'Instruments']);
  });

  it('reads the optional unconfirmed flag and low confidence', () => {
    expect(isUnconfirmed({ confidence: 'high' })).toBe(false);
    expect(isUnconfirmed({ confidence: 'low' })).toBe(true);
    expect(isUnconfirmed({ confidence: 'high', unconfirmed: true } as { confidence: string })).toBe(true);
  });

  it('keeps one of several items for the same coding bit', () => {
    const a = { module: 'm', byte: 1, bits: [2] };
    expect(dedupeItems([a, { ...a }, { ...a, bits: [3] }])).toHaveLength(2);
  });

  it('keeps the 3 cluster short coding items of the PQ35 apart', () => {
    const ids = dedupeItems(codingItemsFor('vag', 'PQ35')).map((i) => i.id);
    for (const id of ['pq35-seat-belt-warning', 'pq35-brake-pad-warning', 'pq35-washer-warning']) expect(ids).toContain(id);
  });

  it('puts the home lights times and the flash on lock settings where an owner looks', () => {
    expect(settingCategory({ id: 'vag-09:1', title: 'Coming home time' })).toBe('Lights');
    expect(settingCategory({ id: 'vag-09:2', title: 'Leaving home time' })).toBe('Lights');
    for (const id of ['cat-leon-lock-flash-remote', 'cat-leon-unlock-flash-remote']) {
      const i = ALL_ITEMS.find((x) => x.id === id)!;
      expect(settingCategory(i)).toBe('Locking');
    }
    expect(settingCategory(ALL_ITEMS.find((x) => x.id === 'pq35-confirm-lock-remote-flash')!)).toBe('Locking');
  });

  it('leaves no setting in Other except a short list, and names none of the 2 home times there', () => {
    const rows = [...ALL_ITEMS.filter((i) => i.platforms.includes('PQ35')), ...ADAPTATIONS.filter((a) => a.platforms.includes('PQ35'))];
    const other = rows.filter((r) => settingCategory(r) === 'Other').map((r) => r.title);
    expect(other).not.toContain('Coming home time');
    expect(other).not.toContain('Leaving home time');
  });
});
