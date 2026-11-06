// The person's own private photo repo (PH-R01 to PH-R08). Talks only to api.github.com, only for that repo (PH-R08).
// The token goes in a header, never in an address, a file or a log (PH-R04).
import { b64FromBytes, b64FromText, bytesFromB64, readme } from './core.js';

const API = 'https://api.github.com';

// What went wrong, in plain words, and what to do (PH-S10)
export function explain(status, repo, what = 'use') {
  if (status === 0) return { kind: 'offline', text: 'GitHub can\'t be reached. Sets wait on this device and send when the connection is back.' };
  if (status === 401) return { kind: 'auth', text: `GitHub refused the token. It may have expired. Make a new one for ${repo} with Contents read and write, and connect again. Sets wait on this device.` };
  if (status === 403) return { kind: 'rights', text: `The token can't ${what} ${repo}. Give it Contents read and write for this repo. Sets wait on this device.` };
  if (status === 404) return { kind: 'missing', text: `There is no repo ${repo} that this token can see. Check the name, and that the token covers this repo.` };
  if (status === 'public') return { kind: 'public', text: `${repo} is public, so anyone could see your shop. On GitHub, open the repo's Settings, then General, and under Danger Zone change its visibility to private. Then check again.` };
  return { kind: 'other', text: `GitHub answered ${status}. Nothing was lost; sets wait on this device. Try again in a minute.` };
}

export function client(repo, token, fetchFn = (...a) => fetch(...a)) {
  const call = async (path, opts = {}) => {
    let res;
    try {
      res = await fetchFn(`${API}/repos/${repo}${path}`, { ...opts, cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch { return { status: 0 }; }
    let json = null; try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, json };
  };
  const post = (path, body) => call(path, { method: 'POST', body: JSON.stringify(body) });

  // the tip of the default branch, or null for an empty repo
  async function head() {
    const r = await call('');
    if (r.status !== 200) return { error: explain(r.status, repo) };
    if (!r.json.private) return { error: explain('public', repo) }; // PH-R03, before every send
    const branch = r.json.default_branch || 'main';
    const ref = await call(`/git/ref/heads/${branch}`);
    if (ref.status === 404 || ref.status === 409) return { branch, commit: null, tree: null, size: r.json.size };
    if (ref.status !== 200) return { error: explain(ref.status, repo, 'read') };
    const c = await call(`/git/commits/${ref.json.object.sha}`);
    if (c.status !== 200) return { error: explain(c.status, repo, 'read') };
    return { branch, commit: ref.json.object.sha, tree: c.json.tree.sha, size: r.json.size };
  }

  // One commit holding many file changes: { path, bytes } adds, { path, remove: true } deletes
  async function commit(files, message, tries = 3) {
    const h = await head();
    if (h.error) return h;
    if (!h.commit) { // an empty repo has no branch to build on; the contents API makes the first commit
      const first = files.find((f) => f.bytes) || { path: 'README.md', bytes: new TextEncoder().encode(readme(repo)) };
      const r = await call(`/contents/${first.path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64FromBytes(first.bytes) }) });
      if (r.status !== 201 && r.status !== 200) return { error: explain(r.status, repo, 'write to') };
      const rest = files.filter((f) => f !== first);
      return rest.length ? commit(rest, message, tries) : { ok: true };
    }
    const tree = [];
    for (const f of files) {
      if (f.remove) { tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const b = await post('/git/blobs', { content: b64FromBytes(f.bytes), encoding: 'base64' });
      if (b.status !== 201) return { error: explain(b.status, repo, 'write to') };
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.json.sha });
    }
    const t = await post('/git/trees', { base_tree: h.tree, tree });
    if (t.status !== 201) return { error: explain(t.status, repo, 'write to') };
    const c = await post('/git/commits', { message, tree: t.json.sha, parents: [h.commit] });
    if (c.status !== 201) return { error: explain(c.status, repo, 'write to') };
    const u = await call(`/git/refs/heads/${h.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.json.sha }) });
    if (u.status === 200) return { ok: true, sha: c.json.sha };
    if (u.status === 422 && tries > 1) return commit(files, message, tries - 1); // someone else committed meanwhile
    return { error: explain(u.status, repo, 'write to') };
  }

  return {
    head,
    // PH-R01, PH-R03: does it exist, is it private, can this token write?
    async check() {
      const r = await call('');
      if (r.status !== 200) return { error: explain(r.status, repo) };
      return { private: !!r.json.private, canWrite: !!r.json.permissions?.push, name: r.json.full_name || repo, size: r.json.size, empty: r.json.size === 0 };
    },
    // PH-R05
    async ensureReadme() {
      const r = await call('/contents/README.md');
      if (r.status === 200) return { ok: true };
      if (r.status !== 404) return { error: explain(r.status, repo, 'read') };
      return commit([{ path: 'README.md', bytes: new TextEncoder().encode(readme(repo)) }], 'Add README for Photo Ctrl');
    },
    // every file under sets/, in one call (PH-U02)
    async tree() {
      const h = await head();
      if (h.error) return h;
      if (!h.commit) return { tree: [], size: h.size };
      const r = await call(`/git/trees/${h.tree}?recursive=1`);
      if (r.status !== 200) return { error: explain(r.status, repo, 'read') };
      return { tree: r.json.tree, size: h.size, truncated: !!r.json.truncated };
    },
    async json(path) {
      const r = await call(`/contents/${path}`);
      if (r.status === 404) return { missing: true };
      if (r.status !== 200) return { error: explain(r.status, repo, 'read') };
      try { return { json: JSON.parse(new TextDecoder().decode(bytesFromB64(r.json.content))) }; } catch { return { error: { kind: 'unreadable', text: `${path} couldn't be read.` } }; }
    },
    // a photo by its blob sha, as bytes, held only while shown
    async blob(sha) {
      const r = await call(`/git/blobs/${sha}`);
      if (r.status !== 200) return { error: explain(r.status, repo, 'read') };
      return { bytes: bytesFromB64(r.json.content) };
    },
    // PH-R07: one set, one commit
    sendSet(set, message) {
      const files = set.photos.map((p, i) => ({ path: `sets/${set.id}/${i + 1}.jpg`, bytes: p.bytes }));
      files.push({ path: `sets/${set.id}/thumb.jpg`, bytes: set.thumb });
      files.push({ path: `sets/${set.id}/set.json`, bytes: new TextEncoder().encode(JSON.stringify(set.json, null, 2) + '\n') });
      return commit(files, message);
    },
    // PH-R17: removes it from the repo, not from its history
    deleteSet(id, paths) { return commit(paths.map((p) => ({ path: `sets/${id}/${p}`, remove: true })), `Delete set ${id}`); },
  };
}

export { b64FromText };
