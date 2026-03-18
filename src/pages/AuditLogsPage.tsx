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
      <div className="rounded-2xl border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-500/10 via-transparent to-transparent">
          <div className="text-sm font-medium">Audit log feed</div>
          <div className="text-xs text-muted-foreground mt-1">Events (access approvals, role changes, critical system activity).</div>
        </div>
        <div className="p-6">
          <div className="text-sm text-muted-foreground">
            Audit log events (access approvals, role changes, critical system events) will appear here.
          </div>
        </div>
      </div>
    </PageShell>
  );
}
