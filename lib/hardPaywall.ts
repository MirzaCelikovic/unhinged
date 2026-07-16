import type { PurchasesOffering, PurchasesOfferings } from 'react-native-purchases';

// Hard-paywall A/B (COM-38).
//
// The treatment (B) offering carries `hard_paywall: true` in its RevenueCat
// offering metadata; the control (A) offering does not. RevenueCat serves the
// user's assigned arm as `offerings.current`, so reading the LIVE served
// offering has three properties we rely on:
//   1. Stopping / aborting the experiment auto-releases the gate — `current`
//      reverts to a control offering that has no `hard_paywall` metadata.
//   2. Existing users are unaffected — the gate is additionally scoped to
//      "onboarding not yet complete" at its call sites.
//   3. Fail-open — if offerings fail to load, `currentOffering` is null,
//      `metadata` is undefined, and this returns false (treat as control A).
export const HARD_PAYWALL_METADATA_KEY = 'hard_paywall';

// Onboarding-gate paywall sources: the ONLY surfaces where a hard-paywall (B)
// user gets the non-dismissable offering. Every other presentation for a B user
// falls back to a dismissable offering (so they're never soft-locked in-app).
export const ONBOARDING_REVEAL_SOURCE = 'onboarding_v2_reveal'; // v2 reveal screen
export const ONBOARDING_GATE_SOURCE = 'onboarding_gate'; // v1 / backstop completion gate

const ONBOARDING_GATE_SOURCES = new Set<string>([ONBOARDING_REVEAL_SOURCE, ONBOARDING_GATE_SOURCE]);
export function isOnboardingGateSource(source?: string): boolean {
  return source != null && ONBOARDING_GATE_SOURCES.has(source);
}

export function isHardPaywallOffering(offering?: PurchasesOffering | null): boolean {
  const value = offering?.metadata?.[HARD_PAYWALL_METADATA_KEY];
  // RevenueCat offering metadata is dashboard-authored JSON; accept the boolean
  // and its string form defensively.
  return value === true || value === 'true';
}

// The experiment's CONTROL offering, used as the dismissable fallback for arm-B
// users at non-onboarding surfaces. Pinned by lookup key ON PURPOSE: `offerings.all`
// is an unordered dict, so "first non-hard offering" could hand arm B the discounted
// `winback` offering while arm A pays full price — silently biasing the D28 LTV
// readout (the experiment's primary metric).
export const CONTROL_OFFERING_LOOKUP_KEY = 'default_v2';

export function pickDismissableOffering(offerings: PurchasesOfferings): PurchasesOffering | null {
  return (
    offerings.all[CONTROL_OFFERING_LOOKUP_KEY] ??
    // Last resort if the control offering is ever renamed: any non-hard offering
    // still beats soft-locking a B user behind a close-less paywall.
    Object.values(offerings.all).find((o) => !isHardPaywallOffering(o)) ??
    null
  );
}
