/**
 * Development seed: semesters, the admin account, and a handful of made-up
 * listings around Burlington so Browse and Map have something to show.
 * Everything here is invented; it never touches real data and refuses to
 * run against production. `npm run db:seed`.
 */
import { isNotNull, sql, eq } from "drizzle-orm";
import { ADMIN_INBOX, ALLOWED_EMAIL_DOMAINS } from "@/config/site";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { setListingSemesters } from "@/server/data/semesters";

const SEMESTERS = [
  { code: "spring27", name: "Spring 2027", sortOrder: 6 },
  { code: "summer27", name: "Summer 2027", sortOrder: 7 },
  { code: "fall27", name: "Fall 2027", sortOrder: 8 },
  { code: "spring28", name: "Spring 2028", sortOrder: 9 },
];

interface SeedListing {
  email: string;
  displayName: string;
  price: number;
  negotiable?: boolean;
  address: string;
  lat: number;
  lon: number;
  semesters: string[];
  bedrooms?: number;
  bathrooms?: number;
  roommates?: number;
  roommateGender?: typeof s.listings.$inferInsert.roommateGender;
  roommatePreference?: typeof s.listings.$inferInsert.roommatePreference;
  description: string;
  amenities?: Partial<
    Pick<
      typeof s.listings.$inferInsert,
      | "amenityFreeParking"
      | "amenityPaidParking"
      | "amenityLaundryFree"
      | "amenityLaundryPaid"
      | "amenityDishwasher"
      | "amenityAirConditioning"
      | "amenityPetsAllowed"
      | "amenityFurnished"
    >
  >;
  status?: "open" | "paused" | "taken";
  photos: number;
}

const LISTINGS: SeedListing[] = [
  {
    email: `seed1@${ALLOWED_EMAIL_DOMAINS[0]}`,
    displayName: "Sam",
    price: 950,
    address: "62 King St, Burlington",
    lat: 44.4762,
    lon: -73.2106,
    semesters: ["spring27"],
    bedrooms: 4,
    bathrooms: 1.5,
    roommates: 2,
    roommateGender: "mixed",
    description: "Sunny room in a four-bed on King St, ten minutes to campus on foot. Two chill roommates staying, one dog.",
    amenities: { amenityLaundryFree: true, amenityPetsAllowed: true, amenityFurnished: true },
    photos: 3,
  },
  {
    email: `seed2@${ALLOWED_EMAIL_DOMAINS[0]}`,
    displayName: "",
    price: 1250,
    negotiable: true,
    address: "118 Colchester Ave, Burlington",
    lat: 44.4818,
    lon: -73.1951,
    semesters: ["summer27", "fall27"],
    bedrooms: 2,
    bathrooms: 1,
    roommates: 1,
    roommateGender: "women",
    roommatePreference: "women_nonbinary",
    description: "Across the street from campus. Summer and fall; one roommate staying.",
    amenities: { amenityDishwasher: true, amenityAirConditioning: true, amenityPaidParking: true },
    photos: 2,
  },
  {
    email: `seed3@${ALLOWED_EMAIL_DOMAINS[0]}`,
    displayName: "Jordan",
    price: 700,
    address: "35 N Winooski Ave, Burlington",
    lat: 44.4815,
    lon: -73.2089,
    semesters: ["spring27"],
    bedrooms: 5,
    bathrooms: 2,
    roommates: 4,
    roommateGender: "mixed",
    description: "Cheapest room in the house, a bit small, great kitchen. Street parking only.",
    amenities: { amenityLaundryPaid: true },
    photos: 1,
  },
  {
    email: `seed4@${ALLOWED_EMAIL_DOMAINS[0]}`,
    displayName: "Priya",
    price: 1400,
    address: "280 Pearl St, Burlington",
    lat: 44.4792,
    lon: -73.2075,
    semesters: ["spring27"],
    bedrooms: 1,
    bathrooms: 1,
    roommates: 0,
    description: "Whole studio, furnished, utilities included. Quiet building.",
    amenities: { amenityFurnished: true, amenityAirConditioning: true, amenityFreeParking: true },
    photos: 4,
  },
  {
    email: `seed5@${ALLOWED_EMAIL_DOMAINS[0]}`,
    displayName: "Alex",
    price: 825,
    address: "12 Loomis St, Burlington",
    lat: 44.4849,
    lon: -73.1989,
    semesters: ["spring27"],
    bedrooms: 3,
    bathrooms: 1,
    roommates: 2,
    roommateGender: "men",
    roommatePreference: "men_nonbinary",
    description: "Old North End three-bed, two of us staying. Big porch.",
    status: "paused",
    photos: 2,
  },
  {
    email: `seed6@${ALLOWED_EMAIL_DOMAINS[0]}`,
    displayName: "Taylor",
    price: 1100,
    address: "45 Hickok Pl, Burlington",
    lat: 44.4807,
    lon: -73.2012,
    semesters: ["fall27", "spring28"],
    bedrooms: 4,
    bathrooms: 2.5,
    roommates: 3,
    roommateGender: "mixed",
    description: "Academic year lease takeover. Walk to campus in five.",
    amenities: { amenityDishwasher: true, amenityLaundryFree: true },
    photos: 2,
  },
];

