import { isAdmin } from "@/lib/board";
import { adminClient, requestUser } from "@/lib/quota";

// Moderation for the site owner: posts that were reported or hidden, plus restore/remove/ban.
// Still no emails or user ids in the response; a ban is applied server-side by post id.

async function guard(request: Request) {
  const db = adminClient();
  const user = await requestUser(request, db);
  if (!db || !user || !(await isAdmin(user.id))) return null;
  return db;
}

export async function GET(request: Request) {
  const db = await guard(request);
  if (!db) return Response.json({ error: "Not allowed." }, { status: 403 });
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data } = await db
    .from("board_posts")
    .select("id,area,body,place,score,reports,hidden,created_at,expires_at, board_reports(reason)")
    .eq("removed", false)
    .or("hidden.eq.true,reports.gt.0")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  const { data: recent } = await db
    .from("board_posts")
    .select("id,area,body,place,score,reports,hidden,created_at,expires_at")
    .eq("removed", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  return Response.json({ flagged: data ?? [], recent: recent ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const db = await guard(request);
  if (!db) return Response.json({ error: "Not allowed." }, { status: 403 });
  const b = (await request.json().catch(() => null)) as { id?: number; action?: string } | null;
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return Response.json({ error: "Bad post." }, { status: 400 });

  if (b?.action === "restore") {
    await db.from("board_posts").update({ hidden: false, reports: 0 }).eq("id", id);
    await db.from("board_reports").delete().eq("post_id", id);
  } else if (b?.action === "remove") {
    await db.from("board_posts").update({ removed: true }).eq("id", id);
  } else if (b?.action === "ban") {
    // Ban the author (by email, so a new account with the same email stays banned) and remove all their posts
    const { data: post } = await db.from("board_posts").select("user_id").eq("id", id).single();
    if (!post) return Response.json({ error: "Post not found." }, { status: 404 });
    const { data: author } = await db.auth.admin.getUserById(post.user_id);
    const email = author.user?.email?.toLowerCase();
    if (email) await db.from("board_bans").upsert({ email, reason: `post ${id}` });
    await db.from("board_posts").update({ removed: true }).eq("user_id", post.user_id);
  } else {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
