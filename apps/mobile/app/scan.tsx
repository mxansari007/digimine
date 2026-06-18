/**
 * QR scanner for joining a class. Points the camera at a teacher's class QR
 * (which encodes the `…/join/<inviteCode>` link), extracts the code, and runs
 * the shared join flow — then drops the student into the class.
 */
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import { Button, Text } from "@/design/ui";
import { extractInviteCode, joinByCode } from "@/lib/classJoin";

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const c = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const onScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (handledRef.current || busy) return;
      const code = extractInviteCode(result.data);
      if (!code) return; // not a join QR — keep scanning
      handledRef.current = true;
      setBusy(true);
      joinByCode({
        code,
        email: user?.email,
        name: user?.displayName,
        onJoined: (classId) => router.replace(`/class/${classId}`),
        onError: (msg) => {
          setBusy(false);
          handledRef.current = false;
          Alert.alert("Couldn't join", msg);
        },
        onCancel: () => {
          setBusy(false);
          handledRef.current = false;
        },
      });
    },
    [busy, user, router]
  );

  const stackOpts = { headerShown: false, title: "Scan QR" } as const;

  // Permission still loading.
  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={stackOpts} />
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  // Permission not granted yet → ask.
  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, padding: space[6] }]}>
        <Stack.Screen options={stackOpts} />
        <Text variant="title3" align="center">
          Camera access needed
        </Text>
        <Text variant="callout" color="textMuted" align="center" style={{ marginTop: space[2], maxWidth: 300 }}>
          Allow camera access to scan your teacher&apos;s class QR code and join instantly.
        </Text>
        <Button
          label={permission.canAskAgain ? "Allow camera" : "Open settings"}
          leftIcon="camera"
          onPress={requestPermission}
          style={{ marginTop: space[6], alignSelf: "stretch" }}
        />
        <Button
          label="Enter a code instead"
          variant="ghost"
          onPress={() => router.back()}
          style={{ marginTop: space[2], alignSelf: "stretch" }}
        />
      </View>
    );
  }

  // Permission granted → live scanner.
  return (
    <View style={styles.fill}>
      <Stack.Screen options={stackOpts} />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={busy ? undefined : onScan}
      />
      {/* Dimmed overlay + scan frame */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.frame, { borderColor: "#ffffff" }]} />
        <Text variant="callout" align="center" style={styles.hint}>
          {busy ? "Joining…" : "Point at your class QR code"}
        </Text>
      </View>
      {/* Top controls */}
      <View style={[styles.topBar, { top: insets.top + space[2] }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.closeBtn}
          accessibilityLabel="Close scanner"
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
      </View>
      {busy ? (
        <View style={styles.busy} pointerEvents="auto">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderRadius: radius.lg,
    backgroundColor: "transparent",
  },
  hint: {
    color: "#fff",
    marginTop: space[6],
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topBar: { position: "absolute", left: space[3], right: space[3], flexDirection: "row" },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  busy: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
});
