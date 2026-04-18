import { createPublicId } from "@prof/contracts";

export type PendingAttachmentDraft = {
  id: string;
  file: File;
};

const pendingAttachmentDraftsBySessionId = new Map<string, PendingAttachmentDraft[]>();

export function createPendingAttachmentDrafts(files: File[]) {
  return files.map((file) => ({
    id: createPublicId(12),
    file,
  }));
}

export function readPendingAttachmentDrafts(sessionId: string) {
  return (pendingAttachmentDraftsBySessionId.get(sessionId) ?? []).map(clonePendingAttachmentDraft);
}

export function writePendingAttachmentDrafts(sessionId: string, drafts: PendingAttachmentDraft[]) {
  if (drafts.length === 0) {
    pendingAttachmentDraftsBySessionId.delete(sessionId);
    return;
  }

  pendingAttachmentDraftsBySessionId.set(sessionId, drafts.map(clonePendingAttachmentDraft));
}

function clonePendingAttachmentDraft(draft: PendingAttachmentDraft): PendingAttachmentDraft {
  return {
    ...draft,
  };
}
