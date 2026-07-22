export type PaperWidth = '58' | '80';

export interface PosHardwareSettings {
  autoPrintThermal: boolean;
  paperWidth: PaperWidth;
  printCopies: number;
  openCashDrawer: boolean;
  scanBeep: boolean;
  showDetailedAfterSale: boolean;
  defaultPaymentMethod: 'cash' | 'card' | 'transfer' | 'credit' | 'wallet';
  receiptHeaderNote: string;
  receiptFooterNote: string;
}

const KEY = 'rafd-pos-hardware-v1';

export const DEFAULT_POS_SETTINGS: PosHardwareSettings = {
  autoPrintThermal: true,
  paperWidth: '80',
  printCopies: 1,
  openCashDrawer: false,
  scanBeep: true,
  showDetailedAfterSale: true,
  defaultPaymentMethod: 'cash',
  receiptHeaderNote: '',
  receiptFooterNote: '',
};

export function loadPosSettings(): PosHardwareSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_POS_SETTINGS };
    return { ...DEFAULT_POS_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_POS_SETTINGS };
  }
}

export function savePosSettings(patch: Partial<PosHardwareSettings>) {
  const next = { ...loadPosSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('rafd-pos-settings', { detail: next }));
  return next;
}

export function playScanBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 1800;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 70);
  } catch {
    /* ignore */
  }
}

export function playSuccessChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.frequency.value = 1175;
    }, 90);
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 180);
  } catch {
    /* ignore */
  }
}
