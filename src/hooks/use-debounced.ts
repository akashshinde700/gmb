"use client";

import { useEffect, useState } from "react";

/**
 * A value that settles rather than changing on every keystroke.
 *
 * Search fields drove a request per character. On a server-side search that is
 * a request flood; on a client-side one it re-filters the whole list between
 * keys. Typing "sharma" fired six searches, five of which nobody wanted.
 *
 * 350ms is a deliberate middle: below ~250ms an average typist still triggers
 * several requests, and above ~500ms the field starts to feel unresponsive.
 */
export function useDebounced<T>(value: T, delay = 350): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    // Each keystroke cancels the previous timer, so only the pause at the end
    // of typing survives.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
