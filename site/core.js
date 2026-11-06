// Photo Ctrl's plain logic, kept apart from the page so it can be tested (npm test).
// Nothing here touches the network, the device's store or the page.

export const KINDS = ['Box', 'Stack', 'Inside'];
export const MAX_PHOTOS = 8; // PH-R12
export const NOTE_MAX = 120; // PH-R13
export const LONG_SIDE = 2048; // PH-R14
export const THUMB_SIDE = 360;
export const GAP_MS = 30000; // PH-R21, Q6
export const WARN_KB = 800 * 1024; // PH-R15
export const FORMAT = 1;
export const ASK = 'Read my new tool photos with the WOODWERD photo skill.'; // PH-R44
export const APP_URL = 'https://woodwerd.github.io/photo-ctrl/';

export const repoError = (r) => (/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(String(r).trim()) ? '' : 'Enter the repo as owner/name, such as you/tool-photos.');

const pad = (n) => String(n).padStart(2, '0');

// PH-R06: the time taken and what it shows, with -2, -3 added if one already matches
export function setId(date, kind, taken = []) {
  const d = new Date(date);
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${String(kind).toLowerCase()}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

// PH-R21: a gap of more than 30 seconds starts a new set; photos with no time are one set each
export function groupByTime(photos, gap = GAP_MS) {
  const timed = photos.filter((p) => Number.isFinite(p.taken)).sort((a, b) => a.taken - b.taken);
  const groups = [];
  for (const p of timed) {
    const last = groups[groups.length - 1];
    if (last && p.taken - last[last.length - 1].taken <= gap) last.push(p);
    else groups.push([p]);
  }
  for (const p of photos) if (!Number.isFinite(p.taken)) groups.push([p]);
  // a group over the limit is split into runs of 8 (PH-R12)
  return groups.flatMap((g) => { const out = []; for (let i = 0; i < g.length; i += MAX_PHOTOS) out.push(g.slice(i, i + MAX_PHOTOS)); return out; });
}

export const splitGroup = (groups, i, at) => [...groups.slice(0, i), groups[i].slice(0, at), groups[i].slice(at), ...groups.slice(i + 1)].filter((g) => g.length);
export const mergeNext = (groups, i) => (i >= groups.length - 1 ? groups : [...groups.slice(0, i), [...groups[i], ...groups[i + 1]], ...groups.slice(i + 2)]);

// The size a photo is redrawn at (PH-R14): never enlarged
export function fitSize(w, h, side = LONG_SIDE) {
  const k = Math.min(1, side / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

// DateTimeOriginal from a JPEG's EXIF, read before the photo is redrawn (PH-R14). Returns ms or null.
export function exifTaken(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return null;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marker = v.getUint16(o), size = v.getUint16(o + 2);
    if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiffTaken(v, o + 10);
    if ((marker & 0xFF00) !== 0xFF00 || size < 2) return null;
    o += 2 + size;
  }
  return null;
}
function tiffTaken(v, t) {
  if (t + 8 > v.byteLength) return null;
  const le = v.getUint16(t) === 0x4949;
  const u16 = (p) => v.getUint16(p, le), u32 = (p) => v.getUint32(p, le);
  const ifd = (p, want) => {
    if (p + 2 > v.byteLength) return null;
    const n = u16(p);
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > v.byteLength) return null;
      if (u16(e) === want) return { count: u32(e + 4), at: u32(e + 8) };
    }
    return null;
  };
  const exif = ifd(t + u32(t + 4), 0x8769);
  if (!exif) return null;
  const dt = ifd(t + exif.at, 0x9003) || ifd(t + exif.at, 0x9004);
  if (!dt) return null;
  let s = '';
  for (let i = 0; i < 19 && t + dt.at + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(t + dt.at + i));
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
}

// PH-R30: a Box Ctrl code holds a Tool Ctrl link with the box ID after the #
export function boxIdFromQr(text) {
  const m = /tool-ctrl\/?#([A-Za-z]{1,6}-\d{1,5})\s*$/.exec(String(text || ''));
  return m ? m[1].toUpperCase() : null;
}
// PH-R31: codes from bottom to top, by where each sits in the photo (y grows downward)
export const idsBottomToTop = (codes) => codes.slice().sort((a, b) => b.y - a.y).map((c) => c.id).filter((id, i, a) => id && a.indexOf(id) === i);

export function setJson({ id, kind, taken, photos, note = '', drawer = '', boxIds = [] }) {
  return { format: FORMAT, id, kind, taken: new Date(taken).toISOString(), photos, ...(note ? { note } : {}), ...(drawer ? { drawer } : {}), ...(boxIds.length ? { boxIds } : {}), sentBy: 'Photo Ctrl' };
}

// PH-R07
export function commitMessage(kind, photos, boxIds = []) {
  return `${kind} set: ${photos} photo${photos === 1 ? '' : 's'}${boxIds.length ? ', ' + boxIds.join(', ') : ''}`;
}

// PH-R41: what the set list shows for a set
export function setState({ local, sending, hasReading, readingStatus, proposalStatus }) {
  if (sending) return { key: 'busy', text: 'Sending' };
  if (local) return { key: 'local', text: 'Waiting on this device' };
  if (!hasReading) return { key: 'wait', text: 'Waiting to be read' };
  if (readingStatus === 'Nothing read') return { key: 'none', text: 'Nothing read' };
  if (proposalStatus === 'Accepted' || proposalStatus === 'Partly accepted') return { key: 'in', text: 'In Tool Ctrl' };
  if (proposalStatus === 'Declined') return { key: 'dec', text: 'Declined' };
  return { key: 'read', text: 'Read' };
}

