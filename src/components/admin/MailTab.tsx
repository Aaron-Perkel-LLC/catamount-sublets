"use client";

import { type AdminMessageDto, MailComposer, MailHistory } from "./MailComposer";

/** One-off email to one address, and every one sent from here (replies to requests included). */
export function MailTab({ history }: { history: AdminMessageDto[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
        <h3 className="font-bold">New message</h3>
        <MailComposer />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-bold">Sent from here</h3>
        <MailHistory messages={history} />
      </section>
    </div>
  );
}
