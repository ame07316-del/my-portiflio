"use client";

import { useActionState } from "react";
import { restoreBackup, runMigrations, type FormState } from "@/app/admin/actions";
import { Alert, Card, SubmitButton } from "@/components/admin/ui";

const initial: FormState = {};

export default function DatabasePanel() {
  const [state, action] = useActionState(restoreBackup, initial);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card
        title="Backup"
        desc="Download every project, skill, service, location, message and setting as JSON."
      >
        <a
          href="/admin/api/backup"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-2.5 text-sm font-bold text-ink"
          download
        >
          ⬇ Download backup.json
        </a>
        <p className="mt-3 text-xs leading-5 text-white/40">
          Tip: take a backup before switching database providers, then restore it
          on the new one.
        </p>
      </Card>

      <Card
        title="Restore"
        desc="Replaces all content with the contents of a backup file."
      >
        <form action={action} className="space-y-3">
          <input
            type="file"
            name="backup"
            accept="application/json"
            required
            className="block w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
          />
          <SubmitButton variant="ghost" pendingLabel="Restoring…">
            Restore from file
          </SubmitButton>
          {state.ok && <Alert>Restored {state.message} rows.</Alert>}
          {state.error && (
            <Alert tone="error">
              {state.error === "NO_FILE"
                ? "Pick a .json backup file first."
                : "That file isn't a valid backup."}
            </Alert>
          )}
        </form>
      </Card>

      <Card
        title="Migrations"
        desc="Re-applies schema.sql. Safe to run any time — it only creates what's missing."
        className="lg:col-span-2"
      >
        <form action={runMigrations}>
          <SubmitButton variant="ghost" pendingLabel="Running…">
            Run migrations
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
