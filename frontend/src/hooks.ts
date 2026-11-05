import { useCallback, useEffect, useState } from "react";

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(undefined);
    loader(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudieron cargar los datos.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loader, version]);
  return { data, error, loading, refresh };
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const result = localStorage.getItem(key);
    return result ? JSON.parse(result) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Preferences still work for this session. */
  }
}
