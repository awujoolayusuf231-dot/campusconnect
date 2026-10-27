import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_SETTINGS, parsePublicSettings } from "./publicSettings";

describe("parsePublicSettings", () => {
  it("falls back to defaults", () => expect(parsePublicSettings([])).toEqual(DEFAULT_PUBLIC_SETTINGS));
  it("applies known keys of the right type", () => {
    const s = parsePublicSettings([{ key: "registration_open", value: false }, { key: "platform_name", value: "CampusConnect NG" }]);
    expect(s.registration_open).toBe(false); expect(s.platform_name).toBe("CampusConnect NG");
  });
  it("ignores wrong types and unknown keys", () => {
    const s = parsePublicSettings([{ key: "registration_open", value: "no" }, { key: "evil", value: 1 }]);
    expect(s.registration_open).toBe(true); expect("evil" in s).toBe(false);
  });
});
