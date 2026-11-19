import { redirect } from "next/navigation";

/** The Mail section's old address (it was /admin#mail before sections became pages). /admin/mail checks who is asking. */
export default function AdminEmailPage() {
  redirect("/admin/mail");
}
