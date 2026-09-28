import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Native Expo Go can occasionally fail with a null AsyncStorage native module,
// which crashes the auth refresh loop. Use a safe adapter that prefers the
// platform-native storage and falls back gracefully instead of throwing.
const safeStorage = {
  async getItem(key: string) {
    try {
      if (Platform.OS === "web") {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(key);
      }

      try {
        return await SecureStore.getItemAsync(key);
      } catch {
        return await AsyncStorage.getItem(key);
      }
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string) {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, value);
        }
        return;
      }

      try {
        await SecureStore.setItemAsync(key, value);
      } catch {
        await AsyncStorage.setItem(key, value);
      }
    } catch {
      // Ignore storage failures; authentication is still allowed to proceed.
    }
  },

  async removeItem(key: string) {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(key);
        }
        return;
      }

      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        await AsyncStorage.removeItem(key);
      }
    } catch {
      // Ignore cleanup failures.
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
