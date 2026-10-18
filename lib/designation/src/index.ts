/**
 * Single source of truth for HOA designation constants used on printed
 * resident IDs.  Both api-server and hoa-tracker import from here so a label
 * rename only needs one edit.
 *
 * Display-only — designations grant no permissions.  One per person, no
 * term dates.
 */

export const DESIGNATIONS = [
  "president",
  "vice_president",
  "auditor",
  "treasurer",
  "secretary",
  "board_member",
  "block_rep",
  "council",
  "elecom",
] as const;

export type Designation = (typeof DESIGNATIONS)[number];

export const DESIGNATION_LABEL: Record<Designation, string> = {
  president: "President",
  vice_president: "Vice President",
  auditor: "Auditor",
  treasurer: "Treasurer",
  secretary: "Secretary",
  board_member: "Board Member",
  block_rep: "Block Rep",
  council: "Council",
  elecom: "Elecom",
};

/** Badge tier: gold = executive board, silver = reps/council, bronze = elecom. */
export type DesignationTier = "gold" | "silver" | "bronze";

export const DESIGNATION_TIER: Record<Designation, DesignationTier> = {
  president: "gold",
  vice_president: "gold",
  auditor: "gold",
  treasurer: "gold",
  secretary: "gold",
  board_member: "gold",
  block_rep: "silver",
  council: "silver",
  elecom: "bronze",
};

export function isDesignation(value: unknown): value is Designation {
  return (
    typeof value === "string" &&
    (DESIGNATIONS as readonly string[]).includes(value)
  );
}

export const TIER_BADGE_BG: Record<DesignationTier, string> = {
  gold: "#b8860b",
  silver: "#708090",
  bronze: "#a05a2c",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  admin_support: "Admin Support",
  accountant: "Accountant",
  security_guard: "Security Guard",
  owner: "Member",
  renter: "Renter",
};

export const RESIDENT_DESIGNATIONS = ["member", "household_member", "renter", "household_helper"] as const;
export type ResidentDesignation = (typeof RESIDENT_DESIGNATIONS)[number];
export const RESIDENT_DESIGNATION_LABEL: Record<ResidentDesignation, string> = {
  member: "Member",
  household_member: "Household Member",
  renter: "Renter",
  household_helper: "Household Helper",
};
export function isResidentDesignation(value: unknown): value is ResidentDesignation {
  return typeof value === "string" && (RESIDENT_DESIGNATIONS as readonly string[]).includes(value);
}
/** Display only. Never use this value for authorization, billing or household links. */
export function getResidentDesignation(person: {
  residentDesignation?: string | null; role?: string; isFamilyMember?: boolean | null;
}): ResidentDesignation {
  if (isResidentDesignation(person.residentDesignation)) return person.residentDesignation;
  if (person.role === "renter") return "renter";
  if (person.role === "owner") return person.isFamilyMember ? "household_member" : "member";
  return "household_helper";
}

export const ROLE_BADGE_BG = "#f57f17";

const ROLE_CODE: Record<string, string> = {
  admin: "ADM",
  admin_support: "SUP",
  accountant: "ACC",
  security_guard: "SEC",
  owner: "OWN",
  renter: "RNT",
};

/** Back-side credentials are staff-only; guards retain the separate scan workflow. */
export function residentIdAccess(role?: string | null): "none" | "front" | "both" {
  if (role === "admin" || role === "admin_support" || role === "accountant") return "both";
  if (role === "owner" || role === "renter") return "front";
  return "none";
}

export function buildIdNumber(userId: number, role: string, createdAt?: string | null): string {
  const createdYear = createdAt ? new Date(createdAt).getFullYear() : Number.NaN;
  const year = Number.isFinite(createdYear) ? createdYear : new Date().getFullYear();
  const code = ROLE_CODE[role] ?? "MBR";
  return `GL1-${code}-${year}-${String(userId).padStart(5, "0")}`;
}

export function getIdBadge(user: {
  role: string;
  designation?: string | null;
  residentDesignation?: string | null;
  isFamilyMember?: boolean | null;
}): { label: string; bg: string } {
  if (user.designation && isDesignation(user.designation)) {
    return {
      label: DESIGNATION_LABEL[user.designation],
      bg: TIER_BADGE_BG[DESIGNATION_TIER[user.designation]],
    };
  }
  if (user.role === "owner" || user.role === "renter") {
    return { label: RESIDENT_DESIGNATION_LABEL[getResidentDesignation(user)], bg: ROLE_BADGE_BG };
  }
  return { label: ROLE_LABEL[user.role] ?? user.role, bg: ROLE_BADGE_BG };
}
