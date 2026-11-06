// Photo Ctrl: the screens (PH-S01 to PH-S11). Plain DOM, one delegated click handler.
import { KINDS, MAX_PHOTOS, NOTE_MAX, WARN_KB, ASK, repoError, setId, groupByTime, splitGroup, mergeNext, idsBottomToTop,
  setJson, commitMessage, setState, setsFromTree, readingLines, outlinePath, fmtWhen, fmtSize } from './core.js';
import { client } from './github.js';
import * as db from './store.js';
import { prepare, urlFor } from './image.js';
import { findBoxCodes, qrAvailable } from './qr.js';
import { SYSTAINERS } from './systainers.js';

const MODEL = new Map(SYSTAINERS.map((m) => [m.id, m.name]));
const modelName = (id) => MODEL.get(id) || id;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const HINT = { // PH-R11
  Box: 'The front with its label, then the open lid.',
  Stack: 'The whole stack, square on, labels facing you.',
  Inside: 'From above, with names facing up.',
};
const wide = matchMedia('(min-width:768px)');

const S = {
  view: 'list', conn: null, gh: null, problem: null, repoKB: 0, remote: [], cache: new Map(), queue: [],
  filter: 'all', draft: null, drops: null, open: null, line: 0, photo: 0, sending: null, ask: false, privacy: false,
  urls: new Map(), qr: false, connectMsg: null, busy: false,
};

// ---------- start ----------
async function start() {
  S.conn = (await db.getMeta('conn')) || null;
  S.queue = await db.queued();
  for (const r of await db.cached()) S.cache.set(r.id, r);
  S.qr = await qrAvailable();
  if (S.conn) { S.gh = client(S.conn.repo, S.conn.token); refresh(); }
  render();
  addEventListener('online', () => sendAll());
}

async function refresh() {
  if (!S.gh) return;
  const t = await S.gh.tree();
  if (t.error) { S.problem = t.error; render(); return; }
  S.problem = null; S.repoKB = t.size || 0;
  S.remote = setsFromTree(t.tree);
  render();
  if (S.queue.length) sendAll();
}

// ---------- rendering ----------
function leds() {
  const out = [];
  if (!S.conn) out.push(['', 'Not connected']);
  else if (S.problem) out.push(['on-fault', 'Repo problem']);
  else out.push(['on-ok', 'Photo repo']);
  if (S.sending) out.push(['on-busy blink', `Sending ${S.sending.done + 1} of ${S.sending.total}`]);
  else if (S.queue.length) out.push(['on-busy', `Waiting ${S.queue.length}`]);
  else if (S.conn) out.push(['on-ok', 'Sent']);
  $('#leds').innerHTML = out.map(([c, t]) => `<span class="led ${c}"><i></i><span>${esc(t)}</span></span>`).join('');
  const dc = document.querySelector('[data-act="disconnect"]'); if (dc) dc.hidden = !S.conn;
}

function render() {
  leds();
  const v = !S.conn ? (S.view === 'connect' ? connectView() : firstView())
    : S.view === 'new' ? newView() : S.view === 'drop' ? dropView() : S.view === 'set' ? setView() : listView();
  $('#app').innerHTML = (S.ask ? askDialog() : '') + (S.privacy ? privacyDialog() : '') + v;
  hydrate();
}

const tier = (n, title, desc, state, stateCls, body) => `<section class="tier"><div class="tier-h"><span class="n">${n}</span><h2>${esc(title)}</h2><span class="tier-d">${desc}</span><span class="tier-s ${stateCls}">${esc(state)}</span></div><div class="pad">${body}</div></section>`;

function firstView() { // PH-S01
  return tier(1, 'Get started', 'Photos to your own private repo', 'Not connected', 'idle', `
    <p class="lede">Photograph your tool boxes, stacks and drawers. The photos go to a private GitHub repo of your own, and your own Claude reads them into Tool Ctrl.</p>
    <div class="row"><button type="button" class="key go" data-act="connect">Connect a photo repo</button><a class="guidelink" href="guide.html#start">How it works, and making the repo</a></div>
    <div class="health"><b>Nothing leaves this device yet</b><span>Photo Ctrl sends photos only to the repo you connect. It never reads them itself, and WOODWERD never sees them.</span></div>`);
}

function connectView() { // PH-S02
  const m = S.connectMsg;
  return tier(1, 'Connect', 'Your photo repo, not Tool Ctrl\'s', m?.ok ? 'Private · ready' : 'Not connected', m?.ok ? 'ok' : 'idle', `
    <form class="fields" id="connectForm" autocomplete="off">
      <label class="field"><span class="lbl">Photo repo</span><input class="in mono" name="repo" placeholder="you/tool-photos" value="${esc(m?.repo || '')}" required><span class="help">As owner/name. Keep it separate from your Tool Ctrl repo.</span></label>
      <label class="field"><span class="lbl">Token</span><input class="in" name="token" type="password" required><span class="help">A fine-grained token for this one repo, with Contents read and write.</span></label>
    </form>
    ${m ? `<div class="health ${m.ok ? 'ok' : 'bad'}"><b>${esc(m.title)}</b><span>${esc(m.text)}</span></div>` : ''}
    <div class="row"><button type="submit" form="connectForm" class="key go" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Checking' : 'Connect'}</button><button type="button" class="key" data-act="cancel">Cancel</button><span class="sp"></span><a class="guidelink" href="guide.html#token">Making the repo and token</a></div>
    <p class="small">The token stays on this device only. Disconnect deletes it.</p>`);
}

