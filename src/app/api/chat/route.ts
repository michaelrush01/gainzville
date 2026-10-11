import type Anthropic from "@anthropic-ai/sdk";
import { aiConfigured, chatReply, type ChatTurn } from "@/lib/ai";
import { COACH_RULES } from "@/lib/coach";
import { adminClient, limitMessage, requestUser, takeQuota } from "@/lib/quota";
import type { Store } from "@/lib/places";
import { areaFor, readDeals } from "@/lib/deals";
import { chainByKey, type Chain } from "@/lib/restaurants";
import type { Profile } from "@/lib/types";

const MAX_HISTORY = 12;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_plan_change",
    description:
      "Propose a change to the user's saved plan. The app shows it and asks the user to confirm. Only include fields that change.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", enum: ["cut", "maintain", "bulk"] },
        calorieTarget: { type: "number", description: "kcal per day" },
        proteinTarget: { type: "number", description: "grams per day" },
        weeklyBudget: { type: "number", description: "USD per week" },
        training: { type: "string", enum: ["casual", "committed", "dedicated"] },
        summary: { type: "string", description: "One short line describing the change, e.g. 'Bulk at 2,900 kcal, 165 g protein'" },
      },
      required: ["summary"],
    },
  },
  {
    name: "report_bug",
    description:
      "File a bug report when the user says something in the app is broken, crashes, shows an error, or behaves wrongly. Only for app problems, not nutrition questions.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One line, e.g. 'App reloads to home after saving a food on iPhone'" },
        details: { type: "string", description: "What they did, what happened, what they expected, device or browser if known" },
        severity: { type: "string", enum: ["low", "medium", "high"], description: "high = can't use a core feature (scan, log, sign in)" },
      },
      required: ["summary", "details", "severity"],
    },
  },
  {
    name: "highlight_stores",
    description: "Point the map at the nearby stores or restaurants that best fit the answer. Use ids from the provided lists only.",
    input_schema: {
      type: "object",
      properties: { store_ids: { type: "array", items: { type: "string" }, maxItems: 3 } },
      required: ["store_ids"],
    },
  },
];

type Body = {
  messages: ChatTurn[];
  profile: Profile;
  today: { protein: number; calories: number; spent: number };
  stores: Pick<Store, "id" | "name" | "tier" | "kind" | "chain">[];
  place: string | null;
  center?: { lat: number; lng: number } | null;
  /** Last error the app caught in this browser, attached to bug reports */
  lastError?: string | null;
};

