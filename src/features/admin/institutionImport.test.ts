import { describe, expect, it } from "vitest";
import { previewInstitutionCsv } from "./institutionImport";

describe("previewInstitutionCsv", () => {
  it("parses quoted CSV values, aliases, and institution types", () => {
    const preview = previewInstitutionCsv(
      'name,short_name,type,state,aliases\r\n"Example, University",EXU,university,Lagos,"Example Uni|EU"',
      [],
    );

    expect(preview.rows).toEqual([{
      rowNumber: 2,
      name: "Example, University",
      short_name: "EXU",
      type: "university",
      state: "Lagos",
      aliases: ["Example Uni", "EU"],
    }]);
    expect(preview.issues).toEqual([]);
  });

  it("skips names already in the database and duplicates within the upload", () => {
    const preview = previewInstitutionCsv(
      "name,type\nExisting Polytechnic,polytechnic\nNew College,college_of_education\nnew college,university",
      ["Existing Polytechnic"],
    );

    expect(preview.rows.map((row) => row.name)).toEqual(["New College"]);
    expect(preview.duplicates.map(({ rowNumber }) => rowNumber)).toEqual([2, 4]);
  });

  it("reports invalid rows and missing required headers", () => {
    const preview = previewInstitutionCsv("name,type\nAB,school\nGood Institution,university", []);
    expect(preview.issues).toEqual([{ rowNumber: 2, message: expect.stringContaining("Name must") }]);
    expect(() => previewInstitutionCsv("name,state\nExample University,Lagos", [])).toThrow(/name and type columns/i);
  });

  it("rejects malformed quoted CSV", () => {
    expect(() => previewInstitutionCsv('name,type\n"Example University,university', [])).toThrow(/unclosed quoted field/i);
  });
});
