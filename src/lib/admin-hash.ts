/**
 * Where an old admin link lands. Until phase 32 the admin was one page whose
 * sections were hashes (#people, #images:187, #post:42), and the listing
 * notices already in people's inboxes link /admin#post:<id>. Each section is
 * now its own route; /admin reads the hash once and replaces it with this.
 * Pure, so every old link is tested (admin-hash.test.ts).
 */

const SAME: Record<string, string> = {
  people: "/admin/people",
  requests: "/admin/requests",
  mail: "/admin/mail",
  digest: "/admin/digest",
  survey: "/admin/survey",
  semesters: "/admin/semesters",
  announce: "/admin/announce",
  // #email was the broadcast's home before the one-off Mail section took #mail.
  email: "/admin/announce",
  announcement: "/admin/announce",
  images: "/admin/photos",
  posts: "/admin/people",
  activity: "/admin",
};

const ID = /^\d{1,9}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The URL for an old hash (with or without the "#"), or null to stay on the
 * Overview. Only the arguments the old page understood are carried over.
 */
export function legacyAdminTarget(hash: string): string | null {
  const [name = "", arg] = hash.replace(/^#/, "").split(":");
  if (name === "post") return arg && ID.test(arg) ? `/admin/listings#post:${arg}` : "/admin/listings";
  if (name === "images" || name === "photos") return arg && ID.test(arg) ? `/admin/photos#images:${arg}` : "/admin/photos";
  if (name === "people" || name === "posts") return arg && UUID.test(arg) ? `/admin/people#people:${arg}` : "/admin/people";
  const target = SAME[name];
  if (!target || target === "/admin") return null;
  return target;
}
