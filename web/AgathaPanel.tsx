import { useEffect, useRef, useState } from "react";
import type { VacationPlan } from "../schema/plan";
import { fetchMessages, streamChat, type ChatMessage } from "./api";

type Props = {
  vacationId: string | null;
  plan: VacationPlan | null;
  onPlanUpdate: (plan: VacationPlan) => void;
  onEnsureVacation: () => Promise<string>;
  onVacationCreated: () => Promise<VacationPlan[]>;
};

export function AgathaPanel({
  vacationId,
  plan,
  onPlanUpdate,
  onEnsureVacation,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vacationId) {
      setMessages([]);
      return;
    }
    fetchMessages(vacationId).then(setMessages);
  }, [vacationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  const greeting =
    messages.length === 0
      ? "What vacation should we plan first? Tell me your story — destinations, timing, and what matters to you."
      : null;

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const vid = await onEnsureVacation();
    setInput("");
    setStreaming(true);
    setStreamBuffer("");

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);

    let assistantText = "";

    streamChat(vid, text, {
      onText: (chunk) => {
        assistantText += chunk;
        setStreamBuffer(assistantText);
      },
      onPlan: (p) => onPlanUpdate(p),
      onDone: () => {
        setStreaming(false);
        if (assistantText) {
          setMessages((m) => [
            ...m,
            {
              id: `local-a-${Date.now()}`,
              role: "assistant",
              content: assistantText,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        setStreamBuffer("");
        fetchMessages(vid).then(setMessages);
      },
      onError: (msg) => {
        setStreaming(false);
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: msg,
            createdAt: new Date().toISOString(),
          },
        ]);
        setStreamBuffer("");
      },
    });
  };

  return (
    <aside className="w-96 shrink-0 flex flex-col bg-surface">
      <div className="p-3 border-b border-border">
        <div className="font-semibold text-sm">Agatha</div>
        <div className="text-xs text-muted">Travel agent</div>
        {plan?.agathaState?.pendingQuestion && (
          <div className="mt-2 text-xs text-amber-400/90 border border-amber-400/30 rounded p-2">
            Waiting for your answer
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {greeting && (
          <div className="text-muted italic">{greeting}</div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === "user" ? "text-right" : "text-left"}
          >
            <div
              className={`inline-block max-w-[95%] p-2 rounded text-left whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-accent/25 text-gray-100"
                  : "bg-panel border border-border"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {streamBuffer && (
          <div className="bg-panel border border-border p-2 rounded whitespace-pre-wrap">
            {streamBuffer}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message Agatha..."
          rows={3}
          className="w-full bg-panel border border-border rounded p-2 text-sm resize-none focus:outline-none focus:border-accent"
          disabled={streaming}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={streaming || !input.trim()}
          className="mt-2 w-full py-2 rounded bg-accent text-white text-sm font-medium disabled:opacity-40"
        >
          {streaming ? "Thinking..." : "Send"}
        </button>
      </div>
    </aside>
  );
}
