import { toast } from "sonner";

/**
 * Extract a user-readable error message from a Supabase edge function response
 * or any error object. Replaces generic toasts with specific backend messages.
 */
export function extractErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;

  // Edge function response with .error property
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.msg === "string") return obj.msg;
  }

  // Standard Error object
  if (error instanceof Error) {
    const msg = error.message;
    // Don't expose raw Supabase/Postgres internals
    if (msg.includes("FetchError") || msg.includes("Failed to fetch")) {
      return "Network error — please check your connection and try again.";
    }
    if (msg.includes("JWT") || msg.includes("token")) {
      return "Your session has expired. Please sign in again.";
    }
    return msg;
  }

  if (typeof error === "string") return error;

  return fallback;
}

/**
 * Handle an edge function invocation result with proper error toasting.
 * Returns the data on success, throws on error with a user-friendly message.
 */
export function handleEdgeFunctionResult(
  result: { data: any; error: any },
  context?: string,
): any {
  const { data, error } = result;

  if (error) {
    const msg = extractErrorMessage(error);
    throw new Error(msg);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * Show an appropriate toast for a mutation error based on the error content.
 */
export function toastMutationError(error: unknown, context = "Operation"): void {
  const message = extractErrorMessage(error);

  // Categorize by content for appropriate toast variant
  if (message.includes("permission") || message.includes("Forbidden") || message.includes("403")) {
    toast.error("You don't have permission to do this.");
  } else if (message.includes("already") || message.includes("duplicate") || message.includes("conflict")) {
    toast.error(message);
  } else if (message.includes("not found") || message.includes("404")) {
    toast.error(message);
  } else if (message.includes("session") || message.includes("sign in") || message.includes("expired")) {
    toast.error(message);
  } else if (message.includes("network") || message.includes("connection")) {
    toast.error(message);
  } else {
    toast.error(message);
  }
}
