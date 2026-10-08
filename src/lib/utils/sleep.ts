/** "12m", or "0:45" in the last minute. */
export function formatSleepRemaining(ms: number): string {
  if (ms <= 60_000) {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    return `0:${String(secs).padStart(2, "0")}`;
  }
  return `${Math.ceil(ms / 60_000)}m`;
}