function rowsData() {
  const qIds = new Set(S.queue.map((q) => q.id));
  const local = S.queue.map((q) => ({ id: q.id, kind: q.kind, ids: q.boxIds, note: q.note, drawer: q.drawer, when: q.taken, photos: q.photos.length, st: setState({ local: true, sending: S.sending?.id === q.id }), thumbLocal: q.thumb }));
  const remote = S.remote.filter((r) => !qIds.has(r.id)).map((r) => {
    const c = S.cache.get(r.id) || {};
    const j = c.set || {};
    return { id: r.id, kind: j.kind || kindFromId(r.id), ids: j.boxIds || [], note: j.note || '', drawer: j.drawer, when: j.taken || null, photos: r.photos.length,
      st: { ...setState({ hasReading: r.hasReading, readingStatus: c.reading?.status }) }, remote: r, boxes: c.reading?.boxes?.length || 0 };
  });
  return [...local, ...remote];
}
const kindFromId = (id) => (/-(box|stack|inside)(-\d+)?$/.exec(id)?.[1] || 'box').replace(/^./, (c) => c.toUpperCase());
const FILTERS = { all: () => true, here: (r) => r.st.key === 'local' || r.st.key === 'busy', toread: (r) => r.st.key === 'wait', read: (r) => ['read', 'in', 'dec', 'none'].includes(r.st.key) };

function listView() { // PH-S03 (and PH-S10 above it)
  const rows = rowsData();
  const waiting = rows.filter((r) => r.st.key === 'wait').length;
  const here = rows.filter((r) => r.st.key === 'local' || r.st.key === 'busy').length;
  const shown = rows.filter(FILTERS[S.filter]);
  const p = S.problem;
  const problem = p ? tier(0, 'Photo repo', `<span class="mono">${esc(S.conn.repo)}</span>`, p.kind === 'offline' ? 'Offline' : p.kind === 'public' ? 'Repo is public' : 'Repo problem', p.kind === 'offline' ? 'warn' : 'bad', `
    <div class="health ${p.kind === 'offline' ? 'warn' : 'bad'}"><b>${p.kind === 'public' ? 'Nothing was sent. This repo is public' : p.kind === 'offline' ? 'Not connected to GitHub' : 'Nothing was sent'}</b><span>${esc(p.text)}</span></div>
    <div class="row"><button type="button" class="key go" data-act="recheck">Check again</button><a class="key" href="https://github.com/${esc(S.conn.repo)}" target="_blank" rel="noopener">Open the repo on GitHub</a>${p.kind === 'auth' || p.kind === 'missing' ? '<button type="button" class="key" data-act="reconnect">Connect again</button>' : ''}</div>
    ${here ? `<p class="small"><span class="mono">${here}</span> set${here === 1 ? ' is' : 's are'} waiting on this device. They send once this is fixed.</p>` : ''}`) : '';
  const sendingBar = S.sending ? `<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${S.sending.total}" aria-valuenow="${S.sending.done}" aria-label="Sets sent"><i style="width:${Math.round(100 * S.sending.done / S.sending.total)}%"></i></div><p class="small"><b class="mono">${S.sending.done}</b> sent · sending <span class="mono">${esc(S.sending.id)}</span> · <span class="mono">${S.sending.total - S.sending.done - 1}</span> left. You can keep taking photos.</p>` : '';
  const near = S.repoKB >= WARN_KB;
  return problem + tier(1, 'Sets', 'Newest first', waiting ? `${waiting} to read` : here ? `${here} here` : `${rows.length} sets`, waiting || here ? 'warn' : 'idle', `
    <div class="row">
      <button type="button" class="key go ${wide.matches ? '' : 'wide'}" data-act="${wide.matches ? 'drop' : 'new'}">${wide.matches ? 'Drop in photos' : 'New set'}</button>
      ${wide.matches ? '<button type="button" class="key" data-act="new">New set</button>' : ''}
      <span class="sp"></span>
      <button type="button" class="key" data-act="ask" ${waiting ? '' : 'disabled'}>Read the waiting sets</button>
    </div>
    ${sendingBar}
    <div class="row">
      <span class="segc" role="group" aria-label="Show">${[['all', 'All'], ['here', 'Here'], ['toread', 'To read'], ['read', 'Read']].map(([k, t]) => `<button type="button" data-act="filter" data-v="${k}" aria-pressed="${S.filter === k}">${t}</button>`).join('')}</span>
      <span class="count"><b class="mono">${shown.length}</b> of <b class="mono">${rows.length}</b> sets</span>
    </div>
    ${shown.length ? `<div class="list">${shown.map(rowHtml).join('')}</div>` : `<div class="empty">${rows.length ? 'No sets in this view.' : 'No sets yet. Take a set of photos of one box, one stack, or the inside of a drawer.'}</div>`}
    <p class="small">Photo repo <span class="mono">${fmtSize(S.repoKB)}</span> of GitHub's 1 GB guide.${near ? ' <b class="warntext">Nearly full: see the guide on starting a second photo repo.</b>' : ''} In Tool Ctrl and Declined appear once Tool Ctrl reviews from photos.</p>`);
}

