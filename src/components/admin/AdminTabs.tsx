"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingViewProvider, useListingView, type Viewer } from "@/components/listings/listing-view";
import { adminLoadListing } from "@/server/actions/admin";
import type { ActivityRange, ListingActivity } from "@/server/data/events";
import type { Announcement, ReadOnly } from "@/server/data/settings";
import { ActivityTab } from "./ActivityTab";
import { AnnounceTab } from "./AnnounceTab";
import { ImagesTab, type StorageUsage } from "./ImagesTab";
import { PeopleTab } from "./PeopleTab";
import { RequestsTab, type RequestsDto } from "./RequestsTab";
import { AdminPostActions } from "./AdminPostActions";
import { SemestersTab } from "./SemestersTab";
import { type SurveyDto, SurveyTab } from "./SurveyTab";

export interface SemesterRowDto {
  code: string;
  name: string;
  active: boolean;
  archivedAt: string | null;
  postCount: number;
}
export interface ArchiveRowDto {
  semesterCode: string;
  semesterName: string;
  archivedAt: string;
  listings: number;
  taken: number;
  priceMedian: number | null;
  priceMin: number | null;
  priceMax: number | null;
  views: number;
  contacts: number;
  shares: number;
  shareArrivals: number;
  photos: number;
  bytes: number;
}
/** A person's post, as the People table shows it; the chip opens the full listing view. */
export interface PostSummaryDto {
  id: number;
  shortAddress: string;
  price: number;
  status: string;
  hidden: boolean;
  photos: number;
  semesterLabel: string;
}
export interface PersonDto {
  id: string;
  email: string;
  /** Their shown name; null when there is none, and the email stands in. */
  name: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  noEmail: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  legacyNetid: string | null;
  post: PostSummaryDto | null;
}
export interface ActivityDto {
  range: ActivityRange;
  daily: { day: string; views: number; contacts: number }[];
  sources: { source: string; n: number }[];
  targets: { target: string; n: number }[];
  perListing: ({ id: number; shortAddress: string; ownerId: string; ownerEmail: string; ownerName: string | null; status: string; hidden: boolean } & ListingActivity)[];
}

export const TABS = ["people", "requests", "activity", "survey", "semesters", "images", "announce"] as const;
export type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { semesters: "Semesters", announce: "Announce", images: "Images", people: "People", requests: "Requests", activity: "Activity", survey: "Survey" };
/** Hashes from before a section moved, so old links (and already-sent notices) still land. */
const ALIASES: Record<string, Tab> = { posts: "people", announcement: "announce", email: "announce" };

type Props = {
  me: { id: string };
  viewer: Viewer;
  stats: { posts: number; people: number; photos: number; bytes: number; hidden: number; taken: number; storage: StorageUsage };
  semesters: SemesterRowDto[];
  archives: ArchiveRowDto[];
  announcement: Announcement;
  readOnly: ReadOnly;
  requests: RequestsDto;
  people: PersonDto[];
  activity: ActivityDto;
  survey: SurveyDto;
};

/** The admin page: its sections, and one listing view any of them can open a post in. */
export function AdminTabs(props: Props) {
  return (
    <ListingViewProvider viewer={props.viewer} actions={AdminPostActions}>
      <AdminSections {...props} />
    </ListingViewProvider>
  );
}

