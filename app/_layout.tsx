import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { initAuth, useAuth } from '@/lib/auth';

export default function RootLayout() {
  const { session, initialized } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    initAuth();
  }, []);

  if (!initialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const path = segments?.[0];
  const inAuthGroup = path === 'login' || path === 'register';
  const inTabsGroup = path === '(tabs)' || path === undefined;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!session && inTabsGroup && <Redirect href="/login" />}
      {session && inAuthGroup && <Redirect href="/(tabs)" />}
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
