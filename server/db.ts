import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { VacationPlan } from "../schema/plan.js";
import { VacationPlanSchema } from "../schema/plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "vac8.db");
export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS vacations (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    vacation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export function listVacations(): VacationPlan[] {
  const rows = db.prepare("SELECT data FROM vacations ORDER BY updated_at DESC").all() as {
    data: string;
  }[];
  return rows.map((r) => VacationPlanSchema.parse(JSON.parse(r.data)));
}

export function getVacation(id: string): VacationPlan | null {
  const row = db.prepare("SELECT data FROM vacations WHERE id = ?").get(id) as
    | { data: string }
    | undefined;
  if (!row) return null;
  return VacationPlanSchema.parse(JSON.parse(row.data));
}

export function saveVacation(plan: VacationPlan): VacationPlan {
  const now = new Date().toISOString();
  const updated = { ...plan, updatedAt: now };
  const data = JSON.stringify(updated);
  db.prepare(
    `INSERT INTO vacations (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(updated.id, data, updated.createdAt, now);
  return VacationPlanSchema.parse(updated);
}

export function deleteVacation(id: string): void {
  db.prepare("DELETE FROM vacations WHERE id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE vacation_id = ?").run(id);
}

export type ChatMessage = { id: string; vacationId: string; role: "user" | "assistant"; content: string; createdAt: string };

export function listMessages(vacationId: string): ChatMessage[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE vacation_id = ? ORDER BY created_at ASC")
    .all(vacationId) as { id: string; vacation_id: string; role: string; content: string; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    vacationId: r.vacation_id,
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.created_at,
  }));
}

export function addMessage(msg: ChatMessage): void {
  db.prepare(
    "INSERT INTO messages (id, vacation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(msg.id, msg.vacationId, msg.role, msg.content, msg.createdAt);
}
