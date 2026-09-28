import Ionicons from "@expo/vector-icons/Ionicons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import { createEvent } from "@/lib/events";
import { useRole } from "@/lib/profiles";
import { buildQRPayload } from "@/lib/qr";

function toLocalISO(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  );
}

function formatDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${pad(date.getDate())}, ${date.getFullYear()} at ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const QUICK_END_OPTIONS = [
  { label: "+30 min", ms: 30 * 60 * 1000 },
  { label: "+1 hour", ms: 60 * 60 * 1000 },
  { label: "+2 hours", ms: 2 * 60 * 60 * 1000 },
];

type EditTarget = "start" | "end";

export default function TeacherScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(
    () => new Date(Date.now() + 60 * 60 * 1000),
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editingPart, setEditingPart] = useState<"date" | "time">("date");
  const [payload, setPayload] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isAndroid = Platform.OS === "android";

  const openPicker = (target: EditTarget) => {
    setMessage(null);
    setEditTarget(target);
    setEditingPart("date");
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (!editTarget) return;
    if (event.type === "dismissed" || !selected) {
      setEditTarget(null);
      setEditingPart("date");
      return;
    }

    const current = editTarget === "start" ? startDate : endDate;
    const next = new Date(current);
    next.setFullYear(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
    );
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);

    if (editTarget === "start") setStartDate(next);
    else setEndDate(next);

    if (isAndroid && editingPart === "date") {
      setEditingPart("time");
    } else {
      setEditTarget(null);
      setEditingPart("date");
    }
  };

  const handleQuickEnd = (ms: number) => {
    setMessage(null);
    setEndDate(new Date(startDate.getTime() + ms));
  };

  const handleCreateEvent = async () => {
    const event = {
      eventId: eventId.trim(),
      title: title.trim(),
      start: toLocalISO(startDate),
      end: toLocalISO(endDate),
    };

    if (!event.eventId || !event.title) {
      setMessage("Event title and code are required.");
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      setMessage("End time must be after start time.");
      return;
    }

    const { error } = await createEvent(event);

    if (error) {
      setMessage(error);
      return;
    }

    setMessage("Event saved! Scan the QR with the Scan tab to test it.");
    setPayload(buildQRPayload(event));
  };

  if (!user) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Sign in to create a class event.</Text>
      </View>
    );
  }

  if (roleLoading) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Checking your access...</Text>
      </View>
    );
  }

  if (role !== "teacher") {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Teacher access required.</Text>
        <Text style={styles.emptyText}>
          Switch to a teacher account in your profile to create QR events.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.formCard}>
        <Text style={styles.title}>Create Event QR</Text>
        <Text style={styles.subtitle}>
          Fill in the event details, then scan the generated QR with the Scan
          tab.
        </Text>

        <Text style={styles.label}>Event Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Founders Day Assembly"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>Event Code</Text>
        <TextInput
          style={styles.input}
          value={eventId}
          onChangeText={setEventId}
          placeholder="e.g. EVT-2026-0002"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Starts</Text>
        <PickerField
          value={formatDateTime(startDate)}
          icon="sunny-outline"
          onPress={() => openPicker("start")}
        />

        <Text style={styles.label}>Ends</Text>
        <PickerField
          value={formatDateTime(endDate)}
          icon="moon-outline"
          onPress={() => openPicker("end")}
        />
        <View style={styles.chipRow}>
          {QUICK_END_OPTIONS.map((option) => (
            <Pressable
              key={option.label}
              style={styles.chip}
              onPress={() => handleQuickEnd(option.ms)}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Tap a chip to set the end time from start.
        </Text>

        {message && <Text style={styles.message}>{message}</Text>}

        <PrimaryActionButton
          title="Create Event"
          icon="add-circle-outline"
          onPress={handleCreateEvent}
        />

        {editTarget && (
          <View style={styles.pickerContainer}>
            <DateTimePicker
              value={editTarget === "start" ? startDate : endDate}
              mode={isAndroid ? editingPart : "datetime"}
              display={isAndroid ? "default" : "spinner"}
              onChange={onPickerChange}
            />
          </View>
        )}

        {payload && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>
              Scan this QR code with the Scan tab:
            </Text>
            <View style={styles.qrBox}>
              <QRCode value={payload} size={200} />
            </View>
            <Text style={styles.payloadText}>{payload}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function PrimaryActionButton({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.primaryAction} onPress={onPress}>
      <Ionicons
        name={icon}
        size={22}
        color="#FFFFFF"
        style={styles.primaryIcon}
      />
      <Text style={styles.primaryActionText}>{title}</Text>
    </Pressable>
  );
}

type PickerFieldProps = {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function PickerField({ value, icon, onPress }: PickerFieldProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pickerField,
        pressed && styles.pickerFieldPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={COLORS.primary} />
      <Text style={styles.pickerValue}>{value}</Text>
      <Ionicons
        name="calendar-outline"
        size={18}
        color={COLORS.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef1f4",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
    alignItems: "center",
  },
  formCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#f7f7f7",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1d2430",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#5d6773",
    lineHeight: 22,
    marginBottom: 16,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#212936",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#e8ebee",
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1d2430",
  },
  pickerField: {
    backgroundColor: "#e8ebee",
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  pickerFieldPressed: {
    backgroundColor: "#dfe4e8",
  },
  pickerValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1d2430",
    marginHorizontal: 10,
  },
  chipRow: {
    flexDirection: "row",
    marginTop: 10,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  chip: {
    backgroundColor: "#f0f7f1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#a9d8b0",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2ebd68",
  },
  hint: {
    fontSize: 12,
    color: "#6d7784",
    marginTop: 2,
    marginBottom: 18,
  },
  primaryAction: {
    backgroundColor: "#39d267",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 10,
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  primaryIcon: {
    marginRight: 8,
  },
  pickerContainer: {
    marginTop: 12,
    alignItems: "center",
  },
  message: {
    fontSize: 14,
    color: "#2c7a44",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    alignItems: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 12,
  },
  qrBox: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  payloadText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  emptyState: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
