import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updatePasswordMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "temp@example.com",
      role: "DEALER_EMPLOYEE",
      mustChangePassword: true,
    },
    isLoading: false,
    updatePassword: updatePasswordMock,
    signOut: signOutMock,
  }),
}));

vi.mock("../app/AppRouter", () => ({
  AppRouter: () => <div>Route content</div>,
}));

import App from "../App";

describe("forced temporary password change", () => {
  beforeEach(() => {
    updatePasswordMock.mockReset();
    updatePasswordMock.mockResolvedValue(undefined);
    signOutMock.mockReset();
  });

  it("blocks signed-in temporary-password users until they choose a new password", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText("Route content")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /change your password/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/new password/i), "new-password-1");
    await user.type(screen.getByLabelText(/confirm password/i), "new-password-1");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(updatePasswordMock).toHaveBeenCalledWith("new-password-1");
    });
  });
});
