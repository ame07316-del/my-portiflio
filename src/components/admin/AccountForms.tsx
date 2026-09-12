"use client";

import { useActionState, useState } from "react";
import { saveAccount, saveToken, type FormState } from "@/app/admin/actions";
import { Alert, Card, Input, SubmitButton } from "@/components/admin/ui";

const initial: FormState = {};

function randomToken() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => {
    let chunk = "";
    let v = n;
    for (let i = 0; i < 5; i++) {
      chunk += alphabet[v % alphabet.length];
      v = Math.floor(v / alphabet.length);
    }
    return chunk;
  }).join("-");
}

export default function AccountForms({
  user,
  token,
}: {
  user: { name: string; email: string };
  token: string;
}) {
  const [accState, accAction] = useActionState(saveAccount, initial);
  const [tokState, tokAction] = useActionState(saveToken, initial);
  const [value, setValue] = useState(token);
  const [copied, setCopied] = useState("");

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/admin/api/token?t=${encodeURIComponent(value)}`
      : "";

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card
        title="Access token"
        desc="One key opens the dashboard — no email, no password."
      >
        <form action={tokAction} className="space-y-3.5">
          <Input
            label="Token"
            name="token"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
            required
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingLabel="Saving…">Save token</SubmitButton>
            <button
              type="button"
              onClick={() => setValue(randomToken())}
              className="rounded-xl border border-white/12 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/30"
            >
              ⟳ Generate strong token
            </button>
            <button
              type="button"
              onClick={() => copy(value, "token")}
              className="rounded-xl border border-white/12 px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/30"
            >
              {copied === "token" ? "Copied ✓" : "Copy"}
            </button>
          </div>

          {tokState.ok && <Alert>Token updated. Keep it safe.</Alert>}
          {tokState.error && (
            <Alert tone="error">Use at least 6 characters.</Alert>
          )}
        </form>

        <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
            One-click sign-in link
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-white/40">
            {link}
          </p>
          <button
            type="button"
            onClick={() => copy(link, "link")}
            className="mt-3 rounded-lg border border-white/12 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30"
          >
            {copied === "link" ? "Copied ✓" : "Copy link"}
          </button>
          <p className="mt-3 text-[11px] leading-5 text-white/35">
            Opening this link signs you straight into the dashboard. Anyone with
            it has full access — don&apos;t share it.
          </p>
        </div>
      </Card>

      <Card title="Owner" desc="Shown on the dashboard and in the session.">
        <form action={accAction} className="space-y-3.5">
          <Input label="Name" name="name" defaultValue={user.name} required />
          <Input
            label="Email"
            name="email"
            type="email"
            defaultValue={user.email}
            required
          />
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          {accState.ok && <Alert>Saved.</Alert>}
          {accState.error && <Alert tone="error">Fill in both fields.</Alert>}
        </form>
      </Card>
    </div>
  );
}
