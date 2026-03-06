import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';

// INR serial: 1-3 letter prefix + 6-digit number (e.g. "7PR 898919", "2AB 012345")
// Strict check for a clean serial string
export const INR_SERIAL_REGEX = /^[0-9A-Z]{1,3}\s?\d{6}$/;

export const DENOMINATIONS = [10, 20, 50, 100, 200, 500, 2000];

export const isValidINRSerial = (serial) =>
  INR_SERIAL_REGEX.test((serial || '').trim().toUpperCase());

// Detect denomination from average color of the bill (canvas pixel data).
// Mahatma Gandhi New Series — each denomination has a distinct dominant hue:
//   ₹10   — chocolate brown      (hue ~25,  sat 30-60%)
//   ₹20   — greenish yellow      (hue ~55,  sat 30-60%)
//   ₹50   — fluorescent blue     (hue ~210, sat 25-70%)
//   ₹100  — lavender             (hue ~270, sat 15-50%)
//   ₹200  — bright orange        (hue ~18,  sat 50-80%)
//   ₹500  — stone grey / green   (hue ~130, sat 8-35%)
//   ₹2000 — magenta / pink       (hue ~330, sat 30-70%)
//
// We use HSL hue because it's robust to brightness changes from lighting.
// Saturation helps disambiguate browns (₹10 vs ₹200) and greys (₹500).

const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
};

// Sample average color from canvas pixel data (skip every `step` pixels for speed)
export const getAverageHSL = (ctx, w, h) => {
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = 4; // sample every 4th pixel
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
    count++;
  }
  if (!count) return [0, 0, 0];
  return rgbToHsl(rSum / count, gSum / count, bSum / count);
};

// Match HSL to INR denomination. Returns denomination or null.
// Ranges are intentionally overlapping — we pick the best match.
const INR_COLOR_PROFILES = [
  // { denom, hueMin, hueMax, satMin, satMax }
  { denom: 2000, hueMin: 310, hueMax: 360, satMin: 25, satMax: 80 },  // magenta/pink
  { denom: 2000, hueMin: 0,   hueMax: 10,  satMin: 25, satMax: 80 },  // magenta wraps around 0
  { denom: 200,  hueMin: 10,  hueMax: 25,  satMin: 40, satMax: 85 },  // bright orange
  { denom: 10,   hueMin: 15,  hueMax: 40,  satMin: 20, satMax: 55 },  // chocolate brown
  { denom: 20,   hueMin: 40,  hueMax: 75,  satMin: 20, satMax: 65 },  // greenish yellow
  { denom: 500,  hueMin: 80,  hueMax: 180, satMin: 5,  satMax: 40 },  // stone grey-green (low sat)
  { denom: 50,   hueMin: 190, hueMax: 240, satMin: 20, satMax: 75 },  // fluorescent blue
  { denom: 100,  hueMin: 240, hueMax: 310, satMin: 10, satMax: 55 },  // lavender / purple
];

export const detectDenominationFromColor = (ctx, w, h) => {
  const [hue, sat] = getAverageHSL(ctx, w, h);
  for (const p of INR_COLOR_PROFILES) {
    if (hue >= p.hueMin && hue <= p.hueMax && sat >= p.satMin && sat <= p.satMax) {
      return p.denom;
    }
  }
  return null;
};

export const truncateSerial = (serial) => {
  const s = (serial || '').replace(/\s/g, '');
  if (s.length <= 6) return s;
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
};

export const groupByDenomination = (bills) =>
  bills.reduce((acc, b) => {
    acc[b.denomination] = (acc[b.denomination] || 0) + 1;
    return acc;
  }, {});

const SESSION_KEY_NAME = 'cashCounter_ts';
const SESSION_DATA_KEY = 'cashCounter_session';
const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export const deriveSessionKey = (address) => {
  let ts = sessionStorage.getItem(SESSION_KEY_NAME);
  if (!ts) {
    ts = Date.now().toString();
    sessionStorage.setItem(SESSION_KEY_NAME, ts);
  }
  return `${address}:${ts}`;
};

export const encryptSession = (data, key) =>
  AES.encrypt(JSON.stringify(data), key).toString();

export const decryptSession = (ciphertext, key) => {
  try {
    const bytes = AES.decrypt(ciphertext, key);
    return JSON.parse(bytes.toString(Utf8));
  } catch {
    return null;
  }
};

export const persistSession = (bills, key) => {
  const payload = { bills, lastActivity: Date.now() };
  localStorage.setItem(SESSION_DATA_KEY, encryptSession(payload, key));
};

export const restoreSession = (key) => {
  const raw = localStorage.getItem(SESSION_DATA_KEY);
  if (!raw) return null;
  const payload = decryptSession(raw, key);
  if (!payload) {
    clearSessionStorage();
    return null;
  }
  if (Date.now() - payload.lastActivity > EXPIRY_MS) {
    clearSessionStorage();
    return null;
  }
  return payload;
};

export const clearSessionStorage = () => {
  localStorage.removeItem(SESSION_DATA_KEY);
  sessionStorage.removeItem(SESSION_KEY_NAME);
};
