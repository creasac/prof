"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import type { TutorBlockType } from "@prof/contracts";

import { PromptComposer } from "../components/PromptComposer";
import { buildLearnHref, createLearnSessionId } from "../lib/learn-route";

export default function HomePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [goal, setGoal] = useState("");
  const [preferredBlockType, setPreferredBlockType] = useState<TutorBlockType | "">("");
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [pendingAction, setPendingAction] = useState<"generate" | "live" | null>(null);

  function launch(action: "generate" | "live") {
    setPendingAction(action);
    const sessionId = createLearnSessionId();

    startTransition(() => {
      router.push(
        buildLearnHref({
          sessionId,
          goal,
          preferredBlockType,
          useWebSearch,
          autoStartAction: action,
        }),
      );
    });
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
          preferredBlockType={preferredBlockType}
          onPreferredBlockTypeChange={setPreferredBlockType}
          useWebSearch={useWebSearch}
          onUseWebSearchChange={setUseWebSearch}
          onGenerate={() => launch("generate")}
          onLive={() => launch("live")}
          generateLabel={isPending && pendingAction === "generate" ? "Sending..." : "Send"}
          generateBusy={isPending && pendingAction === "generate"}
          generateIconOnly
          liveLabel={isPending && pendingAction === "live" ? "..." : "Live"}
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
    padding: "32px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  shell: {
    width: "100%",
    maxWidth: "760px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    alignItems: "center",
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    marginTop: "-128px",
  },
  logo: {
    width: "84px",
    height: "auto",
  },
  tagline: {
    margin: 0,
    fontSize: "clamp(1.26rem, 2.5vw, 1.64rem)",
    lineHeight: 1,
    fontWeight: 500,
    color: "#5e493d",
    letterSpacing: "0.01em",
    textAlign: "center",
  },
};
