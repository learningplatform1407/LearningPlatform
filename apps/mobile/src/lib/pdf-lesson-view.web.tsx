import { Text } from "react-native";

import { fontSizes } from "@/lib/theme";
import { useThemeColors } from "@/lib/theme-context";

/**
 * The web build's stand-in for the native PDF reader. react-native-pdf
 * needs native code, and importing it in a web bundle crashed the static
 * export before any screen rendered -- which also took away the one way to
 * look at the app's screens without a device. The real reader is
 * pdf-lesson-view.tsx; Metro picks this file only for the web platform.
 */
export function PdfLessonView(_props: {
  documentId: string;
  storagePath: string;
  pageCount: number;
}) {
  const colors = useThemeColors();
  return (
    <Text style={{ fontSize: fontSizes.sm, color: colors.mutedForeground }}>
      The lecture PDF opens in the mobile app.
    </Text>
  );
}
