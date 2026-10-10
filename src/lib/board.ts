import "server-only";
import { askStructured, aiConfigured } from "./ai";
import { adminClient } from "./quota";

// Campus deals board, Yik Yak style: posts look anonymous to everyone, but each one is tied
// to an account on the server so moderation and bans work. Nothing here ever sends a
// user id or email to the browser.

export type BoardPost = {
  id: number;
  body: string;
  place: string | null;
  score: number;
  createdAt: string;
  expiresAt: string;
  mine: boolean;
  myVote: -1 | 0 | 1;
  replies: number;
};

export type BoardReply = {
  id: number;
  body: string;
  score: number;
  createdAt: string;
  /** "OP" for the original poster, otherwise "Anon 1", "Anon 2"... in order of first reply */
  author: string;
  mine: boolean;
  myVote: -1 | 0 | 1;
};

type Row = {
  id: number;
  user_id: string;
  body: string;
  place: string | null;
  score: number;
  created_at: string;
  expires_at: string;
};

const COLUMNS = "id,user_id,body,place,score,created_at,expires_at";

function toPost(r: Row, userId: string | null, votes: Map<number, number>, replies: Map<number, number>): BoardPost {
  return {
    id: r.id,
    body: r.body,
    place: r.place,
    score: r.score,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    mine: r.user_id === userId,
    myVote: (votes.get(r.id) ?? 0) as BoardPost["myVote"],
    replies: replies.get(r.id) ?? 0,
  };
}

/** Like Yik Yak's hot feed: votes count for a lot, but newer posts get a head start. */
function hotness(p: BoardPost) {
  const hours = (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000;
  return (p.score + 1) / Math.pow(hours + 2, 1.5);
}

export async function listPosts(area: string, sort: "hot" | "new", userId: string | null): Promise<BoardPost[]> {
  const db = adminClient();
  if (!db) return [];
  const { data } = await db
    .from("board_posts")
    .select(COLUMNS)
    .eq("area", area)
    .eq("hidden", false)
    .eq("removed", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Row[];
  const votes = new Map<number, number>();
  if (userId && rows.length) {
    const { data: mine } = await db
      .from("board_votes")
      .select("post_id,value")
      .eq("user_id", userId)
      .in("post_id", rows.map((r) => r.id));
    for (const v of mine ?? []) votes.set(v.post_id, v.value);
  }
  const replies = new Map<number, number>();
  if (rows.length) {
    const { data: rs } = await db
      .from("board_replies")
      .select("post_id")
      .in("post_id", rows.map((r) => r.id))
      .eq("hidden", false)
      .eq("removed", false);
    for (const r of rs ?? []) replies.set(r.post_id, (replies.get(r.post_id) ?? 0) + 1);
  }
  const posts = rows.map((r) => toPost(r, userId, votes, replies));
  return sort === "hot" ? posts.sort((a, b) => hotness(b) - hotness(a)) : posts;
}

/** A post that can be replied to: visible and not expired. Returns its author for the OP label. */
export async function livePost(postId: number) {
  const db = adminClient();
  if (!db) return null;
  const { data } = await db
    .from("board_posts")
    .select("id,user_id")
    .eq("id", postId)
    .eq("hidden", false)
    .eq("removed", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data as { id: number; user_id: string } | null;
}

export async function listReplies(postId: number, userId: string | null): Promise<BoardReply[] | null> {
  const db = adminClient();
  const post = await livePost(postId);
  if (!db || !post) return null;
  const { data } = await db
    .from("board_replies")
    .select("id,user_id,body,score,hidden,removed,created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(200);
  const rows = data ?? [];
  // Stable per-thread names, counted over every reply (even hidden ones) so labels never shift
  const names = new Map<string, string>([[post.user_id, "OP"]]);
  for (const r of rows) if (!names.has(r.user_id)) names.set(r.user_id, `Anon ${names.size}`);
  const visible = rows.filter((r) => !r.hidden && !r.removed);
  const votes = new Map<number, number>();
  if (userId && visible.length) {
    const { data: mine } = await db
      .from("board_reply_votes")
      .select("reply_id,value")
      .eq("user_id", userId)
      .in("reply_id", visible.map((r) => r.id));
    for (const v of mine ?? []) votes.set(v.reply_id, v.value);
  }
  return visible.map((r) => ({
    id: r.id,
    body: r.body,
    score: r.score,
    createdAt: r.created_at,
    author: names.get(r.user_id) ?? "Anon",
    mine: r.user_id === userId,
    myVote: (votes.get(r.id) ?? 0) as BoardReply["myVote"],
  }));
}

export async function isBanned(email: string | null) {
  const db = adminClient();
  if (!db || !email) return false;
  const { data } = await db.from("board_bans").select("email").eq("email", email).maybeSingle();
  return Boolean(data);
}

export async function isAdmin(userId: string) {
  const db = adminClient();
  if (!db) return false;
  const { data } = await db.from("board_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

// Personal info is blocked outright: phone numbers, emails, social handles, street addresses of homes
const PERSONAL = [
  /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/, // phone number
  /\S+@\S+\.\S+/, // email
  /(^|\s)@[a-z0-9_.]{2,}/i, // @handle
  /\b(venmo|cashapp|cash app|snap(chat)?|insta(gram)?|dm me)\b/i,
];

/** Cheap checks first, then a quick AI review for harassment, hate, or off-topic posts. */
export async function screenPost(body: string, place: string | null, replyTo?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const text = `${body} ${place ?? ""}`;
  if (PERSONAL.some((re) => re.test(text))) {
    return { ok: false, reason: "Posts can't include phone numbers, emails, @handles, or payment apps. Keep it anonymous." };
  }
  if (!aiConfigured()) return { ok: true };
  try {
    const r = await askStructured<{ allowed: boolean; reason: string }>({
      model: "chat",
      maxTokens: 200,
      system: `You moderate an anonymous board where college students share food deals and cheap protein tips near campus.
Allow: deals, promos, prices, free food events, store or restaurant tips, questions about where to find cheap protein, mild opinions about food places. Replies can also be short reactions ("thanks", "still going on?", "it ended") or friendly follow-up questions.
Block: harassment or naming/targeting specific people, hate, threats, sexual content, drugs or alcohol sales, personal info, scams or spam links, anything unrelated to food, groceries, eating, or fitness nutrition.
Return allowed=false with a short, friendly reason (under 20 words) if it should be blocked.`,
      prompt: replyTo ? `Reply: ${body}\nReplying to this post: ${replyTo}` : `Post: ${body}\nPlace tag: ${place ?? "(none)"}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["allowed", "reason"],
        properties: { allowed: { type: "boolean" }, reason: { type: "string" } },
      },
    });
    return r.allowed ? { ok: true } : { ok: false, reason: r.reason || "That post doesn't fit the board's rules." };
  } catch {
    // If the reviewer is down, let it through: downvotes and reports still catch bad posts
    return { ok: true };
  }
}
