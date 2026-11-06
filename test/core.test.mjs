// Photo Ctrl core tests, by PH ID. Made-up data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setId, groupByTime, splitGroup, mergeNext, fitSize, exifTaken, boxIdFromQr, idsBottomToTop, setJson, commitMessage,
  setState, setsFromTree, readingLines, outlinePath, repoError } from '../site/core.js';

test('PH-R06 set IDs: time taken and kind, -2 when one matches', () => {
  const t = new Date(2026, 10, 5, 14, 32, 10);
  assert.equal(setId(t, 'Box'), '2026-11-05-1432-box');
  assert.equal(setId(t, 'Box', ['2026-11-05-1432-box']), '2026-11-05-1432-box-2');
  assert.equal(setId(t, 'Box', ['2026-11-05-1432-box', '2026-11-05-1432-box-2']), '2026-11-05-1432-box-3');
  assert.equal(setId(t, 'Stack', ['2026-11-05-1432-box']), '2026-11-05-1432-stack');
});

test('PH-R21, PH-A06 grouping: a gap over 30 s starts a set; untimed photos are one set each', () => {
  const s = (sec) => ({ taken: Date.UTC(2026, 10, 5, 19, 0, sec) });
  const bursts = [];
  for (let b = 0; b < 12; b++) for (let k = 0; k < (b < 4 ? 4 : 3); k++) bursts.push(s(b * 60 + k * 5));
  assert.equal(bursts.length, 40);
  const g = groupByTime(bursts.slice().reverse());
  assert.equal(g.length, 12);
  assert.equal(splitGroup(g, 0, 2).length, 13);
  assert.equal(mergeNext(g, 0).length, 11);
  assert.equal(groupByTime([s(0), { taken: null }, { taken: undefined }]).length, 3);
});

test('PH-R12 a long burst splits into runs of 8', () => {
  const g = groupByTime(Array.from({ length: 20 }, (_, i) => ({ taken: i * 1000 })));
  assert.deepEqual(g.map((x) => x.length), [8, 8, 4]);
});

test('PH-R14 photos are shrunk, never enlarged', () => {
  assert.deepEqual(fitSize(4284, 5712), { width: 1536, height: 2048 });
  assert.deepEqual(fitSize(480, 640), { width: 480, height: 640 });
});

test('PH-R14 the time taken is read from EXIF before redrawing', () => {
  // a minimal JPEG: SOI, APP1 Exif with IFD0 → ExifIFD → DateTimeOriginal
  const dt = '2026:11:05 19:28:44\0';
  const tiff = [];
  const w16 = (v) => tiff.push(v & 255, v >> 8), w32 = (v) => { w16(v & 0xFFFF); w16(v >>> 16); };
  tiff.push(0x49, 0x49); w16(42); w32(8); // header, IFD0 at 8
  w16(1); w16(0x8769); w16(4); w32(1); w32(26); w32(0); // IFD0: ExifIFD pointer → 26
  w16(1); w16(0x9003); w16(2); w32(20); w32(44); w32(0); // ExifIFD: DateTimeOriginal at 44
  for (const ch of dt) tiff.push(ch.charCodeAt(0));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xFF, 0xD9]);
  assert.equal(exifTaken(bytes.buffer), new Date(2026, 10, 5, 19, 28, 44).getTime());
  assert.equal(exifTaken(new Uint8Array([0x89, 0x50, 0x4E, 0x47]).buffer), null);
});

test('PH-R30, PH-R32, PH-A04 only Box Ctrl codes set a box ID', () => {
  assert.equal(boxIdFromQr('https://woodwerd.github.io/tool-ctrl/#WW-014'), 'WW-014');
  assert.equal(boxIdFromQr('https://example.com/menu'), null);
  assert.equal(boxIdFromQr('WIFI:S:shop;T:WPA;P:secret;;'), null);
});

test('PH-R31, PH-A05 a stack lists codes bottom to top', () => {
  assert.deepEqual(idsBottomToTop([{ id: 'WW-020', y: 0.2 }, { id: 'WW-003', y: 0.9 }, { id: 'WW-011', y: 0.55 }]), ['WW-003', 'WW-011', 'WW-020']);
});

