import { isBanned } from "@/lib/board";
import { adminClient, requestUser } from "@/lib/quota";

// Vote on, report, or delete (your own) board post.

export async function POST(request: Request) {
  const db = adminClient();
  const user = await requestUser(request, db);
  if (!db || !user) return Response.json({ error: "Sign in to vote or report." }, { status: 401 });

  const b = (await request.json().catch(() => null)) as { id?: number; action?: string; reason?: string } | null;
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Bad post." }, { status: 400 });

  switch (b?.action) {
    case "up":
    case "down":
    case "clear": {
      if (await isBanned(user.email)) return Response.json({ error: "Your account can't vote on the board." }, { status: 403 });
      const value = b.action === "up" ? 1 : b.action === "down" ? -1 : 0;
      const { data, error } = await db.rpc("board_vote", { p_post: id, p_user: user.id, p_value: value });
      if (error) return Response.json({ error: "Couldn't vote." }, { status: 500 });
      return Response.json({ score: data });
    }
    case "report": {
      const { error } = await db.rpc("board_report", { p_post: id, p_user: user.id, p_reason: (b.reason ?? "").slice(0, 200) });
      if (error) return Response.json({ error: "Couldn't report." }, { status: 500 });
      return Response.json({ ok: true });
    }
    case "delete": {
      await db.from("board_posts").update({ removed: true }).eq("id", id).eq("user_id", user.id);
      return Response.json({ ok: true });
    }
    default:
      return Response.json({ error: "Unknown action." }, { status: 400 });
  }
}
