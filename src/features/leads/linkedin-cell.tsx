import { Linkedin } from "lucide-react";

type LinkedinCellProps = {
  linkedinUrl?: string | null;
  enrichmentStatus?: "pending" | "matched" | "not_found" | "redacted" | "failed";
};

export function LinkedinCell({ linkedinUrl, enrichmentStatus = "pending" }: LinkedinCellProps) {
  if (linkedinUrl) {
    return (
      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open LinkedIn profile"
        className="inline-flex text-[#0A66C2] hover:opacity-80"
      >
        <Linkedin className="h-4 w-4" />
      </a>
    );
  }

  if (enrichmentStatus === "pending") {
    return <span className="text-xs text-muted">Pending</span>;
  }

  return <span className="text-xs text-muted">Unavailable</span>;
}
