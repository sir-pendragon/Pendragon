// POST /top/admin/api/notes  { "ids": ["n7aab1f246c8b", ...] }  … note の記事の一覧(表示順つき)を丸ごと保存する(Access 配下)
// 必要な環境変数: GITHUB_TOKEN(シークレット) / ACCESS_AUD
import { json, guard, readRef, commitText, NOTE_LIST, OK_NOTE } from "../../../_lib/admin.js";

const MAX_NOTES = 30;

export async function onRequestPost({ request, env }) {
  const g = await guard(request, env); if (g) return g;
  let ids;
  try { ({ ids } = await request.json()); } catch { return json({ error: "bad_request" }, 400); }
  if (!Array.isArray(ids) || ids.length > MAX_NOTES || !ids.every(i => typeof i === "string" && OK_NOTE.test(i)) || new Set(ids).size !== ids.length) return json({ error: "bad_request" }, 400);
  try {
    const h = await readRef(env);
    await commitText(env, h, [{ path: NOTE_LIST, content: JSON.stringify(ids, null, 1) + "\n" }], `note: 記事の一覧を設定画面から更新(${ids.length}件)`);
    return json({ ok: true, ids });
  } catch (e) { return json({ error: "github", status: e.status || 0 }, 502); }
}
export async function onRequest() { return json({ error: "method_not_allowed" }, 405); }
