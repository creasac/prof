import { createPublicId } from "@prof/contracts";

export type PendingPdfAttachmentDraft = {
  id: string;
  file: File;
};

const pendingPdfAttachmentsBySessionId = new Map<string, PendingPdfAttachmentDraft[]>();

export function createPendingPdfAttachmentDrafts(files: File[]) {
  return files.map((file) => ({
    id: createPublicId(12),
    file,
  }));
}

export function readPendingPdfAttachments(sessionId: string) {
  return (pendingPdfAttachmentsBySessionId.get(sessionId) ?? []).map(clonePendingPdfAttachmentDraft);
}

export function writePendingPdfAttachments(sessionId: string, drafts: PendingPdfAttachmentDraft[]) {
  if (drafts.length === 0) {
    pendingPdfAttachmentsBySessionId.delete(sessionId);
    return;
  }

  pendingPdfAttachmentsBySessionId.set(sessionId, drafts.map(clonePendingPdfAttachmentDraft));
}

function clonePendingPdfAttachmentDraft(draft: PendingPdfAttachmentDraft): PendingPdfAttachmentDraft {
  return {
    ...draft,
  };
}
