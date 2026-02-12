import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: Request) {
  const { question, preceding, prefix, suffix } = await request.json();

  const hasContext = preceding || prefix || suffix;

  if (!question && !hasContext) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const hasTemplate = prefix || suffix; // there's surrounding text on the same line

  const systemPrompt = hasTemplate
    ? `You are an inline writing assistant. The user has a sentence with a blank (___). Fill in the blank and return the COMPLETE sentence. Rules:
- Return the FULL sentence — keep ALL the text before AND after the blank
- NEVER drop the suffix text after the blank — it must appear in your response
- Only replace the ___ part with the correct fact
- No quotes, no explanation, no extra words beyond the sentence`
    : hasContext
      ? "You are an inline writing assistant. Given the writing context, answer in 1-2 concise sentences that continue the flow naturally. No preamble, no hedging."
      : "Answer in 1-2 concise sentences. No preamble, no hedging. Just the direct answer.";

  let userMessage: string;
  if (hasTemplate) {
    const parts: string[] = [];
    if (preceding) parts.push(`Earlier text:\n${preceding}`);
    parts.push(`Complete this sentence by replacing BLANK with the correct fact:\n${prefix}BLANK${suffix}`);
    if (question) parts.push(`Hint — the blank is about: ${question}`);
    userMessage = parts.join("\n\n");
  } else if (hasContext) {
    const parts: string[] = [];
    if (preceding) parts.push(`Context:\n${preceding}`);
    if (question) parts.push(`Resolve: ${question}`);
    else parts.push("What comes next? Fill in the missing value or fact.");
    userMessage = parts.join("\n\n");
  } else {
    userMessage = question;
  }

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() ?? "No answer found.";

  return NextResponse.json({ answer });
}
