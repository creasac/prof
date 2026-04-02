import type { CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type MarkdownRendererProps = {
  markdown: string;
  className?: string;
  style?: CSSProperties;
  variant?: "default" | "compact";
};

const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const isExternal = typeof href === "string" && /^(https?:)?\/\//.test(href);

    return (
      <a
        {...props}
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({
  markdown,
  className,
  style,
  variant = "default",
}: MarkdownRendererProps) {
  const normalizedMarkdown = decodeEscapedMarkdown(markdown);

  if (!normalizedMarkdown.trim()) {
    return null;
  }

  return (
    <div className={joinClassNames("markdown-content", `markdown-content--${variant}`, className)} style={style}>
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        skipHtml
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function joinClassNames(...classNames: Array<string | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function decodeEscapedMarkdown(markdown: string) {
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
