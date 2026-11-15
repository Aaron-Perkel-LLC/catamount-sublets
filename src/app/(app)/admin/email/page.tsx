import { redirect } from "next/navigation";

/** The Mail section lives on the admin page; this is its linkable address. /admin checks who is asking. */
export default function AdminEmailPage() {
  redirect("/admin#mail");
}