function rowHtml(r) {
  const ids = r.ids?.length ? r.ids.join(' · ') : r.kind === 'Stack' && r.boxes ? `${r.boxes} boxes` : 'No box ID';
  return `<button type="button" class="srow" data-act="open" data-id="${esc(r.id)}">
    <img data-thumb="${esc(r.id)}" alt="">
    <span class="sm"><span class="l1"><span class="kind">${esc(r.kind)}</span><span class="ids">${esc(ids)}${r.drawer ? ' · ' + esc(r.drawer) : ''}</span></span>
    <span class="note">${esc(r.note || r.id)}</span><span class="when">${esc(r.when ? fmtWhen(r.when) : r.id)} · ${r.photos} photo${r.photos === 1 ? '' : 's'}</span></span>
    <span class="st ${r.st.key}">${esc(r.st.text)}</span></button>`;
}

// ---------- taking a set (PH-S04, PH-S05) ----------
function newView() {
  const d = S.draft;
  const thumbs = d.photos.map((p, i) => `<span class="ph-n"><img data-draft="${i}" alt="Photo ${i + 1}"><span>${i + 1}</span><button type="button" class="x" data-act="dropPhoto" data-i="${i}" aria-label="Remove photo ${i + 1}">×</button></span>`).join('');
  const kindSeg = `<span class="segc full" role="group" aria-label="What it shows">${KINDS.map((k) => `<button type="button" data-act="kind" data-v="${k}" aria-pressed="${d.kind === k}">${k}</button>`).join('')}</span>`;
  if (!d.ready) {
    return tier(1, 'New set', 'What does it show?', `${d.photos.length} of ${MAX_PHOTOS}`, 'idle', `
      ${kindSeg}<p class="small">${HINT[d.kind]}</p>
      ${d.errors.map((e) => `<div class="health warn"><b>Can't use a photo</b><span>${esc(e)}</span></div>`).join('')}
      <label class="key ${d.photos.length ? '' : 'go'} shoot ${d.photos.length >= MAX_PHOTOS ? 'off' : ''}">${d.photos.length ? 'Take another photo' : 'Take a photo'}<input type="file" accept="image/*" capture="environment" data-in="camera" hidden ${d.photos.length >= MAX_PHOTOS ? 'disabled' : ''}></label>
      ${d.working ? '<p class="small">Shrinking the photo on this device…</p>' : ''}
      <div class="strip">${thumbs || '<span class="small">Photos you take show here.</span>'}</div>
      ${d.boxIds.length ? `<div class="health ok"><b>Box Ctrl code${d.boxIds.length > 1 ? 's' : ''}: ${esc(d.boxIds.join(', '))}</b><span>Read from the QR code on its label.</span></div>` : ''}
      <div class="row"><button type="button" class="key go" data-act="done" ${d.photos.length ? '' : 'disabled'}>Done</button><label class="key">Choose from library<input type="file" accept="image/*" multiple data-in="library" hidden></label><span class="sp"></span><button type="button" class="key" data-act="cancelSet">Cancel set</button></div>
      <p class="small">Your phone's camera opens at full size, which is what lets labels be read.${S.qr ? '' : ' This browser can\'t read QR codes, so type the box ID on the next screen.'}</p>`);
  }
  return tier(1, 'Set ready', `${esc(d.kind)} · ${d.photos.length} photo${d.photos.length === 1 ? '' : 's'}`, 'On this device', 'idle', `
    <div class="thumbs">${d.photos.map((p, i) => `<img data-draft="${i}" alt="Photo ${i + 1}">`).join('')}</div>
    ${kindSeg}
    <div class="fields">
      <label class="field"><span class="lbl">Box ID${d.kind === 'Stack' ? 's, bottom to top' : ''}</span><input class="in mono" data-in="boxIds" value="${esc(d.boxIds.join(', '))}" placeholder="${d.kind === 'Stack' ? 'WW-003, WW-011' : 'WW-014'}"><span class="help">${d.qrFound ? 'From the QR code on its label. Change it if it\'s wrong.' : 'Optional. Leave it empty if the box has no label yet.'}</span></label>
      <label class="field"><span class="lbl">Note</span><input class="in" data-in="note" maxlength="${NOTE_MAX}" value="${esc(d.note)}" placeholder="Bought 2026-11 at Woodcraft"><span class="help mono" id="noteCount">${d.note.length} / ${NOTE_MAX}</span></label>
      ${d.kind === 'Inside' ? `<label class="field"><span class="lbl">Drawer</span><input class="in mono" data-in="drawer" value="${esc(d.drawer)}" placeholder="D2"><span class="help">Which drawer of the box, if it has drawers.</span></label>` : ''}
    </div>
    <div class="health"><b>Shrunk and cleaned before it's sent</b><span>Each photo was redrawn on this device at no more than 2,048 px, and its location and camera details were left behind.</span></div>
    <div class="row"><button type="button" class="key go" data-act="send">Send</button><button type="button" class="key" data-act="keep">Keep on this device</button><button type="button" class="key" data-act="more">Add photos</button><span class="sp"></span><button type="button" class="key stop" data-act="cancelSet">Delete</button></div>`);
}

function privacyDialog() { // PH-S09, PH-R60
  return `<section class="dlg" role="dialog" aria-labelledby="privH"><h2 id="privH">Before your first send</h2><ul>
    <li>These photos go to your private GitHub repo, <span class="mono">${esc(S.conn.repo)}</span>.</li>
    <li>They show your shop and what's in it.</li>
    <li>Deleting a photo later doesn't remove it from the repo's history.</li>
    <li>Your Claude reads them under your own Claude account.</li></ul>
    <div class="row"><button type="button" class="key go" data-act="privacyOk">Continue</button><button type="button" class="key" data-act="privacyNo">Cancel</button><span class="sp"></span><a class="guidelink" href="guide.html#privacy">Removing photos for good</a></div>
    <p class="small">Shown once on this device.</p></section>`;
}

function askDialog() { // PH-S11, PH-R44
  const n = rowsData().filter((r) => r.st.key === 'wait').length;
  return `<section class="dlg" role="dialog" aria-labelledby="askH"><h2 id="askH">Read the waiting sets</h2>
    <p><span class="mono">${n}</span> set${n === 1 ? ' is' : 's are'} waiting to be read. Your own Claude reads them with the WOODWERD photo skill. Say this to it:</p>
    <div class="say"><q>${esc(ASK)}</q><button type="button" class="key" data-act="copy">Copy</button></div>
    <ol class="steps"><li>Open Claude Code, with the WOODWERD photo skill added.</li><li>Paste the sentence. Claude reads the sets and writes what it found back to your repos.</li><li>Open Tool Ctrl to review. Nothing goes into your inventory until you add it there.</li></ol>
    <div class="row"><a class="guidelink" href="guide.html#skill">Get the skill</a><span class="sp"></span><button type="button" class="key" data-act="askClose">Close</button></div>
    <p class="small">Photo Ctrl doesn't contact Claude. Reading happens under your own Claude account.</p></section>`;
}

// ---------- drop in (PH-S06) ----------
function dropView() {
  const d = S.drops;
  const sets = d.groups;
  const count = sets.reduce((a, g) => a + g.photos.length, 0);
  return tier(1, 'Drop in', 'Grouped by when they were taken', 'On this device', 'idle', `
    <label class="drop" id="dropZone"><span>Drop photos here, or</span><span class="key">Choose photos<input type="file" accept="image/*" multiple data-in="dropFiles" hidden></span></label>
    ${d.working ? `<p class="small">Shrinking ${d.working} photo${d.working === 1 ? '' : 's'} on this device…</p>` : ''}
    ${d.errors.map((e) => `<div class="health warn"><b>Can't open a photo</b><span>${esc(e)} The other photos go on.</span></div>`).join('')}
    ${sets.length ? `<div class="row"><span><b class="mono">${count}</b> photos in <b class="mono">${sets.length}</b> sets. A gap of more than 30 seconds starts a new set.</span><span class="sp"></span><button type="button" class="key" data-act="dropClear">Clear all</button></div>
    <div>${sets.map((g, i) => `<div class="dset"><span class="no mono">${i + 1}</span><div class="body">
      <div class="strip">${g.photos.map((p, j) => `<span class="ph-n"><img data-drop="${i}:${j}" alt="">${j > 0 ? `<button type="button" class="cut" data-act="split" data-i="${i}" data-j="${j}" aria-label="Start a new set here" title="Start a new set here">⟊</button>` : ''}</span>`).join('')}</div>
      <div class="meta">
        <span class="segc" role="group" aria-label="What set ${i + 1} shows">${KINDS.map((k) => `<button type="button" data-act="dkind" data-i="${i}" data-v="${k}" aria-pressed="${g.kind === k}">${k}</button>`).join('')}</span>
        <input class="mini mono" data-in="dids" data-i="${i}" value="${esc(g.boxIds.join(', '))}" placeholder="Box ID" aria-label="Box ID for set ${i + 1}">
        <input class="mini note" data-in="dnote" data-i="${i}" value="${esc(g.note)}" maxlength="${NOTE_MAX}" placeholder="Note" aria-label="Note for set ${i + 1}">
        <span class="small mono">${esc(span(g.photos))}</span><span class="sp"></span>
        ${i < sets.length - 1 ? `<button type="button" class="lnk" data-act="merge" data-i="${i}">Merge with next</button>` : ''}<button type="button" class="lnk" data-act="dremove" data-i="${i}">Remove</button>
      </div></div></div>`).join('')}</div>
    <div class="row"><button type="button" class="key go" data-act="dropSend">Send ${sets.length} set${sets.length === 1 ? '' : 's'}</button><button type="button" class="key" data-act="dropCancel">Cancel</button><span class="small">One commit each. Anything not sent stays on this device.</span></div>` :
    '<div class="row"><button type="button" class="key" data-act="dropCancel">Back to sets</button></div>'}`);
}
const tm = (t) => { const d = new Date(t); return isNaN(d) ? 'no time' : d.toTimeString().slice(0, 8); };
const span = (ps) => { const t = ps.map((p) => p.taken).filter(Number.isFinite); return !t.length ? 'No time' : t.length === 1 ? tm(t[0]) : `${tm(Math.min(...t))} – ${tm(Math.max(...t))}`; };

// ---------- set open (PH-S08, PH-R45) ----------
function setView() {
  const o = S.open;
  const lines = o.reading ? readingLines(o.reading, modelName) : [];
  const line = lines[S.line];
  const where = line?.where?.find((w) => w.photo === S.photo + 1) ? line.where.find((w) => w.photo === S.photo + 1) : null;
  const ol = where ? outlinePath(where.outline) : null;
  const dash = line?.sure === 'Guess' ? '7 5' : 'none';
  const shot = `<div class="shot"><img data-full="${S.photo}" alt="Photo ${S.photo + 1} of ${o.photos.length}">${ol ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${ol.dim}" fill="rgba(12,11,9,.55)" fill-rule="evenodd"/><polygon points="${ol.points}" fill="none" stroke="#0C0B09" stroke-width="5" vector-effect="non-scaling-stroke"/><polygon points="${ol.points}" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke"/></svg><span class="hlt ${ol.top < 0.08 ? 'below' : ''}" style="left:${Math.max(1, ol.left * 100)}%;top:${(ol.top < 0.08 ? ol.bottom : ol.top) * 100}%">${esc(line.text)} · ${esc(line.sure)}</span>` : ''}</div>`;
  const strip = o.photos.length > 1 ? `<div class="strip">${o.photos.map((p, i) => `<button type="button" class="pbtn" data-act="photo" data-i="${i}" aria-pressed="${S.photo === i}" aria-label="Photo ${i + 1}"><img data-full="${i}" alt=""></button>`).join('')}<span class="small">Photo <span class="mono">${S.photo + 1}</span> of ${o.photos.length}</span></div>` : '';
  const st = o.st;
  const reading = !o.reading ? `<div class="health ${o.local ? '' : 'warn'}"><b>${o.local ? 'Not sent yet' : 'Waiting to be read'}</b><span>${o.local ? 'It sends when the repo is reachable.' : 'Ask your Claude to read the waiting sets.'}</span></div>`
    : o.reading.status === 'Nothing read' ? `<div class="health warn"><b>Nothing read</b><span>${esc(o.reading.reason || 'Claude couldn\'t read this set.')} Retake it and send it as a new set.</span></div>`
    : `<h3 class="sub">What Claude read${o.set.kind === 'Stack' ? ', bottom to top' : ''}</h3>
      <div class="rd">${lines.map((l, i) => `<button type="button" class="r ${i === S.line ? 'on' : ''}" data-act="line" data-i="${i}" aria-pressed="${i === S.line}"><span class="p mono">${esc(l.ref)}</span><span class="t">${esc(l.text)}</span><span class="sure ${l.sure[0].toLowerCase()}">${esc(l.sure)}</span>${l.facts.length ? `<span class="m">${l.facts.map((f) => `<span>${esc(f)}</span>`).join('')}</span>` : ''}</button>`).join('')}</div>
      ${line && !where ? `<p class="small">${line.where?.length ? `Shown in photo ${line.where.map((w) => w.photo).join(', ')}.` : 'Not placed in the photo.'}</p>` : ''}
      ${o.reading.notRead?.length ? `<p class="small">Couldn't read: ${esc(o.reading.notRead.join(' '))}</p>` : ''}`;
  return `<button type="button" class="back" data-act="back">‹ Sets</button>` + tier(1, o.set.note || o.id, `${esc(o.set.kind || '')} · ${o.photos.length} photo${o.photos.length === 1 ? '' : 's'}`, st.text, st.key === 'wait' || st.key === 'local' || st.key === 'none' ? 'warn' : st.key === 'in' ? 'ok' : 'idle', `
    <div class="split wide"><div class="col">${shot}${strip}</div><div class="col">
      <dl class="read"><div><dt>Set</dt><dd class="mono">${esc(o.id)}</dd></div><div><dt>Taken</dt><dd class="mono">${esc(o.set.taken ? fmtWhen(o.set.taken) : '')}</dd></div>
      <div><dt>Box IDs</dt><dd class="mono">${esc((o.set.boxIds || []).join(', ') || 'None')}</dd></div>${o.set.drawer ? `<div><dt>Drawer</dt><dd class="mono">${esc(o.set.drawer)}</dd></div>` : ''}${o.reading?.read ? `<div><dt>Read</dt><dd class="mono">${esc(o.reading.read)}</dd></div>` : ''}</dl>
      ${reading}
      ${o.reading && o.reading.status !== 'Nothing read' ? '<div class="health"><b>Not reviewed here</b><span>Review it in Tool Ctrl on a computer or iPad. Nothing enters your inventory until you add it there.</span></div>' : ''}
      <div class="row">${o.reading ? '<a class="key" href="https://woodwerd.github.io/tool-ctrl/">Open Tool Ctrl</a>' : ''}<span class="sp"></span><button type="button" class="key stop" data-act="deleteSet">${o.local ? 'Delete' : 'Delete from repo'}</button></div>
      ${o.local ? '' : '<p class="small">Deleting removes the set from the repo. It stays in the repo\'s history.</p>'}
    </div></div>`);
}

// ---------- images into the page, as they come on screen (PH-U02) ----------
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); loadThumb(e.target); } }, { rootMargin: '200px' }) : null;
function hydrate() {
  document.querySelectorAll('img[data-thumb]').forEach((img) => (io ? io.observe(img) : loadThumb(img)));
  document.querySelectorAll('img[data-draft]').forEach((img) => { img.src = urlOnce(`d${img.dataset.draft}`, S.draft.photos[+img.dataset.draft].thumb); });
  document.querySelectorAll('img[data-drop]').forEach((img) => { const [i, j] = img.dataset.drop.split(':').map(Number); const p = S.drops.groups[i]?.photos[j]; if (p) img.src = urlOnce(`p${p.key}`, p.thumb); });
  document.querySelectorAll('img[data-full]').forEach((img) => loadFull(img, +img.dataset.full));
  const dz = $('#dropZone');
  if (dz) {
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); addDrops([...e.dataTransfer.files]); };
  }
  const f = $('#connectForm'); if (f) f.onsubmit = (e) => { e.preventDefault(); connect(new FormData(f)); };
}
function urlOnce(key, bytes) { if (!S.urls.has(key)) S.urls.set(key, urlFor(bytes)); return S.urls.get(key); }
async function loadThumb(img) {
  const id = img.dataset.thumb;
  const q = S.queue.find((x) => x.id === id);
  if (q) { img.src = urlOnce(`t${id}`, q.thumb); return; }
  let c = S.cache.get(id);
  const r = S.remote.find((x) => x.id === id);
  if (!r) return;
  if (!c || (!c.set) || (r.hasReading && !c.reading)) c = await fill(r);
  if (c?.thumb) img.src = urlOnce(`t${id}`, c.thumb);
  else if (r.photos[0]) { const b = await S.gh.blob(r.photos[0].sha); if (b.bytes) img.src = urlOnce(`t${id}`, b.bytes); }
}
// set.json, reading.json and the thumbnail of a set from the repo, kept in this device's cache
async function fill(r) {
  const c = { ...(S.cache.get(r.id) || { id: r.id }) };
  if (!c.set) { const j = await S.gh.json(`sets/${r.id}/set.json`); if (j.json) c.set = j.json; }
  if (r.hasReading && !c.reading) { const j = await S.gh.json(`sets/${r.id}/reading.json`); if (j.json) c.reading = j.json; }
  if (!c.thumb && r.thumb) { const b = await S.gh.blob(r.thumb); if (b.bytes) c.thumb = b.bytes; }
  S.cache.set(r.id, c); await db.putCached(c);
  if (S.view === 'list') { const row = document.querySelector(`.srow[data-id="${CSS.escape(r.id)}"]`); if (row) row.outerHTML = rowHtml(rowsData().find((x) => x.id === r.id)); hydrate(); }
  return c;
}
async function loadFull(img, i) {
  const o = S.open; if (!o) return;
  const key = `f${o.id}:${i}`;
  if (S.urls.has(key)) { img.src = S.urls.get(key); return; }
  const bytes = o.local ? o.photos[i].bytes : (await S.gh.blob(o.photos[i].sha)).bytes; // held only while shown
  if (bytes) { S.urls.set(key, urlFor(bytes)); img.src = S.urls.get(key); }
}
function dropUrls(prefix) { for (const [k, u] of S.urls) if (k.startsWith(prefix)) { URL.revokeObjectURL(u); S.urls.delete(k); } }

