import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getBatchesApi } from "../lib/batches/batches";
import { alertMissing, confirmProceed } from "../lib/utils";

export function BatchesPage({ title }: { title: string }) {
  const api = useMemo(() => getBatchesApi(), []);
  const qc = useQueryClient();

  const [batchNumber, setBatchNumber] = useState("");

  const listQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => api.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.create({ batchNumber }),
    onSuccess: async () => {
      setBatchNumber("");
      await qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-1">Group remittances into batches.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Batch #" />
        <div className="md:col-span-2">
          <Button
            onClick={() => {
              void (async () => {
                const b = batchNumber.trim();
                if (!b) return alertMissing("Batch # is required.");
                if (!(await confirmProceed("Create batch?"))) return;
                createMutation.mutate();
              })();
            }}
            disabled={createMutation.isPending}
          >
            Create batch
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm text-muted-foreground">
          <div className="col-span-6">Batch #</div>
          <div className="col-span-3">Status</div>
          <div className="col-span-3 text-right">Created</div>
        </div>
        <div className="divide-y">
          {(listQuery.data ?? []).map((b) => (
            <div key={b.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
              <div className="col-span-6 font-medium">{b.batchNumber}</div>
              <div className="col-span-3">{b.status}</div>
              <div className="col-span-3 text-right text-muted-foreground">
                {new Date(b.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
          {listQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
          ) : null}
          {!listQuery.isLoading && (listQuery.data ?? []).length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">No batches yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
