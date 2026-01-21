import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getRemittancesApi } from "../lib/remittances/remittances";
import { alertMissing, confirmProceed, sanitizeMoney } from "../lib/utils";

function dollarsToCents(raw: string) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function RemittancesPage({ title }: { title: string }) {
  const api = useMemo(() => getRemittancesApi(), []);
  const qc = useQueryClient();

  const [remittanceNumber, setRemittanceNumber] = useState("");
  const [amount, setAmount] = useState("");

  const listQuery = useQuery({
    queryKey: ["remittances"],
    queryFn: () => api.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.create({
        remittanceNumber,
        amountCents: dollarsToCents(amount),
      }),
    onSuccess: async () => {
      setRemittanceNumber("");
      setAmount("");
      await qc.invalidateQueries({ queryKey: ["remittances"] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => api.update(id, { status: "PAID" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["remittances"] });
    },
  });

  return (
    <div className="container mx-auto px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground mt-1">Track remittances.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          value={remittanceNumber}
          onChange={(e) => setRemittanceNumber(e.target.value)}
          placeholder="Remittance #"
        />
        <Input
          value={amount}
          onChange={(e) => setAmount(sanitizeMoney(e.target.value))}
          placeholder="Amount (e.g. 199.99)"
          inputMode="decimal"
        />
        <Button
          onClick={() => {
            void (async () => {
              const r = remittanceNumber.trim();
              const a = amount.trim();
              if (!r) return alertMissing("Remittance # is required.");
              if (!a) return alertMissing("Amount is required.");
              if (!(await confirmProceed("Add remittance?"))) return;
              createMutation.mutate();
            })();
          }}
          disabled={createMutation.isPending}
        >
          Add remittance
        </Button>
      </div>

      {listQuery.isError ? (
        <div className="mt-6 text-sm text-destructive">Failed to load remittances.</div>
      ) : null}

      <div className="mt-6 rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm text-muted-foreground">
          <div className="col-span-3">Remittance #</div>
          <div className="col-span-3">Amount</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Created</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <div className="divide-y">
          {(listQuery.data ?? []).map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
              <div className="col-span-3 font-medium">{r.remittanceNumber}</div>
              <div className="col-span-3">${(r.amountCents / 100).toFixed(2)}</div>
              <div className="col-span-2">
                <span
                  className={
                    "inline-flex items-center text-xs px-2 py-1 rounded-md border " +
                    (r.status === "PAID"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-800 border-amber-200")
                  }
                >
                  {r.status === "PAID" ? "Paid" : "Due"}
                </span>
              </div>
              <div className="col-span-2 text-right text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString()}
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  size="sm"
                  variant={r.status === "PAID" ? "outline" : "default"}
                  onClick={() => {
                    void (async () => {
                      if (r.status === "PAID") return;
                      if (!(await confirmProceed("Mark this remittance as PAID?"))) return;
                      markPaidMutation.mutate(r.id);
                    })();
                  }}
                  disabled={r.status === "PAID" || markPaidMutation.isPending}
                >
                  Mark Paid
                </Button>
              </div>
            </div>
          ))}
          {listQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
          ) : null}
          {!listQuery.isLoading && (listQuery.data ?? []).length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">No remittances yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
