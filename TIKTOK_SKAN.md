# TikTok SDK + SKAdNetwork (SKAN) Integration

Complete technical specification for sending **Signup** and **Purchase** events to TikTok via SKAdNetwork in an Expo / React Native app (iOS-only). Designed to be copy-pasted into any other Expo app with minimal modification.

---

## 1. Overview / Architecture

The integration uses **two independent React Native packages working in tandem**:

| Concern | Package | Purpose |
|---|---|---|
| TikTok Events API (server-side & SDK telemetry) | `react-native-tiktok-business-sdk` | Wraps Apple `TikTokBusinessSDK` CocoaPod. Sends standard events (`Registration`, `StartTrial`, `Purchase`) to TikTok Events Manager. |
| SKAdNetwork postback (Apple's privacy-safe attribution) | `react-native-skadnetwork` | Wraps Apple's native `SKAdNetwork` framework. Calls `updatePostbackConversionValue` so the TikTok ad-network postback fires with a conversion value identifying the event (Install / Signup / Purchase). |

### Why both?

- The **TikTok SDK** sends events to TikTok's own pipeline (Events Manager), used for general analytics and event-API attribution.
- **SKAdNetwork** is Apple's mandatory iOS attribution mechanism. Apple delivers a single postback per install to the ad network (TikTok) containing a *conversion value* (0–63). We use that conversion value to encode which lifecycle event happened (install, signup, or first purchase). TikTok decodes the postback and credits the campaign.
- **Critical**: the TikTok SDK has its own SKAN handling, but in this app it is **explicitly disabled** so the dedicated `react-native-skadnetwork` module is the single source of truth for SKAN conversion-value updates (avoids two SDKs racing to call `updatePostbackConversionValue`, which would clobber each other). This is done by passing `{ disableSKAdNetworkSupport: true }` in the `initializeSdk(...)` options, which makes the native module call `config?.disableSKAdNetworkSupport()` before init. **That option does not exist in upstream `react-native-tiktok-business-sdk@1.6.2`; it is added by the patch in §7.3.** See §5 (init call) and §7.1 (native bridge).

### Event triggers (where each fires from)

| Event | TikTok event | SKAN fine value | Fires from |
|---|---|---|---|
| App install (first launch) | _(none)_ | `1` (bit 0) | Root init, deduped via MMKV (`install` key) |
| Signup | `Registration` (`trackEvent`) | `2` (bit 1) | After successful signup, deduped via MMKV (`signup` key) |
| Trial started | `StartTrial` (`trackEvent`) | _(not sent to SKAN)_ | OPTIONAL — only if the host app distinguishes a trial-start moment. The reference app ships the `logTikTokTrialStarted` wrapper but does **not** call it; wire it only if you have a trial-start signal (see §6.3). |
| Purchase / subscription active | `Purchase` (`trackContentEvent`) | `4` (bit 2) | After a RevenueCat purchase/restore resolves to an active entitlement, deduped per **product id** |

---

## 2. Dependencies

### npm (`package.json`)

```json
{
  "dependencies": {
    "react-native-tiktok-business-sdk": "^1.6.2",
    "react-native-skadnetwork": "^0.1.1",
    "expo-tracking-transparency": "~55.0.13",
    "react-native-mmkv": "^3.3.3"
  },
  "devDependencies": {
    "patch-package": "^8.0.1"
  },
  "scripts": {
    "postinstall": "patch-package"
  }
}
```

- The TikTok SDK version, the patch filename (§7.3), and the Podfile.lock pin below **must
  all agree on the same version**. `patch-package` keys patches by the *exact* installed
  version: a `^1.6.2` install with a `+1.6.2`-named patch applies; mismatched versions make
  the patch silently NOT apply, the `disableSKAdNetworkSupport` option is ignored, and
  TikTok's own SKAN turns back on (the failure §11 warns about). Pin `1.6.2`.
- `expo-tracking-transparency` is required for the **ATT prompt** (App Tracking Transparency). Without `granted`, both TikTok and SKAN attribution are severely limited.
- `react-native-mmkv` (v3, Nitro/JSI, New-Architecture only) is used to dedupe (so install / signup / a given product-id is never reported twice).
- **RevenueCat is the host app's purchase layer and is NOT part of this skill.** The reference
  app already ships `react-native-purchases` + `react-native-purchases-ui` and dispatches a
  `Purchase` analytics event from its RevenueCat flow (§6.3). If your target app does **not**
  already use RevenueCat, install `react-native-purchases react-native-purchases-ui` and an
  entitlement/API-key config separately, OR fire the chokepoint `Purchase` event (§6.0) from
  whatever purchase layer you do use. This skill only needs *some* purchase moment to call
  `logTikTokPurchase` + `trackPurchaseIfNeeded`.

### CocoaPods

The TikTok pod requires **modular headers** to link with Swift. In `ios/Podfile`, inside the main app target (before `use_react_native!`):

```ruby
target 'YourAppTarget' do
  use_expo_modules!

  # Required for the TikTok Business SDK to compile with Swift modular_headers
  pod 'TikTokBusinessSDK', :modular_headers => true

  # ... rest of target
end
```

Pinned versions verified working in this app (from `Podfile.lock`):

```
- TikTokBusiness (1.6.2)            # the RN wrapper pod
- TikTokBusinessSDK (1.6.1)         # Apple/CocoaPods TikTok SDK (the 1.6.2 wrapper pins 1.6.1 native)
- react-native-skadnetwork (0.1.1)
```

iOS deployment target: **15.1** (the SKAN module needs ≥ 14.0 for `SKAdNetwork`, ≥ 15.4 for `updatePostbackConversionValue:`, ≥ 16.1 for coarse + lockWindow variant — see fallback chain in §5.2). The reference app sets this directly in the committed `ios/Podfile` (`platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'`).

---

## 3. Info.plist

Add the following keys to the (committed) `ios/<App>/Info.plist`:

```xml
<!-- ATT prompt copy -->
<key>NSUserTrackingUsageDescription</key>
<string>It will help us to provide you a more personalized experience, relevant content, and promotions.</string>

<!-- TikTok's SKAdNetwork identifiers -->
<key>SKAdNetworkItems</key>
<array>
  <dict>
    <key>SKAdNetworkIdentifier</key>
    <string>v9wttpbfk9.skadnetwork</string>
  </dict>
  <dict>
    <key>SKAdNetworkIdentifier</key>
    <string>n38lu8286q.skadnetwork</string>
  </dict>
</array>
```

The two `SKAdNetworkIdentifier` strings are TikTok's official IDs and are required for SKAN postbacks to actually reach TikTok. Without these, the postback API call succeeds but nothing is delivered.

> This app commits the generated `ios/` directory, so the keys live directly in
> `ios/<App>/Info.plist` (this is where the reference app keeps them — it does **not** mirror
> them into `app.json` or use a config plugin). If you run a clean `expo prebuild` (which
> regenerates `ios/`), re-add these keys — either by re-editing the regenerated plist or via an
> `infoPlist` block in `app.json` / a config plugin so they survive the next prebuild.
> If the app also integrates Meta (Facebook), keep the existing Meta IDs in the same
> `SKAdNetworkItems` array — they're additive.

---

## 4. Environment variables

Three env vars are read at SDK init time (using Expo's `EXPO_PUBLIC_*` convention so they're inlined into the JS bundle):

```env
# iOS App Store numeric listing ID (used as `appId` in TikTok config)
EXPO_PUBLIC_APP_ID=6737972647

# TikTok App ID from TikTok Events Manager → Web/App Connector
EXPO_PUBLIC_TIKTOK_APP_ID=7566251265915895815

# Credential issued by TikTok Events Manager for the server events API.
# NOTE: TikTok's UI labels this an "access token", but it functions as an App
# Secret — treat it as a secret, never commit the real value, keep it in .env.
EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN=<token>
```

> **The numeric values above are the REFERENCE app's IDs — placeholders. You MUST replace
> `EXPO_PUBLIC_APP_ID` with the target app's own App Store numeric ID and
> `EXPO_PUBLIC_TIKTOK_APP_ID` with the target app's own TikTok App ID** (from that app's TikTok
> Events Manager). Shipping the reference values silently mis-attributes every event to the wrong
> app. `EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN` is always app-specific and has no default.

