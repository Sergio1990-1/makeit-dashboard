import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AnnotationModal } from "../../src/components/quality/AnnotationModal";

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
});
