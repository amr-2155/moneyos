import { useCallback } from "react";
import { ApiError } from "./api";
import { HttpError } from "./analyticsApi";
import { useI18n, type TranslationKey } from "../i18n";

/**
 * Unified shape accepted by the error mapper: either the legacy `ApiError`
 * thrown by `api.ts` (auth flow) or the `HttpError` thrown by `analyticsApi.ts`
 * / `apiFetch`. Both expose a `code` string and, optionally, a status.
 */
type MappableError = { code?: string; status?: number };

function isMappable(error: unknown): error is Error & MappableError {
  return error instanceof ApiError || error instanceof HttpError;
}

/**
 * Maps any thrown error to a translated, user-safe message. Never surfaces raw
 * backend/internal text — only semantic codes mapped to localized copy.
 */
export function useErrorMessage(): (error: unknown, fallback: TranslationKey) => string {
  const { t } = useI18n();

  return useCallback(
    (error: unknown, fallback: TranslationKey): string => {
      if (isMappable(error)) {
        const code = error.code;
        switch (code) {
          case "NETWORK":
          case "NO_BACKEND":
            return t("errors.network");
          case "UNAUTHORIZED":
            return t("errors.sessionExpired");
          case "FORBIDDEN":
            return t("errors.forbidden");
          case "RATE_LIMITED":
            return t("errors.rateLimited");
          case "CONFLICT":
            return t("errors.conflict");
          case "INTERNAL_ERROR":
          case "HTTP_ERROR":
            return t("errors.generic");
        }
        // Unrecognised code: fall through to fallback.
      }
      return t(fallback);
    },
    [t],
  );
}
