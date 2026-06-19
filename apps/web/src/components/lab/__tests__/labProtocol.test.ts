import { describe, expect, it } from "vitest";
import { labAgentIdentity, isLabAgentIdentity, labBaseUid } from "@digimine/types";
import {
    LAB_MAX_CHAT_LEN,
    LAB_MAX_SHARE_TARGETS,
    controlAsk,
    controlDeny,
    controlGrant,
    controlInput,
    controlRequest,
    controlRevoke,
    decode,
    decodeControlInputEvent,
    encode,
    isControlMsg,
    parseParticipantMeta,
    parseRoomPolicy,
    type LabDataMsg,
} from "../labProtocol";

/** encode() then decode() — the wire round-trip every data packet takes. */
function roundTrip(msg: LabDataMsg): LabDataMsg | null {
    return decode(encode(msg));
}

describe("labProtocol encode/decode round-trips", () => {
    it("preserves every well-formed message type", () => {
        const messages: LabDataMsg[] = [
            { t: "hand", raised: true },
            { t: "status", status: "needs_help" },
            { t: "chat", text: "hello lab" },
            { t: "share", kind: "peer", targets: ["u1", "u2"], on: true },
            { t: "record", on: true },
            { t: "spotlight", uid: "u9" },
            { t: "spotlight", uid: null },
            controlRequest("teacher", "u1__agent"),
            controlAsk("teacher", "u1"),
            controlGrant("u1__agent", "teacher"),
            controlDeny("u1__agent", "teacher"),
            controlRevoke("teacher", "u1__agent"),
            controlInput("u1__agent", { kind: "pointer", action: "move", x: 0.5, y: 0.25 }),
            controlInput("u1__agent", {
                kind: "key",
                action: "down",
                key: "a",
                code: "KeyA",
            }),
        ];
        for (const msg of messages) {
            expect(roundTrip(msg)).toEqual(msg);
        }
    });
});

describe("decode validation (untrusted input hardening)", () => {
    it("rejects foreign / malformed payloads", () => {
        expect(decode(new TextEncoder().encode("not json"))).toBeNull();
        expect(decode(new TextEncoder().encode("123"))).toBeNull();
        expect(decode(new TextEncoder().encode(JSON.stringify({ t: "nope" })))).toBeNull();
        expect(decode(new TextEncoder().encode(JSON.stringify({ no: "t" })))).toBeNull();
    });

    it("rejects an invalid status rather than passing it through", () => {
        const payload = new TextEncoder().encode(JSON.stringify({ t: "status", status: "x" }));
        expect(decode(payload)).toBeNull();
    });

    it("hard-caps an oversized chat string", () => {
        const huge = "x".repeat(LAB_MAX_CHAT_LEN + 500);
        const decoded = decode(encode({ t: "chat", text: huge }));
        expect(decoded?.t).toBe("chat");
        expect((decoded as { text: string }).text.length).toBe(LAB_MAX_CHAT_LEN);
    });

    it("caps + de-dupes share targets", () => {
        const targets = Array.from({ length: LAB_MAX_SHARE_TARGETS + 50 }, (_, i) => `u${i}`);
        const decoded = decode(encode({ t: "share", kind: "view", targets, on: true }));
        expect(decoded?.t).toBe("share");
        expect((decoded as { targets: string[] }).targets.length).toBeLessThanOrEqual(
            LAB_MAX_SHARE_TARGETS
        );
    });

    it("drops a control handshake message missing `to`", () => {
        const payload = new TextEncoder().encode(JSON.stringify({ t: "ctl_grant", from: "a" }));
        expect(decode(payload)).toBeNull();
    });

    it("drops ctl_in with a malformed event (NaN coordinate)", () => {
        const payload = new TextEncoder().encode(
            JSON.stringify({ t: "ctl_in", to: "u1__agent", ev: { kind: "pointer", action: "move", x: NaN, y: 0 } })
        );
        expect(decode(payload)).toBeNull();
    });
});

