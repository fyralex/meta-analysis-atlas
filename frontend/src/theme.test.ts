import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, readTheme } from "./theme";

afterEach(() => {
  applyTheme("system");
});

describe("the theme choice", () => {
  it("starts on the system setting", () => {
    expect(readTheme()).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("stores and applies light or dark, and forgets them for system", () => {
    applyTheme("dark");
    expect(readTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("system");
    expect(readTheme()).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
