"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";

import { PromptComposer } from "../components/PromptComposer";
import {
  createPendingPdfAttachmentDrafts,
  writePendingPdfAttachments,
  type PendingPdfAttachmentDraft,
} from "../lib/pending-pdf-attachments";
import { buildLearnHref, createLearnSessionId } from "../lib/learn-route";

export default function HomePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draftSessionId] = useState(() => createLearnSessionId());
  const [goal, setGoal] = useState("");
  const [pendingAction, setPendingAction] = useState<"generate" | "live" | null>(null);
  const [pendingPdfDrafts, setPendingPdfDrafts] = useState<PendingPdfAttachmentDraft[]>([]);

  function launch(action: "generate" | "live") {
    setPendingAction(action);

    startTransition(() => {
      router.push(
        buildLearnHref({
          sessionId: draftSessionId,
          courseOwnerUsername: null,
          courseSlug: null,
          goal,
          autoStartAction: action,
        }),
      );
    });
  }

  function handleAttachPdfFiles(files: File[]) {
    const pdfFiles = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      return;
    }

    const nextDrafts = [...pendingPdfDrafts, ...createPendingPdfAttachmentDrafts(pdfFiles)];
    setPendingPdfDrafts(nextDrafts);
    writePendingPdfAttachments(draftSessionId, nextDrafts);
  }

  function handleRemoveAttachment(attachmentId: string) {
    const nextDrafts = pendingPdfDrafts.filter((draft) => draft.id !== attachmentId);
    setPendingPdfDrafts(nextDrafts);
    writePendingPdfAttachments(draftSessionId, nextDrafts);
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <div style={styles.hero}>
          <Image src="/icon.png" alt="Prof." width={120} height={120} style={styles.logo} priority />
          <h1 style={styles.tagline}>knowledge liberates</h1>
        </div>

        <PromptComposer
          goal={goal}
          onGoalChange={setGoal}
          onGenerate={() => launch("generate")}
          onLive={() => launch("live")}
          onAttachPdfFiles={handleAttachPdfFiles}
          onRemoveAttachment={handleRemoveAttachment}
          attachments={pendingPdfDrafts.map((draft) => ({
            id: draft.id,
            title: draft.file.name,
          }))}
          generateLabel={isPending && pendingAction === "generate" ? "Sending..." : "Send"}
          generateBusy={isPending && pendingAction === "generate"}
          generateIconOnly
          liveLabel={isPending && pendingAction === "live" ? "..." : "Live"}
          showAttach
          attachDisabled={isPending}
          generateDisabled={isPending}
          liveDisabled={isPending}
          placeholder="What do you want to learn?"
          rows={1}
          variant="home"
        />
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    padding: "24px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  shell: {
    width: "100%",
    maxWidth: "720px",
    display: "flex",
    flexDirection: "column",
    gap: "22px",
    alignItems: "center",
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    marginTop: "-124px",
  },
  logo: {
    width: "88px",
    height: "auto",
  },
  tagline: {
    margin: 0,
    fontSize: "clamp(1.38rem, 2.8vw, 1.82rem)",
    lineHeight: 1,
    fontWeight: 550,
    color: "#5e493d",
    letterSpacing: "0.01em",
    textAlign: "center",
  },
};
