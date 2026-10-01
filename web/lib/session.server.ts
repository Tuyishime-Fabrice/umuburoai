import "server-only";
import { cookies } from "next/headers";
import { decodeSession, SESSION_COOKIE, type Session } from "./auth";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}
