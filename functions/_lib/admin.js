// 管理画面の API(削除・追加)で共有する処理。ここ自体は URL では公開されない(onRequest を持たない)。
export const TEAM_DOMAIN = "dry-moon-298d.cloudflareaccess.com";
export const REPO = "sir-pendragon/Pendragon";
export const BRANCH = "main";
export const LIST = "top/album/album.json";
export const NOTE_LIST = "top/note/notes.json";
export const OK_NOTE = /^n[a-z0-9]{6,30}$/;
export const OK_NAME = /^album\/[A-Za-z0-9_-]+\.jpg$/;

let certCache = { at: 0, keys: [] };
const b64urlToBytes = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function getKeys(){
  if (Date.now() - certCache.at < 3600e3 && certCache.keys.length) return certCache.keys;
  const r = await fetch(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs");
  certCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  return certCache.keys;
}

// Access が付ける署名つきの印(JWT)を検証する。Access の設定漏れで API が素通しになっても、他人は操作できない。
export async function verifyAccess(request, env){
  try {
    const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!jwt || !env.ACCESS_AUD) return false;
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;
    const dec = new TextDecoder();
    const header = JSON.parse(dec.decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(dec.decode(b64urlToBytes(parts[1])));
    if (header.alg !== "RS256") return false;
    const jwk = (await getKeys()).find(k => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const okSig = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!okSig) return false;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return false;
    if (payload.iss !== `https://${TEAM_DOMAIN}`) return false;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    return aud.includes(env.ACCESS_AUD);
  } catch { return false; }
}

export async function gh(env, path, method = "GET", body){
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ura-note-admin", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) { const e = new Error("github"); e.status = r.status; throw e; }
  return r.json();
}

// 最新の main の状態(コミット・ツリー・写真一覧)を読む
export async function readHead(env){
  const ref = await gh(env, `/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const head = await gh(env, `/git/commits/${headSha}`);
  const file = await gh(env, `/contents/${LIST}?ref=${BRANCH}`);
  const list = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\n/g, "")), c => c.charCodeAt(0))));
  return { headSha, baseTree: head.tree.sha, list };
}

// 一覧(album.json)と、追加/削除するファイルを、1回のコミットにまとめて反映する
//  entries: [{ path, sha }]  sha が null なら削除
export async function commitAll(env, { headSha, baseTree }, newList, entries, message){
  const blob = await gh(env, "/git/blobs", "POST", { content: JSON.stringify(newList, null, 1) + "\n", encoding: "utf-8" });
  const tree = [{ path: LIST, mode: "100644", type: "blob", sha: blob.sha }, ...entries.map(e => ({ path: e.path, mode: "100644", type: "blob", sha: e.sha }))];
  const nt = await gh(env, "/git/trees", "POST", { base_tree: baseTree, tree });
  const nc = await gh(env, "/git/commits", "POST", { message, tree: nt.sha, parents: [headSha] });
  await gh(env, `/git/refs/heads/${BRANCH}`, "PATCH", { sha: nc.sha, force: false });
}

// 写真一覧を使わない更新用: main の先頭コミットだけを読む
export async function readRef(env){
  const ref = await gh(env, `/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const head = await gh(env, `/git/commits/${headSha}`);
  return { headSha, baseTree: head.tree.sha };
}

// 文字のファイルを1回のコミットで書き込む  files: [{ path, content }]
export async function commitText(env, { headSha, baseTree }, files, message){
  const tree = [];
  for (const f of files) {
    const blob = await gh(env, "/git/blobs", "POST", { content: f.content, encoding: "utf-8" });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const nt = await gh(env, "/git/trees", "POST", { base_tree: baseTree, tree });
  const nc = await gh(env, "/git/commits", "POST", { message, tree: nt.sha, parents: [headSha] });
  await gh(env, `/git/refs/heads/${BRANCH}`, "PATCH", { sha: nc.sha, force: false });
}

export async function guard(request, env){
  if (!(await verifyAccess(request, env))) return json({ error: "forbidden" }, 403);
  if (!env.GITHUB_TOKEN) return json({ error: "not_configured" }, 500);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return json({ error: "bad_request" }, 400);
  return null;
}
