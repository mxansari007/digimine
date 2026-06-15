/**
 * Push registration — best-effort, lazy, and fully guarded.
 *
 * IMPORTANT: `expo-notifications` THROWS on import inside Expo Go (SDK 53+
 * removed remote push there), so we never even `require` it in Expo Go. We
 * detect the runtime first and only pull the native modules in on a real
 * dev/standalone build.
 *
 * We register the device's **native FCM token** (not an Expo push token) and
 * send it to our own server, which delivers via firebase-admin (FCM). This
 * needs the app built WITH `google-services.json` (android.googleServicesFile
 * in app.json) — without it `getDevicePushTokenAsync` has no FCM project to
 * register against. Returns null on Expo Go / emulators; lights up on a real
 * build on a physical device.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
// Type-only import is erased at build time — it never executes the module.
import type * as NotificationsModule from "expo-notifications";

const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

let handlerSet = false;

/** Lazily load expo-notifications (never in Expo Go). */
export function getNotificationsModule(): typeof NotificationsModule | null {
  if (isExpoGo) return null;
  try {
    return require("expo-notifications") as typeof NotificationsModule;
  } catch {
    return null;
  }
}

export async function registerForPush(): Promise<string | null> {
  // Expo Go can't do remote push and importing the module would throw.
  if (isExpoGo) return null;

  try {
    const Notifications = require("expo-notifications") as typeof NotificationsModule;

    if (!handlerSet) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerSet = true;
    }

    // The server addresses the "default" channel — it must exist or Android
    // won't display the notification.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      });
    }

    // Try to register regardless of device type — getDevicePushTokenAsync
    // succeeds on real devices AND emulators with Google Play; the surrounding
    // try/catch handles anything that can't obtain an FCM token.
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    // The native FCM registration token — sent to our server, delivered via
    // firebase-admin. (NOT an Expo push token.)
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    return typeof tokenResponse?.data === "string" ? tokenResponse.data : null;
  } catch (err) {
    console.warn("registerForPush failed (non-fatal):", err);
    return null;
  }
}
