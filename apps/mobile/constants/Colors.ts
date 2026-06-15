import { colors } from "@/lib/theme";

const tintColorLight = colors.primary;
const tintColorDark = colors.primaryLight;

export default {
  light: {
    text: colors.ink,
    background: colors.bg,
    tint: tintColorLight,
    tabIconDefault: colors.inkFaint,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#fff",
    background: colors.heroBg,
    tint: tintColorDark,
    tabIconDefault: colors.inkFaint,
    tabIconSelected: tintColorDark,
  },
};
