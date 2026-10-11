import { isAdmin } from "@/lib/board";
import { adminClient, requestUser } from "@/lib/quota";

// Bug reports for the site owner: list them and update their status.

const STATUSES = ["new", "investigating", "fix drafted", "fixed", "wont fix"];

async function guard(request: Request) {
  const db = adminClient();
  const user = await requestUser(request, db);
  if (!db || !user || !(await isAdmin(user.id))) return null;
  return db;
}

export async function GET(request: Request) {
  const db = await guard(request);
  if (!db) return Response.json({ error: "Not allowed." }, { status: 403 });
  const { data } = await db
    .from("bug_reports")
    .select("id,created_at,summary,details,severity,device,last_error,status,notes")
    .order("created_at", { ascending: false })
    .limit(100);
  return Response.json({ bugs: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const db = await guard(request);
  if (!db) return Response.json({ error: "Not allowed." }, { status: 403 });
  const b = (await request.json().catch(() => null)) as { id?: number; status?: string } | null;
  if (!Number.isInteger(Number(b?.id)) || !STATUSES.includes(b?.status ?? "")) {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  await db.from("bug_reports").update({ status: b!.status }).eq("id", Number(b!.id));
  return Response.json({ ok: true });
}
