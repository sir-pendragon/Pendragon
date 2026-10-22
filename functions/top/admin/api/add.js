// POST /top/admin/api/add  { "photos": [ { "full": "<base64 JPEG>", "thumb": "<base64 JPEG>" }, ... ] }  … マイアルバムに写真を追加する(Access 配下)
// 画像の縮小(長辺1600px / 一覧用480px)と位置情報の除去は、管理画面(ブラウザ)側で済んでいる。ここでは形式と大きさを確認して保存する。
// 必要な環境変数: GITHUB_TOKEN(シークレット) / ACCESS_AUD
import { gh, json, guard, readHead, commitAll } from "../../../_lib/admin.js";

const MAX_PHOTOS = 10;                 // 1回の通信回数(サブリクエスト)の上限に収めるため
const MAX_FULL = 2_500_000, MAX_THUMB = 300_000;   // バイト数(デコード後)
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

const decodedSize = b => Math.floor(b.length * 3 / 4) - (b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0);
// JPEG の先頭(FF D8 FF)を確認する。EXIF(APP1)が含まれていないことも確認する。
function checkJpeg(b64){
  const head = atob(b64.slice(0, 4092));   // 先頭の約3KBだけ読む(4の倍数の長さで切る)
  const bytes = Uint8Array.from(head, c => c.charCodeAt(0));
  if (!(bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF)) return "not_jpeg";
  // マーカーを順に読み、EXIF(APP1 = 0xE1)があれば拒否(位置情報の混入を防ぐ)
  let i = 2;
  while (i + 4 < bytes.length && bytes[i] === 0xFF) {
    const m = bytes[i + 1];
    if (m === 0xE1) return "has_exif";
    if (m === 0xDA || m === 0xD9) break;
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  const g = await guard(request, env); if (g) return g;
  let photos;
  try { ({ photos } = await request.json()); } catch { return json({ error: "bad_request" }, 400); }
  if (!Array.isArray(photos) || photos.length === 0 || photos.length > MAX_PHOTOS) return json({ error: "bad_request", detail: "count" }, 400);
  for (const p of photos) {
    if (!p || typeof p.full !== "string" || typeof p.thumb !== "string" || !B64.test(p.full) || !B64.test(p.thumb)) return json({ error: "bad_request", detail: "format" }, 400);
    if (decodedSize(p.full) > MAX_FULL || decodedSize(p.thumb) > MAX_THUMB) return json({ error: "too_large" }, 413);
    const bad = checkJpeg(p.full) || checkJpeg(p.thumb);
    if (bad) return json({ error: bad }, 400);
  }
  try {
    const h = await readHead(env);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);      // 例: 20261022183700
    const names = photos.map((_, i) => `album/${stamp}-${i + 1}-${Math.random().toString(36).slice(2, 6)}.jpg`);
    const entries = [];
    for (let i = 0; i < photos.length; i++) {
      const full = await gh(env, "/git/blobs", "POST", { content: photos[i].full, encoding: "base64" });
      const thumb = await gh(env, "/git/blobs", "POST", { content: photos[i].thumb, encoding: "base64" });
      entries.push({ path: "top/" + names[i], sha: full.sha }, { path: "top/" + names[i].replace("album/", "album/t/"), sha: thumb.sha });
    }
    const list = [...h.list, ...names];
    await commitAll(env, h, list, entries, `マイアルバム: 写真${photos.length}枚を設定画面から追加`);
    return json({ ok: true, added: names, list });
  } catch (e) { return json({ error: "github", status: e.status || 0 }, 502); }
}
export async function onRequest() { return json({ error: "method_not_allowed" }, 405); }
