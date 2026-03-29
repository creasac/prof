type LineKind = "blank" | "paragraph" | "heading" | "unordered-list-item" | "ordered-list-item" | "blockquote" | "fence" | "hr";

export function normalizeLessonMarkdown(markdown: string) {
  const source = decodeEscapedMarkdown(markdown).replace(/\r\n?/g, "\n").replace(/[^\S\n]+$/gm, "").trim();
  if (!source) {
    return "";
  }

  const inputLines = source.split("\n");
  const outputLines: string[] = [];
  let inFence = false;

  for (const rawLine of inputLines) {
    const line = inFence ? rawLine : normalizeMarkdownSyntax(rawLine);
    const trimmed = line.trim();
    const isFence = isFenceDelimiter(line);

    if (inFence) {
      outputLines.push(line);
      if (isFence) {
        inFence = false;
      }
      continue;
    }

    if (!trimmed) {
      if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== "") {
        outputLines.push("");
      }
      continue;
    }

    const previousLine = outputLines[outputLines.length - 1] ?? "";
    const previousKind = classifyLine(previousLine);
    const currentKind = classifyLine(line);

    if (shouldInsertBlankLine(previousKind, currentKind)) {
      outputLines.push("");
    }

    outputLines.push(line);

    if (isFence) {
      inFence = true;
    }
  }

  return outputLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function decodeEscapedMarkdown(markdown: string) {
  if (/[\r\n]/.test(markdown)) {
    return markdown;
  }

  const escapedBreakCount = markdown.match(/\\r\\n|\\n|\\r/g)?.length ?? 0;
  const looksLikeEscapedMarkdown =
    escapedBreakCount >= 2 &&
    /\\n(?:\\n|#{1,6}\S?|[-+*]|\d+\.|>|\|)/.test(markdown);

  if (!looksLikeEscapedMarkdown) {
    return markdown;
  }

  return markdown
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t");
}

function normalizeMarkdownSyntax(line: string) {
  return line
    .replace(/^(\s*#{1,6})([^\s#])/, "$1 $2")
    .replace(/^(\s*>)([^\s>])/, "$1 $2")
    .replace(/^(\s*[-+*])([^\s])/, "$1 $2")
    .replace(/^(\s*\d+\.)([^\s])/, "$1 $2");
}

function shouldInsertBlankLine(previousKind: LineKind, currentKind: LineKind) {
  if (previousKind === "blank") {
    return false;
  }

  if (currentKind === "heading" || currentKind === "fence" || currentKind === "hr") {
    return true;
  }

  if (isListKind(currentKind)) {
    return previousKind === "paragraph" || previousKind === "blockquote";
  }

  if (currentKind === "blockquote") {
    return previousKind === "paragraph" || isListKind(previousKind) || previousKind === "fence" || previousKind === "hr";
  }

  if (currentKind === "paragraph") {
    return (
      isListKind(previousKind) ||
      previousKind === "blockquote" ||
      previousKind === "fence" ||
      previousKind === "hr"
    );
  }

  return false;
}

function isListKind(kind: LineKind) {
  return kind === "unordered-list-item" || kind === "ordered-list-item";
}

function classifyLine(line: string): LineKind {
  const trimmed = line.trim();
  if (!trimmed) {
    return "blank";
  }

  if (isFenceDelimiter(trimmed)) {
    return "fence";
  }

  if (/^#{1,6}\s/.test(trimmed)) {
    return "heading";
  }

  if (/^>\s?/.test(trimmed)) {
    return "blockquote";
  }

  if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
    return "hr";
  }

  if (/^[-+*]\s+/.test(trimmed)) {
    return "unordered-list-item";
  }

  if (/^\d+\.\s+/.test(trimmed)) {
    return "ordered-list-item";
  }

  return "paragraph";
}

function isFenceDelimiter(line: string) {
  return /^(```|~~~)/.test(line.trimStart());
}
