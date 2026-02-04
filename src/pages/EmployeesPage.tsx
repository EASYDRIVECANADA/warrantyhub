import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { getEmployeesApi } from "../lib/employees/employees";
import { alertMissing, confirmProceed, sanitizeLettersOnly } from "../lib/utils";
import { useAuth } from "../providers/AuthProvider";

export function EmployeesPage({ title }: { title: string }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/sign-in" replace />;
  if (user.role !== "DEALER_ADMIN") return <Navigate to="/dealer-dashboard" replace />;

  const api = useMemo(() => getEmployeesApi(), []);
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const listQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.create({ name, email }),
    onSuccess: async () => {
      setName("");
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; name: string; email: string }) => api.update(input.id, { name: input.name, email: input.email }),
    onSuccess: async () => {
      setEditingId(null);
      setEditName("");
      setEditEmail("");
      await qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-1">Maintain employee directory.</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input value={name} onChange={(e) => setName(sanitizeLettersOnly(e.target.value))} placeholder="Name" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <Button
          onClick={() => {
            void (async () => {
              const n = name.trim();
              const e = email.trim();
              if (!n) return alertMissing("Name is required.");
              if (!e) return alertMissing("Email is required.");
              if (!(await confirmProceed("Add this employee?"))) return;
              createMutation.mutate();
            })();
          }}
          disabled={createMutation.isPending}
        >
          Add employee
        </Button>
      </div>

      <div className="mt-6 rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm text-muted-foreground">
          <div className="col-span-4">Name</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-2 text-right">Created</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <div className="divide-y">
          {(listQuery.data ?? []).map((e) => {
            const isEditing = editingId === e.id;
            return (
              <div key={e.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                <div className="col-span-4 font-medium">
                  {isEditing ? (
                    <Input value={editName} onChange={(ev) => setEditName(sanitizeLettersOnly(ev.target.value))} />
                  ) : (
                    e.name
                  )}
                </div>
                <div className="col-span-4">
                  {isEditing ? <Input value={editEmail} onChange={(ev) => setEditEmail(ev.target.value)} /> : e.email}
                </div>
                <div className="col-span-2 text-right text-muted-foreground">
                  {new Date(e.createdAt).toLocaleDateString()}
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            const n = editName.trim();
                            const em = editEmail.trim();
                            if (!n) return alertMissing("Name is required.");
                            if (!em) return alertMissing("Email is required.");
                            if (!(await confirmProceed("Save employee changes?"))) return;
                            updateMutation.mutate({ id: e.id, name: n, email: em });
                          })();
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(null);
                          setEditName("");
                          setEditEmail("");
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(e.id);
                          setEditName(e.name);
                          setEditEmail(e.email);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            if (!(await confirmProceed(`Remove employee ${e.name}?`))) return;
                            removeMutation.mutate(e.id);
                          })();
                        }}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {listQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>
          ) : null}
          {!listQuery.isLoading && (listQuery.data ?? []).length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">No employees yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
