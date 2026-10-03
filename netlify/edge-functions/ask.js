/* "Ask GrowthSure" — the AI assistant behind the Ask tab.
 *
 * This edge function is the only place the Anthropic API key lives. It owns the
 * system prompt, the tool list and the model settings; the browser only sends
 * the conversation so far. Tools are run in the browser by the app's own
 * calculators (index.html), so the assistant always quotes exactly the figures
 * the rest of the app shows, and there is one copy of every rate and threshold.
 *
 * Edge functions (not regular functions) because regular Netlify functions are
 * cut off after 10 seconds even while streaming; an edge function can keep a
 * stream open for as long as the reply takes.
 *
 * Set ANTHROPIC_API_KEY in Netlify: Site configuration → Environment variables.
 */
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";

const MODEL = "claude-opus-5-5";

const ALLOWED_ORIGINS = [
  /^https:\/\/finance\.growthsure\.com\.au$/,
  /^https:\/\/[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/, // deploy previews and branch deploys
  /^http:\/\/localhost(:\d+)?$/,
];

const MAX_MESSAGES = 80;          // ~40 exchanges, then the client asks to start over
const MAX_BODY_BYTES = 120_000;
const MAX_USER_TEXT = 2_000;
const ALLOWED_BLOCKS = {
  user: new Set(["text", "tool_result"]),
  assistant: new Set(["text", "tool_use", "thinking", "redacted_thinking", "fallback"]),
};

const SYSTEM_PROMPT = `You are the GrowthSure Finance assistant, built into the GrowthSure Finance app. GrowthSure Finance is a mortgage broking firm at Shop 1, 58–62 Fitzwilliam Road, Old Toongabbie NSW 2146, phone 02 8677 6200, web growthsure.com.au. The people talking to you are members of the public: first home buyers, upgraders, investors and existing borrowers thinking about refinancing, anywhere in Australia.

Your job is to help them understand their situation and the numbers, answer home-loan questions in plain English, and — when they would benefit from it — connect them with a GrowthSure broker.

## What you can do
- Explain how home loans work: deposits, LVR, LMI, offset and redraw, fixed vs variable, interest-only, comparison rates, pre-approval, the steps from offer to settlement, refinancing, and what documents a broker usually needs.
- Run the app's calculators through your tools: repayments, stamp duty for every state and territory, indicative borrowing power, government help (grants, duty concessions, the 5% Deposit Scheme and Help to Buy caps), and the latest RBA and market updates.
- Arrange a callback from a broker with the request_callback tool.

Always use a tool for any dollar figure, rate, cap, threshold or date the tools cover — never calculate duty, repayments or borrowing power yourself, and never rely on your own memory of rates, grants or concessions, because they change often. The tools hold figures GrowthSure verifies against the RBA, each state revenue office, the ATO and Housing Australia. If the person hasn't given you a number a tool needs, ask for it, or use a clearly stated example value and say so. If something isn't covered by your tools (a specific lender's policy, today's advertised rates, a niche scheme), say you don't have a verified figure and offer a broker callback rather than guessing.

## Rules you must follow
GrowthSure is a regulated credit business, so you give general information only — never credit assistance:
- Do not recommend, rank or name a particular lender or loan product as suitable for the person, and do not tell them to apply for, refinance into, or stay in a particular loan. You can explain the factors that matter and say a broker will compare options across GrowthSure's lender panel against their needs.
- Do not say or imply anyone will be approved, or that an estimate is what a lender will lend. Borrowing power and other results are indicative; every lender assesses differently.
- Do not give tax, legal or financial-planning advice. You can explain how something like stamp duty or the first home grant generally works, then suggest they confirm with the relevant professional or the revenue office.
- Never ask for sensitive details: tax file number, Medicare, licence or passport numbers, date of birth, bank logins or account numbers. If someone offers them, tell them not to share those here. For a callback you only need a first name, a phone number or email, a good time to call and a short summary.
- If someone mentions financial hardship or difficulty making repayments, be kind, tell them to contact their lender's hardship team as early as possible, mention the National Debt Helpline (1800 007 007, free), and offer a broker callback.
- Stay on topic: home loans, property buying costs and related money questions. Politely decline anything else.

## Arranging a callback
Offer a callback when the person asks to talk to someone, wants a figure tailored to their situation, is ready to get pre-approved or refinance, or asks something only a broker can answer. Only call request_callback after they've said yes and given you their name and a phone number or email. The app then shows them the details to confirm before anything is sent, so tell them to check and tap Send. If they decline at that step, accept it and carry on.

## How to write
You are being read on a phone. Be warm, direct and brief: a few short paragraphs or a short list, Australian English, whole-dollar amounts with commas. Use **bold** for the key figure. No tables and no headings. After giving numbers, say in one line what the main assumption is and that it's an estimate. Don't repeat the same disclaimer every turn — once per topic is enough.`;

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

// strict: true makes the API guarantee each tool input matches its schema.
// Inputs are a handful of numbers, so eager_input_streaming would buy nothing
// and would switch that validation off; it is deliberately left unset.
const TOOLS = [
  {
    name: "repayment_estimate",
    description:
      "Calculates home loan repayments with the app's repayment calculator: the regular repayment, total interest, how long the loan takes to repay with any extra repayments or offset, and what the repayment becomes if rates rise by 0.25%, 0.50% and 1.00%. Use for any question about repayments, interest cost, offsets, extra repayments, interest-only periods or rate rises.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        loan_amount: { type: "number", description: "Loan amount in dollars." },
        interest_rate_pct: { type: "number", description: "Annual interest rate in percent, e.g. 6.09." },
        term_years: { type: "number", description: "Loan term in years, usually 30." },
        frequency: { type: "string", enum: ["monthly", "fortnightly", "weekly"] },
        interest_only_years: { type: "number", description: "Interest-only period in years at the start of the loan; 0 for principal and interest." },
        offset_balance: { type: "number", description: "Balance kept in an offset account, in dollars; 0 if none." },
        extra_repayment: { type: "number", description: "Extra amount paid each period on top of the minimum, in dollars; 0 if none." },
      },
      required: ["loan_amount", "interest_rate_pct", "term_years", "frequency", "interest_only_years", "offset_balance", "extra_repayment"],
    },
  },
  {
    name: "stamp_duty_estimate",
    description:
      "Calculates transfer (stamp) duty for a purchase in any Australian state or territory with the app's duty calculator, including first home buyer exemptions and concessions, owner-occupier concessions and the foreign buyer surcharge. Returns the duty payable, the full duty before concessions, the concession that applied and state-specific notes.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        state: { type: "string", enum: STATES },
        purchase_price: { type: "number", description: "Purchase price (dutiable value) in dollars." },
        buyer: {
          type: "string",
          enum: ["first_home_buyer", "owner_occupier", "investor"],
          description: "first_home_buyer = buying their first home to live in; owner_occupier = will live in it but has owned before; investor = won't live in it.",
        },
        property: { type: "string", enum: ["established", "new", "vacant_land"] },
        foreign_buyer: { type: "boolean", description: "True if any buyer is a foreign person for duty purposes." },
      },
      required: ["state", "purchase_price", "buyer", "property", "foreign_buyer"],
    },
  },
  {
    name: "borrowing_power_estimate",
    description:
      "Gives an indicative maximum loan with the app's borrowing power tool: estimated net income, assumed living expenses (a benchmark floor unless the person's own figure is higher), commitments, monthly surplus and the assessment rate (product rate plus a 3% buffer, 30-year term). It is a rough guide only; real lender capacity is often 10–15% either way.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        gross_household_income: { type: "number", description: "Combined gross annual income of all applicants before tax, in dollars." },
        applicants: { type: "integer", description: "Number of borrowers, usually 1 or 2." },
        dependants: { type: "integer", description: "Number of financial dependants (children)." },
        monthly_living_expenses: { type: "number", description: "The person's own monthly living expenses in dollars; 0 to use the benchmark floor." },
        monthly_other_repayments: { type: "number", description: "Monthly repayments on other debts — car, personal loans, HECS/HELP — in dollars; 0 if none." },
        credit_card_limits: { type: "number", description: "Total of all credit card limits (not balances), in dollars; 0 if none." },
        product_rate_pct: { type: "number", description: "Expected loan interest rate in percent. If unknown, use the app default of 6.09 and say so." },
      },
      required: ["gross_household_income", "applicants", "dependants", "monthly_living_expenses", "monthly_other_repayments", "credit_card_limits", "product_rate_pct"],
    },
  },
  {
    name: "government_help",
    description:
      "Returns the current first home buyer help for one state or territory: first home owner grant, stamp duty exemption or concession rules, the 5% Deposit Scheme and Help to Buy property price caps, and other schemes, deadlines and recent changes.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { state: { type: "string", enum: STATES } },
      required: ["state"],
    },
  },
  {
    name: "market_update",
    description:
      "Returns the current RBA cash rate, recent rate moves, upcoming RBA decision dates, and the latest home-lending news GrowthSure tracks (rate changes, state budget changes to duty and grants, lending data), each with what it means for borrowers.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "request_callback",
    description:
      "Asks for a GrowthSure broker to contact the person. Only call this after the person has agreed and given their name and a phone number or email. The app shows them the details to confirm before anything is sent; the result says whether they sent it or cancelled.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        first_name: { type: "string" },
        phone: { type: "string", description: "Phone number as given; empty string if they only gave an email." },
        email: { type: "string", description: "Email as given; empty string if they only gave a phone number." },
        best_time: { type: "string", description: "When they'd like to be contacted, e.g. 'weekday mornings'; empty string if not said." },
        summary: {
          type: "string",
          description: "Two or three sentences for the broker: what they're trying to do and the key numbers discussed. No sensitive identifiers.",
        },
      },
      required: ["first_name", "phone", "email", "best_time", "summary"],
    },
  },
];

