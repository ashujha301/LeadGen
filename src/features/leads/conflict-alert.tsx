import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";

type Conflict = {
  attribute: string;
  values: string[];
};

type ConflictAlertProps = {
  conflicts: Conflict[];
};

export function ConflictAlert({ conflicts }: ConflictAlertProps) {
  if (conflicts.length === 0) {
    return null;
  }

  return (
    <Alert variant="destructive" title="Conflicting data detected">
      <div className="mt-2 space-y-2">
        {conflicts.map((conflict) => (
          <div key={conflict.attribute} className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium capitalize">{conflict.attribute.replace(/_/g, " ")}</span>
              <ul className="mt-1 list-inside list-disc text-red-200/80">
                {conflict.values.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </Alert>
  );
}
