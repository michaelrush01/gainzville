import { areaFor } from "@/lib/deals";
import { isBanned, listPosts, screenPost } from "@/lib/board";
import { adminClient, requestUser } from "@/lib/quota";

// Campus deals board. Anyone can read; posting needs an account (shown as anonymous).

const POSTS_PER_DAY = 5;

function point(lat: unknown, lng: unknown) {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? { lat: la, lng: ln } : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const p = point(params.get("lat"), params.get("lng"));
  if (!p) return Response.json({ error: "Bad location." }, { status: 400 });
  const sort = params.get("sort") === "new" ? "new" : "hot";
  const user = await requestUser(request);
  const posts = await listPosts(areaFor(p.lat, p.lng), sort, user?.id ?? null);
  return Response.json({ posts, signedIn: Boolean(user) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const db = adminClient();
  const user = await requestUser(request, db);
  if (!db || !user) return Response.json({ error: "Sign in to post. Posts still show as anonymous." }, { status: 401 });
  if (await isBanned(user.email)) return Response.json({ error: "Your account can't post on the board." }, { status: 403 });

  const b = (await request.json().catch(() => null)) as { lat?: number; lng?: number; body?: string; place?: string; days?: number } | null;
  const p = point(b?.lat, b?.lng);
  const body = (b?.body ?? "").replace(/\s+/g, " ").trim();
  const place = (b?.place ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  const days = Math.min(14, Math.max(1, Math.round(Number(b?.days) || 3)));
  if (!p) return Response.json({ error: "Bad location." }, { status: 400 });
  if (body.length < 3 || body.length > 280) return Response.json({ error: "Posts are 3 to 280 characters." }, { status: 400 });

  const { data: ok } = await db.rpc("use_quota", {
    p_bucket: `board:user:${user.id}`,
    p_max: POSTS_PER_DAY,
    p_global: "board:global",
    p_global_max: 1000,
  });
  if (!ok) return Response.json({ error: `You can post ${POSTS_PER_DAY} times a day. Try again tomorrow.` }, { status: 429 });

  const screened = await screenPost(body, place);
  if (!screened.ok) return Response.json({ error: screened.reason }, { status: 422 });

  const { error } = await db.from("board_posts").insert({
    area: areaFor(p.lat, p.lng),
    user_id: user.id,
    body,
    place,
    expires_at: new Date(Date.now() + days * 86400_000).toISOString(),
  });
  if (error) return Response.json({ error: "Couldn't post. Try again." }, { status: 500 });
  return Response.json({ ok: true });
}
