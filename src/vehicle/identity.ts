// Which car is connected, checked before anything is written to a module.
// A VIN that was only remembered or typed says nothing about this car. It is
// read from the car's modules in the background after connect, and the write
// compares with the result when it is ready. A write never waits for it.
import { isValidVin } from './vin';

export const NO_VIN_KEY = 'NO-VIN-REPORTED';

// A failed or empty read is tried again at the next check, at most this often.
export const VIN_RETRY_MS = 60_000;

export interface VinReader {
  supportsModules?: boolean;
  readVin?(): Promise<string | null>;
  readVinFromModules?(): Promise<string | null>;
  // Resolves when no module conversation holds the adapter.
  whenIdle?(): Promise<void>;
}

interface Seen {
  // The car's VIN, only ever a valid one: a failed or empty read is not kept.
  live: string | null;
  // When the last background read started.
  at: number;
  pending: Promise<void> | null;
  // The VIN the owner accepted for this connection.
  accepted: string | null;
}

const seen = new WeakMap<object, Seen>();

function stateOf(client: object): Seen {
  let s = seen.get(client);
  if (!s) {
    s = { live: null, at: 0, pending: null, accepted: null };
    seen.set(client, s);
  }
  return s;
}

const tail = (vin: string) => vin.slice(-6);

// Reads the car's VIN from its modules once, when nothing else is using the
// adapter. The OBD request (09 02) is not repeated: it was asked at connect.
export function startVinCheck(client: VinReader): Promise<void> {
  const s = stateOf(client);
  if (s.pending) return s.pending;
  if (!client.supportsModules || !client.readVinFromModules) return Promise.resolve();
  s.at = Date.now();
  const run = (async () => {
    try {
      await client.whenIdle?.();
      const read = (await client.readVinFromModules!())?.trim().toUpperCase();
      if (read && isValidVin(read)) s.live = read;
    } catch {
      // Nothing is kept: the next check tries again.
    } finally {
      s.pending = null;
    }
  })();
  s.pending = run;
  return run;
}

// The owner says the car is the right one: its VIN is accepted for this
// connection only. The saved VIN is not changed.
export function acceptCarVin(client: object): void {
  const s = stateOf(client);
  s.accepted = s.live;
}

// Returns null when it is safe to write, or the words to show when it is not.
// 'car' and 'modules' mean the VIN was read from the car in this connection.
// Anything else was remembered or typed. A car that gives no VIN cannot be
// checked and is let through: the owner chose it.
export async function carMismatch(client: VinReader, savedVin: string, source: string | null): Promise<string | null> {
  if (source === 'car' || source === 'modules' || savedVin === NO_VIN_KEY) return null;
  const s = stateOf(client);
  if (!s.live) {
    if (!s.pending && Date.now() - s.at >= VIN_RETRY_MS) void startVinCheck(client);
    return null;
  }
  if (s.live === savedVin.toUpperCase() || s.live === s.accepted) return null;
  return `This is not the car Pin16 has saved. The car reports a VIN ending ${tail(s.live)} and the saved car ends ${tail(savedVin)}. Nothing was written. Tap "This is the right car" to go on with this connection, or pick the right car on the Car tab.`;
}
