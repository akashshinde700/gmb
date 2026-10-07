// WebSetu — the onboarding draft's storage key, and the one place that clears it.
//
// The wizard keeps a draft in localStorage so a reload does not lose a
// half-typed form. That draft is business PII — owner name, phone, email,
// address — sitting in plain text where it survives the tab, so it is cleared
// on sign-out as well as on success. (A shared computer is the case: the next
// person to use the browser should not find the previous one's phone number in
// devtools, and any script that later runs on this origin can read it.)
//
// sessionStorage would expire by itself, but it also throws the draft away on an
// accidental tab close — precisely the accident the draft exists for.

export const ONBOARDING_DRAFT_KEY = "websetu_onboarding_draft_v2";

/** Remove a half-filled onboarding draft. Safe on the server and in private mode. */
export function clearOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // No storage (SSR, private mode, disabled cookies) — nothing to clear.
  }
}
