import { Link } from "react-router-dom";

import { Button } from "../components/ui/button";
import { PageShell } from "../components/PageShell";

export function AuditLogsPage() {
  return (
    <PageShell
      badge="Super Admin"
      title="Audit Logs"
      subtitle="Read-only system activity."
      actions={
        <Button variant="outline" asChild>
          <Link to="/platform">Back to platform dashboard</Link>
        </Button>
      }
    >
      <div className="rounded-xl border bg-card shadow-card p-6">
        <div className="text-sm text-muted-foreground">
          Audit log events (access approvals, role changes, critical system events) will appear here.
        </div>
      </div>
    </PageShell>
  );
}