// ---------- actions ----------
async function connect(fd) { // PH-R01, PH-R03, PH-R05
  const repo = String(fd.get('repo') || '').trim(), token = String(fd.get('token') || '').trim();
  const bad = repoError(repo);
  if (bad) { S.connectMsg = { repo, ok: false, title: 'Check the repo name', text: bad }; render(); return; }
  S.busy = true; S.connectMsg = { repo }; render();
  const gh = client(repo, token);
  const c = await gh.check();
  S.busy = false;
  if (c.error) { S.connectMsg = { repo, ok: false, title: 'Can\'t connect', text: c.error.text }; render(); return; }
  if (!c.private) { S.connectMsg = { repo, ok: false, title: 'This repo is public', text: `Anyone could see your shop. Make ${repo} private on GitHub (Settings, General, Danger Zone), then connect again.` }; render(); return; }
  if (!c.canWrite) { S.connectMsg = { repo, ok: false, title: 'The token can\'t add photos', text: `Give the token Contents read and write for ${repo}.` }; render(); return; }
  const rd = await gh.ensureReadme();
  if (rd.error) { S.connectMsg = { repo, ok: false, title: 'Can\'t write to the repo', text: rd.error.text }; render(); return; }
  S.conn = { repo: c.name, token }; S.gh = client(c.name, token);
  await db.setMeta('conn', S.conn); await db.clearCache(); S.cache.clear(); db.askToKeep();
  S.view = 'list'; S.connectMsg = null; render(); refresh();
}

