const genericVerificationError = "We couldn't verify your NIN. Please try again.";

export const getNinVerificationErrorMessage = (error: unknown): string => {
  const context =
    typeof error === "object" && error !== null && "context" in error
      ? error.context
      : null;

  if (context instanceof Response) {
    switch (context.status) {
      case 422:
        return "Incorrect or invalid NIN. Please check the number and try again.";
      case 429:
        return "Too many NIN checks. Please wait a while and try again.";
      case 503:
        return "NIN verification is temporarily unavailable. Please try again later.";
      default:
        return genericVerificationError;
    }
  }

  return error instanceof Error ? error.message : genericVerificationError;
};
