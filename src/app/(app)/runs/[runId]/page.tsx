import { RunDetailClient } from "@/features/runs/run-detail-client";

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunDetailClient runId={runId} />;
}
