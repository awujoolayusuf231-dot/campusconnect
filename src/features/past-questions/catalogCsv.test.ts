import { describe, expect, it } from "vitest";
import { parseCatalogCsv } from "./catalogCsv";

describe("parseCatalogCsv", () => {
  it("reads quoted institution names and course titles containing commas", () => {
    const rows = parseCatalogCsv(
      'course_title,department,institution,course_code\r\n"Introduction to Biology, I","Life Sciences","A.D. Rufa’i College of Education, Legal and General Studies","BIO 101"\r\n',
    );

    expect(rows).toEqual([{
      rowNumber: 2,
      institution: "A.D. Rufa’i College of Education, Legal and General Studies",
      department: "Life Sciences",
      courseCode: "BIO 101",
      courseTitle: "Introduction to Biology, I",
    }]);
  });

  it("rejects missing headers, incomplete rows, and malformed quoted fields", () => {
    expect(() => parseCatalogCsv("department,course_code,course_title\nBiology,BIO 101,Intro")).toThrow("Missing required CSV columns: institution.");
    expect(() => parseCatalogCsv("institution,department,course_code,course_title\nUniversity,Biology,,Intro")).toThrow("CSV row 2 is missing: course_code.");
    expect(() => parseCatalogCsv('institution,department,course_code,course_title\n"University,Biology,BIO 101,Intro')).toThrow("Unclosed quoted field");
  });
});
