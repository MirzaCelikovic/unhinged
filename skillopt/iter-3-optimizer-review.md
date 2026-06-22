# Optimizer review — iter-3 (final)

## Gate score: 84 / 100

Trend: 48 → 72 → **84** (improved again).

Rationale: The worker produced a faithful, compilable integration; the skill's non-obvious
hazards (patch-package version keying, App-Secret-not-access-token, disabling TikTok's own SKAN,
`Purchase` as a content event, `~/` alias without a babel plugin, Release-on-device) are all
correctly carried through. The remaining point loss is driven by three skill-side defects the
worker had to paper over with invented values: (1) a version-pin contradiction that steered the
worker AWAY from the gold value, (2) the §6.0 chokepoint is a fragment with no `Events` contract
(worker invented event string values), (3) RevenueCat `configure`/api-key/entitlement are
referenced but never specified (worker invented them). None break the build, so this is a strong
rollout — but each forced a guess, which is exactly what the skill should remove.

---

## Per-gap verdict (each verified against GOLD)

### Gap 1 — Version pin contradiction (`^1.6.2` vs "Pin 1.6.2") → **SKILL DEFECT (gold-confirmed wrong direction)**
- GOLD evidence: `unhinged-app/package.json` ships **`"react-native-tiktok-business-sdk": "^1.6.2"`**
  (caret, NOT exact-pinned). The patch is `patches/react-native-tiktok-business-sdk+1.6.2.patch`.
  Podfile.lock pins `TikTokBusiness 1.6.2` / `TikTokBusinessSDK 1.6.1`.
- Verdict: The GOLD's working integration uses **`^1.6.2`**. The skill's prose ("Pin `1.6.2`"
  / §11 "must be consistent" framed as exact) is stronger than reality and made the worker pin
  exact `1.6.2` — diverging from the GOLD. The patch keys on the *resolved* version (`1.6.2`), and
  `^1.6.2` resolves to `1.6.2` today, so the caret works in the GOLD.
- Fix: Make the skill use **`^1.6.2`** everywhere (matching GOLD). Replace the "pin exact"
  prose with the accurate mechanism: the patch filename must match the *resolved* version, so if
  npm ever resolves `^1.6.2` to a newer `1.6.x`, the patch silently no-ops — guard by verifying
  the patch applied (the existing checklist line) rather than by removing the caret. This removes
  the contradiction and aligns to gold.

### Gap 2 — §6.0 chokepoint never defines `Events` / provider / `analytics.track` export → **SKILL DEFECT (partly), scope-clarification**
- GOLD evidence: `unhinged-app/contexts/AnalyticsContext.tsx`. The `Events` map is **fully
  app-specific** (35 entries, human-readable Title-Case string values, e.g.
  `PURCHASE: 'Purchase'`, `INSTAGRAM_CONNECTED: 'Instagram Connected'`). There is **no generic
  `SIGNUP_OR_CONNECT`** — the signup trigger in the GOLD is the app's `INSTAGRAM_CONNECTED`.
  `analytics.track` fans out to amplitude + CustomerIO + `dispatchAttribution`.
- Verdict: The concrete `Events` shape and wire values are correctly **app-provided** — the worker
  was right that the skill doesn't (and shouldn't) own them. The defect is that the skill presented
  the chokepoint as near-complete code without naming the **minimal interface** the integrator must
  supply, so the worker invented `'signup_or_connect'`/`'purchase'`. Those invented values are
  harmless (they're the host app's own wire strings) but the skill should say so explicitly.