function newDraft() { return { kind: 'Box', photos: [], boxIds: [], codes: [], note: '', drawer: '', errors: [], ready: false, working: false, qrFound: false }; }

async function addToDraft(files) {
  const d = S.draft; d.working = true; d.errors = []; render();
  for (const f of files) {
    if (d.photos.length >= MAX_PHOTOS) { d.errors.push(`A set holds up to ${MAX_PHOTOS} photos.`); break; }
    const p = await prepare(f);
    if (p.error) { d.errors.push(p.error); continue; }
    d.photos.push(p);
    for (const c of await findBoxCodes(p.bytes, p.height)) { d.codes.push(c); d.qrFound = true; }
  }
  d.boxIds = d.kind === 'Stack' ? idsBottomToTop(d.codes) : [...new Set(d.codes.map((c) => c.id))];
  d.working = false; render();
}

async function addDrops(files) {
  const d = S.drops; d.working = files.length; d.errors = []; render();
  const flat = d.groups.flatMap((g) => g.photos);
  for (const f of files) {
    const p = await prepare(f);
    d.working--;
    if (p.error) { d.errors.push(p.error); continue; }
    p.key = Math.random().toString(36).slice(2);
    p.codes = await findBoxCodes(p.bytes, p.height);
    flat.push(p);
  }
  d.groups = groupByTime(flat).map((photos) => groupMeta(photos));
  d.working = 0; render();
}
function groupMeta(photos, kind = 'Box') {
  const codes = photos.flatMap((p) => p.codes || []);
  return { photos, kind, note: '', boxIds: kind === 'Stack' ? idsBottomToTop(codes) : [...new Set(codes.map((c) => c.id))] };
}

