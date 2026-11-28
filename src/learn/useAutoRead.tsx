// Starts auto read once per connection (src/learn/autoRead.ts). Rendered once
// in the root layout, inside the connection provider. Shows nothing.
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../settings';
import { sendLogNow } from '../share/sendLog';
import { sendBack } from '../share/sendBack';
import { useConnection } from '../state';
import { startVinCheck, vinVerified } from '../vehicle/identity';
import { NO_VIN, useGarage } from '../vehicle/garage';
import { autoReadLabel, AutoReadProgress, claimClient, claimCooldown, getAutoReadProgress, isBusy, onAutoReadProgress, planAutoRead, runAutoLearn, runAutoRead, setAutoReadProgress, waitForHealthCheck } from './autoRead';

// A moment after connect, so the screens that start on connect go first.
export const GRACE_MS = 5000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The progress of the run in progress, or null.
export function useAutoReadProgress(): AutoReadProgress | null {
  const [p, setP] = useState(getAutoReadProgress());
  useEffect(() => {
    setP(getAutoReadProgress());
    return onAutoReadProgress(() => setP(getAutoReadProgress()));
  }, []);
  return p;
}

export function AutoRead(): null {
  const conn = useConnection();
  const { settings, loaded } = useSettings();
  const garage = useGarage();
  // The newest of each, for the run that outlives a render.
  const garageRef = useRef(garage);
  garageRef.current = garage;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const connRef = useRef(conn);
  connRef.current = conn;
  const { client, status, vinSource } = conn;
  const vin = conn.vehicle?.vin ?? null;
  const on = settings.autoRead !== false;
  const supports = !!client?.supportsModules;

  useEffect(() => {
    if (status !== 'connected' || !client || !vin || !loaded || !garage.loaded || !on || !supports) return undefined;
    let stop = false;
    const cancelled = () => stop;
    const mine = { vin, done: 0, total: 0, label: '' };
    let showing = false;
    void (async () => {
      await sleep(GRACE_MS);
      if (stop) return;
      if (settingsRef.current.autoCheck) await waitForHealthCheck({ cancelled });
      // Nothing is saved under a VIN that was only remembered or typed: wait
      // for the car's own VIN (read in the background), twice at most.
      if (vin === NO_VIN) return;
      for (let tries = 0; !stop; tries++) {
        const state = vinVerified(client, vin, vinSource);
        if (state === 'yes') break;
        if (state === 'no' || tries >= 2) return;
        await startVinCheck(client);
      }
      if (stop) return;
      if (!claimClient(client) || !claimCooldown(vin)) return;
      const g = {
        get vehicles() {
          return garageRef.current.vehicles;
        },
        latest: (x: string) => garageRef.current.latest(x),
        update: (x: string, patch: Parameters<typeof garage.update>[1], opts?: Parameters<typeof garage.update>[2]) => garageRef.current.update(x, patch, opts),
      };
      const plan = planAutoRead(g.latest(vin), settingsRef.current, client.supportsModules);
      if (plan === 'skip') return;
      const show = (p: Partial<AutoReadProgress>) => {
        if (stop) return;
        Object.assign(mine, p);
        showing = true;
        setAutoReadProgress({ ...mine });
      };
      try {
        if (plan === 'learn') {
          const send = settingsRef.current.sendFindings !== false;
          const car = g.latest(vin);
          show({ label: 'Learning this car' });
          await runAutoLearn({
            client,
            vin,
            garage: g,
            isCan: connRef.current.info?.isCan ?? true,
            send,
            readStatus: () => connRef.current.refreshStatus(),
            busy: () => isBusy(client, { learning: true }),
            cancelled,
            onLabel: (label) => show({ label }),
            log: (reason) => {
              if (send && car) void sendLogNow(reason, car);
            },
            sendBack: (kind, v, data) => sendBack(kind, v, data),
          });
        } else {
          show({ label: autoReadLabel(0, 0) });
          await runAutoRead({
            client,
            vin,
            garage: g,
            busy: () => isBusy(client),
            cancelled,
            onProgress: (done, total) => show({ done, total, label: autoReadLabel(done, total) }),
          });
        }
      } catch {
        // Nothing is shown: the Customise card keeps its own text.
      } finally {
        if (showing && getAutoReadProgress()?.vin === vin) setAutoReadProgress(null);
      }
    })();
    return () => {
      stop = true;
      if (showing && getAutoReadProgress()?.vin === vin) setAutoReadProgress(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, status, vin, vinSource, loaded, garage.loaded, on, supports]);

  return null;
}
