export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDurationShort(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function progressPercent(
  chapters: { duration_secs: number }[],
  currentChapterIndex: number,
  currentPositionSecs: number,
): number {
  const totalDuration = chapters.reduce((sum, ch) => sum + ch.duration_secs, 0);
  if (totalDuration === 0) return 0;

  const completedDuration = chapters
    .slice(0, currentChapterIndex)
    .reduce((sum, ch) => sum + ch.duration_secs, 0);

  return ((completedDuration + currentPositionSecs) / totalDuration) * 100;
}

/** Compact "time left" label: "4h 7m", "12m", "<1m". */
export function formatTimeLeft(totalSeconds: number): string {
  if (totalSeconds < 60) return "<1m";
  return formatDurationShort(totalSeconds);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
