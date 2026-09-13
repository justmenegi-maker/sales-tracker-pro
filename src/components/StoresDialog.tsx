import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useIsOnline } from "@/lib/offline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Check, CloudOff, Loader2, Pencil, Plus, Store, Trash2, X } from "lucide-react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

export function StoresDialog({
  open,
  onOpenChange,
  stores,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: Doc<"stores">[];
}) {
  const create = useMutation(api.stores.create);
  const rename = useMutation(api.stores.rename);
  const remove = useMutation(api.stores.remove);
  const isOnline = useIsOnline();

  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Doc<"stores"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await create({ name });
      setNewName("");
      toast.success(`Store "${name}" added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add store");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (store: Doc<"stores">) => {
    const name = editingName.trim();
    if (!name || name === store.name) {
      setEditingId(null);
      return;
    }
    try {
      await rename({ id: store._id, name });
      setEditingId(null);
      toast.success("Store renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename store");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await remove({ id: pendingDelete._id });
      toast.success(`Store "${pendingDelete.name}" and its records were deleted`);
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete store");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage stores</DialogTitle>
            <DialogDescription>
              Add each location you want to track. Deleting a store also deletes its
              sales records.
            </DialogDescription>
          </DialogHeader>

          {!isOnline && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
              <CloudOff className="size-3.5 shrink-0" />
              <span>
                You&apos;re offline — store changes need a connection. Sales records can
                still be saved.
              </span>
            </div>
          )}

          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Downtown flagship"
              maxLength={60}
              disabled={busy || !isOnline}
            />
            <Button
              type="submit"
              disabled={busy || !isOnline || !newName.trim()}
              className="shrink-0"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>

          <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
            {stores.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <Store className="size-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No stores yet — add your first one above.
                </p>
              </div>
            ) : (
              stores.map((store) => (
                <div
                  key={store._id}
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
                >
                  {editingId === store._id ? (
                    <>
                      <Input
                        autoFocus
                        value={editingName}
                        maxLength={60}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleRename(store);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-8"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0 text-primary"
                        disabled={!isOnline}
                        onClick={() => void handleRename(store)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent">
                        <Store className="size-3.5 text-accent-foreground" />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {store.name}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0 text-muted-foreground"
                        disabled={!isOnline}
                        onClick={() => {
                          setEditingId(store._id);
                          setEditingName(store.name);
                        }}
                        aria-label={`Rename ${store.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={!isOnline}
                        onClick={() => setPendingDelete(store)}
                        aria-label={`Delete ${store.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the store and every daily record saved for it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete store
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
