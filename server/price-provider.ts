/** Phase 2: add amadeus.ts, duffel.ts implementations */
export type PriceQuote = {
  snapshot: string;
  priceUsd?: number;
};

export type PriceProvider = {
  name: string;
  fetchQuote: (query: string) => Promise<PriceQuote>;
};
