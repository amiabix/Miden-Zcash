"use client";
export const dynamic = 'force-dynamic';

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ZcashError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Zcash page error:", error);
  }, [error]);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="border-red-500">
        <CardHeader>
          <CardTitle className="text-red-600">Zcash Module Error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {error.message || "An error occurred while loading the Zcash module."}
          </p>
          <div className="flex gap-2">
            <Button onClick={reset} variant="outline">
              Try Again
            </Button>
            <Button onClick={() => window.location.reload()} variant="default">
              Refresh Page
            </Button>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Error Details
            </summary>
            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
              {error.stack || error.toString()}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}