function AdminSections(props: Props) {
  const [tab, setTab] = useState<Tab>("people");
  const [imagesFocus, setImagesFocus] = useState<number | null>(null);
  const [personFocus, setPersonFocus] = useState<{ id: string; n: number } | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const { open } = useListingView();

  const openPost = useCallback(
    async (id: number) => {
      setMissing(null);
      const listing = await adminLoadListing(id);
      if (listing) open(listing, "deeplink");
      else setMissing(`Listing #${id} is gone.`);
    },
    [open],
  );

  // The open section lives in the hash (#people, #images:187) so links and reloads land on it.
  // #people:<id> flashes that person's row; #post:<id> (the admin notices' link) opens that listing.
  useEffect(() => {
    const read = () => {
      const [raw, arg] = window.location.hash.slice(1).split(":");
      if (raw === "post" && arg) {
        setTab("people");
        history.replaceState(history.state, "", "#people");
        void openPost(Number(arg));
        return;
      }
      const name = ALIASES[raw] ?? raw;
      if (!(TABS as readonly string[]).includes(name)) return;
      if (name !== raw) history.replaceState(history.state, "", `#${name}${arg ? `:${arg}` : ""}`);
      setTab(name as Tab);
      if (name === "images" && arg) setImagesFocus(Number(arg));
      if (name === "people") setPersonFocus(arg ? { id: arg, n: Date.now() } : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [openPost]);

  const go = (t: Tab, arg?: string | number) => {
    setTab(t);
    if (t === "images") setImagesFocus(arg ? Number(arg) : null);
    setPersonFocus(null);
    history.replaceState(history.state, "", `#${t}${arg ? `:${arg}` : ""}`);
  };

  const { stats } = props;
  const waiting = props.requests.pending.length;
  const summary: Record<Tab, string> = {
    people: `${stats.people} ${stats.people === 1 ? "person" : "people"} · ${stats.posts} post${stats.posts === 1 ? "" : "s"} · ${stats.hidden} hidden · ${stats.taken} taken`,
    requests: `${waiting === 0 ? "Nothing" : waiting} waiting · ${props.requests.approved.length} approved address${props.requests.approved.length === 1 ? "" : "es"}`,
    activity: "Views, contacts and shares, counted without names.",
    survey: `${props.survey.summary.answered} of ${props.survey.invited} invited answered the feedback survey.`,
    semesters: "What students can post for, and what is on the board.",
    images: "Every listing's photos, and storage against the plan's caps.",
    announce: "The banner, an email to posters, and the read-only switch.",
  };

  // The sections sit beside the page on a desktop and in one picker on a phone, so they never read as a second site nav.
  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:items-start md:gap-8">
      <nav aria-label="Admin sections" className="md:sticky md:top-4">
        <label className="flex flex-col gap-1 text-sm md:hidden">
          <span className="sr-only">Section</span>
          <select className="field" value={tab} onChange={(e) => go(e.target.value as Tab)}>
            {TABS.map((t) => (
              <option key={t} value={t}>
                {LABELS[t]}
                {t === "requests" && waiting > 0 ? ` (${waiting})` : ""}
              </option>
            ))}
          </select>
        </label>
        <ul className="hidden flex-col gap-0.5 md:flex">
          {TABS.map((t) => (
            <li key={t}>
              <button
                type="button"
                aria-current={tab === t ? "true" : undefined}
                onClick={() => go(t)}
                className={`w-full rounded-lg border-l-4 px-3 py-2 text-left text-sm font-bold ${tab === t ? "border-maple bg-notice-tint text-lake" : "border-transparent text-ink-2 hover:bg-line-light hover:text-lake"}`}
              >
                {LABELS[t]}
                {t === "requests" && waiting > 0 && <span className="ml-1.5 rounded-full bg-maple px-1.5 text-xs text-paper">{waiting}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="admin-section" className="flex min-w-0 flex-col gap-4">
        <div>
          <h2 id="admin-section" className="sr-only text-xl font-bold md:not-sr-only">
            {LABELS[tab]}
          </h2>
          <p className="text-sm text-ink-3">{summary[tab]}</p>
        </div>
        {missing && (
          <p role="status" className="text-sm text-error-ink">
            {missing}
          </p>
        )}
        <div>
          {tab === "semesters" && <SemestersTab semesters={props.semesters} archives={props.archives} />}
          {tab === "announce" && <AnnounceTab announcement={props.announcement} readOnly={props.readOnly} semesters={props.semesters} people={props.people} />}
          {tab === "images" && <ImagesTab focusListingId={imagesFocus} semesters={props.semesters} storage={props.stats.storage} />}
          {tab === "people" && <PeopleTab people={props.people} meId={props.me.id} focus={personFocus} onOpenPost={openPost} />}
          {tab === "requests" && <RequestsTab requests={props.requests} />}
          {tab === "activity" && <ActivityTab activity={props.activity} onOpenPost={openPost} />}
          {tab === "survey" && <SurveyTab survey={props.survey} />}
        </div>
      </section>
    </div>
  );
}
