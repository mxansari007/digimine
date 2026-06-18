/**
 * Teacher-facing "invite students" card: a QR code (encoding the
 * `${API_URL}/join/<inviteCode>` link) plus the class code. Students scan it with
 * the in-app scanner (or any phone camera) to join. Tap to blow it up full-screen
 * for showing to a room.
 */
import { useState } from "react";
import { Dimensions, Modal, Pressable, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { space, radius } from "@/design/tokens";
import { Button, Card, Text } from "@/design/ui";
import { API_URL } from "@/lib/config";

export function InviteQRCard({
  inviteCode,
  className,
}: {
  inviteCode: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const url = `${API_URL}/join/${inviteCode}`;
  const bigSize = Math.min(300, Dimensions.get("window").width - 120);

  return (
    <Card>
      <Text variant="bodyEm">Invite students</Text>
      <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
        Students scan this to join instantly — or share the class code.
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], marginTop: space[4] }}>
        <Pressable
          onPress={() => setOpen(true)}
          style={{ padding: space[2], backgroundColor: "#fff", borderRadius: radius.md }}
        >
          <QRCode value={url} size={104} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textSubtle" style={{ textTransform: "uppercase" }}>
            Class code
          </Text>
          <Text variant="title3" style={{ letterSpacing: 2, marginTop: 2 }}>
            {inviteCode}
          </Text>
          <Button
            label="Show full screen"
            variant="secondary"
            size="compact"
            leftIcon="maximize"
            onPress={() => setOpen(true)}
            style={{ marginTop: space[3], alignSelf: "flex-start" }}
          />
        </View>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.82)",
            alignItems: "center",
            justifyContent: "center",
            padding: space[6],
          }}
        >
          <View style={{ backgroundColor: "#fff", borderRadius: radius.xl, padding: space[6], alignItems: "center", gap: space[4] }}>
            {className ? (
              <Text variant="title3" style={{ color: "#0b1220" }} align="center">
                {className}
              </Text>
            ) : null}
            <QRCode value={url} size={bigSize} />
            <Text style={{ color: "#334155", letterSpacing: 3, fontWeight: "700", fontSize: 20 }}>{inviteCode}</Text>
            <Text style={{ color: "#94a3b8", fontSize: 12 }}>Scan with the PlacementRanker app to join</Text>
          </View>
        </Pressable>
      </Modal>
    </Card>
  );
}
