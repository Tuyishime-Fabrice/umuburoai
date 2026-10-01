import { UploadZone } from "@/components/upload/upload-zone";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Bring in new surveillance, climate or geographic data. Datasets are validated and previewed
        before import; scanned forms and photos are read and shown for you to{" "}
        <span className="text-foreground">review and confirm</span> before anything is saved.
      </p>
      <UploadZone />
    </div>
  );
}
