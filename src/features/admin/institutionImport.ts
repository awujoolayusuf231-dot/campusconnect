export type InstitutionImportType = "university" | "polytechnic" | "college_of_education" | "other";

export interface InstitutionImportRow {
  rowNumber: number;
  name: string;
  short_name: string | null;
  type: InstitutionImportType;
  state: string | null;
  aliases: string[];
}

export interface InstitutionImportIssue {
  rowNumber: number;
  message: string;
}

export interface InstitutionImportDuplicate {
  rowNumber: number;
  name: string;
  message: string;
}

export interface InstitutionImportPreview {
  rows: InstitutionImportRow[];
  issues: InstitutionImportIssue[];
  duplicates: InstitutionImportDuplicate[];
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      record.push(field);
      if (record.some((value) => value.trim().length > 0)) {
        records.push(record);
        if (records.length > 2001) throw new Error("A single import can contain at most 2,000 institution rows.");
      }
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  record.push(field);
  if (record.some((value) => value.trim().length > 0)) {
    records.push(record);
    if (records.length > 2001) throw new Error("A single import can contain at most 2,000 institution rows.");
  }
  return records;
}

function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function institutionType(value: string): InstitutionImportType | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "university" || normalized === "polytechnic" || normalized === "college_of_education" || normalized === "other") return normalized;
  return null;
}

export function previewInstitutionCsv(input: string, existingNames: readonly string[]): InstitutionImportPreview {
  const records = parseCsvRecords(input);
  if (records.length === 0) throw new Error("The CSV file is empty.");

  const headerRecord = records[0];
  if (!headerRecord) throw new Error("The CSV file is empty.");
  const headers = headerRecord.map((header) => header.trim().replace(/^\uFEFF/, "").toLowerCase());
  const nameIndex = headers.indexOf("name");
  const typeIndex = headers.indexOf("type");
  if (nameIndex < 0 || typeIndex < 0) throw new Error("The CSV must include required name and type columns.");

  const indexFor = (header: string) => headers.indexOf(header);
  const shortNameIndex = indexFor("short_name");
  const stateIndex = indexFor("state");
  const aliasesIndex = indexFor("aliases");
  const seen = new Set(existingNames.map(normalizedName));
  const rows: InstitutionImportRow[] = [];
  const issues: InstitutionImportIssue[] = [];
  const duplicates: InstitutionImportDuplicate[] = [];

  records.slice(1).forEach((record, index) => {
    const rowNumber = index + 2;
    const name = (record[nameIndex] ?? "").trim().replace(/\s+/g, " ");
    const type = institutionType(record[typeIndex] ?? "");
    const shortName = shortNameIndex < 0 ? "" : (record[shortNameIndex] ?? "").trim();
    const state = stateIndex < 0 ? "" : (record[stateIndex] ?? "").trim();
    const aliases = aliasesIndex < 0
      ? []
      : (record[aliasesIndex] ?? "").split("|").map((alias) => alias.trim()).filter(Boolean);

    const messages: string[] = [];
    if (name.length < 3 || name.length > 150) messages.push("Name must be between 3 and 150 characters.");
    if (!type) messages.push("Type must be university, polytechnic, college_of_education, or other.");
    if (shortName && (shortName.length < 2 || shortName.length > 20)) messages.push("Short name must be 2–20 characters.");
    if (state.length > 40) messages.push("State must be 40 characters or fewer.");
    if (aliases.length > 10) messages.push("Use no more than 10 aliases, separated with |.");

    if (messages.length > 0 || !type) {
      issues.push({ rowNumber, message: messages.join(" ") });
      return;
    }

    const normalized = normalizedName(name);
    if (seen.has(normalized)) {
      duplicates.push({ rowNumber, name, message: "Duplicate name; it will be skipped." });
      return;
    }
    seen.add(normalized);
    rows.push({
      rowNumber,
      name,
      short_name: shortName || null,
      type,
      state: state || null,
      aliases,
    });
  });

  return { rows, issues, duplicates };
}