- Fix: Reframe §6.0 as "the chokepoint is YOUR app's existing analytics dispatcher; the skill needs
  two hooks into it" and state the **minimal contract**: a signup/connect event and a purchase
  event that carries a stable `product` string. Note the GOLD's actual triggers
  (`INSTAGRAM_CONNECTED`, `PURCHASE`) as the reference example, and that the `Events` map +
  `analytics.track` body are app-owned (the GOLD's also calls Amplitude + Customer.io).

### Gap 3 — RevenueCat assumed pre-existing → **NOT a skill defect (app-provided); needs a 1-line minimal contract**
- GOLD evidence: `unhinged-app/contexts/RevenueCatContext.tsx` configures RC **in-app**:
  `await Purchases.configure({ apiKey: REVENUECAT_API_KEY })`, key from
  `EXPO_PUBLIC_REVENUECAT_API_KEY_APPL` / `_GOOG`, entitlement
  `ENTITLEMENT_ID = 'Unhinged Subscription'`. `unhinged-app/CLAUDE.md` confirms RC predates this
  work ("Payments: RevenueCat").
- Verdict: RevenueCat is genuinely the host app's pre-existing purchase layer — correctly **out of
  scope**. The worker had to invent `configure`/apiKey/entitlement only because the task was a
  *fresh* app. The skill is right to exclude it; it just needs to state the minimal contract the
  skill requires (a purchase moment yielding a stable per-purchase id) and note that
  configure/api-key/entitlement are the host app's, with the GOLD's concrete values as an example.
- Fix: Add a short "RevenueCat is app-provided" callout naming the minimal contract + the GOLD's
  real values (`Purchases.configure`, `EXPO_PUBLIC_REVENUECAT_API_KEY_APPL`,
  entitlement `'Unhinged Subscription'`) as a worked example — not as something the skill installs.

### Gap 4 — Placeholder-vs-missing env trap → **NOT a skill defect (gold does NOT guard placeholders); prose-only fix**
- GOLD evidence: `unhinged-app/lib/tiktokEvents.ts` guard is exactly
  `if (!appId || !tiktokAppId || !accessToken) { ...skip... }` — a **falsy check only**. The GOLD
  does **not** detect placeholder values.
- Verdict: The worker's instinct (placeholders are truthy, so init proceeds with garbage IDs and
  mis-attributes) is correct and a real trap — but inventing a placeholder-detecting guard would
  *diverge from gold*. The honest, gold-faithful fix is prose: do not ship placeholder IDs; the
  falsy guard catches *missing* vars only, not *wrong* ones. (Keeps the skill's code == gold.)
- Fix: Sharpen the §4/§11 warning (already present) to explicitly say the init guard catches
  *missing* not *placeholder* values, so leaving the example IDs in silently mis-attributes. No
  code change to the guard (matches gold).

---

## Additional defects found

- **A1 — `react-native-purchases` version drift (cosmetic, worker-side not skill-side).** Worker
  used `^8.5.0`; GOLD uses `^9.6.13`. The skill correctly says RC is app-provided and doesn't pin
  it, so this is not a skill defect — but the new RevenueCat callout (Gap 3 fix) cites the GOLD's
  `^9.6.13` as the example, which nudges integrators toward a current major.
- **A2 — tsconfig `paths` example omits the app's other alias.** GOLD `tsconfig.json` has both
  `"@/*": ["src/*"]` and `"~/*": ["./*"]`. Not a defect (skill only needs `~/`), but worth a note
  that adding `~/*` should be *additive* to any existing `paths` rather than replacing them.
- **A3 — Init ordering context.** GOLD runs ATT → Meta → RevenueCat attribution → TikTok/SKAN →
  Amplitude in ONE effect. Skill's §6.1 shows ATT → TikTok → install in isolation, which is
  correct, but a one-liner noting "if other SDKs need the ATT outcome, they share this effect
  (GOLD does Meta + RC attribution between ATT and TikTok)" improves fidelity. Minor; added as a
  short note.

---

## Changelog (v2 → v3, bounded)

1. §2 + §11: change `react-native-tiktok-business-sdk` to **`^1.6.2`** (match GOLD); replace
   "Pin `1.6.2`" footgun prose with the accurate "patch keys on the *resolved* version — verify
   it applied" mechanism. (Gap 1)
2. §8 checklist: install line already `@^1.6.2`; reword the patch checklist item to say "verify
   the patch applied against the *resolved* version" instead of implying exact-pin. (Gap 1)
3. §6.0: reframe the chokepoint as the app's **existing** analytics dispatcher and state the
   **minimal interface** (signup/connect event + purchase event carrying a stable `product`);
   cite the GOLD's real triggers (`INSTAGRAM_CONNECTED`, `PURCHASE`) and note the `Events` map +
   `track` body (Amplitude/Customer.io fan-out) are app-owned. (Gap 2)
4. §2 + §6.3: add a tight "RevenueCat is app-provided" contract callout with the GOLD's concrete
   example values (`Purchases.configure`, `EXPO_PUBLIC_REVENUECAT_API_KEY_APPL`, entitlement
   `'Unhinged Subscription'`, `react-native-purchases@^9`). (Gap 3 / A1)
5. §4 + §11: sharpen the env warning — the init guard is a **falsy** check (catches *missing*, not
   *placeholder* values), so shipping example IDs mis-attributes; no guard code change (matches
   gold). (Gap 4)
6. §5.0: note `~/*` is **additive** to any existing tsconfig `paths` (GOLD also has `@/*`). (A2)
7. §6.1: one-line note that other ATT-dependent SDKs share this init effect (GOLD: Meta + RC
   attribution between ATT and TikTok). (A3)

No requirements/description change needed (the skill's scope, trigger surface, and event model are
unchanged; edits are accuracy/contract clarifications). **Linear subtask note: description/requirements
unchanged — v3 is a fidelity patch only.**
