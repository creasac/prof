import type { CoursePlan, CourseSnapshot, LearnTopicArtifacts, PlanTopic, QuizBlock, TutorBlock } from "@prof/contracts";

export function findTopicInPlan(plan: CoursePlan, topicId: string | null | undefined) {
  if (!topicId) {
    return null;
  }

  if ("topics" in plan) {
    return plan.topics.find((topic) => topic.id === topicId) ?? null;
  }

  for (const phase of plan.phases) {
    const topic = phase.topics.find((entry) => entry.id === topicId);
    if (topic) {
      return topic;
    }
  }

  return null;
}

export function flattenPlanTopics(plan: CoursePlan | null) {
  if (!plan) {
    return [];
  }

  if ("topics" in plan) {
    return plan.topics;
  }

  return plan.phases.flatMap((phase) => phase.topics);
}

export function pickSelectedTopicId(snapshot: CourseSnapshot) {
  const topics = flattenPlanTopics(snapshot.plan);
  if (snapshot.selectedTopicId && topics.some((topic) => topic.id === snapshot.selectedTopicId)) {
    return snapshot.selectedTopicId;
  }

  if (snapshot.generatedTopicId && topics.some((topic) => topic.id === snapshot.generatedTopicId)) {
    return snapshot.generatedTopicId;
  }

  return topics[0]?.id ?? snapshot.generatedTopicId ?? snapshot.generatedQuizTopicId ?? null;
}

export function getTopicArtifactsEntry(
  topicArtifacts: Record<string, LearnTopicArtifacts>,
  topicId: string | null | undefined,
) {
  if (!topicId) {
    return null;
  }

  return topicArtifacts[topicId] ?? null;
}

export function resolveCourseBlock(
  snapshot: CourseSnapshot,
  topicId: string | null | undefined,
): {
  block: TutorBlock | null;
  quiz: QuizBlock | null;
  topicId: string | null;
} {
  const entry = getTopicArtifactsEntry(snapshot.topicArtifacts ?? {}, topicId);
  const entryQuiz = entry?.quiz ?? (entry?.block?.type === "quiz" ? entry.block : null);

  if (entry?.block || entryQuiz) {
    return {
      block: entry?.block ?? entryQuiz ?? null,
      quiz: entryQuiz,
      topicId: topicId ?? null,
    };
  }

  const fallbackQuiz = snapshot.generatedQuiz ?? (snapshot.generatedBlock?.type === "quiz" ? snapshot.generatedBlock : null);

  return {
    block: snapshot.generatedBlock ?? fallbackQuiz,
    quiz: fallbackQuiz,
    topicId: snapshot.generatedTopicId ?? snapshot.generatedQuizTopicId ?? null,
  };
}

export function collectCourseQuizzes(snapshot: CourseSnapshot) {
  const results: Array<{
    index: number;
    topicId: string | null;
    topic: PlanTopic | null;
    quiz: QuizBlock;
  }> = [];
  const topics = flattenPlanTopics(snapshot.plan);

  for (const topic of topics) {
    const entry = getTopicArtifactsEntry(snapshot.topicArtifacts ?? {}, topic.id);
    const quiz = entry?.quiz ?? (entry?.block?.type === "quiz" ? entry.block : null);
    if (quiz) {
      results.push({
        index: results.length + 1,
        topicId: topic.id,
        topic,
        quiz,
      });
    }
  }

  if (results.length === 0) {
    const fallbackQuiz = snapshot.generatedQuiz ?? (snapshot.generatedBlock?.type === "quiz" ? snapshot.generatedBlock : null);
    if (fallbackQuiz) {
      results.push({
        index: 1,
        topicId: snapshot.generatedQuizTopicId ?? snapshot.generatedTopicId ?? null,
        topic: snapshot.plan ? findTopicInPlan(snapshot.plan, snapshot.generatedQuizTopicId ?? snapshot.generatedTopicId) : null,
        quiz: fallbackQuiz,
      });
    }
  }

  return results;
}
