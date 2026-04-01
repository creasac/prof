import {
  attachUrlRequestSchema,
  sourceMaterialResponseSchema,
  type SourceMaterial,
} from "@prof/contracts";

import { fetchApi } from "./api";

export async function attachUrlMaterial(sessionId: string, url: string): Promise<SourceMaterial> {
  const response = await fetchApi(`/api/learn/sessions/${encodeURIComponent(sessionId)}/materials/url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(attachUrlRequestSchema.parse({ url })),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to attach URL.");
  }

  const payload = sourceMaterialResponseSchema.parse(await response.json());
  return payload.material;
}

export async function uploadPdfMaterial(sessionId: string, file: File): Promise<SourceMaterial> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetchApi(`/api/learn/sessions/${encodeURIComponent(sessionId)}/materials/pdf`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to upload PDF.");
  }

  const payload = sourceMaterialResponseSchema.parse(await response.json());
  return payload.material;
}
