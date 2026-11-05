import { Link, Text } from "@react-email/components";
import { ALLOWED_EMAIL_DOMAINS } from "@/config/site";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

export interface NoticeRow {
  label: string;
  before?: string;
  after: string;
}

/** The admin's record of a change to a listing: a table of fields, or of befores and afters. */
export default function AdminNoticeEmail({
  title,
  intro,
  rows,
  links,
}: {
  title: string;
  intro: string;
  rows: NoticeRow[];
  links?: { listing: string; admin: string };
}) {
  const hasBefore = rows.some((r) => r.before !== undefined);
  return (
    <EmailLayout preview={`${title}: ${intro}`}>
      <Text style={{ ...paragraph, fontSize: 20, fontWeight: 700 }}>{title}</Text>
      <Text style={paragraph}>{intro}</Text>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ padding: "6px 8px 6px 0", color: EMAIL_COLOURS.ink2, verticalAlign: "top", width: "34%" }}>{r.label}</td>
              {hasBefore && (
                <td style={{ padding: "6px 8px", color: EMAIL_COLOURS.ink3, verticalAlign: "top", textDecoration: "line-through" }}>{r.before ?? ""}</td>
              )}
              <td style={{ padding: "6px 0", verticalAlign: "top", whiteSpace: "pre-wrap" }}>{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {links && (
        <Text style={{ ...muted, marginTop: 16 }}>
          <Link href={links.listing}>Open the listing</Link> · <Link href={links.admin}>Open in admin</Link>
        </Text>
      )}
    </EmailLayout>
  );
}

AdminNoticeEmail.PreviewProps = {
  title: "Listing edited",
  intro: `Jordan Smith (jsmith@${ALLOWED_EMAIL_DOMAINS[0]}) changed their listing.`,
  rows: [
    { label: "Price", before: "$950/mo", after: "$900/mo (or best offer)" },
    { label: "Semesters", before: "Spring 2027", after: "Spring & Summer 2027" },
  ],
  links: { listing: "https://catamountsublets.com/listing/187", admin: "https://catamountsublets.com/admin#post:187" },
};
