# Optimizer review — tiktok-skan iter-2 (Worker against v1)

## Gate score: 72 / 100 (was 48 in the prior iteration → improved +24)

**Rationale:** The skill-owned surface is now reproduced correctly by the Worker (init + ATT +
install, signup, the two `lib/` modules, the patch, Info.plist, Podfile, version pinning — all
verbatim-correct vs GOLD). The remaining 28 points are lost to gold-confirmed *spec* defects the
v1 skill still carries: it documents a purchase-polling loop, `sub.id` dedupe, a StartTrial call,
and an app-start safety net that **do not exist in the GOLD** — these drove the Worker to invent a
`paywall.tsx` polling loop, a safety-net effect, and a contradictory dedupe key, plus an
unnecessary `babel-plugin-module-resolver` dependency the gold does not use. None of these are in
the live integration.

## Per-gap verdict (verified against GOLD)

- **G1 (chokepoint omits init/trial/polling/safety-net) — PARTIAL skill defect.** GOLD's
  `contexts/AnalyticsContext.tsx` chokepoint handles ONLY signup (on `INSTAGRAM_CONNECTED`) and
  purchase (on `Events.PURCHASE`). The root init/ATT/install effect lives in the same provider
  (real, required). But **trial polling and the safety net do NOT exist** — `logTikTokTrialStarted`
  is dead code (defined, never called) and `hasTrackedConversion`/`addTrackedConversion` are dead
  code too. So the gap is real for *init* (skill now states it's always required) but the skill's
  "missing trial/polling/safety-net" framing was itself wrong — those aren't part of the build.
  **Fix:** §6.0 now says the chokepoint IS the complete primary wiring; trial + safety net marked
  OPTIONAL/not-in-reference.

- **G2 (`~/` alias never configured) — REAL skill defect, but Worker over-fixed.** GOLD configures
  the alias in `tsconfig.json` ONLY: `baseUrl: "."` + `"~/*": ["./*"]`. `babel.config.js` has NO
  `module-resolver` and it is NOT a dependency (`babel-preset-expo` honours tsconfig paths). Worker
  added `babel-plugin-module-resolver` + dropped `baseUrl`. **Fix:** new §5.0 gives the exact
  tsconfig (incl. `baseUrl`) and explicitly says do NOT add the babel plugin.

- **G6 (dedupe by product vs sub.id) — REAL skill defect.** GOLD dedupes purchase by
  `properties?.product` = `entitlement.productIdentifier` (chokepoint, `lib/skadNetwork.ts`). The v1
  §6.3a `sub.id` path is fictional and contradicted the live key. **Fix:** §6.3 rewritten to the
  GOLD RevenueCat handler (product id end-to-end); §6.0 adds an explicit "one dedupe id per
  purchase" warning.

- **G3 (RevenueCat deps absent) — app-specific, now clarified.** GOLD lists
  `react-native-purchases` + `-ui`, but they are the host purchase layer, not skill deps. **Fix:**
  §2 note + checklist tell the integrator to install them only if absent.

- **G10 (EXPO_PUBLIC_* placeholders) — REAL skill defect.** Values in §4 are the GOLD app's real
  IDs. **Fix:** explicit "swap these / mis-attribution" warning in §4 + §8 + §11.

- **G5 (2s/16s poll loop is prose-only) — NOT a defect; the loop does not exist.** GOLD has no
  polling and no backend `fetchSubscriptions`. **Fix:** removed the polling story; §6.3 is the real
  paywall handler.

- **G7 (StrictMode guard) — minor real gap.** GOLD guards with `isInitialized.current`. **Fix:**
  §6.1 now shows the ref guard.

## Additional defects found (Worker diverged from GOLD, skill failed to prevent)
- Worker mirrored Info.plist keys into `app.json` + added `expo-build-properties`. GOLD does
  neither (keys live only in committed `ios/Unhinged/Info.plist`; deployment target pinned in the
  committed Podfile). Left as harmless, but §3 now states the gold keeps keys only in the plist.
- Worker dropped `baseUrl` from tsconfig (alias would not resolve). Fixed in §5.0.

## Changelog of edits (bounded)
1. New §5.0: exact tsconfig alias config (`baseUrl` + paths); "no babel plugin" instruction.
2. §6.0/§6.3: rewrote purchase flow to the GOLD RevenueCat handler; product-id dedupe end-to-end;
   added "one dedupe id per purchase" warning; deleted the fictional polling loop.
3. §6.3b safety net + §5.3 `*Conversion` helpers + §1/§5.1 StartTrial: marked OPTIONAL / not-in-
   reference (they are dead code in GOLD).
4. §6.1: added StrictMode ref guard.
5. §4 + §8 + §11: flag example IDs as reference placeholders to swap.
6. §2: RevenueCat as host purchase layer (install only if absent).
7. §8 checklist + §11 gotchas updated to match.

## Requirements / description change?
No change to the skill's frontmatter description/triggers is needed — scope is unchanged. The edits
are corrections within the existing spec. A Linear subtask under COM-14 IS warranted to record that
the live integration has **no** purchase-polling/safety-net/StartTrial path (the v1 spec overstated
the build), so future rollouts and the gate align with ground truth.
