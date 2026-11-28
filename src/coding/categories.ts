// The categories the Customise screen lists settings under. This is the screen
// layer: items.ts, catalogue.ts and adaptations.ts keep their own category and
// are not edited. A setting is placed by its id, then by words in its title,
// then by the category its data file gave it; anything left is Other. A new
// item therefore lands somewhere sensible with no change here.

export const SETTING_CATEGORIES = ['Lights', 'Locking', 'Windows and mirrors', 'Instruments', 'Warnings and chimes', 'Comfort', 'Other'] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

// An exact placement for an id that the words below would get wrong.
const BY_ID: Record<string, SettingCategory> = {
  // Flash and horn confirmations belong with locking, not with the lights.
  'cat-leon-lock-flash-remote': 'Locking',
  'cat-leon-unlock-flash-remote': 'Locking',
};

// Words in the title, checked in this order (the first rule that matches wins).
const BY_WORDS: [SettingCategory, RegExp][] = [
  ['Warnings and chimes', /warning|chime|seat belt|buzzer/],
  ['Lights', /light|lamp|fog|beam|\bdrl\b|daytime|indicator|turn signal|hazard|bulb|dipped|home/],
  ['Windows and mirrors', /window|sunroof|roof|mirror|wiper|wipe|rain clos/],
  ['Locking', /lock|key|horn|alarm|door|tailgate|selective|remote/],
  ['Instruments', /needle|lap timer|display|clock|compass|logo|oil temperature|fuel added|profile|menu|cluster|start-up/],
  ['Comfort', /seat|steering|easy entry|memory|climate|comfort|synchron/],
];

// The data files' own categories, as the last resort.
const BY_DATA_CATEGORY: Record<string, SettingCategory> = {
  'Instrument cluster': 'Instruments',
  Lights: 'Lights',
  'Locking and alarm': 'Locking',
  Mirrors: 'Windows and mirrors',
  Wipers: 'Windows and mirrors',
  'Warnings and chimes': 'Warnings and chimes',
  Comfort: 'Comfort',
};

export function settingCategory(s: { id: string; title: string; category?: string }): SettingCategory {
  const byId = BY_ID[s.id];
  if (byId) return byId;
  const title = s.title.toLowerCase();
  for (const [cat, re] of BY_WORDS) if (re.test(title)) return cat;
  return (s.category && BY_DATA_CATEGORY[s.category]) || 'Other';
}

// Where a setting sits and what it does there: module, coding length, byte,
// bits, field values or short-coding flag. Two items with the same place and
// the same effect are the same setting. A number setting (the whole byte) is
// never the same as a switch on that byte.
type Placed = { module: string; byte: number; bits: number[]; length?: number; number?: { min: number; max: number; step: number; unit: string }; pick?: { divisor: number; modulo: number }; field?: { mask: number; on: number; off: number }; short?: { divisor: number; modulo: number; flag: number } };
const placeKey = (i: Placed) => `${i.module}|${i.length ?? ''}|${i.byte}|${i.bits.join()}|${i.field ? `${i.field.mask}/${i.field.on}/${i.field.off}` : ''}|${i.short ? `${i.short.divisor}/${i.short.modulo}/${i.short.flag}` : ''}|${i.number ? 'number' : ''}|${i.pick ? `pick${i.pick.divisor}/${i.pick.modulo}` : ''}`;

// Several sources can describe the very same setting: keep the first of each.
// Distinct settings that share a short code (brake pad warning, washer fluid
// warning) or a byte stay apart.
export function dedupeItems<T extends Placed>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = placeKey(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// A setting the sources do not confirm: the data file may mark it
// `unconfirmed: true`, and low confidence has always meant the same.
export function isUnconfirmed(i: { confidence?: string }): boolean {
  return (i as { unconfirmed?: boolean }).unconfirmed === true || i.confidence === 'low';
}

// The list in the screen's fixed order, with empty categories left out.
export function groupByCategory<T>(list: T[], categoryOf: (x: T) => SettingCategory): { category: SettingCategory; items: T[] }[] {
  return SETTING_CATEGORIES.map((category) => ({ category, items: list.filter((x) => categoryOf(x) === category) })).filter((g) => g.items.length > 0);
}
