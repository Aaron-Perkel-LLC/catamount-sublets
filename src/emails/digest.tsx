import { Img, Link, Section, Text } from "@react-email/components";
import { SITE } from "@/config/site";
import { EMAIL_COLOURS, EmailLayout, muted, paragraph } from "./layout";

/**
 * The weekly saved-search digest: new listings matching any of the person's
 * saved searches, one email. Mostly text by design (it comes from a new
 * subdomain, to Microsoft 365): each listing is only its share-card lines
 * (price, negotiable, semester, size, distance; shareCardLines()) and a
 * link. No address, no poster name. At most one image, the first listing's
 * thumbnail, and only when DIGEST.firstListingThumbnail is on.
 * Built and sent by src/server/services/digest.ts.
 */

export interface DigestListingLine {
  id: number;
  /** "$850/mo" */
  price: string;
  negotiable: boolean;
  /** "Spring 2027" */
  semester: string;
  /** "2 bd · 1 ba · 0.4 mi from campus" */
  facts: string;
  /** The listing's share link: opens without a sign-in. */
  url: string;
  /** The saved searches it matched, by the person's own names. */
  matched: string[];
}

export interface DigestEmailProps {
  /** New matching listings in all; `listings` is the first DIGEST.maxListingsShown of them. */
  total: number;
  listings: DigestListingLine[];
  /** The person has more than one saved search. */
  severalSearches: boolean;
  /** Small public thumbnail for the first listing, or null for none. */
  firstThumb: string | null;
  browseUrl: string;
  accountUrl: string;
  unsubscribeUrl: string;
  /** The footer's postal address, from digestMailingAddress() (server-only); the template never reads the environment. */
  mailingAddress: string;
}

export function digestSubject(total: number, severalSearches: boolean): string {
  return `${total} new sublet${total === 1 ? "" : "s"} matching your search${severalSearches ? "es" : ""}`;
}

export const MAILING_ADDRESS_PLACEHOLDER = "[Mailing address: set MAILING_ADDRESS]";
/** On a line of its own in both parts, like an address block, so no closing full stop. */
const postalLine = (p: DigestEmailProps) => `${SITE.name}, ${p.mailingAddress || MAILING_ADDRESS_PLACEHOLDER}`;

function listingHeadline(l: DigestListingLine): string {
  return [l.price + (l.negotiable ? " (negotiable)" : ""), l.semester].filter(Boolean).join(" · ");
}

export default function DigestEmail(props: DigestEmailProps) {
  const { total, listings, severalSearches, firstThumb, browseUrl, accountUrl, unsubscribeUrl } = props;
  const more = total - listings.length;
  const link = { color: EMAIL_COLOURS.lake, fontWeight: 700, textDecoration: "underline" } as const;
  const footerLink = { color: EMAIL_COLOURS.ink3, textDecoration: "underline" } as const;
  return (
    <EmailLayout
      plain
      preview={`${listings.map((l) => l.price).slice(0, 3).join(", ")}${total > 3 ? " and more" : ""}, new on ${SITE.name} this week.`}
      footer={
        // One thing per line, in the plain-text part's order: why, the two links, the postal address, the disclaimer.
        <>
          You get this because you turned on the weekly email for your saved searches on {SITE.domain}.
          <br />
          <Link href={unsubscribeUrl} style={footerLink}>
            Unsubscribe
          </Link>{" "}
          ·{" "}
          <Link href={accountUrl} style={footerLink}>
            Change your searches
          </Link>
          <br />
          {postalLine(props)}
          <br />
          {SITE.disclaimer}
        </>
      }
    >
      <Text style={paragraph}>
        {total === 1 ? "One new sublet" : `${total} new sublets`} matched your saved search{severalSearches ? "es" : ""} this week.
      </Text>
      {listings.map((l, i) => (
        <Section key={l.id} style={{ borderTop: `1px solid ${EMAIL_COLOURS.line}`, padding: "12px 0" }}>
          {i === 0 && firstThumb && (
            <Img src={firstThumb} alt="" width={120} height={90} style={{ borderRadius: 6, marginBottom: 8, objectFit: "cover" }} />
          )}
          <Text style={{ ...paragraph, margin: "0 0 2px", fontWeight: 700 }}>{listingHeadline(l)}</Text>
          {l.facts && <Text style={{ ...muted, margin: "0 0 4px" }}>{l.facts}</Text>}
          {severalSearches && l.matched.length > 0 && <Text style={{ ...muted, margin: "0 0 4px", fontSize: 13 }}>Matches: {l.matched.join(", ")}</Text>}
          <Link href={l.url} style={link}>
            See the listing
          </Link>
        </Section>
      ))}
      <Section style={{ borderTop: `1px solid ${EMAIL_COLOURS.line}`, paddingTop: 12 }}>
        <Text style={{ ...paragraph, margin: 0 }}>
          {more > 0 ? `${more} more on the site: ` : "Everything on the board: "}
          <Link href={browseUrl} style={link}>
            {SITE.domain}/browse
          </Link>
        </Text>
      </Section>
    </EmailLayout>
  );
}

/** The plain-text part, written out rather than rendered from the HTML, so each link sits on its own line. */
export function digestText(props: DigestEmailProps): string {
  const { total, listings, severalSearches, browseUrl, accountUrl, unsubscribeUrl } = props;
  const more = total - listings.length;
  const lines = [`${total === 1 ? "One new sublet" : `${total} new sublets`} matched your saved search${severalSearches ? "es" : ""} this week.`, ""];
  for (const l of listings) {
    lines.push(listingHeadline(l));
    if (l.facts) lines.push(l.facts);
    if (severalSearches && l.matched.length > 0) lines.push(`Matches: ${l.matched.join(", ")}`);
    lines.push(l.url, "");
  }
  lines.push(more > 0 ? `${more} more on the site: ${browseUrl}` : `Everything on the board: ${browseUrl}`, "");
  lines.push("--");
  lines.push(`You get this because you turned on the weekly email for your saved searches on ${SITE.domain}.`);
  lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  lines.push(`Change your searches: ${accountUrl}`);
  lines.push(postalLine(props));
  lines.push(SITE.disclaimer);
  return lines.join("\n");
}

const sample = (id: number, price: string, semester: string, facts: string, matched: string[], negotiable = false): DigestListingLine => ({
  id,
  price,
  negotiable,
  semester,
  facts,
  url: `${SITE.url}/s/${id}-0123456789`,
  matched,
});
DigestEmail.PreviewProps = {
  total: 12,
  listings: [
    sample(301, "$850/mo", "Spring 2027", "2 bd · 1 ba · 1 roommate · 0.4 mi from campus", ["Spring, under $900"]),
    sample(298, "$1,150/mo", "Summer 2027, Fall 2027", "1 bd · 1 ba · No roommates · 1.2 mi from campus", ["Furnished"], true),
    sample(295, "$700/mo", "Spring 2027", "3 bd · 2 ba · 2 roommates · 0.8 mi from campus", ["Spring, under $900", "Furnished"]),
  ],
  severalSearches: true,
  firstThumb: null,
  browseUrl: `${SITE.url}/browse`,
  accountUrl: `${SITE.url}/account`,
  unsubscribeUrl: `${SITE.url}/unsubscribe?t=00000000-0000-0000-0000-000000000000.1800000000.${"0".repeat(32)}`,
  mailingAddress: "",
} satisfies DigestEmailProps;
