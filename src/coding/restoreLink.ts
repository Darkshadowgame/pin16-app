// A put back opened from a link or from History. Opening the screen never writes
// to the car: this only says what to show, and the owner taps Put back.
export function adaptRestoreMessage(title: string, current: number | null | undefined, original: number): { tone: 'ok' | 'danger'; text: string } {
  if (current == null) return { tone: 'danger', text: `${title} did not answer, so it could not be read. Check the ignition is on, then tap Read settings again.` };
  if (current === original) return { tone: 'ok', text: `${title} already has its original value. Nothing to put back.` };
  return { tone: 'ok', text: `To put ${title} back to its original value, tap Put back original under ${title} below.` };
}
