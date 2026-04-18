import type { Readable } from "node:stream";

import type { SourceMaterialFileKind } from "@prof/contracts";
import Busboy from "busboy";
import type busboy from "busboy";
import type express from "express";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { env } from "./env.js";
import { getReasoningClient } from "./providers/reasoning/index.js";

const CODE_FILE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "graphql",
  "h",
  "hpp",
  "java",
  "js",
  "jsx",
  "kt",
  "mjs",
  "php",
  "pl",
  "py",
  "rb",
  "rs",
  "scala",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "yaml",
  "yml",
]);

const imageAttachmentSummarySchema = z.object({
  title: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(4000),
});

const rawImageAttachmentSummarySchema = z.object({
  title: z.string().optional(),
  excerpt: z.string().optional(),
});

type SupportedUploadSpec = {
  fileKind: SourceMaterialFileKind;
  mimeType: string;
};

export type UploadedSourceFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileKind: SourceMaterialFileKind;
};

export async function parseUploadedSourceFile(request: express.Request): Promise<UploadedSourceFile> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("Upload must use multipart/form-data.");
  }

  return new Promise<UploadedSourceFile>((resolve, reject) => {
    const busboy = Busboy({
      headers: request.headers,
      limits: {
        files: 1,
        fileSize: env.FILE_UPLOAD_MAX_BYTES,
      },
    });

    let uploadedFile: UploadedSourceFile | null = null;
    let streamError: Error | null = null;

    busboy.on("file", (_fieldName: string, file: Readable & { truncated?: boolean }, info: busboy.FileInfo) => {
      const fileName = info.filename?.trim() || "attachment";
      const mimeType = normalizeMimeType(info.mimeType);
      const uploadSpec = resolveSupportedUploadSpec(fileName, mimeType);

      if (!uploadSpec) {
        streamError = new Error(
          "Unsupported file type. Attach PDF, text, markdown, CSV, JSON, code, PNG, JPG, or WEBP files.",
        );
        file.resume();
        return;
      }

      const chunks: Buffer[] = [];
      let sizeBytes = 0;

      file.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        sizeBytes += chunk.length;
      });

      file.on("limit", () => {
        streamError = new Error(
          `File exceeds the ${Math.floor(env.FILE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`,
        );
      });

      file.on("end", () => {
        if (streamError) {
          return;
        }

        const buffer = Buffer.concat(chunks);
        const validationError = validateUploadedBuffer(buffer, uploadSpec);
        if (validationError) {
          streamError = validationError;
          return;
        }

        uploadedFile = {
          buffer,
          fileName,
          mimeType: uploadSpec.mimeType,
          sizeBytes,
          fileKind: uploadSpec.fileKind,
        };
      });
    });

    busboy.on("error", (error: unknown) => {
      reject(error instanceof Error ? error : new Error("Attachment upload failed."));
    });

    busboy.on("finish", () => {
      if (streamError) {
        reject(streamError);
        return;
      }

      if (!uploadedFile) {
        reject(new Error("Select a file to attach."));
        return;
      }

      resolve(uploadedFile);
    });

    request.pipe(busboy);
  });
}

export async function extractUploadedSourceFileContent(uploadedFile: UploadedSourceFile) {
  switch (uploadedFile.fileKind) {
    case "pdf": {
      const textExcerpt = await extractPdfText(uploadedFile.buffer);
      return {
        title: deriveExcerptTitle(uploadedFile.fileName, textExcerpt, {
          fallback: "PDF attachment",
          preferExcerptHeading: true,
        }),
        textExcerpt,
      };
    }
    case "image":
      return summarizeUploadedImage(uploadedFile);
    case "markdown": {
      const textExcerpt = extractTextBuffer(uploadedFile.buffer);
      return {
        title: deriveExcerptTitle(uploadedFile.fileName, textExcerpt, {
          fallback: "Markdown attachment",
          preferExcerptHeading: true,
          stripMarkdownHeading: true,
        }),
        textExcerpt,
      };
    }
    case "text": {
      const textExcerpt = extractTextBuffer(uploadedFile.buffer);
      return {
        title: deriveExcerptTitle(uploadedFile.fileName, textExcerpt, {
          fallback: "Text attachment",
          preferExcerptHeading: true,
        }),
        textExcerpt,
      };
    }
    case "csv":
    case "json":
    case "code": {
      const textExcerpt = extractTextBuffer(uploadedFile.buffer);
      return {
        title: deriveFileNameTitle(uploadedFile.fileName, "File attachment"),
        textExcerpt,
      };
    }
    default: {
      return {
        title: deriveFileNameTitle(uploadedFile.fileName, "File attachment"),
        textExcerpt: "",
      };
    }
  }
}

export async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

