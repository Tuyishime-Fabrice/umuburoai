// Lightweight demo auth: a signed-in session is stored in a cookie so both the
// server (SSR) and middleware can read it. This is a prototype gate, not a
// production identity system.

export const SESSION_COOKIE = "umuburo_session";

export type Role = "national" | "district" | "sector";

export interface Session {
  name: string;
  email: string;
  role: Role;
  district?: string; // scope for district/sector roles
  sector?: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  national: "Malaria Surveillance · National Coordinator",
  district: "Malaria Surveillance · District Team",
  sector: "Malaria Surveillance · Sector / Health Centre",
};

export const DEMO_ACCOUNTS: Array<Session & { password: string }> = [
  {
    name: "Aline U.",
    email: "national@umuburo.rw",
    password: "demo",
    role: "national",
  },
  {
    name: "Jean-Bosco N.",
    email: "kirehe@umuburo.rw",
    password: "demo",
    role: "district",
    district: "Kirehe",
  },
  {
    name: "Claudine M.",
    email: "nyamasheke@umuburo.rw",
    password: "demo",
    role: "district",
    district: "Nyamasheke",
  },
];

export function encodeSession(s: Session): string {
  return encodeURIComponent(JSON.stringify(s));
}

export function decodeSession(raw: string | undefined | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(decodeURIComponent(raw)) as Session;
    if (!s || !s.role) return null;
    return s;
  } catch {
    return null;
  }
}
