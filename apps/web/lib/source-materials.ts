import type { SourceMaterial } from "@prof/contracts";

export function upsertSourceMaterial(current: SourceMaterial[], nextMaterial: SourceMaterial) {
  const nextMaterialUrl = getMaterialPrimaryUrl(nextMaterial);

  const nextItems: SourceMaterial[] = [];
  let inserted = false;

  for (const material of current) {
    if (material.id === nextMaterial.id) {
      if (!inserted) {
        nextItems.push(nextMaterial);
        inserted = true;
      }
      continue;
    }

    if (
      nextMaterial.kind === "url" &&
      material.kind === "url" &&
      nextMaterialUrl &&
      normalizeUrl(material.resolvedUrl ?? material.sourceUrl ?? "") === nextMaterialUrl
    ) {
      if (!inserted) {
        nextItems.push(nextMaterial);
        inserted = true;
      }
      continue;
    }

    nextItems.push(material);
  }

  if (!inserted) {
    nextItems.push(nextMaterial);
  }

  return nextItems;
}

export function findAttachedUrlMaterial(materials: SourceMaterial[], url: string) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  return (
    materials.find((material) => {
      if (material.kind !== "url") {
        return false;
      }

      return normalizeUrl(material.resolvedUrl ?? material.sourceUrl ?? "") === normalizedUrl;
    }) ?? null
  );
}

export function buildLearnSessionMaterialFileHref(sessionId: string, materialId: string) {
  return `/api/learn/sessions/${encodeURIComponent(sessionId)}/materials/${encodeURIComponent(materialId)}/file`;
}

export function buildCourseMaterialFileHref(username: string, courseSlug: string, materialId: string) {
  return `/api/courses/${encodeURIComponent(username)}/${encodeURIComponent(courseSlug)}/materials/${encodeURIComponent(materialId)}/file`;
}

export function formatFileSize(sizeBytes?: number) {
  if (sizeBytes === undefined || Number.isNaN(sizeBytes)) {
    return "";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMaterialPrimaryUrl(material: SourceMaterial) {
  return normalizeUrl(material.resolvedUrl ?? material.sourceUrl ?? "");
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}