function resolveSupportedUploadSpec(fileName: string, mimeType: string): SupportedUploadSpec | null {
  const extension = getFileExtension(fileName);
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType === "application/pdf" || extension === "pdf") {
    return {
      fileKind: "pdf",
      mimeType: "application/pdf",
    };
  }

  const imageMimeType = resolveImageMimeType(extension, normalizedMimeType);
  if (imageMimeType) {
    return {
      fileKind: "image",
      mimeType: imageMimeType,
    };
  }

  if (normalizedMimeType === "text/markdown" || extension === "md" || extension === "markdown") {
    return {
      fileKind: "markdown",
      mimeType: "text/markdown",
    };
  }

  if (
    normalizedMimeType === "text/csv" ||
    normalizedMimeType === "text/tab-separated-values" ||
    extension === "csv" ||
    extension === "tsv"
  ) {
    return {
      fileKind: "csv",
      mimeType: normalizedMimeType || (extension === "tsv" ? "text/tab-separated-values" : "text/csv"),
    };
  }

  if (
    normalizedMimeType === "application/json" ||
    normalizedMimeType === "application/x-ndjson" ||
    extension === "json" ||
    extension === "jsonl" ||
    extension === "ndjson"
  ) {
    return {
      fileKind: "json",
      mimeType: normalizedMimeType || "application/json",
    };
  }

  if (isCodeFile(extension)) {
    return {
      fileKind: "code",
      mimeType: normalizedMimeType || "text/plain",
    };
  }

  if (normalizedMimeType.startsWith("text/") || extension === "txt" || extension === "text") {
    return {
      fileKind: "text",
      mimeType: normalizedMimeType || "text/plain",
    };
  }

  return null;
}

function validateUploadedBuffer(buffer: Buffer, uploadSpec: SupportedUploadSpec) {
  if (buffer.length === 0) {
    return new Error("Uploaded file is empty.");
  }

  switch (uploadSpec.fileKind) {
    case "pdf":
      return looksLikePdfBuffer(buffer) ? null : new Error("Uploaded file is not a valid PDF.");
    case "image":
      return looksLikeSupportedImageBuffer(buffer, uploadSpec.mimeType)
        ? null
        : new Error("Uploaded image is not a valid PNG, JPG, or WEBP file.");
    default:
      return looksLikeTextBuffer(buffer) ? null : new Error("Uploaded file must be valid UTF-8 text.");
  }
}

function extractTextBuffer(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, "").trim();
}

async function summarizeUploadedImage(uploadedFile: UploadedSourceFile) {
  try {
    const client = getReasoningClient();
    const schema = zodToJsonSchema(imageAttachmentSummarySchema, {
      $refStrategy: "none",
    });
    const response = await client.models.generateContent({
      model: env.ATTACHMENT_IMAGE_MODEL,
      contents: [
        {
          text: buildImageAttachmentPrompt(uploadedFile.fileName),
        },
        {
          inlineData: {
            data: uploadedFile.buffer.toString("base64"),
            mimeType: uploadedFile.mimeType,
          },
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });

    if (!response.text) {
      throw new Error("Image attachment model returned an empty response.");
    }

    return normalizeImageAttachmentSummary(JSON.parse(response.text), uploadedFile.fileName);
  } catch (error) {
    console.warn("Image attachment analysis failed; falling back to filename.", {
      error: error instanceof Error ? error.message : String(error),
      fileName: uploadedFile.fileName,
    });

    return {
      title: deriveFileNameTitle(uploadedFile.fileName, "Image attachment"),
      textExcerpt: "Image attachment. Visual OCR and summarization were unavailable for this upload.",
    };
  }
}

function normalizeImageAttachmentSummary(raw: unknown, fileName: string) {
  const parsed = rawImageAttachmentSummarySchema.parse(asRecord(raw));
  const title = clampString(parsed.title, 200, deriveFileNameTitle(fileName, "Image attachment"));
  const textExcerpt = clampString(
    parsed.excerpt,
    4000,
    "Image attachment. A concise visual summary could not be generated for this upload.",
  );

  return {
    title,
    textExcerpt,
  };
}

function buildImageAttachmentPrompt(fileName: string) {
  return [
    "You are extracting useful learning context from an uploaded image attachment.",
    "The image may be lecture slides, notes, a textbook photo, a screenshot, a diagram, a chart, or a whiteboard.",
    "Return JSON matching the schema.",
    "title: a short specific title for the attachment.",
    "excerpt: plain text only, with the most important visible text plus a concise description of the non-text visual content.",
    "Do not mention that you are an AI model.",
    "Keep the excerpt under 4000 characters.",
    `File name: ${fileName}`,
  ].join("\n");
}

function deriveExcerptTitle(
  fileName: string,
  text: string,
  options: {
    fallback: string;
    preferExcerptHeading?: boolean;
    stripMarkdownHeading?: boolean;
  },
) {
  if (options.preferExcerptHeading) {
    const firstLine = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (options.stripMarkdownHeading ? line.replace(/^#{1,6}\s+/, "") : line))
      .find((line) => line.length >= 3 && /[A-Za-z0-9]/.test(line));

    if (firstLine) {
      return firstLine.slice(0, 240);
    }
  }

  return deriveFileNameTitle(fileName, options.fallback);
}

function deriveFileNameTitle(fileName: string, fallback: string) {
  const normalized = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return normalized || fallback;
}

function clampString(value: unknown, maxLength: number, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}

function resolveImageMimeType(extension: string, mimeType: string) {
  if (mimeType === "image/png" || extension === "png") {
    return "image/png";
  }

  if (mimeType === "image/jpeg" || extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (mimeType === "image/webp" || extension === "webp") {
    return "image/webp";
  }

  return "";
}

function looksLikePdfBuffer(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function looksLikeSupportedImageBuffer(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

function looksLikeTextBuffer(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));

  for (const value of sample) {
    if (value === 0) {
      return false;
    }
  }

  return true;
}

function normalizeMimeType(value: string | undefined) {
  return value?.trim().toLowerCase() || "";
}

function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  const lastDotIndex = normalized.lastIndexOf(".");
  if (lastDotIndex < 0 || lastDotIndex === normalized.length - 1) {
    return "";
  }

  return normalized.slice(lastDotIndex + 1);
}

function isCodeFile(extension: string) {
  return CODE_FILE_EXTENSIONS.has(extension);
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
