import type { Readable } from "node:stream";

import Busboy from "busboy";
import type busboy from "busboy";
import type express from "express";
import { PDFParse } from "pdf-parse";

import { env } from "./env.js";

export type UploadedPdf = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function parseUploadedPdf(request: express.Request): Promise<UploadedPdf> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("Upload must use multipart/form-data.");
  }

  return new Promise<UploadedPdf>((resolve, reject) => {
    const busboy = Busboy({
      headers: request.headers,
      limits: {
        files: 1,
        fileSize: env.PDF_UPLOAD_MAX_BYTES,
      },
    });

    let uploadedPdf: UploadedPdf | null = null;
    let streamError: Error | null = null;

    busboy.on("file", (_fieldName: string, file: Readable & { truncated?: boolean }, info: busboy.FileInfo) => {
      const fileName = info.filename?.trim() || "document.pdf";
      const mimeType = info.mimeType?.trim() || "application/octet-stream";

      if (!looksLikePdfFile(fileName, mimeType)) {
        streamError = new Error("Only PDF uploads are supported.");
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
        streamError = new Error(`PDF exceeds the ${Math.floor(env.PDF_UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`);
      });

      file.on("end", () => {
        if (streamError) {
          return;
        }

        const buffer = Buffer.concat(chunks);
        if (!looksLikePdfBuffer(buffer)) {
          streamError = new Error("Uploaded file is not a valid PDF.");
          return;
        }

        uploadedPdf = {
          buffer,
          fileName,
          mimeType: "application/pdf",
          sizeBytes,
        };
      });
    });

    busboy.on("error", (error: unknown) => {
      reject(error instanceof Error ? error : new Error("PDF upload failed."));
    });

    busboy.on("finish", () => {
      if (streamError) {
        reject(streamError);
        return;
      }

      if (!uploadedPdf) {
        reject(new Error("Select a PDF file to attach."));
        return;
      }

      resolve(uploadedPdf);
    });

    request.pipe(busboy);
  });
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

function looksLikePdfFile(fileName: string, mimeType: string) {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function looksLikePdfBuffer(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}
