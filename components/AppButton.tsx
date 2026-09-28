import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: "primary";
  onPress: () => void;
  disabled?: boolean;
};

export default function AppButton({
  title,
  icon,
  theme,
  onPress,
  disabled = false,
}: Props) {
  const buttonStyle = [
    styles.buttonInner,
    theme === "primary" && { backgroundColor: COLORS.primary },
    disabled && styles.disabled,
  ];

  if (theme === "primary") {
    return (
      <View
        style={[
          styles.buttonOuter,
          { borderWidth: 3, borderColor: COLORS.primary, borderRadius: 18 },
        ]}
      >
        <Pressable
          style={buttonStyle}
          onPress={disabled ? undefined : onPress}
          disabled={disabled}
        >
          <Ionicons
            name={icon}
            size={22}
            color={COLORS.textOnPrimary}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: COLORS.textOnPrimary }]}>
            {title}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.buttonOuter}>
      <Pressable
        style={buttonStyle}
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
      >
        <Ionicons
          name={icon}
          size={22}
          color={disabled ? COLORS.textSecondary : COLORS.textSecondary}
          style={styles.icon}
        />
        <Text style={[styles.label, disabled && styles.disabledText]}>
          {title}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonOuter: {
    width: "100%",
    marginBottom: 14,
  },
  buttonInner: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    backgroundColor: COLORS.card,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  disabled: {
    opacity: 0.6,
  },
  disabledText: {
    color: COLORS.textSecondary,
  },
  icon: { paddingRight: 10 },
  label: { fontSize: 17, fontWeight: "600", color: COLORS.textPrimary },
});
