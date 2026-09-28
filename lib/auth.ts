import { useEffect, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

export type Role = "student" | "teacher";

export type SignUpProfile = {
  full_name: string;
  role: Role;
};

export type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true;
let globalInitialized = false;

/**
 * Immutable snapshot, rebuilt on every change.
 * IMPORTANT: `useAuth` hands this object straight to useSyncExternalStore
 * (no object literal in the component). The React Compiler — enabled in
 * app.json — otherwise memoizes the literal on first render and every screen
 * keeps reading stale auth state.
 */
let snapshot: AuthState = {
  session: null,
  user: null,
  loading: true,
  initialized: false,
};

const listeners: Set<() => void> = new Set();

function publish() {
  snapshot = {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
    initialized: globalInitialized,
  };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  publish();
}

export function normalizeRole(value: unknown): Role | null {
  return value === "teacher" || value === "student" ? value : null;
}

/* -------------------------------------------------------------------------
 * Sign-up intent stash — remembers the name/role chosen on the sign-up form
 * so the profile row can be healed even when the DB trigger never ran.
 * ---------------------------------------------------------------------- */

type Intent = SignUpProfile & { email: string };

const INTENT_KEY = "qratt_pending_profile";

let memoryIntent: Intent | null = null;

async function stashIntent(email: string, profile: SignUpProfile) {
  const intent: Intent = { email: email.trim().toLowerCase(), ...profile };
  memoryIntent = intent;
  try {
    await SecureStore.setItemAsync(INTENT_KEY, JSON.stringify(intent));
  } catch {
    // SecureStore can be unavailable (e.g. web) — memory covers this session,
    // user_metadata covers every future session.
  }
}

async function readIntent(email: string): Promise<Intent | null> {
  const normalized = email.trim().toLowerCase();
  let intent = memoryIntent;
  if (!intent) {
    try {
      const raw = await SecureStore.getItemAsync(INTENT_KEY);
      if (raw) intent = JSON.parse(raw);
    } catch {
      // fall through to metadata
    }
  }
  if (!intent || intent.email !== normalized) return null;
  return intent;
}

async function clearIntent() {
  memoryIntent = null;
  try {
    await SecureStore.deleteItemAsync(INTENT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Self-healing profile sync — runs at sign-up, sign-in, and app boot.
 *
 * Intent sources (best first):
 *   1. device stash (memory/SecureStore) from this sign-up
 *   2. session.user.user_metadata — the `options.data` sent at sign-up.
 *      It lives on the server, so it works on other devices, after a cleared
 *      cache, and even if the schema trigger was never installed.
 *
 * It reads the profiles row, upserts on mismatch, then READS BACK to verify —
 * and only clears the stash once the DB provably matches. Never throws.
 * Returns the role the DB actually holds afterwards (or null if unknown).
 */
export async function syncProfile(session: Session | null): Promise<Role | null> {
  const user = session?.user;
  if (!user?.email) return null;
  const email = user.email;

  try {
    const intent = await readIntent(email);
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    const intendedRole = intent
      ? normalizeRole(intent.role)
      : normalizeRole(meta.role);
    const metaName = typeof meta.full_name === "string" ? meta.full_name : "";
    const intendedName = intent?.full_name || metaName || null;

    if (!intendedRole && !intendedName) return null;

    const { data: row, error: selectError } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (selectError) {
      const missingRoleColumn = /column .*profiles\.role.*does not exist|column .*role.*does not exist/i.test(
        selectError.message,
      );
      console.warn("syncProfile: read failed:", selectError.message);
      if (missingRoleColumn) {
        return intendedRole ?? normalizeRole(meta.role) ?? "student";
      }
      return intendedRole ?? normalizeRole(meta.role) ?? "student";
    }

    const currentRole = normalizeRole(row?.role) ?? "student";
    const roleMatches = !intendedRole || currentRole === intendedRole;
    const nameMatches = !intendedName || !!row?.full_name;

    if (roleMatches && nameMatches) {
      await clearIntent();
      return currentRole;
    }

    const nextRole = intendedRole ?? currentRole;
    const nextName = intendedName ?? row?.full_name ?? null;

    const { error: writeError } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, email, full_name: nextName, role: nextRole },
        { onConflict: "id" },
      );

    if (writeError) {
      // Keep the intent — it is retried at the next sign-in / boot.
      // Some projects still have an older schema without the full_name column.
      console.warn("syncProfile: write failed:", writeError.message);
      return intendedRole ?? currentRole;
    }

    const { data: verify } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const verified = normalizeRole(verify?.role) ?? null;

    if (!intendedRole || verified === intendedRole) {
      await clearIntent();
    } else {
      console.warn(
        "syncProfile: read-back mismatch — wanted",
        intendedRole,
        "got",
        verified,
      );
    }
    return verified ?? currentRole;
  } catch (err) {
    console.warn("syncProfile failed:", err);
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Boot — reads the stored session exactly once, and can never hang.
 * ---------------------------------------------------------------------- */

let initPromise: Promise<void> | null = null;

/** Set once the user explicitly signs out, so a late session read can never log them back in. */
let userSignedOut = false;

export function initAuth(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const timeout = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 4000),
        );
        const stored = Promise.resolve()
          .then(() => supabase.auth.getSession())
          .then((res) => res?.data?.session ?? null)
          .catch(() => null);

        const session = await Promise.race([stored, timeout]);

        globalSession = session;
        globalUser = session?.user ?? null;

        // If getSession was slow and lost the race, adopt its result as soon
        // as it arrives — unless the user has signed out in the meantime.
        stored.then((late) => {
          if (!late || globalSession || userSignedOut) return;
          globalSession = late;
          globalUser = late.user;
          globalLoading = false;
          publish();
          Promise.race([
            syncProfile(late),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        });

        if (session) {
          // Boot-time repair: heal a stale profile role from the device
          // stash / signup metadata. Bounded so boot can never hang on it —
          // if it loses the race it keeps running in the background.
          await Promise.race([
            syncProfile(session),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        }
      } catch {
        globalSession = null;
        globalUser = null;
      } finally {
        globalLoading = false;
        globalInitialized = true;
        publish();
      }
    })();
  }
  return initPromise;
}

export function useAuth(): AuthState {
  useEffect(() => {
    initAuth();
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/* -------------------------------------------------------------------------
 * Auth operations
 * ---------------------------------------------------------------------- */

export async function signUp(
  email: string,
  password: string,
  full_name?: string,
  role: Role = "student",
) {
  const profile: SignUpProfile = {
    full_name: full_name?.trim() ?? "",
    role,
  };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Layer 1: carry the profile in the user metadata so it survives every
    // session (and so the DB trigger can write it atomically at insert time).
    options: { data: { full_name: profile.full_name, role: profile.role } },
  });

  if (!error) {
    // Always remember the choice — before any write is attempted.
    await stashIntent(email, profile);

    if (data.session) {
      userSignedOut = false;
      setAuth(data.session);
      // Layer 2: write the row ourselves with read-back verification.
      try {
        await syncProfile(data.session);
      } catch (syncError) {
        console.warn("signUp: profile sync failed:", syncError);
      }
    }
    // No session (email confirmation on): metadata + trigger cover the
    // server; the first sign-in / next boot finishes the job.
  }

  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!error && data.session) {
    userSignedOut = false;
    setAuth(data.session);
    // Heal the role BEFORE the caller navigates, so every screen — including
    // the Teacher tab's role gate — sees the final, verified role.
    await syncProfile(data.session);
  }
  return { data, error };
}

export async function signOut() {
  userSignedOut = true;
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  return { error: null };
}
