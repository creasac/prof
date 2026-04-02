"use client";

import {
  accountUnlimitedAccessStatusSchema,
  redeemUnlimitedAccessCodeResponseSchema,
} from "@prof/contracts";

import { fetchApi, parseApiError } from "./api";

export async function loadAccountUnlimitedAccessStatus() {
  const response = await fetchApi("/api/account/unlimited-access");

  if (!response.ok) {
    const parsed = await parseApiError(response, "Failed to load unlimited access status.");
    throw new Error(parsed.message);
  }

  return accountUnlimitedAccessStatusSchema.parse(await response.json());
}

export async function redeemAccountUnlimitedAccessCode(code: string) {
  const response = await fetchApi("/api/account/unlimited-access/redeem", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
    }),
  });

  if (!response.ok) {
    const parsed = await parseApiError(response, "Failed to redeem the unlimited access code.");
    throw new Error(parsed.message);
  }

  return redeemUnlimitedAccessCodeResponseSchema.parse(await response.json());
}