describe("isControlMsg", () => {
    it("classifies every control-handshake type — including ctl_ask", () => {
        expect(isControlMsg(controlAsk("t", "u1"))).toBe(true);
        expect(isControlMsg(controlRequest("t", "u1__agent"))).toBe(true);
        expect(isControlMsg(controlGrant("u1__agent", "t"))).toBe(true);
        expect(isControlMsg(controlDeny("u1__agent", "t"))).toBe(true);
        expect(isControlMsg(controlRevoke("t", "u1__agent"))).toBe(true);
        expect(
            isControlMsg(controlInput("u1__agent", { kind: "scroll", dx: 0, dy: 10 }))
        ).toBe(true);
    });

    it("does not classify ordinary room traffic as control", () => {
        expect(isControlMsg({ t: "chat", text: "hi" })).toBe(false);
        expect(isControlMsg({ t: "hand", raised: true })).toBe(false);
        expect(isControlMsg({ t: "spotlight", uid: "u1" })).toBe(false);
        expect(isControlMsg({ t: "record", on: true })).toBe(false);
    });
});

describe("decodeControlInputEvent", () => {
    it("accepts a valid normalized pointer + clamps the security gate", () => {
        expect(
            decodeControlInputEvent({ kind: "pointer", action: "down", x: 0.1, y: 0.9, button: 0 })
        ).toEqual({ kind: "pointer", action: "down", x: 0.1, y: 0.9, button: 0 });
    });

    it("rejects out-of-range coordinates and unknown kinds", () => {
        expect(decodeControlInputEvent({ kind: "pointer", action: "move", x: 1.5, y: 0 })).toBeNull();
        expect(decodeControlInputEvent({ kind: "pointer", action: "move", x: -0.1, y: 0 })).toBeNull();
        expect(decodeControlInputEvent({ kind: "key", action: "down", key: "a" })).toBeNull(); // no code
        expect(decodeControlInputEvent({ kind: "bogus" })).toBeNull();
        expect(decodeControlInputEvent(null)).toBeNull();
    });
});

describe("parseRoomPolicy", () => {
    it("falls back to permissive defaults on empty / garbage metadata", () => {
        const a = parseRoomPolicy(null);
        const b = parseRoomPolicy("not json");
        expect(a).toEqual(b);
        expect(typeof a.allowChat).toBe("boolean");
    });

    it("reads explicit policy flags", () => {
        const p = parseRoomPolicy(JSON.stringify({ allowPeerShare: false, allowChat: false }));
        expect(p.allowPeerShare).toBe(false);
        expect(p.allowChat).toBe(false);
    });
});

describe("parseParticipantMeta", () => {
    it("falls back to default meta on absent / garbage metadata", () => {
        expect(parseParticipantMeta(undefined, 3).seat).toBe(3);
        expect(parseParticipantMeta("not json", 5).status).toBe("on_task");
    });

    it("clamps a hostile seat and coerces an invalid status", () => {
        const raw = JSON.stringify({ seat: 1e9, status: "pwned", sharingTo: ["u1", "u1", "u2"] });
        const meta = parseParticipantMeta(raw, 2);
        expect(meta.seat).toBe(2); // 1e9 > LAB_MAX_SEAT → fallback
        expect(meta.status).toBe("on_task"); // unknown status coerced
        expect(meta.sharingTo).toEqual(["u1", "u2"]); // de-duped
    });

    it("keeps a valid status and seat", () => {
        const raw = JSON.stringify({ seat: 7, status: "needs_help" });
        const meta = parseParticipantMeta(raw, 0);
        expect(meta.seat).toBe(7);
        expect(meta.status).toBe("needs_help");
    });
});

describe("agent identity helpers", () => {
    it("round-trips a base uid ↔ agent identity", () => {
        const agent = labAgentIdentity("studentA");
        expect(agent).not.toBe("studentA");
        expect(isLabAgentIdentity(agent)).toBe(true);
        expect(isLabAgentIdentity("studentA")).toBe(false);
        expect(labBaseUid(agent)).toBe("studentA");
        expect(labBaseUid("studentA")).toBe("studentA");
    });
});
