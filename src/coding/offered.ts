// The settings a car is offered, decided in 1 place. The Customise list and the
// Car tab count both call offeredSettings, so the number on the Car tab is the
// number of rows Customise shows. Whether an item fits a module's coding is
// decided by itemApplies in items.ts, which the write itself also calls.
import { ADAPTATIONS, AdaptationItem, adaptationKey, adaptationsFor, valueFromHex } from './adaptations';
import { dedupeItems } from './categories';
import { CodingItem, codingItemsFor, FitContext, offeredItems } from './items';
import { LearnedSetting, learnedReady } from './learn';
import { sharedFits } from './shared';

export type Codings = Record<string, number[] | null | undefined>;

export interface OfferedInput {
  group: string | undefined;
  platform: string | null | undefined;
  // Every module's coding as last read, by module id (or "module:DID").
  codings: Codings;
  // How a module holds its coding, and its part number, when known.
  ctxOf?: (moduleId: string) => FitContext;
  // The adjustable values read so far, by adaptationKey (a number when the module has the channel).
  adaptValues: Record<string, number | null | undefined>;
  learned?: LearnedSetting[];
  // Settings learned on the owner's other cars that fit this one, with what was tried.
  borrowed?: LearnedSetting[];
  tried?: Record<string, string>;
}

export interface Offered {
  items: CodingItem[];
  adapts: AdaptationItem[];
  learned: LearnedSetting[];
  borrowed: LearnedSetting[];
  count: number;
}

export function offeredSettings(i: OfferedInput): Offered {
  const items = offeredItems(dedupeItems(i.group ? codingItemsFor(i.group, i.platform ?? null) : []), i.codings, i.ctxOf);
  const adapts = adaptationsFor(i.group, i.platform).filter((a) => typeof i.adaptValues[adaptationKey(a)] === 'number');
  const learned = (i.learned ?? []).filter((s) => learnedReady(s, i.codings as Record<string, number[] | null>));
  const tried = i.tried ?? {};
  const borrowed = (i.borrowed ?? []).filter((s) => tried[s.id] !== 'no-effect' && tried[s.id] !== 'refused' && sharedFits(s, i.codings as Record<string, number[] | null>));
  return { items, adapts, learned, borrowed, count: items.length + adapts.length + learned.length + borrowed.length };
}

// A saved coding as hex, as the garage keeps it, back to bytes. Anything that
// is not whole bytes of hex is left out.
export function codingsFromCache(cache: Record<string, string> | undefined): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(cache ?? {})
      .filter(([, hex]) => /^([0-9A-F]{2})+$/i.test(hex))
      .map(([k, hex]) => [k, hex.match(/../g)!.map((h) => parseInt(h, 16))]),
  );
}

// The adjustable values Customise last read, kept in the same saved copy under
// "module:ADAPTnn" (4 hex digits). Channels the module did not have are absent.
export function adaptValuesFromCache(cache: Record<string, string> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of ADAPTATIONS) {
    const hex = cache?.[adaptationKey(a)];
    if (hex && /^[0-9A-F]{4}$/i.test(hex)) out[adaptationKey(a)] = valueFromHex(hex);
  }
  return out;
}