const parseIds = (s) => String(s || '').split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{1,6}-\d{1,5}$/.test(x));

async function queueSet({ kind, photos, note, drawer, boxIds }) {
  const taken = photos.map((p) => p.taken).filter(Number.isFinite)[0] ?? Date.now();
  const used = [...S.remote.map((r) => r.id), ...S.queue.map((q) => q.id)];
  const id = setId(taken, kind, used);
  const json = setJson({ id, kind, taken, photos: photos.map((_, i) => `${i + 1}.jpg`), note, drawer, boxIds });
  const q = { id, kind, taken: json.taken, note, drawer, boxIds, json, photos: photos.map((p) => ({ bytes: p.bytes })), thumb: photos[0].thumb, created: Date.now() };
  await db.putQueued(q); S.queue = await db.queued();
}

async function sendAll() { // PH-R16, PH-R23: in order, one commit each, stop at a failure
  if (S.sending || !S.gh || !S.queue.length) return;
  if (!(await db.getMeta('privacySeen'))) { S.privacy = true; render(); return; }
  const list = S.queue.slice().sort((a, b) => a.created - b.created);
  S.sending = { total: list.length, done: 0, id: list[0].id };
  for (const q of list) {
    S.sending.id = q.id; render();
    const r = await S.gh.sendSet(q, commitMessage(q.kind, q.photos.length, q.boxIds));
    if (r.error) { S.problem = r.error; break; }
    await db.delQueued(q.id);
    const c = { id: q.id, set: q.json, thumb: q.thumb }; S.cache.set(q.id, c); await db.putCached(c);
    S.queue = await db.queued(); S.sending.done++;
  }
  S.sending = null; render();
  if (!S.problem) refresh();
}

