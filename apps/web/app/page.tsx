"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";

import { PromptComposer } from "../components/PromptComposer";
import { buildLearnHref, createLearnSessionId } from "../lib/learn-route";

export default function HomePage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [goal, setGoal] = useState("");
  const [pendingAction, setPendingAction] = useState<"generate" | "live" | null>(null);

  function launch(action: "generate" | "live") {
    setPendingAction(action);
    const sessionId = createLearnSessionId();

    startTransition(() => {
      router.push(
        buildLearnHref({
          sessionId,
          courseOwnerUsername: null,
          courseSlug: null,
          goal,
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
    gap: "18px",
    alignItems: "center",
  },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    marginTop: "-96px",
  },
  logo: {
    width: "76px",
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
