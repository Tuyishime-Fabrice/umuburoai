"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmt, fmtDate } from "@/lib/surveillance/display";

export interface DatasetRow {
  id: string;
  name: string;
  uploadedAt: string;
  uploadedBy: string;
  rows: number;
  districts: string[];
  periodStart: string | null;
  periodEnd: string | null;
  status: "active" | "removed";
  removedBy?: string;
  removedAt?: string;
  warnings: number;
  superseded: number;
}

export function DatasetTable({ rows, canRemove }: { rows: DatasetRow[]; canRemove: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(r: DatasetRow) {
    if (!window.confirm(`Remove ${r.name} from the analytics? It stays on record and can be re-imported.`)) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/datasets/${encodeURIComponent(r.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Removal failed");
      toast.success(`${r.name} removed — analytics recalculated`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Removal failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Districts</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Records</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={r.status === "removed" ? "opacity-60" : ""}>
              <TableCell>
                <p className="font-medium">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.warnings ? `${r.warnings} validation warning(s)` : "No validation warnings"}
                  {r.superseded ? ` · ${r.superseded} record(s) replaced by later uploads` : ""}
                </p>
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                {fmtDate(r.uploadedAt.slice(0, 10))}
                <p className="text-muted-foreground">{r.uploadedBy}</p>
              </TableCell>
              <TableCell className="text-xs">{r.districts.join(", ")}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">
                {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
              </TableCell>
              <TableCell className="text-right">{fmt(r.rows)}</TableCell>
              <TableCell className="text-xs">
                {r.status === "active" ? (
                  <span className="text-[color:var(--risk-low)]">In use</span>
                ) : (
                  <span>
                    Removed {r.removedAt ? fmtDate(r.removedAt.slice(0, 10)) : ""}
                    {r.removedBy ? ` by ${r.removedBy}` : ""}
                  </span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                <Button asChild variant="ghost" size="sm" title="Download file">
                  <a href={`/api/datasets/${encodeURIComponent(r.id)}/file`}>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                {canRemove && r.status === "active" && (
                  <Button variant="ghost" size="sm" title="Remove from analytics" onClick={() => remove(r)} disabled={busy === r.id}>
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
