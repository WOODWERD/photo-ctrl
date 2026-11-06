// Finds Box Ctrl QR codes in a photo on the device (PH-R30 to PH-R32). Other codes are dropped, never stored.
// Uses the browser's own barcode reader where it has one; where it doesn't, the box ID is typed (PH-R33).
import { boxIdFromQr } from './core.js';

let detector = null;
export async function qrAvailable() {
  if (!('BarcodeDetector' in window)) return false;
  try { return (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code'); } catch { return false; }
}

// returns [{ id, y }] for Box Ctrl codes, y as a fraction of the photo's height
export async function findBoxCodes(bytes, height) {
  if (!(await qrAvailable())) return [];
  detector ||= new window.BarcodeDetector({ formats: ['qr_code'] });
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const found = await detector.detect(bmp);
    bmp.close?.();
    return found.map((f) => ({ id: boxIdFromQr(f.rawValue), y: (f.boundingBox.y + f.boundingBox.height / 2) / height })).filter((c) => c.id);
  } catch { return []; }
}
