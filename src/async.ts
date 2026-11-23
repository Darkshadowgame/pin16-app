// Waits for a number of milliseconds.
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
