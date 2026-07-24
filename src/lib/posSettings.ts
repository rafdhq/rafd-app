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

// Sounds now live in the shared Audio Service (src/lib/audioService.ts), which
// keeps a single unlocked AudioContext so feedback plays reliably even when
// triggered after an `await` or from a scanner. Re-exported here so existing
// `import { playScanBeep, playSuccessChime } from '../lib/posSettings'` call
// sites keep working unchanged.
export { playScanBeep, playSuccessChime } from './audioService';
