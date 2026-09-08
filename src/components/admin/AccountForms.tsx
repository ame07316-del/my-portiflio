"use client";

import { useActionState } from "react";
import { savePassword, saveAccount, type FormState } from "@/app/admin/actions";
import { Alert, Card, Input, SubmitButton } from "@/components/admin/ui";

const initial: FormState = {};

export default function AccountForms({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [accState, accAction] = useActionState(saveAccount, initial);
  const [pwState, pwAction] = useActionState(savePassword, initial);

  const pwError: Record<string, string> = {
    TOO_SHORT: "New password must be at least 8 characters.",
    MISMATCH: "The two new passwords don't match.",
    WRONG_PASSWORD: "Your current password is incorrect.",
  };

  return (
    <div className="space-y-5">
      <Card title="Profile" desc="Used for your admin login.">
        <form action={accAction} className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" name="name" defaultValue={user.name} required />
          <Input label="Email" name="email" type="email" defaultValue={user.email} required />
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
          </div>
          {accState.ok && (
            <div className="sm:col-span-2">
              <Alert>Profile updated.</Alert>
            </div>
          )}
        </form>
      </Card>

      <Card title="Password" desc="Use at least 8 characters.">
        <form action={pwAction} className="grid gap-4 sm:grid-cols-3">
          <Input label="Current password" name="current" type="password" required />
          <Input label="New password" name="next" type="password" required />
          <Input label="Confirm new password" name="confirm" type="password" required />
          <div className="sm:col-span-3">
            <SubmitButton pendingLabel="Updating…">Change password</SubmitButton>
          </div>
          {pwState.ok && (
            <div className="sm:col-span-3">
              <Alert>Password changed successfully.</Alert>
            </div>
          )}
          {pwState.error && (
            <div className="sm:col-span-3">
              <Alert tone="error">
                {pwError[pwState.error] ?? "Something went wrong."}
              </Alert>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
