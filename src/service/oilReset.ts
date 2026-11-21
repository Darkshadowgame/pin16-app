// The built-in oil service reset for the older-protocol instrument cluster of
// a PQ35 car: adaptation channel 2 saved as 0. Pure, so it is tested without a
// phone (__tests__/carFeatures2026-11-21.test.ts).
import type { AdaptationSave } from '../obd/kwpAdapt';

export const OIL_RESET = {
  title: 'Reset the oil service',
  module: 'vag-17',
  channel: 2,
  value: 0,
  platform: 'PQ35',
  // What the row says it will write, plainly.
  writes: "Sets the cluster's service reminder to 0",
  source: 'Seen working on this car, Listen recording of 21 Nov 2026',
  sourceUrl: 'https://wiki.ross-tech.com/wiki/index.php/Seat_Leon_(1P)_Instrument_Cluster',
  sourceLabel: 'Ross-Tech wiki: SEAT Leon (1P) instrument cluster, channel 2, service reminder reset',
} as const;

// VW group car on the PQ35 platform. The cluster must also answer on the older
// protocol, which the screen checks against the connection.
export function oilResetFits(v: { group: string; platform?: string | null } | null | undefined): boolean {
  return !!v && v.group === 'vag' && v.platform === OIL_RESET.platform;
}

export interface OilResetWording {
  took: boolean;
  tone: 'ok' | 'danger';
  text: string;
}

// Says plainly whether the reset took. A save counts as accepted only when the
// module answered it with 71 BB. The read-back is shown as information: the
// recording shows channel 2 already reading 0 before any save, so a read-back
// of 0 alone does not prove a change.
export function oilResetWording(res: AdaptationSave | null): OilResetWording {
  if (!res) return { took: false, tone: 'danger', text: 'Did not take. The instrument cluster did not answer on the older protocol, so nothing was changed.' };
  const why = res.reason ? ` ${res.reason}` : '';
  if (res.accepted && res.ok) {
    if (res.before === OIL_RESET.value) {
      return { took: true, tone: 'ok', text: 'The cluster accepted the reset. The reminder was already at 0 before the save, so the read-back alone does not prove a change. Check the service display.' };
    }
    const before = res.before == null ? 'The value before could not be read.' : `The reminder read ${res.before} before and reads ${res.after} now.`;
    return { took: true, tone: 'ok', text: `The cluster accepted the reset. ${before}` };
  }
  if (res.accepted) {
    const read = res.after == null ? 'The value could not be read back.' : `It now reads ${res.after}.`;
    return { took: false, tone: 'danger', text: `The cluster accepted the save, but the check afterwards failed.${why} ${read} Check the service display.`.replace(/\s+/g, ' ').trim() };
  }
  const unchanged = res.before != null && res.after != null && res.before === res.after ? ' Nothing was changed.' : ' Check the service display.';
  return { took: false, tone: 'danger', text: `The cluster did not accept it.${why}${/Nothing was changed/.test(why) ? '' : unchanged}`.replace(/\s+/g, ' ').trim() };
}
