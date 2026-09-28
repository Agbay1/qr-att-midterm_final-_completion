import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  type AttendanceRecord,
  type TeacherEventAttendance,
} from "@/lib/attendance";
import { useRole } from "@/lib/profiles";

export default function HistoryScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading, reload } = useRole();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  const isTeacher = role === "teacher";

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!user) {
      setRecords([]);
      setTeacherEvents([]);
      setLoading(false);
      return;
    }

    if (roleLoading) {
      setLoading(true);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      if (isTeacher) {
        const events = await getTeacherEventAttendance(user.id);
        if (cancelled) return;
        setTeacherEvents(events);
        setRecords([]);
      } else {
        const rows = await getAttendanceHistory(user.id);
        if (cancelled) return;
        setRecords(rows);
        setTeacherEvents([]);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, roleLoading, isTeacher]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isTeacher ? "Teacher Attendance" : "Attendance History"}
      </Text>

      {loading ? (
        <Text style={styles.subtitle}>Loading records...</Text>
      ) : isTeacher ? (
        teacherEvents.length === 0 ? (
          <Text style={styles.subtitle}>No events created yet.</Text>
        ) : (
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => item.eventId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventMeta}>{item.eventId}</Text>
                <Text style={styles.eventMeta}>
                  {item.attendeeCount} attendees
                </Text>
                {item.attendees.length > 0 && (
                  <Text style={styles.eventMeta}>
                    Latest: {item.attendees[0].studentId}
                  </Text>
                )}
              </View>
            )}
          />
        )
      ) : records.length === 0 ? (
        <Text style={styles.subtitle}>
          No records yet. Scan a QR code to register your attendance.
        </Text>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.eventTitle}>{item.eventTitle}</Text>
              <Text style={styles.eventMeta}>{item.eventId}</Text>
              <Text style={styles.eventMeta}>{formatDate(item.scannedAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
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
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 32,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
