import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ScanBarcode, Focus } from 'lucide-react';
import Button from './Button';
import { cn } from '../../lib/utils';
import { playSuccessChime } from '../../lib/audioService';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  className?: string;
  compact?: boolean;
  /** Keep focusing a target input for hardware wedge scanners */
  autoFocusTargetId?: string;
  keepFocus?: boolean;
  /**
   * On the first valid camera decode: play the success sound, close the camera
   * and emit exactly once (no repeated reads). Default true. Set false only if
   * you intentionally want the camera to keep scanning until manually stopped.
   */
  singleShotCamera?: boolean;
  /**
   * Suppress the scanner's own success sound — use when the caller already
   * plays feedback (e.g. POS beeps on add-to-cart).
   */
  silent?: boolean;
}

/**
 * Supports:
 * 1) Hardware barcode scanners (keyboard wedge) via rapid key input
 * 2) Device camera via html5-qrcode
 * 3) Persistent autofocus on POS search field
 */
export default function BarcodeScanner({
  onScan,
  className,
  compact,
  autoFocusTargetId,
  keepFocus = false,
  singleShotCamera = true,
  silent = false,
}: BarcodeScannerProps) {
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [focusArmed, setFocusArmed] = useState(keepFocus);
  const regionId = useRef(`rafd-qr-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef<{
    start: (...args: unknown[]) => Promise<void>;
    stop: () => Promise<void>;
    clear: () => Promise<void>;
  } | null>(null);
  const bufferRef = useRef('');
  const lastKeyTime = useRef(0);
  const lastScanAt = useRef(0);
  // Latch so a single camera session emits exactly once (prevents repeated reads).
  const cameraLatchRef = useRef(false);
  // Latest-value refs so the camera/keyboard handlers always invoke the current
  // callbacks WITHOUT listing them as effect dependencies (which would re-arm the
  // camera on every render). They are updated in an effect, never during render.
  const onScanRef = useRef(onScan);
  const emitScanRef = useRef<(code: string) => void>(() => undefined);

  const emitScan = (code: string) => {
    const now = Date.now();
    // debounce duplicate scans within 400ms
    if (now - lastScanAt.current < 400 && lastCode === code) return;
    lastScanAt.current = now;
    setLastCode(code);
    onScanRef.current(code);
  };

  useEffect(() => {
    onScanRef.current = onScan;
    emitScanRef.current = emitScan;
  });

  // Keep POS barcode field focused for continuous scanning
  useEffect(() => {
    if (!focusArmed || !autoFocusTargetId) return;
    const tick = () => {
      const el = document.getElementById(autoFocusTargetId) as HTMLInputElement | null;
      if (!el) return;
      const active = document.activeElement;
      const tag = (active as HTMLElement | null)?.tagName?.toLowerCase();
      // don't steal focus from dialogs/other inputs
      if (active && active !== el && (tag === 'input' || tag === 'textarea' || tag === 'select' || (active as HTMLElement).isContentEditable)) {
        return;
      }
      if (document.visibilityState === 'visible') {
        el.focus({ preventScroll: true });
      }
    };
    tick();
    const id = window.setInterval(tick, 1200);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [focusArmed, autoFocusTargetId]);

  // Hardware scanner (keyboard wedge): characters come very fast, end with Enter
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isBarcodeInput = target?.getAttribute?.('data-barcode-input') === 'true';
      if (tag === 'input' || tag === 'textarea') {
        if (!isBarcodeInput) return;
      }

      const now = Date.now();
      if (now - lastKeyTime.current > 80) {
        bufferRef.current = '';
      }
      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        bufferRef.current = '';
        if (code.length >= 3) {
          e.preventDefault();
          emitScan(code);
        }
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!cameraOn) return;
      setError('');
      // A fresh camera session may scan again.
      cameraLatchRef.current = false;
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(regionId.current);
        scannerRef.current = scanner as never;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: { width: 260, height: 150 }, aspectRatio: 1.777 },
          (decoded) => {
            if (!decoded) return;
            // Single-shot: ignore every frame after the first valid decode so
            // the same code is never emitted twice in one session.
            if (singleShotCamera && cameraLatchRef.current) return;
            cameraLatchRef.current = true;
            if (!silent) playSuccessChime();
            emitScanRef.current(decoded);
            // Close the camera immediately after the first valid read. The
            // [cameraOn] effect cleanup stops & clears the scanner.
            if (singleShotCamera) setCameraOn(false);
          },
          () => {
            /* ignore frame errors */
          }
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'تعذر فتح الكاميرا');
        setCameraOn(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => undefined);
      }
    };
  }, [cameraOn, silent, singleShotCamera]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={cameraOn ? 'danger' : 'outline'}
          size={compact ? 'sm' : 'md'}
          onClick={() => setCameraOn((v) => !v)}
        >
          {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {cameraOn ? 'إيقاف الكاميرا' : 'كاميرا الباركود'}
        </Button>
        {autoFocusTargetId && (
          <Button
            type="button"
            size={compact ? 'sm' : 'md'}
            variant={focusArmed ? 'soft' : 'outline'}
            onClick={() => setFocusArmed((v) => !v)}
          >
            <Focus className="h-4 w-4" />
            {focusArmed ? 'تركيز تلقائي: يعمل' : 'تفعيل التركيز'}
          </Button>
        )}
        <div className="inline-flex items-center gap-1.5 text-xs text-muted">
          <ScanBarcode className="h-3.5 w-3.5" />
          USB / Bluetooth / كاميرا
        </div>
        {lastCode && (
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success font-mono">
            {lastCode}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div
        id={regionId.current}
        className={cn(
          'overflow-hidden rounded-2xl border border-app bg-black/90',
          cameraOn ? 'min-h-[200px]' : 'hidden'
        )}
      />
    </div>
  );
}
