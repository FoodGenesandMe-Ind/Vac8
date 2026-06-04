import type { VacationPlan } from "./types";

const BASE = "/api";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchVacations(): Promise<VacationPlan[]> {
  const res = await fetch(`${BASE}/vacations`);
  return parseJson(res);
}

export async function createVacation(title?: string): Promise<VacationPlan> {
  const res = await fetch(`${BASE}/vacations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title ?? "New Vac8" }),
  });
  return parseJson(res);
}

export async function fetchVacation(id: string): Promise<VacationPlan> {
  const res = await fetch(`${BASE}/vacations/${id}`);
  return parseJson(res);
}

export async function promoteSuggestion(
  vacationId: string,
  suggestionId: string
): Promise<VacationPlan> {
  const res = await fetch(`${BASE}/vacations/${vacationId}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestionId }),
  });
  return parseJson(res);
}

export async function demoteSuggestion(
  vacationId: string,
  suggestionId: string
): Promise<VacationPlan> {
  const res = await fetch(`${BASE}/vacations/${vacationId}/demote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestionId }),
  });
  return parseJson(res);
}

export async function reorderWorkingPlan(
  vacationId: string,
  orderedIds: string[]
): Promise<VacationPlan> {
  const res = await fetch(`${BASE}/vacations/${vacationId}/reorder/working`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  return parseJson(res);
}

export async function reorderSuggestions(
  vacationId: string,
  orderedIds: string[]
): Promise<VacationPlan> {
  const res = await fetch(`${BASE}/vacations/${vacationId}/reorder/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
  return parseJson(res);
}

export type ChatMessage = { id: string; role: string; content: string; createdAt: string };

export async function fetchMessages(vacationId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE}/vacations/${vacationId}/messages`);
  return parseJson(res);
}

export function streamChat(
  vacationId: string,
  message: string,
  handlers: {
    onText?: (chunk: string) => void;
    onPlan?: (plan: VacationPlan) => void;
    onVacationDeleted?: (vacationId: string) => void;
    onTool?: (data: { name: string; status: string }) => void;
    onStatus?: (data: { phase: string; message?: string; tool?: string }) => void;
    onDone?: () => void;
    onError?: (msg: string) => void;
  }
): () => void {
  const controller = new AbortController();

  fetch(`${BASE}/vacations/${vacationId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      handlers.onError?.(`Chat failed: ${res.status}`);
      handlers.onDone?.();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        let event = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data = line.slice(5).trim();
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === "text") handlers.onText?.(parsed.chunk);
          if (event === "plan_updated") handlers.onPlan?.(parsed.plan);
          if (event === "vacation_deleted") handlers.onVacationDeleted?.(parsed.vacationId);
          if (event === "tool") handlers.onTool?.(parsed);
          if (event === "status") handlers.onStatus?.(parsed);
          if (event === "error") handlers.onError?.(parsed.message);
          if (event === "done") handlers.onDone?.();
        } catch {
          /* ignore parse errors */
        }
      }
    }
    handlers.onDone?.();
  }).catch((e) => {
    handlers.onError?.(e instanceof Error ? e.message : String(e));
    handlers.onDone?.();
  });

  return () => controller.abort();
}
