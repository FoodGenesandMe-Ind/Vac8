import { useCallback, useEffect, useState } from "react";
import type { VacationPlan } from "./types";
import {
  createVacation,
  fetchVacation,
  fetchVacations,
} from "./vac8-api";
import { VacationList } from "./VacationList";
import { PlanDashboard } from "./PlanDashboard";
import { AgathaPanel } from "./AgathaPanel";

export default function App() {
  const [vacations, setVacations] = useState<VacationPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<VacationPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    const list = await fetchVacations();
    setVacations(list);
    setApiError(null);
    return list;
  }, []);

  const loadPlan = useCallback(async (id: string) => {
    const p = await fetchVacation(id);
    setPlan(p);
    setSelectedId(id);
  }, []);

  useEffect(() => {
    refreshList()
      .catch((e) => setApiError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [refreshList]);

  useEffect(() => {
    if (selectedId) loadPlan(selectedId);
    else setPlan(null);
  }, [selectedId, loadPlan]);

  const handleCreate = async () => {
    const v = await createVacation("New Vac8");
    await refreshList();
    setSelectedId(v.id);
    setPlan(v);
  };

  const handlePlanUpdate = (updated: VacationPlan) => {
    setPlan(updated);
    setVacations((prev) =>
      prev.map((v) => (v.id === updated.id ? updated : v))
    );
  };

  const ensureVacation = async (): Promise<string> => {
    if (selectedId) return selectedId;
    const v = await createVacation("My first Vac8");
    await refreshList();
    setSelectedId(v.id);
    setPlan(v);
    return v.id;
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-muted">
        Loading Vac8...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-panel text-gray-200 overflow-hidden">
      {apiError && (
        <div className="shrink-0 px-4 py-2 bg-red-900/40 border-b border-red-700 text-sm text-red-200">
          API not reachable: {apiError}. Run <code className="text-red-100">pnpm dev</code> (needs both web and api).
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      <VacationList
        vacations={vacations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreate}
      />
      <PlanDashboard plan={plan} onPromote={handlePlanUpdate} />
      <AgathaPanel
        vacationId={selectedId}
        plan={plan}
        onPlanUpdate={handlePlanUpdate}
        onEnsureVacation={ensureVacation}
        onVacationDeleted={async () => {
          setSelectedId(null);
          setPlan(null);
          await refreshList();
        }}
      />
      </div>
    </div>
  );
}
