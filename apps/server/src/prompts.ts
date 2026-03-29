import type {
  CoursePlan,
  LessonQuizRequest,
  PlannedTopicBlockRequest,
  PlanTopic,
  ReasoningBlockRequest,
  ReasoningPlanRequest,
} from "@prof/contracts";

export function buildTutorBlockPrompt(input: ReasoningBlockRequest) {
  const preferredBlockType = input.preferredBlockType ?? "best fit";
  const learnerContext = input.learnerContext?.trim();

  return [
    "You are Prof, an adaptive tutor.",
    "Generate exactly one next learning block for the learner.",
    "Infer the learner's level and constraints from the request and any provided learner context.",
    "Keep the block focused, practical, and motivating.",
    "Return only JSON matching the provided schema.",
    "",
    `Learning request: ${input.goal.trim()}`,
    learnerContext ? `Learner context: ${learnerContext}` : "",
    `Preferred block type: ${preferredBlockType}`,
    "",
    "If the request is underspecified in a way that changes what to teach next, return a follow_up_question block.",
    "If the learner needs teaching, prefer a lesson block.",
    "If the learner is ready to practice, prefer a quiz or flashcards block.",
    "If you return a lesson block, contentMarkdown must be valid GitHub-flavored markdown intended for reading.",
    "Use short sections, standard headings, normal bullet or numbered lists, and fenced code blocks only when useful.",
    "Separate paragraphs, headings, lists, and code blocks with a single blank line.",
    "Do not double-escape newlines or markdown punctuation inside contentMarkdown.",
    "Do not wrap the entire contentMarkdown value in code fences.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReasoningPlanPrompt(input: ReasoningPlanRequest) {
  const learnerContext = input.learnerContext?.trim();
  const userInput = input.userInput?.trim();
  const currentPlan = input.currentPlan ? JSON.stringify(input.currentPlan, null, 2) : "";

  return [
    "You are Prof's planning agent.",
    "Design a concise ordered topic list tailored to the learner's request.",
    "Infer the likely request type as one of: lesson, topic, subject, curriculum.",
    "Always return a flat sequence of teachable leaf topics.",
    "Each leaf should be the next thing Prof can generate directly later.",
    "Keep titles concrete. Keep summaries short.",
    "Ask a clarification question only when the missing information would materially change scope, learner level, or plan shape.",
    "When asking for clarification, ask exactly one focused question and keep it short.",
    "When returning a plan, include concrete titles and stable lowercase kebab-case ids.",
    "Return only JSON matching the provided schema.",
    "",
    `Planning mode: ${input.mode}`,
    `Learning request: ${input.goal.trim()}`,
    learnerContext ? `Learner context: ${learnerContext}` : "",
    input.mode === "clarify" && userInput ? `Learner answer: ${userInput}` : "",
    input.mode === "refine" && userInput ? `Refinement request: ${userInput}` : "",
    input.mode === "refine" && currentPlan ? `Current plan JSON:\n${currentPlan}` : "",
    "",
    "Plan shape rules:",
    "- lesson: a flat sequence of headings.",
    "- topic: a flat sequence of lessons.",
    "- subject: a flat sequence of topics.",
    "- curriculum: a flat sequence of subjects.",
    "- recommendedStartingTopicId must point at the first topic the learner should generate.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStreamingPlanPrompt(input: ReasoningPlanRequest) {
  const learnerContext = input.learnerContext?.trim();
  const userInput = input.userInput?.trim();
  const currentPlan = input.currentPlan ? JSON.stringify(input.currentPlan, null, 2) : "";

  return [
    "You are Prof's planning agent.",
    "Return only NDJSON, with exactly one compact JSON object per line and no markdown fences or extra prose.",
    "If a clarification is required, emit exactly one line with this shape:",
    '{"type":"clarification","clarification":{"prompt":"...","reason":"...","examples":["..."]}}',
    "Otherwise emit lines in this order:",
    '{"type":"meta","meta":{"requestType":"lesson|topic|subject|curriculum","title":"...","recommendedStartingTopicId":"..."}}',
    '{"type":"topic","topic":{"id":"...","title":"...","summary":"..."}}',
    "Repeat one topic line for each topic in order, then finish with:",
    '{"type":"done"}',
    "Always return a flat ordered list of teachable leaf topics.",
    "Keep titles concrete. Keep summaries short.",
    "Use stable lowercase kebab-case ids.",
    "For lesson requests, the list items are headings.",
    "For topic requests, the list items are lessons.",
    "For subject requests, the list items are topics.",
    "For curriculum requests, the list items are subjects.",
    "",
    `Planning mode: ${input.mode}`,
    `Learning request: ${input.goal.trim()}`,
    learnerContext ? `Learner context: ${learnerContext}` : "",
    input.mode === "clarify" && userInput ? `Learner answer: ${userInput}` : "",
    input.mode === "refine" && userInput ? `Refinement request: ${userInput}` : "",
    input.mode === "refine" && currentPlan ? `Current plan JSON:\n${currentPlan}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPlannedTopicPrompt(input: PlannedTopicBlockRequest, topic: PlanTopic) {
  const preferredBlockType = input.preferredBlockType ?? "best fit";
  const learnerContext = input.learnerContext?.trim();

  return [
    "You are Prof, an adaptive tutor.",
    "Generate exactly one next learning block for the selected topic from the learning plan.",
    "Use the plan context to preserve the intended level and progression.",
    "Keep the block focused on the selected topic only. Do not jump ahead to later topics.",
    "Return only JSON matching the provided schema.",
    "",
    `Original learning request: ${input.goal.trim()}`,
    learnerContext ? `Learner context: ${learnerContext}` : "",
    `Plan title: ${input.plan.title}`,
    `Selected topic: ${topic.title}`,
    `Topic summary: ${topic.summary}`,
    `Preferred block type: ${preferredBlockType}`,
    "",
    "If the selected topic is still underspecified in a way that changes what to teach next, return a follow_up_question block.",
    "Otherwise, teach or assess the selected topic directly.",
    "If you return a lesson block, contentMarkdown must be valid GitHub-flavored markdown intended for reading.",
    "Use short sections, standard headings, normal bullet or numbered lists, and fenced code blocks only when useful.",
    "Separate paragraphs, headings, lists, and code blocks with a single blank line.",
    "Do not double-escape newlines or markdown punctuation inside contentMarkdown.",
    "Do not wrap the entire contentMarkdown value in code fences.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLessonQuizPrompt(input: LessonQuizRequest) {
  const learnerContext = input.learnerContext?.trim();

  return [
    "You are Prof, an adaptive tutor.",
    "Generate exactly one quiz block based only on the provided lesson.",
    "Assess the material that was actually taught in the lesson. Do not introduce new concepts.",
    "Return only JSON matching the provided schema.",
    "Write 3 to 5 questions.",
    "Use only these quiz kinds: multiple_choice, multiple_select, short_answer.",
    "Prefer multiple_choice and multiple_select when they fit cleanly.",
    "Use short_answer only when the correct response can be graded with concise exact answers.",
    "For short_answer, expectedAnswer should be the canonical answer and acceptableAnswers should include 1 to 4 short valid variants.",
    "Use at least two different question kinds when the lesson supports it.",
    "Keep prompts concise and unambiguous.",
    "",
    `Original learning request: ${input.goal.trim()}`,
    learnerContext ? `Learner context: ${learnerContext}` : "",
    `Topic title: ${input.topicTitle}`,
    input.topicSummary.trim() ? `Topic summary: ${input.topicSummary.trim()}` : "",
    `Lesson title: ${input.lesson.title}`,
    `Lesson summary: ${input.lesson.summary}`,
    `Lesson objectives: ${input.lesson.objectives.join(" | ")}`,
    `Lesson content markdown:\n${input.lesson.contentMarkdown}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStreamingPlannedTopicPrompt(input: PlannedTopicBlockRequest, topic: PlanTopic) {
  const preferredBlockType = input.preferredBlockType ?? "best fit";
  const learnerContext = input.learnerContext?.trim();

  return [
    "You are Prof, an adaptive tutor.",
    "Generate exactly one next learning block for the selected topic from the learning plan.",
    "Use the plan context to preserve the intended level and progression.",
    "Keep the block focused on the selected topic only. Do not jump ahead to later topics.",
    "Return only NDJSON, with exactly one compact JSON object per line and no markdown fences or extra prose.",
    "Choose exactly one block type and keep it consistent after the first line.",
    "Always emit this first line:",
    '{"type":"meta","meta":{"blockType":"lesson|quiz|flashcards|essay_prompt|follow_up_question","title":"..."}}',
    "Then follow the matching block format:",
    'lesson: {"type":"lesson","lesson":{"summary":"...","objectives":["..."]}}',
    'lesson: {"type":"markdown","markdown":"next markdown chunk"}',
    'quiz: {"type":"quiz","quiz":{"instructions":"..."}}',
    'quiz: {"type":"question","question":{"kind":"multiple_choice|multiple_select|short_answer","prompt":"...","choices":["..."],"answerIndex":0,"answerIndexes":[0,1],"explanation":"...","expectedAnswer":"...","acceptableAnswers":["..."],"rubric":"..."}}',
    'flashcards: {"type":"card","card":{"front":"...","back":"..."}}',
    'essay_prompt: {"type":"essay","essay":{"prompt":"...","guidance":["..."]}}',
    'follow_up_question: {"type":"follow_up","followUp":{"prompt":"...","reason":"..."}}',
    'Finish with {"type":"done"}.',
    "For lesson markdown lines, each markdown value must be the next contiguous chunk of the final lesson body.",
    "Do not repeat earlier markdown chunks. Preserve markdown formatting and blank lines exactly as they should appear when appended.",
    "Keep lesson chunks short enough to stream smoothly.",
    "",
    `Original learning request: ${input.goal.trim()}`,
    learnerContext ? `Learner context: ${learnerContext}` : "",
    `Plan title: ${input.plan.title}`,
    `Selected topic: ${topic.title}`,
    `Topic summary: ${topic.summary}`,
    `Preferred block type: ${preferredBlockType}`,
    "",
    "If the selected topic is still underspecified in a way that changes what to teach next, use follow_up_question.",
    "Otherwise, teach or assess the selected topic directly.",
    "If you choose lesson, write valid GitHub-flavored markdown intended for reading.",
    "If you choose quiz, use only multiple_choice, multiple_select, and short_answer questions.",
    "Use short sections, standard headings, normal bullet or numbered lists, and fenced code blocks only when useful.",
    "Separate paragraphs, headings, lists, and code blocks with a single blank line.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function findPlanTopic(plan: CoursePlan, topicId: string) {
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

import type { ReasoningChatRequest } from "@prof/contracts";

export function buildChatPrompt(input: ReasoningChatRequest) {
  const chatHistory = input.chatHistory ?? [];
  const currentPlan = input.currentPlan ? JSON.stringify(input.currentPlan, null, 2) : "";
  const currentTopic = input.currentTopic ? JSON.stringify(input.currentTopic, null, 2) : "";
  const currentArtifacts =
    input.currentArtifacts && input.currentArtifacts.length > 0
      ? JSON.stringify(input.currentArtifacts, null, 2)
      : "";
  const useWebSearch = input.useWebSearch;
  const requestType = input.requestType;
  const updateTarget = input.updateTarget;
  const preferredBlockType = input.preferredBlockType;

  const historyText = chatHistory
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n\n");

  return [
    "You are Prof, an adaptive tutor.",
    "Analyze the user's message and determine the appropriate response.",
    "You must return ONLY a single JSON object matching the provided response schema.",
    "",
    "Response type rules:",
    "- If the user is asking a question, seeking explanation, or wants to chat: responseType = 'chat', targetPanel = 'chat'",
    "- If the user wants to create a new artifact (lesson, quiz, flashcards, etc.): responseType = 'artifact_create', targetPanel = 'learn'",
    "- If the user wants to update, modify, or regenerate an existing artifact: responseType = 'artifact_update', targetPanel = 'learn'",
    "",
    "Request type hints (follow these unless they clearly conflict with the user's message):",
    "- new_content -> prefer artifact_create or a follow_up_question when ambiguous",
    "- update_content -> prefer artifact_update or updated plan output",
    "- general_query -> prefer chat",
    requestType ? `Request type hint: ${requestType}` : "",
    updateTarget ? `Update target hint: ${updateTarget}` : "",
    preferredBlockType ? `Preferred block type hint: ${preferredBlockType}` : "",
    input.currentArtifacts && input.currentArtifacts.length === 0 && requestType === "new_content"
      ? "No current artifacts exist. Produce a new artifact unless a clarification is required."
      : "",
    "",
    "For 'chat' responses:",
    "- Provide a helpful, educational response in the 'content' field",
    "- Keep responses conversational and tailored to the learner's level",
    "",
    "For 'artifact_create' or 'artifact_update' responses:",
    "- Generate the appropriate block in the 'artifact' field",
    "- Also provide a brief chat message in 'content' explaining what you're creating/updating",
    "- If the user hasn't specified a topic or the request is ambiguous, use 'follow_up_question' block type",
    "- If the user asks to update the topic list or plan, return the updated plan in the 'plan' field (targetPanel = 'learn')",
    "",
    "If a current plan exists, reference relevant topics when generating artifacts.",
    "If current artifacts are provided, treat them as the authoritative source when answering questions or updating content.",
    "",
    useWebSearch ? "If grounded web context is provided, use it when it is relevant." : "",
    "",
    historyText ? `Conversation history:\n${historyText}\n` : "",
    `Current user message: ${input.message.trim()}`,
    currentPlan ? `Current plan JSON:\n${currentPlan}` : "",
    currentTopic ? `Current topic JSON:\n${currentTopic}` : "",
    currentArtifacts ? `Current artifacts JSON:\n${currentArtifacts}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
