# Optimizer review — tiktok-skan iter-1

## Gate score: 48 / 100

Rationale: The Worker faithfully reproduced the skill, so the skill's defects became the
artifact's defects. Three of those are correctness-critical and gold-confirmed: (1) the
version contradiction (`^1.5.0` vs `1.6.2`) would make `patch-package` silently no-op and
re-enable TikTok's SKAN (the exact failure §11 warns about); (2) the patch content was
absent, so the linchpin could not be produced; (3) the skill's `PURCHASE` handling is
factually wrong — in the real SDK `PURCHASE` is a `TikTokContentEventName` sent via
`trackContentEvent`, not a `TikTokEventName` via `trackEvent`, and the skill's
`trackEvent(…PURCHASE, properties)` mis-slots properties into the `eventId` argument. The
event-logic/dedupe layer is otherwise sound, which is why this scores ~mid rather than low.

---

## Gold ground truth (the source of every edit below)

| Fact | Gold evidence |
|---|---|
| npm version | `package.json:61` → `"react-native-tiktok-business-sdk": "^1.6.2"` |
| RN wrapper pod | `ios/Podfile.lock:2537` → `TikTokBusiness (1.6.2)` |
| Apple pod | `ios/Podfile.lock:2558/2560` → `TikTokBusinessSDK (= 1.6.1)` (1.6.2 wrapper pins 1.6.1 native) |
| patch filename | `patches/react-native-tiktok-business-sdk+1.6.2.patch` |
| patch content | that file: 1 swift hunk (`disableSKAdNetworkSupport()`), `src/index.tsx` + both `lib/typescript/{commonjs,module}/src/index.d.ts` type hunks |
| PURCHASE is a content event | `node_modules/react-native-tiktok-business-sdk/src/index.tsx:53-58` — `PURCHASE` is in `TikTokContentEventName`, NOT in `TikTokEventName` (line 22-51) |
| purchase call shape | `lib/tiktokEvents.ts:70-80` → `trackContentEvent(TikTokContentEventName.PURCHASE, {[CONTENT_ID]: productId})` |
| trackEvent signature | SDK `src/index.tsx:282` → `trackEvent(eventName, eventId?, properties?)` |
| REGISTRATION / START_TRIAL | `lib/tiktokEvents.ts:47-64` → plain `trackEvent(TikTokEventName.REGISTRATION)` / `START_TRIAL`, no 2nd arg |
| signup deduped per install | `lib/skadNetwork.ts:50-58` + `lib/storage.ts:11,26-31` → `SKAN_SIGNUP_TRACKED` / `trackSignupIfNeeded` |
| init arg order | `lib/tiktokEvents.ts:36` → `initializeSdk(appId, tiktokAppId, accessToken, false, {disableSKAdNetworkSupport:true})` |
| env var names | repo grep → `EXPO_PUBLIC_APP_ID`, `EXPO_PUBLIC_TIKTOK_APP_ID`, `EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN` (skill names already correct) |
| Info.plist keys | `ios/Unhinged/Info.plist:81-95` → ATT copy + both SKAN IDs (skill already correct, verbatim match) |
| mmkv / tracking | `package.json:53,46` → `react-native-mmkv ^3.3.3`, `expo-tracking-transparency ~55.0.13` |
| dispatch architecture | `contexts/AnalyticsContext.tsx:57-69` → single `dispatchAttribution` chokepoint, plain functions (not hooks) |

---

## Per-gap verdicts

### BLOCKER #1 — version contradiction → REAL DEFECT (fix)
Gold uses `^1.6.2` everywhere; the patch is `+1.6.2`; Podfile.lock = `TikTokBusiness 1.6.2`
→ `TikTokBusinessSDK 1.6.1`. The skill's `^1.5.0` / `1.5.0` / `1.5.0` is simply wrong and
self-contradictory with its own §7.1/§11. **Fix:** pin `^1.6.2`, correct the Podfile.lock
block to `TikTokBusiness (1.6.2)` + `TikTokBusinessSDK (1.6.1)`, fix the checklist.

### BLOCKER #2 — patch content missing → REAL DEFECT (fix)
Gold contains the actual apply-clean patch. **Fix:** embed the full diff verbatim in the
skill so it is self-contained. Worker's reconstructed patch was a guess (LOW confidence);
now replaced by the real one.

