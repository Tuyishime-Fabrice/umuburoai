import { AlertsView } from "@/components/alerts/alerts-view";
import { getAlerts, getNational } from "@/lib/data";

export default function AlertsPage() {
  const alerts = getAlerts();
  const national = getNational();
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Signals the model flagged for human review. Each shows why it fired and what to confirm
        <span className="text-foreground"> before</span> any response.
      </p>
      <AlertsView alerts={alerts} asOf={national.as_of} epiWeek={national.epi_week} />
    </div>
  );
}
