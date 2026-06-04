import type { VacationPlan } from "../schema/plan";

type Props = {
  vacations: VacationPlan[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
};

export function VacationList({ vacations, selectedId, onSelect, onCreate }: Props) {
  const empty = vacations.length === 0;

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="p-3 border-b border-border font-semibold text-sm">Vac8</div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {empty ? (
          <button
            type="button"
            onClick={onCreate}
            className="w-full text-left p-3 rounded border border-dashed border-border text-accent hover:bg-panel text-sm"
          >
            Create your first Vac8!
          </button>
        ) : (
          vacations.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.id)}
              className={`w-full text-left p-2 rounded text-sm truncate ${
                selectedId === v.id
                  ? "bg-panel border border-accent/40"
                  : "hover:bg-panel border border-transparent"
              }`}
            >
              {v.title}
            </button>
          ))
        )}
      </div>
      {!empty && (
        <div className="p-2 border-t border-border">
          <button
            type="button"
            onClick={onCreate}
            className="w-full py-1.5 text-xs text-muted hover:text-gray-200"
          >
            + New Vac8
          </button>
        </div>
      )}
    </aside>
  );
}
