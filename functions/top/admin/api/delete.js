// POST /top/admin/api/delete  { "names": ["album/xxx.jpg", ...] }  … マイアルバムの写真を削除する(Access 配下)
// 必要な環境変数: GITHUB_TOKEN(シークレット) / ACCESS_AUD
import { json, guard, readHead, commitAll, OK_NAME } from "../../../_lib/admin.js";

export async function onRequestPost({ request, env }) {
  const g = await guard(request, env); if (g) return g;
  let names;
  try { ({ names } = await request.json()); } catch { return json({ error: "bad_request" }, 400); }
  if (!Array.isArray(names) || names.length === 0 || names.length > 100 || !names.every(n => typeof n === "string" && OK_NAME.test(n))) return json({ error: "bad_request" }, 400);
  try {
    const h = await readHead(env);
    const gone = h.list.filter(f => names.includes(f));
    if (gone.length === 0) return json({ error: "none", remain: h.list }, 409);
    const remain = h.list.filter(f => !names.includes(f));
    const entries = [];
    gone.forEach(f => { entries.push({ path: "top/" + f, sha: null }); entries.push({ path: "top/" + f.replace("album/", "album/t/"), sha: null }); });
    await commitAll(env, h, remain, entries, `マイアルバム: 写真${gone.length}枚を設定画面から削除`);
    return json({ ok: true, deleted: gone, remain });
  } catch (e) { return json({ error: "github", status: e.status || 0 }, 502); }
}
export async function onRequest() { return json({ error: "method_not_allowed" }, 405); }
