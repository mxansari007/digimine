// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberInput } from "../NumberInput";

/** Controlled harness mirroring how the builder forms use NumberInput. */
function Harness({ initial }: { initial: number | null }) {
    const [value, setValue] = useState<number | null>(initial);
    return (
        <div>
            <NumberInput value={value} onValueChange={setValue} aria-label="n" />
            <span data-testid="emitted">{value === null ? "null" : String(value)}</span>
        </div>
    );
}

function getInput() {
    return screen.getByLabelText("n") as HTMLInputElement;
}

describe("NumberInput", () => {
    it("renders the initial numeric value", () => {
        render(<Harness initial={42} />);
        expect(getInput().value).toBe("42");
    });

    it("can be cleared and does NOT snap back to 0", () => {
        render(<Harness initial={5} />);
        const input = getInput();
        fireEvent.change(input, { target: { value: "" } });
        expect(input.value).toBe(""); // stays empty — the core bug fixed
        expect(screen.getByTestId("emitted").textContent).toBe("null");
    });

    it("emits the parsed number as the user types", () => {
        render(<Harness initial={null} />);
        const input = getInput();
        fireEvent.change(input, { target: { value: "25" } });
        expect(input.value).toBe("25");
        expect(screen.getByTestId("emitted").textContent).toBe("25");
    });

    it("preserves a leading zero so decimals like 0.5 are enterable", () => {
        // The old `Number(value) || 1/0` pattern turned a lone '0' into the
        // fallback, making '0.5' impossible to type. The draft must keep '0'.
        render(<Harness initial={null} />);
        const input = getInput();
        fireEvent.change(input, { target: { value: "0" } });
        expect(input.value).toBe("0");
        expect(screen.getByTestId("emitted").textContent).toBe("0");
        fireEvent.change(input, { target: { value: "0.5" } });
        expect(screen.getByTestId("emitted").textContent).toBe("0.5");
    });

    it("canonicalises the visible text on blur (007 → 7)", () => {
        render(<Harness initial={null} />);
        const input = getInput();
        fireEvent.change(input, { target: { value: "007" } });
        fireEvent.blur(input);
        expect(input.value).toBe("7");
    });

    it("adopts an external value change without clobbering", () => {
        function ExternalHarness() {
            const [value, setValue] = useState<number | null>(1);
            return (
                <div>
                    <NumberInput value={value} onValueChange={setValue} aria-label="n" />
                    <button onClick={() => setValue(99)}>set99</button>
                </div>
            );
        }
        render(<ExternalHarness />);
        const input = getInput();
        expect(input.value).toBe("1");
        fireEvent.click(screen.getByText("set99"));
        expect(input.value).toBe("99");
    });
});
