/**
 * A short brief over findings that were already computed.
 *
 * The division of labour is the whole design. `lib/insights.ts` produces the facts —
 * every figure is arithmetic over the reader's own rows. This asks a model to do the
 * one thing it is actually better at than `reduce`: decide what matters most today
 * and say it in two or three sentences, the way a bookkeeper would open a call.
 *
 * It is handed the findings and told, in the strongest terms the prompt allows, that
 * it may not introduce a number of its own. Anything it says that looks like a figure
 * came from a card sitting directly beneath it, where the reader can check it.
 *
 * Client names are replaced with placeholders before the call and restored after, so
 * the customer list never leaves the machine. The amounts do go out — that is the
 * honest cost of a summary that says anything useful, and it is why this runs on an
 * explicit button press rather than on every dashboard load.
 */

const MODEL = "openai/gpt-oss-120b";

const SYSTEM = `You are a bookkeeper opening a short call with a freelance software
consultant. You are given findings that have ALREADY been calculated from their books.

Write 2–3 sentences, plain and direct, in British English.

Absolute rules:
- NEVER state a number, percentage, date or currency amount that is not already in the
  findings. You are not permitted to calculate, estimate, project or infer any figure.
- Lead with whatever costs them money soonest. Money owed beats housekeeping.
- Refer to clients exactly by the placeholder names given (CLIENT_1, CLIENT_2, …).
- No greeting, no sign-off, no bullet points, no headings. Just the sentences.
- Do not restate every finding. Pick what matters and say what you would do first.
- If the findings are thin, say so briefly rather than padding.`;

export interface BriefInput {
  /** One line per finding, already pseudonymised. */
  findings: string[];
}

export async function writeBrief({ findings }: BriefInput): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  if (!findings.length) throw new Error("Nothing to summarise");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      // Some latitude in wording, none in arithmetic — the figures are fixed by the
      // prompt, so temperature only affects how it reads.
      temperature: 0.3,
      // gpt-oss reasons before it answers, and that thinking is billed against the
      // same budget. A tight cap here returns an empty `content` with the whole
      // allowance spent on reasoning — which is exactly what happened. Keep the
      // reasoning short and leave room for the answer behind it.
      reasoning_effort: "low",
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Findings:\n${findings.map((f) => `- ${f}`).join("\n")}` },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (!text) {
    // Distinguish "ran out of room" from "the model had nothing to say", because the
    // first is a budget to raise and the second is a prompt to fix.
    throw new Error(
      choice?.finish_reason === "length"
        ? "The summary ran out of room before it finished"
        : "The model returned nothing"
    );
  }
  return text;
}
