const DAY = 86400000;

export function today() {
  return new Date();
}

export function parseDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole days between an ISO date and today, local time. */
export function daysAgo(iso, now = today()) {
  if (!iso) return null;
  const then = parseDate(iso);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((base - then) / DAY);
}

/** Compact age for a card corner: today, 3d, 5w, 14mo. */
export function ago(iso, now = today()) {
  const days = daysAgo(iso, now);
  if (days == null) return "—";
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 14) return `${days}d`;
  if (days < 70) return `${Math.round(days / 7)}w`;
  if (days < 730) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

const WEEK = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function dayLabel(iso, now = today()) {
  const days = daysAgo(iso, now);
  if (days === 0) return "TODAY";
  if (days === 1) return "YESTERDAY";
  return WEEK[parseDate(iso).getDay()];
}

export function dayDate(iso) {
  const date = parseDate(iso);
  return `${WEEK[date.getDay()]} ${String(date.getDate()).padStart(2, "0")} ${MONTH[date.getMonth()]} ${date.getFullYear()}`;
}

export function num(value) {
  return Number(value).toLocaleString("en-US");
}

export function bytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function stamp(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function statusLabel(status) {
  return status.replace(/_/g, " ").toUpperCase();
}
