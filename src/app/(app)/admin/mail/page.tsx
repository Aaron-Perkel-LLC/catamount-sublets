import { redirect } from "next/navigation";

/** Mail's old address: one-off email is part of Email now. /admin/email checks who is asking. */
export default function AdminMailPage() {
  redirect("/admin/email");
}
