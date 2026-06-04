import { useCallback, useEffect, useState } from "react";
import type { VacationPlan } from "../schema/plan";
import {
  createVacation,
  fetchVacation,
  fetchVacations,
} from "./api";
import { VacationList } from "./VacationList";
import { PlanDashboard } from "./PlanDashboard";
import { AgathaPanel } from "./AgathaPanel";

export default function App() {
  const [vacations, setVacations] = useState<VacationPlan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<VacationPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshList = useCallback(async () => {
    const list = await fetchVacations();
    setVacations(list);
    return list;
  }, []);

  const loadPlan = useCallback(async (id: string) => {
    const p = await fetchVacation(id);
    setPlan(p);
    setSelectedId(id);
  }, []);

  useEffect(() => {
    refreshList().finally(() => setLoading(false));
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
    <div className="h-screen flex bg-panel text-gray-200 overflow-hidden">
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
        onVacationCreated={refreshList}
      />
    </div>
  );
}