test('PH-R07, PH-R13 set.json and the commit message', () => {
  const j = setJson({ id: 'x', kind: 'Box', taken: 0, photos: ['1.jpg', '2.jpg'], note: 'bought at Woodcraft', boxIds: ['WW-014'] });
  assert.equal(j.format, 1); assert.equal(j.note, 'bought at Woodcraft'); assert.ok(!('drawer' in j));
  assert.equal(commitMessage('Box', 2, ['WW-014']), 'Box set: 2 photos, WW-014');
  assert.equal(commitMessage('Stack', 1), 'Stack set: 1 photo');
});

test('PH-R41 states', () => {
  assert.equal(setState({ local: true }).text, 'Waiting on this device');
  assert.equal(setState({ hasReading: false }).text, 'Waiting to be read');
  assert.equal(setState({ hasReading: true }).text, 'Read');
  assert.equal(setState({ hasReading: true, readingStatus: 'Nothing read' }).text, 'Nothing read');
  assert.equal(setState({ hasReading: true, proposalStatus: 'Declined' }).text, 'Declined');
});

test('PH-U02 sets come from one tree listing, newest first', () => {
  const tree = [
    { path: 'README.md', type: 'blob' },
    { path: 'sets/2026-11-05-1928-box/1.jpg', type: 'blob', sha: 'a' },
    { path: 'sets/2026-11-05-1928-box/set.json', type: 'blob', sha: 'b' },
    { path: 'sets/2026-11-05-1930-stack/2.jpg', type: 'blob', sha: 'd' },
    { path: 'sets/2026-11-05-1930-stack/1.jpg', type: 'blob', sha: 'c' },
    { path: 'sets/2026-11-05-1930-stack/reading.json', type: 'blob', sha: 'e' },
    { path: 'sets/2026-11-05-1930-stack/thumb.jpg', type: 'blob', sha: 'f' },
  ];
  const s = setsFromTree(tree);
  assert.deepEqual(s.map((x) => x.id), ['2026-11-05-1930-stack', '2026-11-05-1928-box']);
  assert.deepEqual(s[0].photos.map((p) => p.n), [1, 2]);
  assert.equal(s[0].hasReading, true); assert.equal(s[0].thumb, 'f'); assert.equal(s[1].hasReading, false);
});

test('PH-R43, PH-R45 a reading becomes lines with outlines; Guess stays Guess', () => {
  const reading = { format: 1, kind: 'Box', status: 'Read', boxes: [{
    model: { value: 'SYS 4 TL-SORT/3', sure: 'Likely' }, label: null, match: { value: 'WW-016', sure: 'Guess' },
    where: [{ photo: 1, outline: [[0.05, 0.3], [0.95, 0.3], [0.95, 0.8], [0.05, 0.8]] }],
    drawers: [{ drawer: 3, labels: [{ value: 'VISE GRIPS PRY BARS', sure: 'Sure' }, { value: 'PLIERS', sure: 'Sure' }], where: [{ photo: 1, outline: [[0.08, 0.64], [0.92, 0.64], [0.91, 0.79], [0.09, 0.79]] }] }],
  }] };
  const lines = readingLines(reading);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].sure, 'Likely');
  assert.equal(lines[1].text, 'VISE GRIPS PRY BARS · PLIERS'); assert.equal(lines[1].sure, 'Sure'); assert.equal(lines[1].ref, 'D3');
  assert.deepEqual(readingLines({ status: 'Nothing read' }), []);
  const o = outlinePath(lines[1].where[0].outline);
  assert.equal(o.points.split(' ').length, 4); assert.ok(o.dim.startsWith('M0 0H100V100H0Z M8,64'));
  assert.equal(outlinePath([[0, 0], [1, 1]]), null);
});

test('PH-R01 repo names', () => {
  assert.equal(repoError('you/tool-photos'), '');
  assert.notEqual(repoError('https://github.com/x/y'), '');
});
