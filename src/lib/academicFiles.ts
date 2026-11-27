const FILE_TYPES = {
  pdf: { contentType: "application/pdf", kind: "pdf" },
  jpg: { contentType: "image/jpeg", kind: "image" },
  jpeg: { contentType: "image/jpeg", kind: "image" },
  png: { contentType: "image/png", kind: "image" },
  webp: { contentType: "image/webp", kind: "image" },
  doc: { contentType: "application/msword", kind: "document" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document" },
} as const;

export type AcademicFileKind = (typeof FILE_TYPES)[keyof typeof FILE_TYPES]["kind"];
export type AcademicFileDetails = {
  extension: keyof typeof FILE_TYPES;
  contentType: (typeof FILE_TYPES)[keyof typeof FILE_TYPES]["contentType"];
  kind: AcademicFileKind;
};

export const ACADEMIC_FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";
export const ACADEMIC_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export function getAcademicFileDetails(file: Pick<File, "name" | "type">): AcademicFileDetails | null {
  const extension = file.name.split(".").pop()?.toLowerCase() as keyof typeof FILE_TYPES | undefined;
  if (!extension || !(extension in FILE_TYPES)) return null;
  const details = FILE_TYPES[extension];
  if (file.type && file.type !== details.contentType && file.type !== "application/octet-stream") return null;
  return { extension, ...details };
}

export function getAcademicFileKindFromPath(path: string): AcademicFileKind | null {
  const extension = path.split(".").pop()?.toLowerCase() as keyof typeof FILE_TYPES | undefined;
  return extension && extension in FILE_TYPES ? FILE_TYPES[extension].kind : null;
}

export function getAcademicFileExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "file";
}
