const STORAGE_KEY = 'rafd_device_id_v1';

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function fingerprintSeed() {
  try {
    const parts = [
      navigator.userAgent || '',
      navigator.language || '',
      String(screen.width),
      String(screen.height),
      String(screen.colorDepth || ''),
      String(new Date().getTimezoneOffset()),
      navigator.platform || '',
      String(navigator.hardwareConcurrency || ''),
    ];
    return parts.join('|');
  } catch {
    return 'unknown';
  }
}

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Stable-ish device id stored locally + soft fingerprint. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = `rafd_${hashString(fingerprintSeed())}_${randomId().slice(0, 8)}`;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `rafd_tmp_${randomId()}`;
  }
}

export async function checkDeviceTrialBlocked(deviceId = getDeviceId()) {
  const res = await fetch(`/api/subscription?action=check-device&device_id=${encodeURIComponent(deviceId)}`);
  if (!res.ok) return { blocked: false as const, binding: null, deviceId };
  const data = await res.json();
  return { ...data, deviceId };
}
