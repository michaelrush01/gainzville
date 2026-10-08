import type Anthropic from "@anthropic-ai/sdk";
import { aiConfigured, chatReply, type ChatTurn } from "@/lib/ai";
import { COACH_RULES } from "@/lib/coach";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import type { Store } from "@/lib/places";
import type { Profile } from "@/lib/types";

const DAILY_MESSAGES = 60;
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
    name: "highlight_stores",
    description: "Point the map at the nearby stores that best fit the answer. Use ids from the provided store list only.",
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
  stores: Pick<Store, "id" | "name" | "tier">[];
  place: string | null;
};

export async function POST(request: Request) {
  if (!aiConfigured()) return Response.json({ error: "The coach isn't switched on yet." }, { status: 503 });

  const limit = checkLimit(`chat:${clientIp(request)}`, DAILY_MESSAGES);
  if (!limit.ok) return Response.json({ error: "Daily chat limit reached. Come back tomorrow." }, { status: 429 });

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

  const p = body.profile;
  const stores = (body.stores ?? []).slice(0, 15);
  const context = `USER PLAN
Goal: ${p.goal}. Training: ${p.training}. Weight: ${p.weightLb ?? "not given"} lb. Age: ${p.age ?? "not given"}.
Targets: ${p.proteinTarget} g protein, ${p.calorieTarget} kcal per day. Budget: $${p.weeklyBudget}/week.
Today so far: ${Math.round(body.today?.protein ?? 0)} g protein, ${Math.round(body.today?.calories ?? 0)} kcal, $${(body.today?.spent ?? 0).toFixed(2)} spent.
Location: ${body.place ?? "not set"}.
NEARBY STORES (id | name | price tier)
${stores.length ? stores.map((s) => `${s.id} | ${s.name} | ${s.tier}`).join("\n") : "none loaded"}`;

  try {
    const { text, toolCalls } = await chatReply({
      system: `${COACH_RULES}\n\n${context}`,
      messages: history,
      tools: TOOLS,
      toolAck: (call) =>
        call.name === "propose_plan_change"
          ? "Shown to the user with a Confirm button. It is not applied until they confirm. Briefly tell them what changes and why."
          : "The map now highlights those stores. Briefly say why they're the pick.",
    });

    const actions: Record<string, unknown>[] = [];
    for (const call of toolCalls) {
      if (call.name === "propose_plan_change") {
        actions.push({ type: "plan", change: sanitizeChange(call.input, p) });
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
