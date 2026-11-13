import { supabase } from "@/lib/supabase";

export const ASSIGNMENT_DISCUSSIONS_BUCKET = "assignment-discussions";
export const MAX_ASSIGNMENT_DISCUSSION_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ASSIGNMENT_DISCUSSIONS_PAGE_SIZE = 30;

export type DiscussionCategory = "question" | "assignment_help" | "study_group";
export type AssignmentDiscussionReportType = "assignment_discussion" | "assignment_discussion_reply";

export type DiscussionAuthor = {
  username: string;
  display_name: string;
  avatar_path: string | null;
};

export type DiscussionAttachment = {
  id: string;
  discussion_id: string;
  reply_id: string | null;
  uploaded_by: string;
  object_path: string;
  file_name: string;
  file_size: number;
  content_type: "application/pdf";
  created_at: string;
};

export type AssignmentDiscussionReply = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: DiscussionAuthor | null;
  attachments: DiscussionAttachment[];
};

export type AssignmentDiscussion = {
  id: string;
  course_id: string;
  author_id: string;
  category: DiscussionCategory;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: DiscussionAuthor | null;
  attachments: DiscussionAttachment[];
  replies: AssignmentDiscussionReply[];
};

type AttachmentRow = DiscussionAttachment;
type ReplyRow = Omit<AssignmentDiscussionReply, "attachments"> & {
  attachments: AttachmentRow[] | null;
};
type DiscussionRow = Omit<AssignmentDiscussion, "attachments" | "replies"> & {
  attachments: AttachmentRow[] | null;
  replies: ReplyRow[] | null;
};

const DISCUSSION_SELECT = `
  id,course_id,author_id,category,title,body,created_at,updated_at,
  author:profiles!assignment_discussions_author_id_fkey(username,display_name,avatar_path),
  attachments:assignment_discussion_attachments!assignment_discussion_attachments_discussion_id_fkey(id,discussion_id,reply_id,uploaded_by,object_path,file_name,file_size,content_type,created_at),
  replies:assignment_discussion_replies!assignment_discussion_replies_discussion_id_fkey(
    id,discussion_id,author_id,body,created_at,updated_at,
    author:profiles!assignment_discussion_replies_author_id_fkey(username,display_name,avatar_path),
    attachments:assignment_discussion_attachments!assignment_discussion_attachments_reply_same_discussion_fk(id,discussion_id,reply_id,uploaded_by,object_path,file_name,file_size,content_type,created_at)
  )
`;

export function validateDiscussionAttachment(file: File): string | null {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    return "Choose a PDF attachment.";
  }
  if (file.size <= 0 || file.size > MAX_ASSIGNMENT_DISCUSSION_ATTACHMENT_BYTES) {
    return "The PDF must be smaller than 10 MB.";
  }
  return null;
}

export async function listAssignmentDiscussions(courseId: string): Promise<AssignmentDiscussion[]> {
  const { data, error } = await supabase
    .from("assignment_discussions")
    .select(DISCUSSION_SELECT)
    .eq("course_id", courseId)
    .eq("status", "visible")
    .eq("replies.status", "visible")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ASSIGNMENT_DISCUSSIONS_PAGE_SIZE);
  if (error) throw error;
  return ((data ?? []) as unknown as DiscussionRow[]).map(normalizeDiscussion);
}

export type CreateDiscussionInput = {
  courseId: string;
  category: DiscussionCategory;
  title: string;
  body: string;
  file: File | null;
};

export async function createAssignmentDiscussion(input: CreateDiscussionInput): Promise<string> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 5 || title.length > 200) throw new Error("The title must be between 5 and 200 characters.");
  if (body.length < 10 || body.length > 5000) throw new Error("The discussion must be between 10 and 5,000 characters.");
  if (input.file) {
    const fileError = validateDiscussionAttachment(input.file);
    if (fileError) throw new Error(fileError);
  }

  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("assignment_discussions")
    .insert({
      course_id: input.courseId,
      category: input.category,
      title,
      body,
      author_id: userId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const discussionId = (data as { id: string }).id;
  if (input.file) {
    try {
      await uploadDiscussionAttachment(discussionId, null, input.file, userId);
    } catch (attachmentError) {
      const { error: rollbackError } = await supabase.rpc("delete_own_assignment_discussion", {
        p_discussion_id: discussionId,
      });
      if (rollbackError) {
        throw new Error(`The discussion was created, but its attachment failed and cleanup failed: ${rollbackError.message}`);
      }
      throw attachmentError;
    }
  }
  return discussionId;
}

export type CreateDiscussionReplyInput = {
  discussionId: string;
  body: string;
  file: File | null;
};

export async function createAssignmentDiscussionReply(input: CreateDiscussionReplyInput): Promise<string> {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 3000) throw new Error("A reply must be between 1 and 3,000 characters.");
  if (input.file) {
    const fileError = validateDiscussionAttachment(input.file);
    if (fileError) throw new Error(fileError);
  }

  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("assignment_discussion_replies")
    .insert({ discussion_id: input.discussionId, body, author_id: userId })
    .select("id")
    .single();
  if (error) throw error;

  const replyId = (data as { id: string }).id;
  if (input.file) {
    try {
      await uploadDiscussionAttachment(input.discussionId, replyId, input.file, userId);
    } catch (attachmentError) {
      const { error: rollbackError } = await supabase.rpc("delete_own_assignment_discussion_reply", {
        p_reply_id: replyId,
      });
      if (rollbackError) {
        throw new Error(`The reply was created, but its attachment failed and cleanup failed: ${rollbackError.message}`);
      }
      throw attachmentError;
    }
  }
  return replyId;
}