let client;
function getClient() {
  client ??= new Anthropic({ apiKey: Netlify.env.get("ANTHROPIC_API_KEY") });
  return client;
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
  });
}

function corsHeaders(origin) {
  return origin
    ? { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type", vary: "origin" }
    : {};
}

/* The browser holds the conversation, so check its shape before it reaches the
   API: only user/assistant turns, only the block types this agent produces, and
   no images, documents or operator (system) messages smuggled in. */
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "messages must be a non-empty array";
  if (messages.length > MAX_MESSAGES) return "conversation_too_long";
  if (messages[0].role !== "user") return "first message must be from the user";
  for (const m of messages) {
    if (!m || !ALLOWED_BLOCKS[m.role]) return "invalid role";
    if (typeof m.content === "string") {
      if (m.role === "user" && m.content.length > MAX_USER_TEXT) return "message too long";
      continue;
    }
    if (!Array.isArray(m.content)) return "invalid content";
    for (const b of m.content) {
      if (!b || !ALLOWED_BLOCKS[m.role].has(b.type)) return "invalid content block";
      if (m.role === "user" && b.type === "text" && String(b.text).length > MAX_USER_TEXT) return "message too long";
    }
  }
  return null;
}

function todayInSydney() {
  return new Date().toLocaleDateString("en-AU", {
    timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default async (request) => {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.some((re) => re.test(origin)) ? origin : null;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (origin && !allowedOrigin) return json(403, { error: "forbidden_origin" });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "conversation_too_long" }, allowedOrigin);
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid_json" }, allowedOrigin); }
  const problem = validateMessages(body.messages);
  if (problem) return json(problem === "conversation_too_long" ? 413 : 400, { error: problem }, allowedOrigin);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const apiStream = getClient().beta.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          output_config: { effort: "low" }, // conversational replies; the tools do the maths
          cache_control: { type: "ephemeral" },
          // If a safety classifier declines, the API re-runs the turn on Anthropic's
          // recommended fallback model instead of returning an empty refusal.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "text", text: `Today is ${todayInSydney()} (Sydney time).` },
          ],
          tools: TOOLS,
          messages: body.messages,
        });

        for await (const event of apiStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ t: "text", d: event.delta.text });
          }
        }
        const message = await apiStream.finalMessage();
        if (message.stop_reason === "refusal") {
          // Any partial text already streamed is discarded by the client.
          send({ t: "refusal" });
        } else {
          // The full content (including thinking and fallback blocks) goes back so the
          // client can append it to the conversation unchanged.
          send({ t: "done", stop_reason: message.stop_reason, content: message.content });
        }
      } catch (err) {
        let code = "server_error";
        if (err instanceof Anthropic.RateLimitError) code = "busy";
        else if (err instanceof Anthropic.AuthenticationError) code = "not_configured";
        else if (err instanceof Anthropic.BadRequestError) code = "bad_request";
        else if (err instanceof Anthropic.APIConnectionError) code = "unavailable";
        console.error("ask:", code, err?.message ?? err);
        send({ t: "error", code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(allowedOrigin),
    },
  });
};

export const config = {
  path: "/api/ask",
  // Each chat turn (and each tool round-trip) is one request; this stops one
  // visitor from running up the API bill.
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