These three map **positionally** onto the init call (§5/§6.1):
`initializeSdk(appId, tiktokAppId, accessToken, debug, options)`. Names can be renamed, but if
you rename them keep the positional order — swapping `appId`/`tiktokAppId` is a silent
mis-attribution.

---

## 5. JS / TS wrapper modules

Place these under `lib/` (or wherever the target app keeps its hooks). They are the **only public API** the rest of the app should call. The reference app exposes them as plain async functions and calls them from a single analytics chokepoint (see §6.0); the hook form below is equivalent and shown for illustration.

### 5.0 Path alias (`~/`) — required for the imports below to resolve

Every import in §5–§6 uses the `~/` alias (`~/lib/...`, `~/contexts/...`). A fresh
`create-expo-app` does **not** ship this alias, so without it Metro/TypeScript cannot resolve
the imports and the app fails to bundle. The reference app configures it in **`tsconfig.json`
only** — `babel-preset-expo` (Expo SDK ≥ 50) reads `tsconfig` `paths` natively, so **no
`babel-plugin-module-resolver` and no extra devDependency are needed** (do not add one):

```jsonc
// tsconfig.json (reference app)
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",          // REQUIRED — paths resolve relative to baseUrl
    "paths": {
      "~/*": ["./*"]
    }
  }
}
```

(Alternatively, use plain relative imports — `../lib/...` — and skip the alias entirely.)

### 5.1 `lib/tiktokEvents.ts` (TikTok Events Manager wrappers)