async function openSet(id) {
  const q = S.queue.find((x) => x.id === id);
  if (q) S.open = { id, local: true, set: q.json, photos: q.photos, reading: null, st: setState({ local: true }) };
  else {
    const r = S.remote.find((x) => x.id === id); if (!r) return;
    const c = await fill(r);
    S.open = { id, local: false, set: c.set || { kind: kindFromId(id) }, photos: r.photos, reading: c.reading || null, files: r, st: setState({ hasReading: r.hasReading, readingStatus: c.reading?.status }) };
  }
  S.line = 0; S.photo = firstPhotoOf(0); S.view = 'set'; render(); scrollTo(0, 0);
}
const firstPhotoOf = (i) => { const l = S.open?.reading ? readingLines(S.open.reading, modelName)[i] : null; return l?.where?.[0] ? l.where[0].photo - 1 : 0; };

async function deleteSet() { // PH-R17
  const o = S.open;
  if (o.local) { if (!confirm('Delete this set from this device? It hasn\'t been sent.')) return; await db.delQueued(o.id); S.queue = await db.queued(); }
  else {
    if (!confirm('Delete this set from your photo repo? It stays in the repo\'s history; the guide explains removing it for good.')) return;
    const paths = [...o.files.photos.map((p) => `${p.n}.jpg`), 'set.json', ...(o.files.thumb ? ['thumb.jpg'] : []), ...(o.files.hasReading ? ['reading.json'] : [])];
    const r = await S.gh.deleteSet(o.id, paths);
    if (r.error) { alert(r.error.text); return; }
    await db.delCached(o.id); S.cache.delete(o.id);
  }
  dropUrls(`f${o.id}`); S.open = null; S.view = 'list'; render(); refresh();
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, i = +b.dataset.i;
  const d = S.draft, g = S.drops;
  switch (a) {
    case 'connect': case 'reconnect': S.view = 'connect'; if (a === 'reconnect') { S.connectMsg = { repo: S.conn.repo }; S.conn = null; S.gh = null; await db.delMeta('conn'); } break;
    case 'cancel': S.view = 'list'; S.connectMsg = null; break;
    case 'recheck': await refresh(); return;
    case 'filter': S.filter = b.dataset.v; break;
    case 'new': S.draft = newDraft(); S.view = 'new'; break;
    case 'kind': d.kind = b.dataset.v; d.boxIds = d.kind === 'Stack' ? idsBottomToTop(d.codes) : [...new Set(d.codes.map((c) => c.id))]; break;
    case 'dropPhoto': d.photos.splice(i, 1); dropUrls('d'); break;
    case 'done': d.ready = true; break;
    case 'more': d.ready = false; break;
    case 'cancelSet': if (d.photos.length && !confirm('Delete these photos? They haven\'t been sent.')) return; S.draft = null; dropUrls('d'); S.view = 'list'; break;
    case 'keep': case 'send': await queueSet(d); S.draft = null; dropUrls('d'); S.view = 'list'; render(); if (a === 'send') sendAll(); return;
    case 'privacyOk': await db.setMeta('privacySeen', true); S.privacy = false; render(); sendAll(); return;
    case 'privacyNo': S.privacy = false; break;
    case 'ask': S.ask = true; scrollTo(0, 0); break;
    case 'askClose': S.ask = false; break;
    case 'copy': try { await navigator.clipboard.writeText(ASK); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; } return;
    case 'drop': S.drops = { groups: [], errors: [], working: 0 }; S.view = 'drop'; break;
    case 'dkind': g.groups[i] = { ...groupMeta(g.groups[i].photos, b.dataset.v), note: g.groups[i].note }; break;
    case 'split': g.groups = splitGroup(g.groups.map((x) => x.photos), i, +b.dataset.j).map((p) => groupMeta(p)); break;
    case 'merge': g.groups = mergeNext(g.groups.map((x) => x.photos), i).map((p) => groupMeta(p)); break;
    case 'dremove': g.groups.splice(i, 1); break;
    case 'dropClear': g.groups = []; dropUrls('p'); break;
    case 'dropCancel': if (g.groups.length && !confirm('Leave without sending? These photos aren\'t kept.')) return; S.drops = null; dropUrls('p'); S.view = 'list'; break;
    case 'dropSend': for (const x of g.groups) await queueSet(x); S.drops = null; dropUrls('p'); S.view = 'list'; render(); sendAll(); return;
    case 'open': await openSet(b.dataset.id); return;
    case 'back': if (S.open) dropUrls(`f${S.open.id}`); S.open = null; S.view = 'list'; break;
    case 'line': S.line = i; S.photo = firstPhotoOf(i); break;
    case 'photo': S.photo = i; break;
    case 'deleteSet': await deleteSet(); return;
    case 'disconnect': if (!confirm('Disconnect? The token is deleted from this device. Sets not yet sent stay here.')) return; await db.delMeta('conn'); S.conn = null; S.gh = null; S.remote = []; break;
    default: return;
  }
  render();
});

document.addEventListener('change', (e) => {
  const t = e.target, k = t.dataset?.in; if (!k) return;
  if (k === 'camera' || k === 'library') { addToDraft([...t.files]); t.value = ''; }
  else if (k === 'dropFiles') { addDrops([...t.files]); t.value = ''; }
});
document.addEventListener('input', (e) => {
  const t = e.target, k = t.dataset?.in; if (!k) return;
  if (k === 'note') { S.draft.note = t.value.slice(0, NOTE_MAX); const c = $('#noteCount'); if (c) c.textContent = `${S.draft.note.length} / ${NOTE_MAX}`; }
  else if (k === 'drawer') S.draft.drawer = t.value.trim().toUpperCase();
  else if (k === 'boxIds') S.draft.boxIds = parseIds(t.value);
  else if (k === 'dids') S.drops.groups[+t.dataset.i].boxIds = parseIds(t.value);
  else if (k === 'dnote') S.drops.groups[+t.dataset.i].note = t.value.slice(0, NOTE_MAX);
});
wide.addEventListener?.('change', () => S.view === 'list' && render());

start();
