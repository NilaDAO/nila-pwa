/** Time left in days and hours (22 Oct): "6 days 23 h", under a day "23 h 50 min", under an hour "50 min". */
export function timeLeft(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} day${d > 1 ? 's' : ''} ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
