import { formatPercent, formatScore } from "@/shared/utils/formatters";
import { Badge } from "@/components/ui/badge";

type LeadScoreProps = {
  score: number;
  confidence: number;
  contactability?: number;
  size?: "sm" | "md" | "lg";
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-accent-light";
  if (score >= 25) return "text-amber-400";
  return "text-muted";
}

export function LeadScore({ score, confidence, contactability, size = "md" }: LeadScoreProps) {
  const sizeClasses = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-5xl",
  };

  return (
    <div className="flex items-start gap-6">
      <div className="text-center">
        <div className={`font-semibold tabular-nums ${sizeClasses[size]} ${scoreColor(score)}`}>
          {formatScore(score)}
        </div>
        <p className="mt-1 text-xs text-muted">Lead score</p>
      </div>
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Confidence</span>
          <Badge variant="secondary">{formatPercent(confidence)}</Badge>
        </div>
        {contactability != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Contactability</span>
            <Badge variant="secondary">{formatPercent(contactability)}</Badge>
          </div>
        )}
      </div>
    </div>
  );
}