export async function POST(request: Request) {
  if (!aiConfigured()) return Response.json({ error: "The coach isn't switched on yet." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Say something first." }, { status: 400 });
  }

  // Keep the conversation short and well-formed: alternating turns, trimmed text, starts with the user
  const history = body.messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (history.length && history[0].role !== "user") history.shift();
  if (!history.length) return Response.json({ error: "Say something first." }, { status: 400 });

  const quota = await takeQuota(request, "chat");
  if (!quota.ok) {
    return Response.json({ error: limitMessage("chat", quota.signedIn), limited: true, signedIn: quota.signedIn }, { status: 429 });
  }

  const p = body.profile;
  const all = body.stores ?? [];
  const stores = all.filter((s) => s.kind !== "food").slice(0, 12);
  // Restaurant details come from our own chain list, never from the request
  const food = all
    .filter((s) => s.kind === "food")
    .map((s) => ({ id: s.id, chain: chainByKey(s.chain) }))
    .filter((r): r is { id: string; chain: Chain } => Boolean(r.chain))
    .slice(0, 10);
  // This week's deals come from our database for the user's area, never from the request
  const c = body.center;
  const deals = c && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? (await readDeals(areaFor(c.lat, c.lng))).slice(0, 12) : [];
  const context = `USER PLAN
Goal: ${p.goal}. Training: ${p.training}. Weight: ${p.weightLb ?? "not given"} lb. Age: ${p.age ?? "not given"}.
Targets: ${p.proteinTarget} g protein, ${p.calorieTarget} kcal per day. Budget: $${p.weeklyBudget}/week.
Today so far: ${Math.round(body.today?.protein ?? 0)} g protein, ${Math.round(body.today?.calories ?? 0)} kcal, $${(body.today?.spent ?? 0).toFixed(2)} spent.
Location: ${body.place ?? "not set"}.
NEARBY STORES (id | name | price tier)
${stores.length ? stores.map((s) => `${s.id} | ${s.name} | ${s.tier}`).join("\n") : "none loaded"}
NEARBY RESTAURANTS (id | chain | best protein order | approx protein, kcal, price)
${food.length ? food.map(({ id, chain: c }) => `${id} | ${c.name} | ${c.order} | ~${c.protein} g, ${c.calories} kcal, ~$${c.price}`).join("\n") : "none loaded"}
THIS WEEK'S DEALS NEAR THE USER (chain | item | deal | price | approx protein | ends)
${deals.length ? deals.map((d) => `${d.chain} | ${d.item} | ${d.deal} | ${d.price_usd != null ? `$${d.price_usd}` : "?"} | ${d.protein_g != null ? `${Math.round(d.protein_g)} g` : "?"} | ${d.valid_to}`).join("\n") : "none found yet"}`;

  try {
    const { text, toolCalls } = await chatReply({
      system: `${COACH_RULES}\n\n${context}`,
      messages: history,
      tools: TOOLS,
      toolAck: (call) =>
        call.name === "propose_plan_change"
          ? "Shown to the user with a Confirm button. It is not applied until they confirm. Briefly tell them what changes and why."
          : call.name === "report_bug"
            ? "Bug report saved and sent to the developer. Thank them in one or two sentences. Don't promise a fix date, and don't suggest workarounds or features unless you're sure the app has them (it has photo, barcode, and label scanning, the coach, the map, deals, and the campus board; it has no manual food entry or food search)."
            : "The map now highlights those stores. Briefly say why they're the pick.",
    });

    const actions: Record<string, unknown>[] = [];
    for (const call of toolCalls) {
      if (call.name === "propose_plan_change") {
        actions.push({ type: "plan", change: sanitizeChange(call.input, p) });
      } else if (call.name === "report_bug") {
        const saved = await saveBugReport(request, call.input, body.lastError ?? null);
        if (saved) actions.push({ type: "bug" });
      } else if (call.name === "highlight_stores") {
        const ids = (call.input.store_ids as string[] | undefined)?.filter((id) => stores.some((s) => s.id === id)) ?? [];
        if (ids.length) actions.push({ type: "stores", ids });
      }
    }
    return Response.json({ reply: text || defaultReply(actions), actions });
  } catch (err) {
    console.error("chat failed", err);
    return Response.json({ error: "The coach is having a moment. Try again." }, { status: 500 });
  }
}

/** Store a bug report from the coach (at most 10 per person or IP per day). */
async function saveBugReport(request: Request, input: Record<string, unknown>, lastError: string | null) {
  const db = adminClient();
  if (!db) return false;
  const user = await requestUser(request, db);
  const who = user?.id ?? (request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown");
  const { data: ok } = await db.rpc("use_quota", { p_bucket: `bug:${who}`, p_max: 10, p_global: "bug:global", p_global_max: 300 });
  if (!ok) return false;
  const severity = ["low", "medium", "high"].includes(input.severity as string) ? (input.severity as string) : "medium";
  const { error } = await db.from("bug_reports").insert({
    user_id: user?.id ?? null,
    summary: String(input.summary ?? "Bug report").slice(0, 200),
    details: String(input.details ?? "").slice(0, 2000),
    severity,
    device: (request.headers.get("user-agent") ?? "").slice(0, 400),
    last_error: lastError ? String(lastError).slice(0, 1000) : null,
  });
  if (error) console.error("bug report failed", error.message);
  return !error;
}

/** Enforce the guardrails on any plan change, whatever the model asked for. */
function sanitizeChange(input: Record<string, unknown>, p: Profile) {
  const floor = p.age != null && p.age < 18 ? 1800 : 1500;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : undefined;
  const change: Record<string, unknown> = { summary: String(input.summary ?? "Update your plan").slice(0, 120) };
  if (["cut", "maintain", "bulk"].includes(input.goal as string)) change.goal = input.goal;
  if (["casual", "committed", "dedicated"].includes(input.training as string)) change.training = input.training;
  const kcal = num(input.calorieTarget, floor, 6000);
  if (kcal) change.calorieTarget = kcal;
  const protein = num(input.proteinTarget, 40, 350);
  if (protein) change.proteinTarget = protein;
  const budget = num(input.weeklyBudget, 10, 500);
  if (budget) change.weeklyBudget = budget;
  return change;
}

function defaultReply(actions: Record<string, unknown>[]) {
  if (actions.some((a) => a.type === "plan")) return "Here's the change. Confirm it below.";
  if (actions.some((a) => a.type === "stores")) return "Here's where I'd go. Check the map.";
  return "Got it.";
}
