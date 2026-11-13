export type CatalogCsvRow = {
  rowNumber: number;
  institution: string;
  department: string;
  courseCode: string;
  courseTitle: string;
};

const REQUIRED_HEADERS = ["institution", "department", "course_code", "course_title"] as const;
const MAX_CATALOG_CSV_ROWS = 5000;

export function normalizeCatalogName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function parseCatalogCsv(contents: string): CatalogCsvRow[] {
  const records = parseRecords(contents.replace(/^\uFEFF/, ""));
  const headerRecord = records.shift();
  if (!headerRecord) throw new Error("The CSV file is empty.");

  const headers = headerRecord.cells.map((cell) => cell.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    if (headerIndexes.has(header)) throw new Error(`The CSV contains a duplicate "${header}" column.`);
    headerIndexes.set(header, index);
  });
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndexes.has(header));
  if (missingHeaders.length) throw new Error(`Missing required CSV columns: ${missingHeaders.join(", ")}.`);

  const dataRecords = records.filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
  if (dataRecords.length > MAX_CATALOG_CSV_ROWS) {
    throw new Error(`The CSV can contain at most ${MAX_CATALOG_CSV_ROWS} course rows.`);
  }

  return dataRecords.map(({ cells, line }) => {
    const field = (name: typeof REQUIRED_HEADERS[number]) => cells[headerIndexes.get(name)!]?.trim() ?? "";
    const row = {
      rowNumber: line,
      institution: field("institution"),
      department: field("department"),
      courseCode: field("course_code"),
      courseTitle: field("course_title"),
    };
    const values: Record<typeof REQUIRED_HEADERS[number], string> = {
      institution: row.institution,
      department: row.department,
      course_code: row.courseCode,
      course_title: row.courseTitle,
    };
    const missing = REQUIRED_HEADERS.filter((header) => !values[header]);
    if (missing.length) throw new Error(`CSV row ${line} is missing: ${missing.join(", ")}.`);
    if (row.department.length < 2 || row.department.length > 120) throw new Error(`CSV row ${line}: department must be 2-120 characters.`);
    if (row.courseCode.length > 30) throw new Error(`CSV row ${line}: course code must be 30 characters or fewer.`);
    if (row.courseTitle.length < 2 || row.courseTitle.length > 150) throw new Error(`CSV row ${line}: course title must be 2-150 characters.`);
    return row;
  });
}

function parseRecords(contents: string): { cells: string[]; line: number }[] {
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  function finishRecord() {
    cells.push(field);
    records.push({ cells, line: recordLine });
    cells = [];
    field = "";
  }

  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index];
    if (inQuotes) {
      if (char === '"') {
        if (contents[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
        if (char === "\n") line += 1;
        else if (char === "\r" && contents[index + 1] !== "\n") line += 1;
      }
      continue;
    }

    if (char === '"') {
      if (field.length) throw new Error(`Invalid quote in CSV row ${recordLine}.`);
      inQuotes = true;
    } else if (char === ",") {
      cells.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      finishRecord();
      if (char === "\r" && contents[index + 1] === "\n") index += 1;
      line += 1;
      recordLine = line;
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error(`Unclosed quoted field starting on CSV row ${recordLine}.`);
  if (field.length || cells.length) finishRecord();
  return records;
}
