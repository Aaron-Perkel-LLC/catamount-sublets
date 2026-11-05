import { z } from "zod";
import { LIMITS } from "@/config/site";
import { milesFromCampus } from "./distance";
import {
  AMENITY_KEYS,
  type AmenityKey,
  ROOMMATE_GENDER_VALUES,
  ROOMMATE_PREFERENCE_VALUES,
  UTILITY_KINDS,
  UTILITY_VALUES,
  type UtilityKind,
} from "./options";

/**
 * The post form's input, validated once here for both the client (inline
 * messages) and the Server Action (the truth). Rules are the legacy's plus
 * the limits it only enforced in the browser.
 */

/**
 * Safari ignores autocomplete="off" for contact details, so the four fields
 * it would AutoFill are named like search boxes. The action maps them back.
 */
export const FORM_ALIASES = {
  search_place: "address",
  search_reach: "contactEmail",
  search_text: "contactPhone",
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalCount = (max: number) => z.number().int("Whole numbers only.").min(0).max(max).nullable();

const utilityShape = Object.fromEntries(UTILITY_KINDS.map((k) => [utilityField(k), z.enum(UTILITY_VALUES)])) as Record<
  `utility${Capitalize<UtilityKind>}`,
  z.ZodEnum<{ [K in (typeof UTILITY_VALUES)[number]]: K }>
>;
const amenityShape = Object.fromEntries(AMENITY_KEYS.map((k) => [amenityField(k), z.boolean()])) as Record<
  `amenity${Capitalize<AmenityKey>}`,
  z.ZodBoolean
>;

export function utilityField(k: UtilityKind): `utility${Capitalize<UtilityKind>}` {
  return `utility${k[0].toUpperCase()}${k.slice(1)}` as `utility${Capitalize<UtilityKind>}`;
}
export function amenityField(k: AmenityKey): `amenity${Capitalize<AmenityKey>}` {
  return `amenity${k[0].toUpperCase()}${k.slice(1)}` as `amenity${Capitalize<AmenityKey>}`;
}

export const listingInput = z
  .object({
    price: z
      .number("Enter the monthly rent.")
      .int("Whole dollars only, no cents (850, not 850.50).")
      .min(0, "Rent can't be negative.")
      .max(LIMITS.priceMax, "That rent looks too high."),
    priceNegotiable: z.boolean(),
    address: z.string().trim().min(1, "Enter the address.").max(LIMITS.addressMaxChars, "That address is too long."),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    semesters: z.array(z.string().regex(/^[a-z0-9_-]{1,40}$/i)).min(1, "Pick the semester your place is available for."),
    description: z.string().trim().max(LIMITS.descriptionMaxChars, `Keep the description under ${LIMITS.descriptionMaxChars} characters.`),
    contactEmail: z
      .string()
      .trim()
      .max(100)
      .refine((v) => v === "" || EMAIL.test(v), "Enter a valid contact email."),
    contactPhone: z.string().trim().max(20, "That phone number is too long."),
    ...utilityShape,
    utilityCost: z.number("Enter a number of dollars.").int("Whole dollars only, no cents.").min(0, "Utilities can't be negative.").max(100_000, "That looks too high.").nullable(),
    ...amenityShape,
    bedrooms: optionalCount(20),
    bathrooms: z
      .number()
      .min(0.5)
      .max(9.5)
      .transform((n) => Math.round(n * 2) / 2)
      .nullable(),
    roommates: optionalCount(20),
    roommateGender: z.enum(ROOMMATE_GENDER_VALUES),
    roommatePreference: z.enum(ROOMMATE_PREFERENCE_VALUES),
  })
  // Nobody to describe or prefer if the subletter would have the place to themselves.
  .transform((v) => (v.roommates === 0 ? { ...v, roommateGender: "" as const, roommatePreference: "" as const } : v));

export type ListingInput = z.infer<typeof listingInput>;

/**
 * The map pin, checked beside the schema rather than in a superRefine: zod
 * only runs an object's refinements once every field is valid, and this
 * message must show on the first submit with the others.
 */
export function locationError(lat: unknown, lon: unknown): string | null {
  const la = typeof lat === "number" ? lat : Number.NaN;
  const lo = typeof lon === "number" ? lon : Number.NaN;
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) {
    return "Pick your address from the suggestions, or tap your place on the map, so your listing lands in the right spot.";
  }
  if (milesFromCampus(la, lo) > LIMITS.maxDistanceFromCampusMiles) {
    return `The location is more than ${LIMITS.maxDistanceFromCampusMiles} miles from campus.`;
  }
  return null;
}

export type ValidatedListing = { ok: true; data: ListingInput } | { ok: false; fieldErrors: Record<string, string> };

/** The whole check: schema plus the pin, with one message per field. */
export function validateListingInput(raw: Record<string, unknown>): ValidatedListing {
  const parsed = listingInput.safeParse(raw);
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  const pin = locationError(raw.lat, raw.lon);
  if (pin && !errors.address) errors.address = pin;
  if (!parsed.success || pin) return { ok: false, fieldErrors: errors };
  return { ok: true, data: parsed.data };
}

const text = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};
const num = (fd: FormData, name: string): number | null => {
  const v = text(fd, name).trim();
  return v === "" ? null : Number(v);
};

/** FormData → the shape listingInput expects (aliases mapped, numbers parsed, checkboxes booleans). */
export function formToListingInput(fd: FormData): Record<string, unknown> {
  const alias = (field: keyof typeof FORM_ALIASES) => text(fd, field) || text(fd, FORM_ALIASES[field]);
  const utilities = Object.fromEntries(UTILITY_KINDS.map((k) => [utilityField(k), text(fd, utilityField(k))]));
  const amenities = Object.fromEntries(AMENITY_KEYS.map((k) => [amenityField(k), fd.has(amenityField(k))]));
  return {
    price: num(fd, "price") ?? Number.NaN,
    priceNegotiable: fd.has("priceNegotiable"),
    address: alias("search_place"),
    lat: num(fd, "lat") ?? 0,
    lon: num(fd, "lon") ?? 0,
    semesters: fd.getAll("semesters").filter((s): s is string => typeof s === "string" && s !== ""),
    description: text(fd, "description"),
    contactEmail: alias("search_reach"),
    contactPhone: alias("search_text"),
    ...utilities,
    utilityCost: num(fd, "utilityCost"),
    ...amenities,
    bedrooms: num(fd, "bedrooms"),
    bathrooms: num(fd, "bathrooms"),
    roommates: num(fd, "roommates"),
    roommateGender: text(fd, "roommateGender"),
    roommatePreference: text(fd, "roommatePreference"),
  };
}

/** First message per field, for the form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
