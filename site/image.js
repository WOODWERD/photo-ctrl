// Redraws each photo on the device before it's sent (PH-R14): no larger than 2,048 px, JPEG,
// with every embedded detail (location, camera, time) left behind. The time taken is read first.
import { exifTaken, fitSize, LONG_SIDE, THUMB_SIDE } from './core.js';

const canDecodeHeic = () => /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);

async function bitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to an <img> */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

function draw(src, side, quality) {
  const w = src.width, h = src.height;
  const s = fitSize(w, h, side);
  const c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, s.width, s.height);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok({ blob: b, ...s }) : fail(new Error('encode'))), 'image/jpeg', quality));
}

// Returns { bytes, width, height, taken, thumb } or { error } for a photo this browser can't open (PH-E10)
export async function prepare(file) {
  const head = await file.slice(0, 256 * 1024).arrayBuffer();
  const taken = exifTaken(head) ?? (file.lastModified || null);
  let src;
  try { src = await bitmap(file); } catch {
    const heic = /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
    return { error: heic && !canDecodeHeic() ? `${file.name} is HEIC, which this browser can't open. Export it as JPEG and drop it in again.` : `${file.name} couldn't be opened.` };
  }
  const full = await draw(src, LONG_SIDE, 0.85);
  const small = await draw(src, THUMB_SIDE, 0.7);
  if (src.close) src.close();
  return { bytes: new Uint8Array(await full.blob.arrayBuffer()), width: full.width, height: full.height, taken, thumb: new Uint8Array(await small.blob.arrayBuffer()), name: file.name };
}

export const urlFor = (bytes) => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