```ts
import { Platform } from 'react-native';
import {
  TikTokBusiness,
  TikTokEventName,
  TikTokContentEventName,
  TikTokContentEventParameter,
} from 'react-native-tiktok-business-sdk';

const isSupported = () => Platform.OS === 'ios';
let initialized = false;

/** Initialize once at app start. Reads credentials from EXPO_PUBLIC_* env. */
export const initTikTokSdk = async (): Promise<void> => {
  if (!isSupported() || initialized) return;
  const appId = process.env.EXPO_PUBLIC_APP_ID;
  const tiktokAppId = process.env.EXPO_PUBLIC_TIKTOK_APP_ID;
  const accessToken = process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN;
  if (!appId || !tiktokAppId || !accessToken) {
    console.warn('TikTok SDK: missing EXPO_PUBLIC_* credentials — skipping init');
    return;
  }
  try {
    // Hand SKAN to react-native-skadnetwork; stop the TikTok SDK from also
    // writing conversion values. Requires the patch (see §7.3).
    await TikTokBusiness.initializeSdk(appId, tiktokAppId, accessToken, false, {
      disableSKAdNetworkSupport: true,
    });
    initialized = true;
    console.log('TikTok SDK initialized');
  } catch (error) {
    console.error('TikTok SDK: Error initializing:', error);
  }
};

/** Signup → standard `Registration` event. */
export const logTikTokSignup = async (): Promise<void> => {
  if (!isSupported()) return;
  try {
    await TikTokBusiness.trackEvent(TikTokEventName.REGISTRATION);
  } catch (error) {
    console.error('TikTok Events: Error logging Registration event:', error);
  }
};

/** Trial → standard `StartTrial` event. OPTIONAL — the reference app exports this
 *  but does not call it (no trial-start signal). Wire it only if you have one. */
export const logTikTokTrialStarted = async (): Promise<void> => {
  if (!isSupported()) return;
  try {
    await TikTokBusiness.trackEvent(TikTokEventName.START_TRIAL);
  } catch (error) {
    console.error('TikTok Events: Error logging StartTrial event:', error);
  }
};

/**
 * Purchase → `Purchase` CONTENT event.
 * In this SDK version `Purchase` is a TikTokContentEventName (NOT a plain
 * TikTokEventName) and is sent via `trackContentEvent`, with content params.
 */
export const logTikTokPurchase = async (productId?: string): Promise<void> => {
  if (!isSupported()) return;
  try {
    await TikTokBusiness.trackContentEvent(
      TikTokContentEventName.PURCHASE,
      productId ? { [TikTokContentEventParameter.CONTENT_ID]: productId } : undefined
    );
  } catch (error) {
    console.error('TikTok Events: Error logging Purchase event:', error);
  }
};
```

Notes:
- **Two distinct APIs.** `trackEvent(eventName, eventId?, properties?)` is for plain
  `TikTokEventName`s (here `REGISTRATION`, `START_TRIAL`) — pass only the name. **Do NOT pass
  properties as the 2nd arg** to `trackEvent`; the 2nd arg is `eventId`, so
  `trackEvent(name, properties)` mis-slots your properties into the event id. For events that
  carry properties use `trackContentEvent`.
- **`PURCHASE` is a `TikTokContentEventName`, not a `TikTokEventName`** — it must go through
  `trackContentEvent(TikTokContentEventName.PURCHASE, { [CONTENT_ID]: ... })`.
- `TikTokEventName` (plain) values: `ACHIEVE_LEVEL`, `ADD_PAYMENT_INFO`, `COMPLETE_TUTORIAL`,
  `CREATE_GROUP`, `CREATE_ROLE`, `GENERATE_LEAD`, `IMPRESSION_LEVEL_AD_REVENUE`,
  `IN_APP_AD_CLICK`, `IN_APP_AD_IMPR`, `INSTALL_APP`, `JOIN_GROUP`, `LAUNCH_APP`, `LOGIN`,
  `RATE`, `REGISTRATION`, `SEARCH`, `SPEND_CREDITS`, `START_TRIAL`, `SUBSCRIBE`,
  `UNLOCK_ACHIEVEMENT` (plus deprecated loan events). **`PURCHASE` is NOT in this enum.**
- `TikTokContentEventName` values: `ADD_TO_CART`, `ADD_TO_WISHLIST`, `CHECK_OUT`, `PURCHASE`,
  `VIEW_CONTENT`. `TikTokContentEventParameter` values: `CONTENT_TYPE`, `CONTENT_ID`,
  `DESCRIPTION`, `CURRENCY`, `VALUE`, `CONTENTS`, `ORDER_ID`.

### 5.2 `lib/skadNetwork.ts` (SKAN postbacks + dedupe)

