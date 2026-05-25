// @vitest-environment jsdom
// device-hint touches localStorage and the global Storage shim, both of
// which only exist under jsdom — the default node env errors out with
// "localStorage is not defined".
import { describe, it, expect, beforeEach } from "vitest";
import {
  getDeviceHint,
  setDeviceHint,
  DEVICE_HINT_MAX_LEN,
} from "../../src/utils/device-hint";

beforeEach(() => {
  localStorage.clear();
});

describe("device-hint", () => {
  it("returns empty string when nothing stored", () => {
    expect(getDeviceHint()).toBe("");
  });

  it("roundtrips a value through localStorage", () => {
    setDeviceHint("Mac Sergey");
    expect(getDeviceHint()).toBe("Mac Sergey");
  });

  it("trims whitespace before storing", () => {
    setDeviceHint("  office iPad  ");
    expect(getDeviceHint()).toBe("office iPad");
  });

  it("truncates to DEVICE_HINT_MAX_LEN on write", () => {
    const long = "x".repeat(DEVICE_HINT_MAX_LEN + 20);
    setDeviceHint(long);
    expect(getDeviceHint().length).toBe(DEVICE_HINT_MAX_LEN);
  });

  it("clears storage when given empty string", () => {
    setDeviceHint("anything");
    setDeviceHint("");
    expect(localStorage.getItem("makeit_device_hint")).toBeNull();
    expect(getDeviceHint()).toBe("");
  });

  it("survives a legacy value longer than the cap (read path also truncates)", () => {
    localStorage.setItem("makeit_device_hint", "y".repeat(DEVICE_HINT_MAX_LEN + 5));
    expect(getDeviceHint().length).toBe(DEVICE_HINT_MAX_LEN);
  });
});
