import { PageHeader } from "@/components/admin/PageHeader";
import { IconButton, SubmitButton } from "@/components/admin/ui";
import {
  deleteMessage,
  markAllRead,
  toggleMessageRead,
} from "@/app/admin/actions";
import { getMessages } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const messages = await getMessages();
  const unread = messages.filter((m) => !m.is_read).length;

  return (
    <>
      <PageHeader
        title="Inbox"
        desc={`${messages.length} messages · ${unread} unread`}
      >
        {unread > 0 && (
          <form action={markAllRead}>
            <SubmitButton variant="ghost" pendingLabel="…">
              Mark all as read
            </SubmitButton>
          </form>
        )}
      </PageHeader>

      {messages.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/12 px-4 py-16 text-center text-sm text-white/40">
          Nothing here yet. Messages from the contact form land straight in this
          inbox.
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-2xl border p-4 sm:p-5 ${
                m.is_read
                  ? "border-white/8 bg-white/[0.02]"
                  : "border-[var(--accent)]/25 bg-[var(--accent)]/[0.04]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{m.name}</h3>
                    {!m.is_read && (
                      <span className="rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-black uppercase text-ink">
                        new
                      </span>
                    )}
                    {m.budget && (
                      <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/50">
                        {m.budget}
                      </span>
                    )}
                  </div>
                  <a
                    href={`mailto:${m.email}`}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {m.email}
                  </a>
                  {m.subject && (
                    <p className="mt-1 text-xs font-semibold text-white/60">
                      {m.subject}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-white/30">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                  <form action={toggleMessageRead}>
                    <input type="hidden" name="id" value={m.id} />
                    <IconButton title="Toggle read">
                      {m.is_read ? "○" : "✓"}
                    </IconButton>
                  </form>
                  <form action={deleteMessage}>
                    <input type="hidden" name="id" value={m.id} />
                    <IconButton variant="danger" title="Delete">
                      ✕
                    </IconButton>
                  </form>
                </div>
              </div>
              <p
                className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/65"
                dir="auto"
              >
                {m.body}
              </p>
              <a
                href={`mailto:${m.email}?subject=${encodeURIComponent(
                  `Re: ${m.subject || "Your message"}`,
                )}`}
                className="mt-4 inline-flex rounded-xl border border-white/12 px-3.5 py-2 text-xs text-white/70 transition hover:border-[var(--accent)]/50 hover:text-white"
              >
                Reply by email →
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
