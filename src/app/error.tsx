"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-12">
      <Alert variant="destructive" title="Something went wrong">
        {error.message || "An unexpected error occurred."}
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
