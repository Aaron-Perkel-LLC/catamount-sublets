import { render } from "@react-email/components";
import WelcomeEmail from "../../src/emails/welcome";

/** Prints the welcome message's plain-text part, for reading before a send: `node --import tsx scripts/admin/render-welcome.ts [name]`. */
async function main() {
  console.log(await render(WelcomeEmail({ name: process.argv[2] ?? "Sam", listingId: 187 }), { plainText: true }));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
