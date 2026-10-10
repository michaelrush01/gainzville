import { isBanned, listReplies, livePost, screenPost } from "@/lib/board";
import { adminClient, requestUser } from "@/lib/quota";

// Replies on a board post. Anyone can read; replying needs an account (shown as OP or Anon N).

const REPLIES_PER_DAY = 30;

export async function GET(request: Request) {
  const postId = Number(new URL(request.url).searchParams.get("post"));
  if (!Number.isInteger(postId) || postId <= 0) return Response.json({ error: "Bad post." }, { status: 400 });
  const user = await requestUser(request);
  const replies = await listReplies(postId, user?.id ?? null);
  if (!replies) return Response.json({ error: "That post is gone." }, { status: 404 });
  return Response.json({ replies }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const db = adminClient();
  const user = await requestUser(request, db);
  if (!db || !user) return Response.json({ error: "Sign in to reply. Replies still show as anonymous." }, { status: 401 });
  if (await isBanned(user.email)) return Response.json({ error: "Your account can't post on the board." }, { status: 403 });

  const b = (await request.json().catch(() => null)) as { post?: number; body?: string } | null;
  const postId = Number(b?.post);
  const body = (b?.body ?? "").replace(/\s+/g, " ").trim();
  if (!Number.isInteger(postId) || postId <= 0) return Response.json({ error: "Bad post." }, { status: 400 });
  if (body.length < 1 || body.length > 280) return Response.json({ error: "Replies are up to 280 characters." }, { status: 400 });

  const post = await livePost(postId);
  if (!post) return Response.json({ error: "That post is gone." }, { status: 404 });
  const { data: parent } = await db.from("board_posts").select("body").eq("id", postId).single();

  const { data: ok } = await db.rpc("use_quota", {
    p_bucket: `board-reply:user:${user.id}`,
    p_max: REPLIES_PER_DAY,
    p_global: "board-reply:global",
    p_global_max: 3000,
  });
  if (!ok) return Response.json({ error: `You can reply ${REPLIES_PER_DAY} times a day. Try again tomorrow.` }, { status: 429 });

  const screened = await screenPost(body, null, parent?.body ?? "");
  if (!screened.ok) return Response.json({ error: screened.reason }, { status: 422 });

  const { error } = await db.from("board_replies").insert({ post_id: postId, user_id: user.id, body });
  if (error) return Response.json({ error: "Couldn't reply. Try again." }, { status: 500 });
  return Response.json({ ok: true });
}
