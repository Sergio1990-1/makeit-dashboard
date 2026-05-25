import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { AnnotationModal } from "../../src/components/quality/AnnotationModal";

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
});
