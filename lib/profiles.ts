import { useCallback, useEffect, useState } from "react";

import { normalizeRole, useAuth, type Role } from "./auth";
import { supabase } from "./supabase";

export type { Role };

export type Profile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role: Role;
  updated_at?: string | null;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const missingRoleColumn = /column .*profiles\.role.*does not exist|column .*role.*does not exist/i.test(
      error.message,
    );

    if (!missingRoleColumn) {
      return null;
    }

    const fallback = await supabase
      .from("profiles")
      .select("id, email, full_name, updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (fallback.error || !fallback.data) {
      return null;
    }

    return {
      ...fallback.data,
      role: "student",
    } as Profile;
  }

  if (!data) {
    const { data: userData } = await supabase.auth.getUser();
    const metaName = userData.user?.user_metadata?.full_name;
    if (typeof metaName === "string" && metaName.trim()) {
      return {
        id: userId,
        email: userData.user?.email ?? null,
        full_name: metaName.trim(),
        role: normalizeRole(userData.user?.user_metadata?.role) ?? "student",
        updated_at: null,
      };
    }
    return null;
  }

  const safeRole = normalizeRole((data as Record<string, unknown>).role) ?? "student";

  return {
    ...data,
    role: safeRole,
    full_name:
      typeof (data as Record<string, unknown>).full_name === "string"
        ? ((data as Record<string, unknown>).full_name as string)
        : (data as Record<string, unknown>).full_name ?? null,
  } as Profile;
}

export async function updateProfile(
  userId: string,
  updates: { full_name?: string; role?: Role },
): Promise<{ error: string | null }> {
  try {
    const existing = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existing.data) {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email ?? null;
      const { error: insertError } = await supabase.from("profiles").upsert(
        {
          id: userId,
          email,
          full_name: updates.full_name ?? null,
          role: updates.role ?? "student",
        },
        { onConflict: "id" },
      );

      if (insertError) {
        return { error: insertError.message };
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    return { error: error?.message ?? null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to update profile.",
    };
  }
}

/* -------------------------------------------------------------------------
 * Centralized role check (Phase 11 — RBAC).
 * One module-level cache + pub/sub so every screen (tab bar, teacher gate,
 * history, scan) reads the SAME role and updates together.
 * ---------------------------------------------------------------------- */

type RoleState = {
  userId: string | null;
  role: Role | null;
  loading: boolean;
  loaded: boolean;
};

let roleState: RoleState = {
  userId: null,
  role: null,
  loading: false,
  loaded: false,
};

const roleListeners: Set<() => void> = new Set();

function notifyRole() {
  roleListeners.forEach((listener) => listener());
}

/** Re-reads the profile role for a user and notifies every subscriber. */
export async function refreshRole(userId: string): Promise<Role | null> {
  roleState = {
    userId,
    role: roleState.userId === userId ? roleState.role : null,
    loading: true,
    loaded: false,
  };
  notifyRole();

  const profile = await getProfile(userId);
  let nextRole: Role | null = profile?.role ?? null;

  if (!nextRole) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    nextRole = normalizeRole(session?.user?.user_metadata?.role) ?? null;
  }

  roleState = {
    userId,
    role: nextRole,
    loading: false,
    loaded: true,
  };
  notifyRole();
  return roleState.role;
}

/** Applies a role change made elsewhere (e.g. the Profile screen switch). */
export function publishRole(userId: string, role: Role) {
  roleState = { userId, role, loading: false, loaded: true };
  notifyRole();
}

export type RoleStateView = {
  role: Role | null;
  loading: boolean;
  reload: () => void;
};

/**
 * Single source of truth for "what role is the signed-in user?".
 * Returns `role: null` while unknown — callers must treat unknown as
 * "not yet decided" (never as student or teacher).
 */
export function useRole(): RoleStateView {
  const { user } = useAuth();
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((value) => value + 1);
    roleListeners.add(listener);
    return () => {
      roleListeners.delete(listener);
    };
  }, []);

  const ownsState = !!user && roleState.userId === user.id;

  useEffect(() => {
    if (!user) {
      if (roleState.userId !== null) {
        roleState = { userId: null, role: null, loading: false, loaded: false };
        notifyRole();
      }
      return;
    }

    if (roleState.userId !== user.id || !roleState.loaded) {
      refreshRole(user.id);
    }
  }, [user]);

  const reload = useCallback(() => {
    if (user) refreshRole(user.id);
  }, [user]);

  const loadedForUser = ownsState && roleState.loaded;

  return {
    role: loadedForUser ? roleState.role : null,
    loading: !!user && !loadedForUser,
    reload,
  };
}
