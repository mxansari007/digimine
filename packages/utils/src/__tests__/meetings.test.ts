import { describe, it, expect } from "vitest";
import { sanitizeMeetings } from "@digimine/utils";

describe("sanitizeMeetings", () => {
    it("keeps a valid row", () => {
        expect(
            sanitizeMeetings([{ day: "mon", startTime: "10:00", endTime: "11:00", room: "301" }])
        ).toEqual([{ day: "mon", startTime: "10:00", endTime: "11:00", room: "301" }]);
    });

    it("lowercases the day and defaults room to null", () => {
        expect(sanitizeMeetings([{ day: "TUE", startTime: "09:00", endTime: "09:50" }])).toEqual([
            { day: "tue", startTime: "09:00", endTime: "09:50", room: null },
        ]);
    });

    it("drops invalid day / time and end ≤ start", () => {
        expect(
            sanitizeMeetings([
                { day: "funday", startTime: "10:00", endTime: "11:00" }, // bad day
                { day: "mon", startTime: "25:00", endTime: "26:00" }, // bad time
                { day: "mon", startTime: "10:00", endTime: "10:00" }, // end == start
                { day: "mon", startTime: "12:00", endTime: "11:00" }, // end < start
            ])
        ).toEqual([]);
    });

    it("returns [] for non-arrays", () => {
        expect(sanitizeMeetings(null)).toEqual([]);
        expect(sanitizeMeetings("nope")).toEqual([]);
        expect(sanitizeMeetings(undefined)).toEqual([]);
    });

    it("clamps room length and caps at 30 rows", () => {
        const [row] = sanitizeMeetings([
            { day: "wed", startTime: "08:00", endTime: "09:00", room: "x".repeat(100) },
        ]);
        expect(row.room?.length).toBe(40);

        const many = Array.from({ length: 50 }, () => ({ day: "mon", startTime: "10:00", endTime: "11:00" }));
        expect(sanitizeMeetings(many)).toHaveLength(30);
    });
});
