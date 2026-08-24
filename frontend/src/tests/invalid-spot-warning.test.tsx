import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InvalidSpotWarningSheet } from "../components/InvalidSpotWarningSheet";

describe("invalid spot replacement choices", () => {
  it("shows multiple alternatives and reports the one explicitly confirmed", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();

    render(
      <InvalidSpotWarningSheet
        warning={{
          spotId: "A01",
          status: "occupied",
          alternativeSpotId: "A02",
          alternativeSpotIds: ["A02", "A03", "A04"],
        }}
        onSwitch={onSwitch}
        onContinueMap={vi.fn()}
      />,
    );

    expect(screen.getByText("A02 · A03 · A04")).toBeVisible();
    await user.click(screen.getByTestId("switch-alternative-A03"));
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onSwitch).toHaveBeenCalledWith("A03");
  });
});
