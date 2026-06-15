import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { FontAwesome } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import {
  googleUnavailableReason,
  isGoogleConfigured,
  isGoogleSignInAvailable,
} from "@/lib/googleAuth";
import { useColors, useTheme } from "@/design/theme";
import { radius, size, space } from "@/design/tokens";
import { Button, Input, PressableScale, Screen, Text } from "@/design/ui";

// Brand mark — navy R on light, white R on dark (statically required so Metro
// can bundle both; the live one is picked by theme at render).
const LOGO_LIGHT = require("../assets/images/logo-mark-light.png");
const LOGO_DARK = require("../assets/images/logo-mark-dark.png");

/** Map Firebase auth error codes to copy a student can act on. */
function authErrorMessage(err: any): string {
  const code = String(err?.code || "");
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
    return "Email or password is incorrect.";
  if (code.includes("too-many-requests")) return "Too many attempts — wait a minute and try again.";
  if (code.includes("network-request-failed")) return "Can't reach the server. Check your connection.";
  return "Sign-in failed. Please try again.";
}

/** Map Google sign-in failures to copy. Returns null for a user cancel (no error). */
function googleErrorMessage(err: any): string | null {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "");
  if (code.includes("CANCEL")) return null;
  if (code.includes("IN_PROGRESS")) return "Google sign-in is already in progress.";
  if (code.includes("PLAY_SERVICES")) return "Google Play Services isn't available on this device.";
  if (msg.includes("Web client")) return "Google sign-in isn't set up correctly (Web client id).";
  if (code.includes("NETWORK") || msg.includes("network")) return "Can't reach Google. Check your connection.";
  return "Google sign-in failed. Please try again.";
}

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  const c = useColors();
  const { isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (googleBusy || busy) return;
    if (!isGoogleSignInAvailable()) {
      setError(googleUnavailableReason());
      return;
    }
    setGoogleBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const m = googleErrorMessage(err);
      if (m) setError(m); // null = user cancelled, stay quiet
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space[6] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={{ alignItems: "center", marginBottom: space[10] }}>
            <Image
              source={isDark ? LOGO_DARK : LOGO_LIGHT}
              style={{ width: 76, height: 76, marginBottom: space[4] }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text variant="title1">PlacementRanker</Text>
            <Text variant="callout" color="textMuted" align="center" style={{ marginTop: space[2] }}>
              Practice, mock tests & AI interviews — in your pocket.
            </Text>
          </View>

          {/* Form */}
          <View style={{ gap: space[3] }}>
            <View style={{ gap: space[2] }}>
              <Text variant="subhead" color="textMuted">
                Email
              </Text>
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                leftIcon="mail"
              />
            </View>
            <View style={{ gap: space[2] }}>
              <Text variant="subhead" color="textMuted">
                Password
              </Text>
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                leftIcon="lock"
                onSubmitEditing={submit}
                returnKeyType="go"
              />
            </View>

            {error ? (
              <Text variant="footnote" color="danger" style={{ fontWeight: "600" }}>
                {error}
              </Text>
            ) : null}

            <Button
              label="Sign in"
              size="hero"
              fullWidth
              loading={busy}
              disabled={!email.trim() || !password}
              onPress={submit}
              style={{ marginTop: space[2] }}
            />

            {isGoogleConfigured() ? (
              <>
                {/* divider */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], marginVertical: space[3] }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                  <Text variant="caption" color="textSubtle">or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                </View>

                <PressableScale
                  onPress={onGoogle}
                  disabled={googleBusy || busy}
                  style={{
                    height: size.buttonHero,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.surface,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: space[3],
                    opacity: googleBusy || busy ? 0.6 : 1,
                  }}
                >
                  {googleBusy ? (
                    <ActivityIndicator color={c.text} />
                  ) : (
                    <>
                      <FontAwesome name="google" size={18} color="#4285F4" />
                      <Text variant="bodyEm">Continue with Google</Text>
                    </>
                  )}
                </PressableScale>
              </>
            ) : null}

            <Text variant="footnote" color="textSubtle" align="center" style={{ marginTop: space[3], lineHeight: 18 }}>
              New here? Create your account on the PlacementRanker website — then sign in with it on mobile.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
