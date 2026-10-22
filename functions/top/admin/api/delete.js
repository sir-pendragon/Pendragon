// 管理画面(/top/admin/)の「写真を削除」用 API。 POST /top/admin/api/delete  { "names": ["album/01.jpg", ...] }
//
// 守り(二重):
//  1) Cloudflare Access のアプリで /top/admin/* を守る(自分のメールだけ許可)。
//  2) この関数でも、Access が付ける署名つきの印(Cf-Access-Jwt-Assertion)を検証する。
//     Access の設定漏れで、この API が素通しになっても、他人は削除できない。
// 必要な設定(Cloudflare Pages の「環境変数とシークレット」):
//  - GITHUB_TOKEN : GitHub の Fine-grained token(Pendragon リポジトリの Contents: Read and write)。シークレットとして保存
//  - ACCESS_AUD   : Access アプリの「Application Audience (AUD) Tag」
const TEAM_DOMAIN = "dry-moon-298d.cloudflareaccess.com";
const REPO = "sir-pendragon/Pendragon";
const BRANCH = "main";
const LIST = "top/album/album.json";
const OK_NAME = /^album\/[A-Za-z0-9_-]+\.jpg$/;

let certCache = { at: 0, keys: [] };

const b64urlToBytes = s => {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function getKeys(){
  if (Date.now() - certCache.at < 3600e3 && certCache.keys.length) return certCache.keys;
  const r = await fetch(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("certs");
  certCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  return certCache.keys;
}

async function verifyAccess(request, env){
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt || !env.ACCESS_AUD) return false;
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  const dec = new TextDecoder();
  let header, payload;
  try { header = JSON.parse(dec.decode(b64urlToBytes(parts[0]))); payload = JSON.parse(dec.decode(b64urlToBytes(parts[1]))); } catch { return false; }
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
}

async function gh(env, path, method = "GET", body){
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ura-note-admin", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) { const e = new Error("github"); e.status = r.status; throw e; }
  return r.json();
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyAccess(request, env).catch(() => false))) return json({ error: "forbidden" }, 403);
  if (!env.GITHUB_TOKEN) return json({ error: "not_configured" }, 500);
  if (!(request.headers.get("content-type") || "").includes("application/json")) return json({ error: "bad_request" }, 400);
  let names;
  try { ({ names } = await request.json()); } catch { return json({ error: "bad_request" }, 400); }
  if (!Array.isArray(names) || names.length === 0 || names.length > 100 || !names.every(n => typeof n === "string" && OK_NAME.test(n))) return json({ error: "bad_request" }, 400);

  try {
    const ref = await gh(env, `/git/ref/heads/${BRANCH}`);
    const headSha = ref.object.sha;
    const head = await gh(env, `/git/commits/${headSha}`);
    const file = await gh(env, `/contents/${LIST}?ref=${BRANCH}`);
    const current = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\n/g, "")), c => c.charCodeAt(0))));
    const gone = current.filter(f => names.includes(f));
    if (gone.length === 0) return json({ error: "none", remain: current }, 409);
    const remain = current.filter(f => !names.includes(f));
    const blob = await gh(env, "/git/blobs", "POST", { content: JSON.stringify(remain, null, 1) + "\n", encoding: "utf-8" });
    const tree = [{ path: LIST, mode: "100644", type: "blob", sha: blob.sha }];
    gone.forEach(f => {
      tree.push({ path: "top/" + f, mode: "100644", type: "blob", sha: null });
      tree.push({ path: "top/" + f.replace("album/", "album/t/"), mode: "100644", type: "blob", sha: null });
    });
    const nt = await gh(env, "/git/trees", "POST", { base_tree: head.tree.sha, tree });
    const nc = await gh(env, "/git/commits", "POST", { message: `マイアルバム: 写真${gone.length}枚を設定画面から削除`, tree: nt.sha, parents: [headSha] });
    await gh(env, `/git/refs/heads/${BRANCH}`, "PATCH", { sha: nc.sha, force: false });
    return json({ ok: true, deleted: gone, remain });
  } catch (e) {
    return json({ error: "github", status: e.status || 0 }, 502);
  }
}

export async function onRequest() { return json({ error: "method_not_allowed" }, 405); }
