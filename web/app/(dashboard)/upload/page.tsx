import { UploadZone } from "@/components/upload/upload-zone";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Check a CSV against the surveillance format before it is used: the same validation the dashboard
        runs on its own data (columns, dates, duplicates, numeric values, ranges, logic, derived columns and
        weekly continuity). Files are <span className="text-foreground">not stored</span> and do not change
        the analytics.
      </p>
      <UploadZone />
    </div>
  );
}
