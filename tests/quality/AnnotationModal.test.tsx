import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AnnotationModal } from "../../src/components/quality/AnnotationModal";

beforeEach(() => {
  // device_hint persists in localStorage between tests — clear so each
  // test starts from the "first-time user" state unless it explicitly
  // seeds a value.
  localStorage.clear();
});
afterEach(cleanup);

describe("AnnotationModal", () => {
  it("submits annotation with form values converted to UTC", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    const { getByLabelText, getByText } = render(
      <AnnotationModal onSubmit={onSubmit} onClose={vi.fn()} />
    );
    fireEvent.change(getByLabelText(/дата/i), { target: { value: "2026-05-22" } });
    fireEvent.change(getByLabelText(/title/i), { target: { value: "test event" } });
    fireEvent.click(getByText(/сохранить/i));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        occurred_at: "2026-05-22T00:00:00.000Z",
        category: "skill",
        scope: "global",
        title: "test event",
        desc: "",
      })
    );
  });

  it("surfaces submit failure inline and keeps modal open", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    const onClose = vi.fn();
    const { getByLabelText, getByText, findByRole } = render(
      <AnnotationModal onSubmit={onSubmit} onClose={onClose} />
    );
    fireEvent.change(getByLabelText(/title/i), { target: { value: "test" } });
    fireEvent.click(getByText(/сохранить/i));
    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/HTTP 500/);
    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });

  it("submits device_hint when user fills it and persists to localStorage", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    const { getByLabelText, getByText } = render(
      <AnnotationModal onSubmit={onSubmit} onClose={vi.fn()} />
    );
    fireEvent.change(getByLabelText(/title/i), { target: { value: "deploy" } });
    fireEvent.change(getByLabelText(/устройство/i), { target: { value: "Mac Sergey" } });
    fireEvent.click(getByText(/сохранить/i));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ device_hint: "Mac Sergey" }),
    );
    expect(localStorage.getItem("makeit_device_hint")).toBe("Mac Sergey");
  });

  it("prefills device_hint from localStorage on next open", () => {
    localStorage.setItem("makeit_device_hint", "office iPad");
    const { getByLabelText } = render(
      <AnnotationModal onSubmit={vi.fn()} onClose={vi.fn()} />
    );
    expect((getByLabelText(/устройство/i) as HTMLInputElement).value).toBe(
      "office iPad",
    );
  });

  it("omits device_hint from payload when blank (no false attribution)", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    const { getByLabelText, getByText } = render(
      <AnnotationModal onSubmit={onSubmit} onClose={vi.fn()} />
    );
    fireEvent.change(getByLabelText(/title/i), { target: { value: "x" } });
    fireEvent.click(getByText(/сохранить/i));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).not.toHaveProperty("device_hint");
  });
});
