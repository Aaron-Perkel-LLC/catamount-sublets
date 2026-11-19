"use client";

import { Card } from "./Card";
import { type AdminMessageDto, MailComposer, MailHistory } from "./MailComposer";

/**
 * One-off email to one address, and every one sent from here (replies to
 * requests included). Two cards for the Mail page's grid, which lays them
 * out: the composer fills the left column on a wide screen, and the history
 * goes last (after the page's own numbers card) because it is the long one.
 */
export function MailTab({ history }: { history: AdminMessageDto[] }) {
  return (
    <>
      <Card title="New message" className="lg:row-span-2">
        <MailComposer />
      </Card>
      <Card flush title="Sent from here" tip="Every one-off email sent from the admin, newest first, replies to requests included. Open one to read it." className="order-last">
        <MailHistory messages={history} />
      </Card>
    </>
  );
}
