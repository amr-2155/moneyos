import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../i18n";
import { ThemeProvider } from "../lib/theme";
import { ToastProvider } from "../components/Toast";
import { AuthPage } from "./Auth";

const signIn = vi.fn();
const signUp = vi.fn();
const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();

vi.mock("../lib/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    loading: false,
    offline: false,
    signIn,
    signUp,
    signOut: vi.fn(),
    updateUser: vi.fn(),
    requestPasswordReset,
    resetPassword,
  }),
}));

function renderAuth(mode: "login" | "signup" | "forgot" | "reset", route = "/") {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={[route]}>
          <ToastProvider>
            <AuthPage mode={mode} />
          </ToastProvider>
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe("AuthPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("shows localized copy for each mode", () => {
    const { unmount } = renderAuth("login");
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    unmount();

    renderAuth("signup");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("rejects a short password before calling the API", async () => {
    const user = userEvent.setup();
    renderAuth("signup");

    await user.type(screen.getByLabelText("Name"), "Amr");
    await user.type(screen.getByLabelText("Email"), "amr@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.type(screen.getByLabelText("Confirm password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 8 characters.",
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const user = userEvent.setup();
    renderAuth("signup");

    await user.type(screen.getByLabelText("Name"), "Amr");
    await user.type(screen.getByLabelText("Email"), "amr@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "supersecrez");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("signs in with the entered credentials", async () => {
    signIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAuth("login");

    await user.type(screen.getByLabelText("Email"), "AMR@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith("AMR@example.com", "supersecret"));
  });

  it("surfaces invalid credentials from the API", async () => {
    const { ApiError } = await import("../lib/api");
    signIn.mockRejectedValue(new ApiError("bad", 401, "INVALID_CREDENTIALS"));
    const user = userEvent.setup();
    renderAuth("login");

    await user.type(screen.getByLabelText("Email"), "amr@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email or password. Please try again.",
    );
  });

  it("explains when the backend cannot be reached", async () => {
    const { ApiError } = await import("../lib/api");
    signIn.mockRejectedValue(new ApiError("offline", 0, "NETWORK_ERROR"));
    const user = userEvent.setup();
    renderAuth("login");

    await user.type(screen.getByLabelText("Email"), "amr@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot reach the server. Check your connection and try again.",
    );
  });

  it("requests a reset link and shows the sent state", async () => {
    requestPasswordReset.mockResolvedValue({ resetToken: null });
    const user = userEvent.setup();
    renderAuth("forgot");

    await user.type(screen.getByLabelText("Email"), "amr@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(requestPasswordReset).toHaveBeenCalledWith("amr@example.com");
  });

  it("offers the dev reset link when the backend returns one", async () => {
    requestPasswordReset.mockResolvedValue({ resetToken: "abc123" });
    const user = userEvent.setup();
    renderAuth("forgot");

    await user.type(screen.getByLabelText("Email"), "amr@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    const link = await screen.findByRole("link", { name: "Open reset link" });
    expect(link).toHaveAttribute("href", "/reset-password?token=abc123");
  });

  it("reports an invalid reset token", async () => {
    const user = userEvent.setup();
    renderAuth("reset", "/reset-password");

    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired reset link.");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("submits a valid reset token and confirms success", async () => {
    resetPassword.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAuth("reset", "/reset-password?token=tok-1234567890");

    await user.type(screen.getByLabelText("Password"), "supersecret");
    await user.type(screen.getByLabelText("Confirm password"), "supersecret");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith("tok-1234567890", "supersecret"));
    expect(await screen.findByText("Password reset successfully!")).toBeInTheDocument();
  });
});
