import { useCallback, useState, useRef } from "react";

export function useAsyncAction() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    if (isSubmittingRef.current) return;
    
    setIsSubmitting(true);
    isSubmittingRef.current = true;
    setError(null);

    try {
      return await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, []);


  return {
    error,
    isSubmitting,
    run,
    setError,
  };
}