```ts
import { Platform } from 'react-native';
import { logEventSKAdNetwork } from 'react-native-skadnetwork';

import {
  addSkanTrackedSubscription,
  hasSkanTrackedInstall,
  hasSkanTrackedSignup,
  hasSkanTrackedSubscription,
  setSkanInstallTracked,
  setSkanTrackedSignup,
} from './storage';

// Encoding: each event sets one bit; SKAN fine value = 2^event.
// INSTALL → fine value 1, SIGNUP → 2, PURCHASE → 4.
// Up to 6 events fit in the 6-bit fine value (0..63).
export const SKAdNetworkEvents = {
  INSTALL: 0,
  SIGNUP: 1,
  PURCHASE: 2,
} as const;
export type SKAdNetworkEvent = (typeof SKAdNetworkEvents)[keyof typeof SKAdNetworkEvents];

const logEvent = async (
  event: SKAdNetworkEvent,
  coarseValue: number = 0,   // 0 = Low, 1 = Medium, 2 = High (iOS 16.1+)
  lockWindow: boolean = false // iOS 16.1+ — true ends the conversion window immediately
): Promise<void> => {
  if (Platform.OS !== 'ios') return;
  try {
    await logEventSKAdNetwork(event, coarseValue, lockWindow);
    console.log(`SKAdNetwork: Successfully logged event ${event}`);
  } catch (error) {
    console.error('SKAdNetwork: Error logging event:', error);
  }
};

// Install postback — once per device install. Kicks off the SKAN attribution window.
export const trackInstallIfNeeded = (): boolean => {
  if (Platform.OS !== 'ios') return false;
  if (!hasSkanTrackedInstall()) {
    logEvent(SKAdNetworkEvents.INSTALL);
    setSkanInstallTracked();
    return true;
  }
  return false;
};

// Signup postback — once per device install (signup triggers can fire on
// reconnect / account-switch, so dedupe to one postback per install).
export const trackSignupIfNeeded = (): boolean => {
  if (Platform.OS !== 'ios') return false;
  if (!hasSkanTrackedSignup()) {
    logEvent(SKAdNetworkEvents.SIGNUP);
    setSkanTrackedSignup();
    return true;
  }
  return false;
};

// Purchase postback — deduped per id (the reference app passes the RevenueCat
// PRODUCT id; any stable per-purchase string works as long as it is consistent).
export const trackPurchaseIfNeeded = (subscriptionId: string): boolean => {
  if (Platform.OS !== 'ios') return false;
  if (!hasSkanTrackedSubscription(subscriptionId)) {
    logEvent(SKAdNetworkEvents.PURCHASE);
    addSkanTrackedSubscription(subscriptionId);
    return true;
  }
  return false;
};
```

#### How the conversion value is built

The library does the bit math for you. From `react-native-skadnetwork/src/SKAdNetwork.ts`:

```ts
export const logEventSKAdNetwork = async (event, coarseValue = 0, lockWindow = false) => {
  const bitValues = new Array(6).fill(0);
  bitValues[event] = 1;                                              // set one bit
  const conversionValue = bitValues.reduce(                          // → 2^event
    (acc, bit, index) => acc + bit * 2 ** index, 0);
  await SKAdNetworkModule.setConversionValue(conversionValue, coarseValue, lockWindow);
};
```

So `INSTALL` → fineValue `1`, `SIGNUP` → `2`, `PURCHASE` → `4`. The `event` you pass is the
bit index (0/1/2 — what the console logs print); the postback carries the fine value
(1/2/4). On the TikTok dashboard side, map fine values to events (§9).

#### Native fallback chain (FYI — this is in the SDK, not your code)

The native module `SKAdNetworkModule.m` calls the most modern available API:

| iOS version | API used |
|---|---|
| 16.1+ | `updatePostbackConversionValue:coarseValue:lockWindow:completionHandler:` |
| 15.4+ | `updatePostbackConversionValue:completionHandler:` (fine value only) |
| 14.0+ | `updateConversionValue:` (legacy SKAN 2/3) — also calls `registerAppForAdNetworkAttribution` when value is `0` |
| 11.3+ | `registerAppForAdNetworkAttribution` only |

### 5.3 `lib/storage.ts` (MMKV dedupe helpers)

The SKAN module depends on these helpers. Add to whichever storage module the target app uses (or create one).

```ts
import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV();

const KEYS = {
  SKAN_TRACKED_SUBSCRIPTIONS: 'skan_tracked_subscriptions',
  SKAN_INSTALL_TRACKED: 'skan_install_tracked',
  SKAN_SIGNUP_TRACKED: 'skan_signup_tracked',
  TRACKED_SUBSCRIPTION_CONVERSIONS: 'tracked_subscription_conversions',
} as const;

// --- SKAN install dedupe ---
export const hasSkanTrackedInstall = (): boolean =>
  storage.getBoolean(KEYS.SKAN_INSTALL_TRACKED) ?? false;
export const setSkanInstallTracked = () => storage.set(KEYS.SKAN_INSTALL_TRACKED, true);

// --- SKAN signup dedupe ---
export const hasSkanTrackedSignup = (): boolean =>
  storage.getBoolean(KEYS.SKAN_SIGNUP_TRACKED) ?? false;
export const setSkanTrackedSignup = () => storage.set(KEYS.SKAN_SIGNUP_TRACKED, true);

// --- SKAN purchase dedupe (per purchase id) ---
export const getSkanTrackedSubscriptions = (): string[] => {
  const data = storage.getString(KEYS.SKAN_TRACKED_SUBSCRIPTIONS);
  return data ? JSON.parse(data) : [];
};
export const addSkanTrackedSubscription = (subscriptionId: string) => {
  const tracked = getSkanTrackedSubscriptions();
  if (!tracked.includes(subscriptionId)) {
    tracked.push(subscriptionId);
    storage.set(KEYS.SKAN_TRACKED_SUBSCRIPTIONS, JSON.stringify(tracked));
  }
};
export const hasSkanTrackedSubscription = (subscriptionId: string): boolean =>
  getSkanTrackedSubscriptions().includes(subscriptionId);

// --- OPTIONAL: cross-SDK purchase dedupe for an app-start "safety net" ---
// The reference app defines these but does NOT use them (the single chokepoint
// purchase dispatch + per-product dedupe above is sufficient). Add the §6.3b
// effect that consumes these only if you need to catch purchases made off-device.
export const hasTrackedConversion = (subscriptionId: string): boolean => {
  const data = storage.getString(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS);
  const tracked: string[] = data ? JSON.parse(data) : [];
  return tracked.includes(subscriptionId);
};
export const addTrackedConversion = (subscriptionId: string) => {
  const data = storage.getString(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS);
  const tracked: string[] = data ? JSON.parse(data) : [];
  if (!tracked.includes(subscriptionId)) {
    tracked.push(subscriptionId);
    storage.set(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS, JSON.stringify(tracked));
  }
};
```

