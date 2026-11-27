import React from 'react';
import { LiveScreen } from '../screens/LiveScreen';
import { useConnection } from '../state';
import { sensorCount, sensorCountText } from '../vehicle/counts';
import { JobCard, Screen, TOOLS } from '../ui';

export default function Live() {
  const conn = useConnection();
  const c = sensorCount(conn.vehicle);
  const found = c.maker + c.groupValues > 0;
  return (
    <Screen>
      {/* The same card as on the Car tab: what this car can show. */}
      <JobCard icon={TOOLS.live.icon} colour={TOOLS.live.colour} title="Live data" status={found ? sensorCountText(c) : 'The standard values every car reports'} />
      <LiveScreen />
    </Screen>
  );
}
