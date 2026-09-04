import type { ScoreComponent } from "@/shared/contracts";
import { formatScore } from "@/shared/utils/formatters";

type ScoreBreakdownProps = {
  components: ScoreComponent[];
};

export function ScoreBreakdown({ components }: ScoreBreakdownProps) {
  const sorted = [...components].sort((a, b) => b.contribution - a.contribution);
  const maxContribution = Math.max(...sorted.map((c) => c.contribution), 1);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Score breakdown</h3>
      <ul className="space-y-2">
        {sorted.map((component) => (
          <li key={component.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{component.label}</span>
              <span className="tabular-nums text-muted">
                +{formatScore(component.contribution)}{" "}
                <span className="text-xs">({component.reasonCode})</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(component.contribution / maxContribution) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