export async function updateAssignmentDiscussion(
  discussionId: string,
  input: Pick<CreateDiscussionInput, "category" | "title" | "body">,
): Promise<void> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 5 || title.length > 200) throw new Error("The title must be between 5 and 200 characters.");
  if (body.length < 10 || body.length > 5000) throw new Error("The discussion must be between 10 and 5,000 characters.");
  const { data, error } = await supabase
    .from("assignment_discussions")
    .update({ category: input.category, title, body })
    .eq("id", discussionId)
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("The discussion could not be updated.");
}

export async function updateAssignmentDiscussionReply(replyId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 3000) throw new Error("A reply must be between 1 and 3,000 characters.");
  const { data, error } = await supabase
    .from("assignment_discussion_replies")
    .update({ body: trimmed })
    .eq("id", replyId)
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("The reply could not be updated.");
}

export async function deleteAssignmentDiscussion(discussionId: string): Promise<void> {
  const userId = await currentUserId();
  const attachments = await getOwnedDiscussionAttachments(discussionId, userId);
  const { error } = await supabase.rpc("delete_own_assignment_discussion", { p_discussion_id: discussionId });
  if (error) throw error;
  await removeOwnedDiscussionAttachments(attachments);
}

export async function deleteAssignmentDiscussionReply(replyId: string, discussionId: string): Promise<void> {
  const userId = await currentUserId();
  const attachments = await getOwnedDiscussionAttachments(discussionId, userId, replyId);
  const { error } = await supabase.rpc("delete_own_assignment_discussion_reply", { p_reply_id: replyId });
  if (error) throw error;
  await removeOwnedDiscussionAttachments(attachments);
}

export async function deleteAssignmentDiscussionAttachment(attachment: DiscussionAttachment): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(ASSIGNMENT_DISCUSSIONS_BUCKET)
    .remove([attachment.object_path]);
  if (storageError) throw storageError;
  const { error } = await supabase
    .from("assignment_discussion_attachments")
    .delete()
    .eq("id", attachment.id);
  if (error) throw new Error(`The file was removed, but its record could not be updated: ${error.message}`);
}

export async function createDiscussionAttachmentUrl(objectPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ASSIGNMENT_DISCUSSIONS_BUCKET)
    .createSignedUrl(objectPath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function reportAssignmentDiscussion(
  type: AssignmentDiscussionReportType,
  targetId: string,
  category: string,
  explanation: string,
): Promise<void> {
  const { error } = await supabase.rpc("submit_assignment_discussion_report", {
    p_type: type,
    p_target: targetId,
    p_category: category,
    p_explanation: explanation.trim() || null,
  });
  if (error) throw error;
}

async function uploadDiscussionAttachment(
  discussionId: string,
  replyId: string | null,
  file: File,
  userId: string,
): Promise<void> {
  const objectPath = `${userId}/${discussionId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(ASSIGNMENT_DISCUSSIONS_BUCKET)
    .upload(objectPath, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("assignment_discussion_attachments").insert({
    discussion_id: discussionId,
    reply_id: replyId,
    uploaded_by: userId,
    object_path: objectPath,
    file_name: file.name.slice(0, 160),
    file_size: file.size,
    content_type: "application/pdf",
  });
  if (!insertError) return;

  const { error: cleanupError } = await supabase.storage
    .from(ASSIGNMENT_DISCUSSIONS_BUCKET)
    .remove([objectPath]);
  if (cleanupError) {
    throw new Error(`Could not save attachment (${insertError.message}); uploaded file cleanup also failed (${cleanupError.message}).`);
  }
  throw insertError;
}

type OwnedDiscussionAttachment = { id: string; object_path: string };

async function getOwnedDiscussionAttachments(
  discussionId: string,
  userId: string,
  replyId?: string,
): Promise<OwnedDiscussionAttachment[]> {
  let query = supabase
    .from("assignment_discussion_attachments")
    .select("id,object_path")
    .eq("discussion_id", discussionId)
    .eq("uploaded_by", userId);
  if (replyId) query = query.eq("reply_id", replyId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OwnedDiscussionAttachment[];
}

async function removeOwnedDiscussionAttachments(attachments: OwnedDiscussionAttachment[]): Promise<void> {
  if (!attachments.length) return;
  const paths = attachments.map((attachment) => attachment.object_path);
  const { error: storageError } = await supabase.storage
    .from(ASSIGNMENT_DISCUSSIONS_BUCKET)
    .remove(paths);
  if (storageError) {
    throw new Error(`The content was deleted, but some attachments could not be removed: ${storageError.message}`);
  }
  const { error: metadataError } = await supabase
    .from("assignment_discussion_attachments")
    .delete()
    .in("id", attachments.map((attachment) => attachment.id));
  if (metadataError) {
    throw new Error(`The files were removed, but their records could not be cleaned up: ${metadataError.message}`);
  }
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Sign in to use assignment discussion rooms.");
  return data.user.id;
}

function normalizeDiscussion(row: DiscussionRow): AssignmentDiscussion {
  const replies = (row.replies ?? []).map((reply) => ({
    ...reply,
    attachments: (reply.attachments ?? []).filter((attachment) => attachment.reply_id === reply.id),
  }));
  return {
    ...row,
    attachments: (row.attachments ?? []).filter((attachment) => attachment.reply_id === null),
    replies: replies.sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}