### AMBIGUITY #1 — trackEvent property mis-slot → REAL DEFECT (fix), and bigger than reported
The Worker spotted the symptom; the gold reveals the root cause. `PURCHASE` is not a
`TikTokEventName` at all — it is a `TikTokContentEventName` and must go through
`trackContentEvent(...)`. The gold's `logTikTokPurchase(productId)` passes
`{ [TikTokContentEventParameter.CONTENT_ID]: productId }`. `REGISTRATION` and `START_TRIAL`
are plain events with no properties. **Fix:** rewrite §5.1 purchase to `trackContentEvent`;
drop the `properties` 2nd-arg from trial; remove `PURCHASE` from the `TikTokEventName` list;
add the `TikTokContentEventName`/`TikTokContentEventParameter` enums.

### AMBIGUITY #5 — "access token" vs App Secret → KEEP AS WARNING, no gold evidence
No App-Secret note exists in the gold repo, so this is not gold-verifiable. It is in the
registered skill *description* as the #1 gotcha, so I keep the env var labelled as the
TikTok Events Manager token and add a one-line caveat, without inventing gold detail.

### BLOCKER #3 / AMBIGUITY #4 — undefined imports (api/auth/subscriptions/usePaywall) → PARTLY REAL
Gold confirms these are **app-provided integration points**, not skill scope: the gold has no
`useTikTokEvents`/`useSKAdNetwork` hooks, no `usePaywall` tracking, no `SubscriptionState`.
It dispatches from a single `dispatchAttribution` chokepoint keyed on the app's own event
names. **Fix:** add an explicit "Integration points (app-provided)" callout so a Worker stops
treating `api`/`auth`/`subscriptions`/RevenueCat as skill-defined, and present the gold's
chokepoint pattern as the canonical wiring (keeping the hook examples as illustration only).

### Signup dedupe missing → REAL DEFECT (fix)
Gold dedupes signup per install (`hasSkanTrackedSignup`/`setSkanTrackedSignup`,
`SKAN_SIGNUP_TRACKED`). The skill's SKAN hook calls `logSignup()` raw → duplicate signup
postbacks on reconnect. **Fix:** add `trackSignupIfNeeded` + the signup storage key.

### AMBIGUITY #2 (managed vs bare Info.plist) → MINOR, clarify
Gold is a prebuild/managed Expo app but keeps a committed `ios/Unhinged/Info.plist` with the
keys. **Fix:** one sentence stating the keys live in the (committed) `ios/<App>/Info.plist`
and to re-add after a clean prebuild / via a config plugin. Not a blocker.

### AMBIGUITY #6 (init arg order) → MINOR, clarify
Gold confirms positional order `initializeSdk(appId, tiktokAppId, accessToken, false, opts)`.
**Fix:** annotate the arg order inline next to the env labels.

### MINOR — mmkv version & tracking version → fix to gold values
`react-native-mmkv ^3.3.3` (New-Arch/Nitro), `expo-tracking-transparency ~55.0.13`. Replace
`<latest compatible>` placeholders with these.

### AMBIGUITY #3 (event id vs fine value), #7 (exclusive vs cumulative), trackEvent native
note, postinstall-postinstall → NOISE / out-of-scope. Gold uses the exclusive schema and the
event-id console logs as the skill describes; left as-is. `postinstall-postinstall` is not
present in the gold and is npm-version-dependent — not added.

---

## Changelog of edits (SKILL.candidate.md)

1. §2: `^1.5.0` → `^1.6.2`; Podfile.lock block → `TikTokBusiness (1.6.2)` /
   `TikTokBusinessSDK (1.6.1)` / `react-native-skadnetwork (0.1.1)`; pin
   `react-native-mmkv ^3.3.3`, `expo-tracking-transparency ~55.0.13`; add `patch-package`.
2. §4: annotate the positional init arg order; one-line token caveat.
3. §5.1: rewrite to gold — `REGISTRATION`/`START_TRIAL` via `trackEvent` (no props);
   `PURCHASE` via `trackContentEvent(TikTokContentEventName.PURCHASE, {CONTENT_ID})`; remove
   `PURCHASE` from the `TikTokEventName` list; add the content enums; correct the signature note.
4. §5.2: add `trackSignupIfNeeded` (signup deduped per install).
5. §5.3: add `SKAN_SIGNUP_TRACKED` + `hasSkanTrackedSignup`/`setSkanTrackedSignup`.
6. New §6.0 "Integration points (app-provided)" + gold `dispatchAttribution` chokepoint
   pattern; clarify hook examples are illustrative.
7. §7.1 / §8 / §11: version `1.6.2` everywhere; embed the full real patch (new §7.3).
8. §3: one sentence on committed Info.plist + prebuild regeneration.
