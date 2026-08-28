import { useCallback } from "react";
import { ApiError } from "./api";
import { useI18n, type TranslationKey } from "../i18n";

/**
 * Maps any thrown error to a translated, user-safe message. Never surfaces raw
 * backend/internal text — only semantic codes mapped to localized copy.
 */
export function useErrorMessage(): (error: unknown, fallback: TranslationKey) => string {
  const { t } = useI18n();

  return useCallback(
    (error: unknown, fallback: TranslationKey): string => {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "NETWORK":
            return t("errors.network");
          case "UNAUTHORIZED":
            return t("errors.sessionExpired");
          case "RATE_LIMITED":
            return t("errors.rateLimited");
          case "CONFLICT":
            return t("errors.conflict");
          case "INTERNAL_ERROR":
            return t("errors.generic");
        }
      }
      return t(fallback);
    },
    [t],
  );
}
