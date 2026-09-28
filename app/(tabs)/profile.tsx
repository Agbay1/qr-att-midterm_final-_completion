import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import AppButton from "@/components/AppButton";
import { COLORS } from "@/constants/colors";
import { signOut, syncProfile, useAuth, type Role } from "@/lib/auth";
import {
  getProfile,
  publishRole,
  updateProfile,
  useRole,
  type Profile,
} from "@/lib/profiles";

export default function ProfileScreen() {
  const { user, session } = useAuth();
  const { role, loading: roleLoading, reload } = useRole();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    if (!user) return;

    let nextProfile = await getProfile(user.id);

    if (!nextProfile && session) {
      await syncProfile(session);
      nextProfile = await getProfile(user.id);
    }

    const metaFullName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "";
    const resolvedName = nextProfile?.full_name?.trim() || metaFullName || "";

    setProfile(nextProfile ?? {
      id: user.id,
      email: user.email,
      full_name: resolvedName,
      role: role ?? "student",
    });
    setFullName(resolvedName);

    if (nextProfile) {
      publishRole(user.id, nextProfile.role);
    }
  }, [user, session, role]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      reload();
    }, [loadProfile, reload]),
  );

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);
      const trimmedName = fullName.trim();
      const { error } = await updateProfile(user.id, {
        full_name: trimmedName,
      });

      if (error) {
        Alert.alert("Error", error);
        return;
      }

      const refreshed = await getProfile(user.id);
      setProfile(refreshed);
      setFullName(refreshed?.full_name ?? "");
      Alert.alert("Saved", "Your profile was updated.");
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchRole = async () => {
    if (!user || !role) return;
    const next: Role = role === "teacher" ? "student" : "teacher";

    setSaving(true);
    const { error } = await updateProfile(user.id, { role: next });
    setSaving(false);

    if (error) {
      Alert.alert("Error", error);
      return;
    }

    publishRole(user.id, next);
    const refreshed = await getProfile(user.id);
    setProfile(refreshed);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to sign out.");
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = roleLoading
    ? "Loading..."
    : role === "teacher"
      ? "Teacher"
      : role === "student"
        ? "Student"
        : "Not set yet";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>

      {user && (
        <View style={styles.infoCard}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Add your name"
            style={styles.input}
            placeholderTextColor={COLORS.textSecondary}
          />

          <Text style={styles.label}>Role</Text>
          <View style={styles.roleRow}>
            <Text style={styles.value}>{roleLabel}</Text>
            <Text
              style={styles.roleSwitchHint}
              onPress={saving || !role ? undefined : handleSwitchRole}
            >
              {saving
                ? "..."
                : role === "teacher"
                  ? "Make Student"
                  : "Make Teacher"}
            </Text>
          </View>
          <Text style={styles.roleHint}>
            Your role is chosen at sign-up. If it ever shows the wrong one,
            tap the switch to correct it.
          </Text>

          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>

          <Text style={styles.label}>User ID</Text>
          <Text style={styles.valueSmall}>{user.id}</Text>
        </View>
      )}

      <AppButton
        title={saving ? "Saving..." : "Save Profile"}
        icon="save-outline"
        onPress={handleSave}
        disabled={saving}
      />

      <AppButton
        title="Sign Out"
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roleSwitchHint: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: "hidden",
  },
  roleHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  valueSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});
