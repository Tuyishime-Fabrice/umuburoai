import Link from "next/link";
import { DatabaseZap, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ScopeOption } from "@/lib/surveillance/types";

/** Shown when no surveillance data has been imported for the selected scope. */
export function EmptyScope({ scope, canUpload = true }: { scope: ScopeOption; canUpload?: boolean }) {
  const name = scope.level === "district" ? `${scope.label} District` : scope.label;
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <DatabaseZap className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">No surveillance data for {name}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          No weekly reports have been imported for {name} yet. Analytics, signals and alerts appear here as soon
          as data is uploaded.
        </p>
        {canUpload && (
          <Button asChild>
            <Link href="/data">
              <UploadCloud className="h-4 w-4" /> Upload surveillance data
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
