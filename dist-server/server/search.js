export async function searchWeb(query) {
    const key = process.env.SERPER_API_KEY;
    if (!key) {
        return [
            {
                title: "Search unavailable",
                snippet: `Set SERPER_API_KEY in .env to enable web search. Query was: ${query}`,
                link: "",
            },
        ];
    }
    const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 8 }),
    });
    if (!res.ok) {
        throw new Error(`Serper search failed: ${res.status}`);
    }
    const data = (await res.json());
    return (data.organic ?? []).map((o) => ({
        title: o.title ?? "",
        snippet: o.snippet ?? "",
        link: o.link ?? "",
    }));
}
export function buildGoogleFlightsUrl(opts) {
    const params = new URLSearchParams();
    if (opts.origin)
        params.set("tfs", `from ${opts.origin}`);
    const q = [opts.origin, opts.destination, opts.departDate, opts.cabin]
        .filter(Boolean)
        .join(" ");
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(q || "flights")}`;
}
/** Phase 2: swap to amadeus.ts */
export const webSearchProvider = {
    name: "webSearch",
    async fetchQuote(query) {
        const results = await searchWeb(query);
        const text = results.map((r) => `${r.title}: ${r.snippet}`).join("\n");
        const prices = [...text.matchAll(/\$[\d,]+(?:\.\d{2})?/g)].map((m) => parseFloat(m[0].replace(/[$,]/g, "")));
        const priceUsd = prices.length > 0 ? Math.min(...prices) : undefined;
        return { snapshot: text.slice(0, 4000), priceUsd };
    },
};
export function parsePriceFromSnapshot(snapshot) {
    const prices = [...snapshot.matchAll(/\$[\d,]+(?:\.\d{2})?/g)].map((m) => parseFloat(m[0].replace(/[$,]/g, "")));
    return prices.length > 0 ? Math.min(...prices) : undefined;
}
