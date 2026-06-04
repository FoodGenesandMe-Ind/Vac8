import "dotenv/config";

type Result = { name: string; ok: boolean; detail: string };

async function testAnthropic(): Promise<Result> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { name: "Anthropic", ok: false, detail: "ANTHROPIC_API_KEY missing in .env" };

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
    });
    const text = res.content.find((b) => b.type === "text");
    return {
      name: "Anthropic",
      ok: true,
      detail: `Model ${model} — reply: ${text && text.type === "text" ? text.text.trim().slice(0, 40) : "(no text)"}`,
    };
  } catch (e) {
    return { name: "Anthropic", ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function testOpenAI(): Promise<Result> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { name: "OpenAI", ok: false, detail: "OPENAI_API_KEY missing in .env" };

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: key });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  try {
    const res = await client.chat.completions.create({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
    });
    return {
      name: "OpenAI",
      ok: true,
      detail: `Model ${model} — reply: ${(res.choices[0]?.message?.content ?? "").trim().slice(0, 40)}`,
    };
  } catch (e) {
    return { name: "OpenAI", ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function testSerper(): Promise<Result> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return { name: "Serper", ok: false, detail: "SERPER_API_KEY missing in .env" };

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: "first class flights to Europe fall 2025", num: 3 }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { name: "Serper", ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    const data = (await res.json()) as { organic?: { title?: string }[] };
    const first = data.organic?.[0]?.title ?? "(no results)";
    return { name: "Serper", ok: true, detail: `Search OK — first hit: ${first.slice(0, 60)}` };
  } catch (e) {
    return { name: "Serper", ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log("Vac8 API key check\n");
  const results = await Promise.all([testAnthropic(), testOpenAI(), testSerper()]);

  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    console.log(`       ${r.detail}\n`);
  }

  const agatha = process.env.AGATHA_PROVIDER ?? "anthropic";
  console.log(`AGATHA_PROVIDER=${agatha} (Agatha will use this provider in chat)\n`);

  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main();
