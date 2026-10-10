import { isAdmin } from "@/lib/board";
import { adminClient, requestUser } from "@/lib/quota";

// Moderation for the site owner: posts that were reported or hidden, plus restore/remove/ban.
// Still no emails or user ids in the response; a ban is applied server-side by post id.

/** Ban by email (so a new account with the same email stays banned) and remove everything they posted. */
async function banUser(db: NonNullable<ReturnType<typeof adminClient>>, userId: string, reason: string) {
  const { data: author } = await db.auth.admin.getUserById(userId);
  const email = author.user?.email?.toLowerCase();
  if (email) await db.from("board_bans").upsert({ email, reason });
  await db.from("board_posts").update({ removed: true }).eq("user_id", userId);
  await db.from("board_replies").update({ removed: true }).eq("user_id", userId);
}

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
  const { data: replies } = await db
    .from("board_replies")
    .select("id,post_id,body,score,reports,hidden,created_at, board_reply_reports(reason)")
    .eq("removed", false)
    .or("hidden.eq.true,reports.gt.0")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  return Response.json({ flagged: data ?? [], recent: recent ?? [], flaggedReplies: replies ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const db = await guard(request);
  if (!db) return Response.json({ error: "Not allowed." }, { status: 403 });
  const b = (await request.json().catch(() => null)) as { id?: number; kind?: string; action?: string } | null;
  const id = Number(b?.id);
  if (!Number.isInteger(id)) return Response.json({ error: "Bad post." }, { status: 400 });

  if (b?.kind === "reply") {
    if (b.action === "restore") {
      await db.from("board_replies").update({ hidden: false, reports: 0 }).eq("id", id);
      await db.from("board_reply_reports").delete().eq("reply_id", id);
    } else if (b.action === "remove") {
      await db.from("board_replies").update({ removed: true }).eq("id", id);
    } else if (b.action === "ban") {
      const { data: r } = await db.from("board_replies").select("user_id").eq("id", id).single();
      if (!r) return Response.json({ error: "Reply not found." }, { status: 404 });
      await banUser(db, r.user_id, `reply ${id}`);
    } else {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    return Response.json({ ok: true });
  }

  if (b?.action === "restore") {
    await db.from("board_posts").update({ hidden: false, reports: 0 }).eq("id", id);
    await db.from("board_reports").delete().eq("post_id", id);
  } else if (b?.action === "remove") {
    await db.from("board_posts").update({ removed: true }).eq("id", id);
  } else if (b?.action === "ban") {
    // Ban the author (by email, so a new account with the same email stays banned) and remove all their posts
    const { data: post } = await db.from("board_posts").select("user_id").eq("id", id).single();
    if (!post) return Response.json({ error: "Post not found." }, { status: 404 });
    await banUser(db, post.user_id, `post ${id}`);
  } else {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