// The sets in the repo, from one recursive tree listing: id → which files it has
export function setsFromTree(tree) {
  const out = new Map();
  for (const e of tree || []) {
    const m = /^sets\/([^/]+)\/([^/]+)$/.exec(e.path || '');
    if (!m || e.type !== 'blob') continue;
    const s = out.get(m[1]) || { id: m[1], photos: [], hasSet: false, hasReading: false, thumb: null };
    if (m[2] === 'set.json') s.hasSet = true;
    else if (m[2] === 'reading.json') s.hasReading = true;
    else if (m[2] === 'thumb.jpg') s.thumb = e.sha;
    else if (/^\d+\.jpg$/.test(m[2])) s.photos.push({ n: +m[2].replace('.jpg', ''), sha: e.sha });
    out.set(m[1], s);
  }
  for (const s of out.values()) s.photos.sort((a, b) => a.n - b.n);
  return [...out.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
}

// ----- readings (written by the skill, format in skill/reading-format.md) -----
const sureOf = (v) => (v && ['Sure', 'Likely', 'Guess'].includes(v.sure) ? v.sure : 'Guess');
const val = (v) => (v && v.value != null ? String(v.value) : '');
const lowest = (...vs) => { const r = { Sure: 0, Likely: 1, Guess: 2 }; return vs.filter(Boolean).reduce((a, v) => (r[sureOf(v)] > r[a] ? sureOf(v) : a), 'Sure'); };

// PH-R43, PH-R45: a reading as plain lines, each with where it is in the photos
export function readingLines(reading, modelName = (id) => id) {
  if (!reading || reading.status === 'Nothing read') return [];
  const lines = [];
  const boxes = (reading.boxes || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  for (const b of boxes) {
    const mn = val(b.model) ? modelName(val(b.model)) : '';
    const name = val(b.label) || val(b.makerLabel) || [val(b.kindOfBox), mn].filter(Boolean).join(' · ') || 'A box';
    const facts = [];
    if (val(b.boxId)) facts.push(`Box ID ${val(b.boxId)} · ${sureOf(b.boxId)}`);
    if (val(b.kindOfBox) && !name.includes(val(b.kindOfBox))) facts.push(val(b.kindOfBox));
    if (val(b.makerLabel) && val(b.makerLabel) !== name) facts.push(`Maker's label: ${val(b.makerLabel)}`);
    if (mn && !name.includes(mn)) facts.push(`Model ${mn}`);
    if (val(b.match)) facts.push(`Matches ${val(b.match)} in Tool Ctrl · ${sureOf(b.match)}`);
    if (b.note) facts.push(b.note);
    lines.push({ ref: reading.kind === 'Stack' ? String(b.position || '') : 'Box', text: name, sure: b.model ? sureOf(b.model) : lowest(b.label, b.match), facts, where: b.where || [] });
    for (const d of b.drawers || []) {
      lines.push({ ref: `D${d.drawer}`, text: (d.labels || []).map(val).filter(Boolean).join(' · ') || `Drawer ${d.drawer}`, sure: lowest(...(d.labels || [])), facts: [`Drawer ${d.drawer}`], where: d.where || [] });
    }
    for (const it of b.items || []) lines.push({ ref: '·', text: val(it), sure: sureOf(it), facts: it.textRead ? [`Read: ${it.textRead}`] : [], where: it.where || [] });
  }
  if (reading.stands && reading.stands.on && val(reading.stands.on)) lines.push({ ref: '—', text: `On a ${modelName(val(reading.stands.on))}`, sure: sureOf(reading.stands.on), facts: [], where: reading.stands.where || [] });
  return lines;
}

// PH-R115: an outline as an SVG path in a 0–100 box, and the dimmed surround
export function outlinePath(points) {
  const pts = (points || []).filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  if (pts.length < 3) return null;
  const s = pts.map(([x, y]) => `${+(Math.min(1, Math.max(0, x)) * 100).toFixed(2)},${+(Math.min(1, Math.max(0, y)) * 100).toFixed(2)}`);
  return { points: s.join(' '), dim: `M0 0H100V100H0Z M${s.join(' L')} Z`, top: Math.min(...pts.map((p) => p[1])), bottom: Math.max(...pts.map((p) => p[1])), left: Math.min(...pts.map((p) => p[0])) };
}

export const readme = (repo) => `# Photo Ctrl photos

This private repo holds tool box photos sent by [Photo Ctrl](${APP_URL}).

- \`sets/<set>/\` holds one set: \`set.json\`, the photos \`1.jpg\`, \`2.jpg\` and so on, and a small \`thumb.jpg\`.
- The WOODWERD photo skill, run in your own Claude, adds \`reading.json\` beside the photos when it reads a set.
- Photos are shrunk to 2,048 px and have their location and camera details removed before they're sent.
- **Keep this repo private.** The photos show your shop. Deleting a photo later leaves it in the repo's history; deleting the whole repo removes everything.

Repo: ${repo}
`;

export function b64FromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const b64FromText = (t) => b64FromBytes(new TextEncoder().encode(t));
export function bytesFromB64(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const fmtWhen = (iso) => {
  const d = new Date(iso); if (isNaN(d)) return '';
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return same ? `Today ${t}` : `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${t}`;
};
export const fmtSize = (kb) => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(2)} GB` : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`);
