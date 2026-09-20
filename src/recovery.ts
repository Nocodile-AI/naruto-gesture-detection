import { t, translateErrorMessage } from "./i18n";

function errorName(error: unknown): string {
  if (error instanceof DOMException) return error.name;
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return "";
}

export function cameraFailureMessage(error: unknown): string {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "SecurityError":
      return t("cameraDenied");
    case "NotFoundError":
    case "DevicesNotFoundError":
      return t("cameraNotFound");
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return t("cameraBusy");
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return t("cameraModeUnavailable");
    default:
      return t("cameraStartFailed");
  }
}

export function cameraSupportMessage(): string | null {
  if (!window.isSecureContext) {
    return t("cameraRequiresSecure");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return t("cameraApiUnavailable");
  }
  return null;
}

export function storageFailureMessage(error: unknown): string {
  const name = errorName(error);
  if (name === "QuotaExceededError") {
    return t("storageFull");
  }
  if (name === "SecurityError" || name === "InvalidStateError") {
    return t("storageBlocked");
  }
  return error instanceof Error ? translateErrorMessage(error.message) : t("storageUnavailable");
}