The `SKAN_TRACKED_SUBSCRIPTIONS` key is the live dedupe (checked inside `trackPurchaseIfNeeded`
at moment-of-purchase). `TRACKED_SUBSCRIPTION_CONVERSIONS` backs the **optional** safety-net
effect in §6.3b only.

---

## 6. Where to call each function

### 6.0 Integration points (app-provided — NOT defined by this skill)

The functions in §5 are the skill's surface. Everything below is supplied by the host app and
must already exist (or be wired by the integrator); the skill does **not** define them:

- The **auth/signup** moment and the **purchase** moment (and the product id passed to it).
- **RevenueCat** paywall presentation and purchase results (the reference app's purchase layer).
- The **app's own analytics event names** and where they are dispatched.

The reference app does NOT use per-screen hooks. It funnels everything through one analytics
chokepoint, so attribution fires at exactly the same moments as its analytics events. **This is
the complete, primary wiring — there is no separate purchase-polling path or app-start safety
net in the reference app** (§6.3 explains the purchase moment in full):

```ts
// contexts/AnalyticsContext.tsx (reference pattern)
import { initTikTokSdk, logTikTokPurchase, logTikTokSignup } from '~/lib/tiktokEvents';
import { trackInstallIfNeeded, trackPurchaseIfNeeded, trackSignupIfNeeded } from '~/lib/skadNetwork';

const dispatchAttribution = (event: string, properties?: Record<string, any>) => {
  switch (event) {
    case Events.SIGNUP_OR_CONNECT:                 // your app's signup/connect event
      logTikTokSignup();        // TikTok 'Registration'
      trackSignupIfNeeded();    // SKAN signup postback (fineValue 2), deduped per install
      break;
    case Events.PURCHASE:                          // your app's purchase event
      logTikTokPurchase(properties?.product);                 // TikTok 'Purchase' content event
      // SKAN purchase postback (fineValue 4), deduped per PRODUCT id
      trackPurchaseIfNeeded(String(properties?.product ?? 'purchase'));
      break;
  }
};

// in your track(...) wrapper, after sending to your analytics provider:
export const analytics = {
  track: (event: string, properties?: Record<string, any>) => {
    // ...send to your analytics provider(s) here...
    dispatchAttribution(event, properties);
  },
};
```

> **Dedupe key = the same `product` value, end to end.** The chokepoint dedupes the SKAN
> purchase postback by `properties?.product`. Whatever fires `Events.PURCHASE` MUST pass the
> same product identifier every time for one purchase (the reference app passes
> `entitlement.productIdentifier` from RevenueCat — see §6.3), so the per-id dedupe in
> `trackPurchaseIfNeeded` works. Do **not** dispatch the same purchase through two paths with
> two different ids (e.g. product id from one and a subscription id from another) — they won't
> dedupe each other and SKAN purchase could fire twice.

At app start (after ATT — see §6.1) call `initTikTokSdk()` then `trackInstallIfNeeded()`.

> The hook examples in §6.1–§6.3 below are an **alternative illustration** of the same calls
> if you prefer per-screen hooks. The root init effect (§6.1) is always required; the signup
> (§6.2) and purchase (§6.3) calls are the same calls the chokepoint above makes — wire them
> EITHER through the chokepoint OR inline, never both for the same event.

### 6.1 SDK initialization + ATT + install (root, e.g. `AnalyticsProvider` / `app/_layout.tsx`)

Order matters: request **ATT first**, then init SDKs, then fire the install postback. Guard the
effect against React StrictMode double-invoke with a ref (the reference app uses
`isInitialized.current`), so ATT is not prompted twice:

```tsx
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { initTikTokSdk } from '~/lib/tiktokEvents';
import { trackInstallIfNeeded } from '~/lib/skadNetwork';

const isInitialized = useRef(false);

useEffect(() => {
  if (isInitialized.current) return;   // StrictMode / remount guard
  isInitialized.current = true;
  const init = async () => {
    if (Platform.OS !== 'ios') return;
    try {
      // (1) ATT first — 1s delay so the system settles the splash/UI before the
      //     modal (otherwise the prompt is sometimes dropped). Other SDKs that
      //     need the ATT outcome (e.g. Meta) read `status` here.
      await new Promise((r) => setTimeout(r, 1000));
      const { status } = await requestTrackingPermissionsAsync();
      console.log('ATT permission status:', status);
    } catch (e) {
      console.error('ATT request failed:', e);
    }
    try {
      // (2) Init TikTok with SKAN handed to react-native-skadnetwork (needs the patch).
      await initTikTokSdk();
      // (3) Fire the one-time SKAN install postback — opens the conversion window.
      trackInstallIfNeeded();
    } catch (e) {
      console.error('TikTok/SKAN init failed:', e);
    }
  };
  init();
}, []);
```

### 6.2 Signup

Call **both** trackers immediately after signup succeeds (the chokepoint in §6.0 does this on
the signup/connect event). If wiring directly:

```tsx
import { logTikTokSignup } from '~/lib/tiktokEvents';
import { trackSignupIfNeeded } from '~/lib/skadNetwork';

// after the signup API succeeds and you have an auth token:
logTikTokSignup();      // TikTok 'Registration'
trackSignupIfNeeded();  // SKAN postback fineValue 2, deduped per install
```

### 6.3 Purchase flow

Purchases come from RevenueCat. **This is exactly how the reference app does it** — it is the
RevenueCat paywall handler, and it dispatches a single `Purchase` analytics event that flows
through the §6.0 chokepoint. There is **no polling loop, no backend `fetchSubscriptions`, and no
app-start safety net** in the reference app.

```tsx
// contexts/RevenueCatContext.tsx (reference pattern), inside the paywall handler
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Purchases from 'react-native-purchases';
import { analytics, Events } from '~/contexts/AnalyticsContext';

const ENTITLEMENT_ID = 'Your Entitlement'; // your RevenueCat entitlement id

const result = await RevenueCatUI.presentPaywall();
switch (result) {
  case PAYWALL_RESULT.PURCHASED:
  case PAYWALL_RESULT.RESTORED: {
    const info = await Purchases.getCustomerInfo();
    const entitlement = info.entitlements.active[ENTITLEMENT_ID];
    if (entitlement) {
      // Single dispatch → chokepoint fires logTikTokPurchase + trackPurchaseIfNeeded,
      // deduped per product id. Restores are reported too (deduped, so harmless).
      analytics.track(Events.PURCHASE, {
        product: entitlement.productIdentifier,
        restored: result === PAYWALL_RESULT.RESTORED,
      });
    }
    break;
  }
  // NOT_PRESENTED / ERROR / CANCELLED → no purchase event
}
```

- The product id passed (`entitlement.productIdentifier`) is the dedupe key (§6.0). It is the
  same value on a later restore, so the second dispatch is suppressed by
  `hasSkanTrackedSubscription`.
- **Trial:** the reference app does NOT emit `StartTrial` (no trial-start signal). If your app
  *does* distinguish a trial (e.g. RevenueCat `periodType === 'TRIAL'` or
  `entitlement.willRenew` heuristics), call `logTikTokTrialStarted()` at that moment. StartTrial
  is a TikTok-only event and is **not** sent to SKAN.

#### (b) OPTIONAL app-start safety net (`app/(tabs)/_layout.tsx`)

> **Not used by the reference app.** Add this only if you must catch purchases completed
> off-device (e.g. a restore on a fresh install where the paywall handler above never ran).
> It uses the **separate** `tracked_subscription_conversions` key (§5.3) so it can't double-fire
> with the chokepoint path. `subscriptions` is loaded from the app's own subscription source.

```tsx
import { logTikTokPurchase } from '~/lib/tiktokEvents';
import { trackPurchaseIfNeeded } from '~/lib/skadNetwork';
import { addTrackedConversion, hasTrackedConversion } from '~/lib/storage';

useEffect(() => {
  if (!subscriptions?.length) return;
  const active = subscriptions.find((s) => s.state === 'ACTIVE');
  if (!active?.id) return;
  const subId = active.id.toString();
  if (!hasTrackedConversion(subId)) {
    trackPurchaseIfNeeded(subId);
    logTikTokPurchase(subId);
    addTrackedConversion(subId);
  }
}, [subscriptions]);
```

> ⚠️ If you enable this safety net, make its dedupe id consistent with the chokepoint's
> `product` id (or accept it as a distinct, separately-deduped channel). Mixing a product id in
> one path and a subscription id in the other is the double-fire trap warned about in §6.0.

---

## 7. Native bridge specifics (for debugging only — no app changes needed)

These files live inside the npm packages; you don't touch them, but understanding them helps debug.

### 7.1 TikTok `TikTokBusinessModule.swift`

- `initializeSdk(...)` constructs `TikTokConfig(accessToken:appId:tiktokAppId:)`.
- **Reads the `options` dict and, when `disableSKAdNetworkSupport == true`, calls `config?.disableSKAdNetworkSupport()` before init**, because the dedicated `react-native-skadnetwork` module owns the conversion-value pipeline. This app passes that flag (§5.1/§6.1). Do not remove it; if you do, two libraries fight for `updatePostbackConversionValue` and clobber each other.
- **This SKAN-disable option does not exist in upstream `react-native-tiktok-business-sdk@1.6.2`** — it is added by the patch in §7.3, applied automatically via the `postinstall: patch-package` script. If the package is upgraded, regenerate the patch and rename it to match the new version.
- `trackEvent(eventName, eventId, parameters)` builds a `TikTokBaseEvent(eventName:eventId:)`, copies any properties in, and dispatches via `TikTokBusiness.trackTTEvent(event)`. `trackContentEvent(eventName, parameters)` is the dedicated path for content events like `Purchase`.
- Module name (used from JS): `TikTokBusinessModule`.

### 7.2 SKAN `SKAdNetworkModule.m`

- Single exported method: `setConversionValue(fineValue:coarseValue:lockWindow:resolver:rejecter:)`.
- Validates: `0 ≤ fineValue ≤ 63`, `0 ≤ coarseValue ≤ 2`.
- Branches on iOS version (see §5.2 table).
- Module name: `SKAdNetworkModule`.

### 7.3 The patch — `patches/react-native-tiktok-business-sdk+1.6.2.patch`

Copy this file verbatim into `patches/`. It adds the `disableSKAdNetworkSupport` option to the
native bridge and to the TS types. It applies clean against `react-native-tiktok-business-sdk@1.6.2`.

```diff
diff --git a/node_modules/react-native-tiktok-business-sdk/ios/TikTokBusinessModule.swift b/node_modules/react-native-tiktok-business-sdk/ios/TikTokBusinessModule.swift
index c67a427..6890680 100644
--- a/node_modules/react-native-tiktok-business-sdk/ios/TikTokBusinessModule.swift
+++ b/node_modules/react-native-tiktok-business-sdk/ios/TikTokBusinessModule.swift
@@ -263,6 +263,11 @@ class TikTokBusinessModule: NSObject, RCTBridgeModule {
       if opts["disablePaymentTracking"] as? Bool == true {
         config?.disablePaymentTracking()
       }
+      if opts["disableSKAdNetworkSupport"] as? Bool == true {
+        // Let the dedicated react-native-skadnetwork module own SKAN conversion
+        // values so the two SDKs don't clobber each other's postbacks.
+        config?.disableSKAdNetworkSupport()
+      }
     }
 
     TikTokBusiness.initializeSdk(config) { success, error in
diff --git a/node_modules/react-native-tiktok-business-sdk/lib/typescript/commonjs/src/index.d.ts b/node_modules/react-native-tiktok-business-sdk/lib/typescript/commonjs/src/index.d.ts
index 59cf309..79a9d06 100644
--- a/node_modules/react-native-tiktok-business-sdk/lib/typescript/commonjs/src/index.d.ts
+++ b/node_modules/react-native-tiktok-business-sdk/lib/typescript/commonjs/src/index.d.ts
@@ -79,6 +79,7 @@ export interface TikTokSdkConfig {
     disableLaunchTracking?: boolean;
     disableRetentionTracking?: boolean;
     disablePaymentTracking?: boolean;
+    disableSKAdNetworkSupport?: boolean;
 }
 /**
  * Initializes the TikTok SDK.
diff --git a/node_modules/react-native-tiktok-business-sdk/lib/typescript/module/src/index.d.ts b/node_modules/react-native-tiktok-business-sdk/lib/typescript/module/src/index.d.ts
index 59cf309..79a9d06 100644
--- a/node_modules/react-native-tiktok-business-sdk/lib/typescript/module/src/index.d.ts
+++ b/node_modules/react-native-tiktok-business-sdk/lib/typescript/module/src/index.d.ts
@@ -79,6 +79,7 @@ export interface TikTokSdkConfig {
     disableLaunchTracking?: boolean;
     disableRetentionTracking?: boolean;
     disablePaymentTracking?: boolean;
+    disableSKAdNetworkSupport?: boolean;
 }
 /**
  * Initializes the TikTok SDK.
diff --git a/node_modules/react-native-tiktok-business-sdk/src/index.tsx b/node_modules/react-native-tiktok-business-sdk/src/index.tsx
index 72ef5da..ec55488 100644
--- a/node_modules/react-native-tiktok-business-sdk/src/index.tsx
+++ b/node_modules/react-native-tiktok-business-sdk/src/index.tsx
@@ -176,6 +176,13 @@ export interface TikTokSdkConfig {
   disableLaunchTracking?: boolean;
   disableRetentionTracking?: boolean;
   disablePaymentTracking?: boolean;
+  /**
+   * Disables the TikTok SDK's built-in SKAdNetwork conversion-value handling.
+   * Set this when another module (e.g. react-native-skadnetwork) owns SKAN
+   * postbacks, to avoid both SDKs racing on updatePostbackConversionValue.
+   * iOS only.
+   */
+  disableSKAdNetworkSupport?: boolean;
 }
 
 /**
```

---

## 8. Required setup checklist (for the target app)

- [ ] `npm install react-native-tiktok-business-sdk@^1.6.2 react-native-skadnetwork expo-tracking-transparency react-native-mmkv`
- [ ] Configure the `~/` path alias in `tsconfig.json` (`baseUrl: "."` + `"~/*": ["./*"]`) — no babel plugin needed (§5.0), OR use relative imports
- [ ] Add `pod 'TikTokBusinessSDK', :modular_headers => true` in `ios/Podfile` inside the main target
- [ ] iOS deployment target ≥ 15.1 (TikTok SDK requirement; SKAN works ≥ 14 with the fallback chain)
- [ ] Apply the SKAN-disable patch: `npm i -D patch-package`, add `"postinstall": "patch-package"`, save §7.3 as `patches/react-native-tiktok-business-sdk+1.6.2.patch`, then `npm install` (adds the `disableSKAdNetworkSupport` option). **Verify it applies clean — a version mismatch makes it silently no-op.**
- [ ] `cd ios && pod install`
- [ ] Pass `{ disableSKAdNetworkSupport: true }` to `TikTokBusiness.initializeSdk(...)` at init (§5.1/§6.1)
- [ ] `Info.plist`: add `NSUserTrackingUsageDescription` copy
- [ ] `Info.plist`: add `SKAdNetworkItems` with both TikTok identifiers (`v9wttpbfk9.skadnetwork`, `n38lu8286q.skadnetwork`)
- [ ] `.env`: add `EXPO_PUBLIC_APP_ID`, `EXPO_PUBLIC_TIKTOK_APP_ID`, `EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN` — **using the TARGET app's own IDs, not the §4 example values** (never commit the token value)
- [ ] Add `lib/tiktokEvents.ts` (§5.1), `lib/skadNetwork.ts` (§5.2), and the storage helpers (§5.3)
- [ ] At root, after ATT (guarded against StrictMode double-invoke): `await initTikTokSdk()` then `trackInstallIfNeeded()` (§6.1)
- [ ] On signup: `logTikTokSignup()` + `trackSignupIfNeeded()` (§6.2 / §6.0)
- [ ] On purchase (RevenueCat paywall handler): dispatch `Events.PURCHASE` with `{ product: entitlement.productIdentifier }` so the chokepoint fires `logTikTokPurchase(product)` + `trackPurchaseIfNeeded(product)` (§6.3 / §6.0)
- [ ] (OPTIONAL) Add the app-start "safety net" effect (§6.3b) only if catching off-device purchases
- [ ] In TikTok Events Manager → SKAN setup, configure a conversion-value schema mapping fine value `1`→install, `2`→signup, `4`→purchase (§9)

---

## 9. SKAN conversion-value schema (TikTok dashboard config)

Mirror this in TikTok's SKAN configuration UI so the postbacks decode correctly:

| Fine value | Bit set | Lifecycle event |
|---|---|---|
| 1 | bit 0 | App install |
| 2 | bit 1 | Signup (Registration) |
| 4 | bit 2 | First purchase / subscription active |

> If TikTok requires a *cumulative* schema where later events also include earlier bits (e.g. purchase = bits 0+1+2 → fine value `7`), modify `logEventSKAdNetwork` to OR the new bit into the previously stored value. The current implementation sets only the latest event's bit (an *exclusive* schema — one event per postback), which is what TikTok's "single event per attribution window" SKAN config expects.

---

## 10. Testing & verification

1. **Build a non-dev release** (SKAN won't fire in `__DEV__` builds because Apple disables it on debug installs). Verify on a **real device**.
2. Launch on a fresh install → check console for:
   - `TikTok SDK initialized` (JS) and `[TikTokBusiness] ... initialized OK` (native)
   - `SKAdNetwork: Successfully logged event 0` (install; the log prints the bit index)
3. Complete signup → expect `Registration` in TikTok Events Manager and `SKAdNetwork: Successfully logged event 1`.
4. Complete a purchase → expect `Purchase` in Events Manager and `SKAdNetwork: Successfully logged event 2`.
5. TikTok-side attribution shows in the dashboard hours-to-days later (Apple delays SKAN postbacks up to 35 days; a fresh-install test postback typically arrives within 24 h).

---

## 11. Gotchas

- **Version must be consistent.** npm `^1.6.2`, patch `+1.6.2`, Podfile.lock `TikTokBusiness 1.6.2` (→ `TikTokBusinessSDK 1.6.1`). `patch-package` keys patches by exact installed version; any mismatch makes the patch silently no-op, the `disableSKAdNetworkSupport` flag is ignored, and TikTok's SKAN turns back on.
- **Keep `disableSKAdNetworkSupport: true`** in `initializeSdk` options. Removing it (or a failed patch) lets the TikTok SDK write SKAN conversion values too, and two pipelines racing on `updatePostbackConversionValue` silently lose conversion data.
- **`Purchase` is a content event** (`trackContentEvent`/`TikTokContentEventName.PURCHASE`), not `trackEvent(TikTokEventName.PURCHASE)`. Passing properties as the 2nd arg of `trackEvent` mis-slots them into `eventId`.
- **One dedupe id per purchase.** The chokepoint dedupes SKAN purchase by the `product` id; if you also wire the optional safety net (§6.3b), keep its id consistent or you risk a double SKAN purchase postback.
- **The `~/` alias must be configured** (tsconfig `baseUrl` + `paths`) or the app won't bundle (§5.0). Do not add `babel-plugin-module-resolver` — `babel-preset-expo` already honours tsconfig paths.
- **Swap the §4 example IDs.** `EXPO_PUBLIC_APP_ID` / `EXPO_PUBLIC_TIKTOK_APP_ID` in §4 are the reference app's values; using them ships conversions to the wrong app.
- **The "install" event MUST fire** — it calls `updatePostbackConversionValue` for the first time, registering the install with SKAN. Skip it and downstream signup/purchase postbacks won't attribute.
- **ATT must be requested** (once — guard the init effect). Without `granted`, TikTok server-event matching and SKAN accuracy drop (SKAN postbacks still fire, they just match less well).
- **`SKAdNetworkItems` is build-time only.** Adding TikTok's identifiers after shipping requires a new build & resubmit.
- **Android is not implemented.** All wrappers early-return on non-iOS. SKAN is iOS-only by design.
- **MMKV dedupe is per-device-install only.** On reinstall, install/signup/purchase fire again (correct for SKAN — Apple treats reinstalls as new installs).
- **The credential labelled "access token"** by TikTok behaves as an App Secret — keep it out of source control even though it is read via an `EXPO_PUBLIC_*` var (which bakes it into the bundle at build time).