async function main() {
  if (process.env.VERCEL_ENV === "production") throw new Error("seed refuses to run against production");
  // Seed accounts are invented people with invented photos: PGlite by default, a remote
  // branch only when asked, and never a database that already holds migrated accounts.
  if (process.env.DATABASE_URL && process.env.SEED_ALLOW_REMOTE !== "1") {
    throw new Error("DATABASE_URL is set: seeding a remote database needs SEED_ALLOW_REMOTE=1 (and never Neon main)");
  }
  const db = await getDb();
  const [{ migrated }] = await db.select({ migrated: sql<number>`count(*)::int` }).from(s.user).where(isNotNull(s.user.legacyNetid));
  if (migrated > 0) throw new Error(`this database holds ${migrated} migrated account(s); seeding it is refused`);

  await db.transaction(async (tx) => {
    for (const sem of SEMESTERS) {
      await tx.insert(s.semesters).values(sem).onConflictDoNothing();
    }

    const adminEmail = ADMIN_INBOX;
    if (!adminEmail) throw new Error("NEXT_PUBLIC_ADMIN_EMAILS is not set; the seed needs an admin account");
    await tx
      .insert(s.user)
      .values({ email: adminEmail, name: "Aaron", role: "admin", emailVerified: true })
      .onConflictDoNothing();

    for (const l of LISTINGS) {
      const [existing] = await tx.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, l.email));
      const userId =
        existing?.id ??
        (await tx.insert(s.user).values({ email: l.email, name: l.email.split("@")[0] }).returning({ id: s.user.id }))[0].id;
      const [already] = await tx.select({ id: s.listings.id }).from(s.listings).where(eq(s.listings.userId, userId));
      if (already) continue;

      const [row] = await tx
        .insert(s.listings)
        .values({
          userId,
          price: l.price,
          priceNegotiable: l.negotiable ?? false,
          address: l.address,
          lat: l.lat,
          lon: l.lon,
          bedrooms: l.bedrooms ?? null,
          bathrooms: l.bathrooms ?? null,
          roommates: l.roommates ?? null,
          roommateGender: l.roommateGender ?? "",
          roommatePreference: l.roommatePreference ?? "",
          description: l.description,
          displayName: l.displayName,
          contactEmail: l.email,
          utilityElectric: "tenant",
          utilityInternet: "landlord",
          status: l.status ?? "open",
          ...l.amenities,
        })
        .returning({ id: s.listings.id });

      await setListingSemesters(
        tx,
        row.id,
        l.semesters.map((code, position) => ({ code, position })),
      );

      for (let i = 0; i < l.photos; i++) {
        const stem = `seed${row.id.toString().padStart(2, "0")}${i.toString().padStart(2, "0")}`.padEnd(32, "0");
        const url = `/seed/photo-${((row.id + i) % 4) + 1}.svg`;
        await tx.insert(s.listingPhotos).values({
          listingId: row.id,
          sortOrder: i,
          stem,
          displayUrl: url,
          thumbUrl: url,
          cardUrl: url,
          width: 1200,
          height: 900,
          bytes: 0,
          contentType: "image/svg+xml",
          sha256: "0".repeat(64),
        });
      }
    }

    await tx
      .insert(s.siteSettings)
      .values([{ key: "announcement", value: { active: false, message: "", style: "info" } }])
      .onConflictDoNothing();
  });

  // eslint-disable-next-line no-console
  console.log(`seeded ${SEMESTERS.length} semesters, the admin, ${LISTINGS.length} listings`);
}

main().then(
  () => process.exit(0),
  (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  },
);
