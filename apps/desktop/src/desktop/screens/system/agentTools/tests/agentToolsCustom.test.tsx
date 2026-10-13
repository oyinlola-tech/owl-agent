import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentToolsScreen } from "../agentTools.screen";
import type { CustomToolRead } from "../../../../services/agentApi.types";

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    tools: vi.fn(),
    customTools: vi.fn(),
    createCustomTool: vi.fn(),
    updateCustomTool: vi.fn(),
    deleteCustomTool: vi.fn(),
    setCustomToolEnabled: vi.fn(),
  },
}));

vi.mock("../../../../services/agentApi.service", () => ({
  agentApi: mockApi,
  isServiceAuthError: () => false,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function tool(overrides: Partial<CustomToolRead> = {}): CustomToolRead {
  return {
    id: "ctool-abc123",
    name: "lint",
    description: "Run the linter.",
    argv: ["make", "lint", "{args}"],
    risk: "high",
    project: "",
    enabled: false,
    ...overrides,
  };
}

function mockLoaded(items: CustomToolRead[]) {
  mockApi.tools.mockResolvedValue([]);
  mockApi.customTools.mockResolvedValue(items);
}

describe("AgentToolsScreen custom tools", () => {
  it("shows a loading state while custom tools load", () => {
    mockApi.tools.mockResolvedValue([]);
    mockApi.customTools.mockReturnValue(new Promise(() => {}));
    render(<AgentToolsScreen />);
    expect(screen.getByRole("status").textContent).toContain("Loading custom tools…");
  });

  it("shows an error state with retry", async () => {
    mockApi.tools.mockResolvedValue([]);
    mockApi.customTools.mockRejectedValue(new Error("offline"));
    render(<AgentToolsScreen />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Couldn't load custom tools."));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockApi.customTools).toHaveBeenCalledTimes(2);
  });

  it("lists tools with enable, edit, and delete actions", async () => {
    mockLoaded([tool()]);
    render(<AgentToolsScreen />);
    await waitFor(() => expect(screen.getByText("custom-lint")).toBeTruthy());
    expect(screen.getByText("make lint {args}")).toBeTruthy();
    expect(screen.getByText("High risk")).toBeTruthy();
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable custom tool lint" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit custom tool lint" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete custom tool lint" })).toBeTruthy();
  });

  it("shows an empty state with no sample data", async () => {
    mockLoaded([]);
    render(<AgentToolsScreen />);
    await waitFor(() => expect(screen.getByText("No custom tools yet. Add one to give OWL a command of your own.")).toBeTruthy());
    expect(screen.queryByRole("list", { name: "Custom tool list" })).toBeNull();
  });

  it("creates a tool from the add form", async () => {
    mockLoaded([]);
    mockApi.createCustomTool.mockResolvedValue(tool({ enabled: false }));
    render(<AgentToolsScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add custom tool" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add custom tool" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "lint" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Run the linter." } });
    fireEvent.change(screen.getByLabelText(/Command, one argument per line/), {
      target: { value: "make\nlint\n{args}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add custom tool", hidden: true }));
    await waitFor(() => expect(mockApi.createCustomTool).toHaveBeenCalledWith({
      name: "lint",
      description: "Run the linter.",
      argv: ["make", "lint", "{args}"],
      risk: "high",
      project: "",
    }));
  });

  it("rejects a bad name client-side without calling the service", async () => {
    mockLoaded([]);
    render(<AgentToolsScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add custom tool" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add custom tool" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Name!" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText(/Command, one argument per line/), { target: { value: "make" } });
    fireEvent.click(screen.getByRole("button", { name: "Add custom tool", hidden: true }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Name must be 1-40 lowercase letters"));
    expect(mockApi.createCustomTool).not.toHaveBeenCalled();
  });

  it("enables and deletes a tool with confirmation", async () => {
    mockLoaded([tool()]);
    mockApi.setCustomToolEnabled.mockResolvedValue({ enabled: true });
    mockApi.deleteCustomTool.mockResolvedValue({ deleted: true });
    render(<AgentToolsScreen />);
    await waitFor(() => expect(screen.getByText("custom-lint")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Enable custom tool lint" }));
    await waitFor(() => expect(mockApi.setCustomToolEnabled).toHaveBeenCalledWith("ctool-abc123", true));
    fireEvent.click(screen.getByRole("button", { name: "Delete custom tool lint" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm delete/ }));
    await waitFor(() => expect(mockApi.deleteCustomTool).toHaveBeenCalledWith("ctool-abc123"));
  });

  it("edits a tool without renaming it", async () => {
    mockLoaded([tool({ enabled: true })]);
    mockApi.updateCustomTool.mockResolvedValue(tool({ description: "Lint all.", enabled: true }));
    render(<AgentToolsScreen />);
    await waitFor(() => expect(screen.getByText("custom-lint")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Edit custom tool lint" }));
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Lint all." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mockApi.updateCustomTool).toHaveBeenCalledWith(
      "ctool-abc123",
      { description: "Lint all.", argv: ["make", "lint", "{args}"], risk: "high", project: "" },
    ));
  });
});
