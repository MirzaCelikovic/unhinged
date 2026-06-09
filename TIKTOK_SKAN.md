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
- **Critical**: the TikTok SDK has its own SKAN handling, but in this app it is **explicitly disabled** so the dedicated `react-native-skadnetwork` module is the single source of truth for SKAN conversion-value updates (avoids two SDKs racing to call `updatePostbackConversionValue`, which would clobber each other). This is done by passing `{ disableSKAdNetworkSupport: true }` in the `initializeSdk(...)` options, which makes the native module call `config?.disableSKAdNetworkSupport()` before init. See §5 (init call) and §7.1 (native bridge).

### Event triggers (where each fires from)

| Event | TikTok event name | SKAN fine value | Fires from |
|---|---|---|---|
| App install (first launch) | _(none)_ | `1` (bit 0) | Root layout `useEffect`, deduped via MMKV |
| Signup | `Registration` | `2` (bit 1) | After successful signup API response |
| Trial started | `StartTrial` | _(not sent to SKAN)_ | After RevenueCat purchase polling resolves to `TRIAL` state |
| Purchase / subscription active | `Purchase` | `4` (bit 2) | After RevenueCat purchase polling resolves to `ACTIVE` state + at app start if active sub found |

---

## 2. Dependencies

### npm (`package.json`)

```json
{
  "dependencies": {
    "react-native-tiktok-business-sdk": "^1.5.0",
    "react-native-skadnetwork": "^0.1.1",
    "expo-tracking-transparency": "<latest compatible>",
    "react-native-mmkv": "<latest compatible>"
  }
}
```

- `expo-tracking-transparency` is required for the **ATT prompt** (App Tracking Transparency). Without `granted`, both TikTok and SKAN attribution are severely limited.
- `react-native-mmkv` is used to dedupe (so install / signup / a given subscription-id is never reported twice).

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
- TikTokBusiness (1.5.0)            # the RN wrapper pod
- TikTokBusinessSDK (1.5.0)         # Apple/CocoaPods TikTok SDK
- react-native-skadnetwork (0.1.1)
```

iOS deployment target: **15.1** (the SKAN module needs ≥ 14.0 for `SKAdNetwork`, ≥ 15.4 for `updatePostbackConversionValue:`, ≥ 16.1 for coarse + lockWindow variant — see fallback chain in §5.2).

---

## 3. Info.plist

Add the following keys to `ios/<App>/Info.plist`:

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

> If the other app also integrates Meta (Facebook), keep the existing Meta IDs in the same `SKAdNetworkItems` array — they're additive.

---

## 4. Environment variables

Three env vars are read at SDK init time (using Expo's `EXPO_PUBLIC_*` convention so they're inlined into the JS bundle):

```env
# iOS App Store numeric listing ID (used as `appId` in TikTok config)
EXPO_PUBLIC_APP_ID=6737972647

# TikTok App ID from TikTok Events Manager → Web/App Connector
EXPO_PUBLIC_TIKTOK_APP_ID=7566251265915895815

# Long-lived access token issued by TikTok Events Manager (server events API)
EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN=<token>
```

Names can be renamed if desired, but all three are mandatory inputs to `TikTokBusiness.initializeSdk(...)`.

---

## 5. JS / TS wrapper modules

Place these two hooks under `lib/` (or wherever the target app keeps its hooks). They are the **only public API** the rest of the app should call.

### 5.1 `lib/useTikTokEvents.ts`

```ts
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { TikTokBusiness, TikTokEventName } from 'react-native-tiktok-business-sdk';

export const useTikTokEvents = () => {
  const logSignup = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'ios') return;
    try {
      await TikTokBusiness.trackEvent(TikTokEventName.REGISTRATION);
    } catch (error) {
      console.error('TikTok Events: Error logging Registration event:', error);
    }
  }, []);

  const logTrialStarted = useCallback(async (properties?: Record<string, any>): Promise<void> => {
    if (Platform.OS !== 'ios') return;
    try {
      await TikTokBusiness.trackEvent(TikTokEventName.START_TRIAL, properties);
    } catch (error) {
      console.error('TikTok Events: Error logging StartTrial event:', error);
    }
  }, []);

  const logPurchase = useCallback(async (properties?: Record<string, any>): Promise<void> => {
    if (Platform.OS !== 'ios') return;
    try {
      await TikTokBusiness.trackEvent(TikTokEventName.PURCHASE, properties);
    } catch (error) {
      console.error('TikTok Events: Error logging Purchase event:', error);
    }
  }, []);

  return { logSignup, logTrialStarted, logPurchase };
};
```

Notes:
- The library's `trackEvent(eventName, eventId?, properties?)` signature is `(string, string|null, NSDictionary|null)`. Passing only the event name is valid.
- Available `TikTokEventName` enum values (full list from `react-native-tiktok-business-sdk`): `ACHIEVE_LEVEL`, `ADD_PAYMENT_INFO`, `COMPLETE_TUTORIAL`, `CREATE_GROUP`, `CREATE_ROLE`, `GENERATE_LEAD`, `IMPRESSION_LEVEL_AD_REVENUE`, `IN_APP_AD_CLICK`, `IN_APP_AD_IMPR`, `INSTALL_APP`, `JOIN_GROUP`, `LAUNCH_APP`, `LOAN_APPLICATION`, `LOAN_APPROVAL`, `LOAN_DISBURSAL`, `LOGIN`, `RATE`, `REGISTRATION`, `SEARCH`, `SPEND_CREDITS`, `START_TRIAL`, `SUBSCRIBE`, `UNLOCK_ACHIEVEMENT`.
- Use **`REGISTRATION` for signup and `PURCHASE` for purchase** to match TikTok's standard event taxonomy (these are the names TikTok Events Manager expects).

### 5.2 `lib/useSKAdNetwork.ts`

```ts
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { logEventSKAdNetwork } from 'react-native-skadnetwork';

import {
  addSkanTrackedSubscription,
  hasSkanTrackedInstall,
  hasSkanTrackedSubscription,
  setSkanInstallTracked,
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

export const useSKAdNetwork = () => {
  const logEvent = async (
    event: SKAdNetworkEvent,
    coarseValue: number = 0,   // 0 = Low, 1 = Medium, 2 = High (iOS 16.1+)
    lockWindow: boolean = false // iOS 16.1+ — true ends the conversion window immediately
  ): Promise<void> => {
    if (Platform.OS !== 'ios') {
      console.log('SKAdNetwork: Skipping event logging on non-iOS platform');
      return;
    }
    try {
      await logEventSKAdNetwork(event, coarseValue, lockWindow);
      console.log(`SKAdNetwork: Successfully logged event ${event}`);
    } catch (error) {
      console.error('SKAdNetwork: Error logging event:', error);
    }
  };

  const logInstall = () => logEvent(SKAdNetworkEvents.INSTALL);
  const logSignup = () => logEvent(SKAdNetworkEvents.SIGNUP);
  const logPurchase = () => logEvent(SKAdNetworkEvents.PURCHASE);

  const hasTrackedSubscription = useCallback((subscriptionId: string): boolean => {
    return hasSkanTrackedSubscription(subscriptionId);
  }, []);

  const addTrackedSubscription = useCallback((subscriptionId: string) => {
    addSkanTrackedSubscription(subscriptionId);
  }, []);

  // Only emit the purchase postback once per subscription-id.
  const trackPurchaseIfNeeded = useCallback(
    (subscriptionId: string): boolean => {
      if (!hasTrackedSubscription(subscriptionId)) {
        logPurchase();
        addTrackedSubscription(subscriptionId);
        return true;
      }
      return false;
    },
    [hasTrackedSubscription, addTrackedSubscription]
  );

  // Only emit the install postback once per device install.
  const trackInstallIfNeeded = useCallback((): boolean => {
    if (!hasSkanTrackedInstall()) {
      logInstall();
      setSkanInstallTracked();
      return true;
    }
    return false;
  }, []);

  return {
    logEvent,
    logInstall,
    logSignup,
    logPurchase,
    hasTrackedSubscription,
    addTrackedSubscription,
    trackPurchaseIfNeeded,
    trackInstallIfNeeded,
    events: SKAdNetworkEvents,
  };
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

So `INSTALL` → fineValue `1`, `SIGNUP` → `2`, `PURCHASE` → `4`. On the TikTok dashboard side, these conversion values must be mapped to the corresponding business events (TikTok lets you upload a conversion-value schema).

#### Native fallback chain (FYI — this is in the SDK, not your code)

The native module `SKAdNetworkModule.m` calls the most modern available API:

| iOS version | API used |
|---|---|
| 16.1+ | `updatePostbackConversionValue:coarseValue:lockWindow:completionHandler:` |
| 15.4+ | `updatePostbackConversionValue:completionHandler:` (fine value only) |
| 14.0+ | `updateConversionValue:` (legacy SKAN 2/3) — also calls `registerAppForAdNetworkAttribution` when value is `0` |
| 11.3+ | `registerAppForAdNetworkAttribution` only |

### 5.3 `lib/storage.ts` (MMKV dedupe helpers)

The hooks above depend on these four storage helpers. Add this to whichever storage module the target app uses (or create one).

```ts
import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV();

const KEYS = {
  SKAN_TRACKED_SUBSCRIPTIONS: 'skan_tracked_subscriptions',
  SKAN_INSTALL_TRACKED: 'skan_install_tracked',
  TRACKED_SUBSCRIPTION_CONVERSIONS: 'tracked_subscription_conversions',
} as const;

// --- SKAN-specific dedupe ---
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
export const hasSkanTrackedSubscription = (subscriptionId: string): boolean => {
  return getSkanTrackedSubscriptions().includes(subscriptionId);
};
export const hasSkanTrackedInstall = (): boolean => {
  return storage.getBoolean(KEYS.SKAN_INSTALL_TRACKED) ?? false;
};
export const setSkanInstallTracked = () => {
  storage.set(KEYS.SKAN_INSTALL_TRACKED, true);
};

// --- Centralized cross-platform purchase dedupe (used by the safety-net check) ---
const getTrackedConversions = (): string[] => {
  const data = storage.getString(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS);
  return data ? JSON.parse(data) : [];
};
export const hasTrackedConversion = (subscriptionId: string): boolean => {
  return getTrackedConversions().includes(subscriptionId);
};
export const addTrackedConversion = (subscriptionId: string) => {
  const tracked = getTrackedConversions();
  if (!tracked.includes(subscriptionId)) {
    tracked.push(subscriptionId);
    storage.set(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS, JSON.stringify(tracked));
  }
};
```

Why separate `SKAN_TRACKED_SUBSCRIPTIONS` and `TRACKED_SUBSCRIPTION_CONVERSIONS`?
- `SKAN_TRACKED_SUBSCRIPTIONS` is checked **inside the SKAN hook only** — used at moment-of-purchase.
- `TRACKED_SUBSCRIPTION_CONVERSIONS` is checked at app start in the "safety net" effect (§6.3) to deal with users who *bought elsewhere* (e.g. App Store restore from a different device). It fires both TikTok and SKAN purchase events together.

---

## 6. Where to call each hook

### 6.1 SDK initialization (root layout, `app/_layout.tsx`)

These four effects must run at app root. Order matters: ATT prompt before SDK calls that depend on the IDFA being available.

```tsx
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { TikTokBusiness } from 'react-native-tiktok-business-sdk';
import { useSKAdNetwork } from '~/lib/useSKAdNetwork';

function RootLayout() {
  const { trackInstallIfNeeded } = useSKAdNetwork();

  // (1) Initialize TikTok SDK. Safe to call before ATT — the SDK queues internally.
  useEffect(() => {
    const setupTikTokSDK = async () => {
      if (Platform.OS !== 'ios') return;
      try {
        await TikTokBusiness.initializeSdk(
          process.env.EXPO_PUBLIC_APP_ID!,
          process.env.EXPO_PUBLIC_TIKTOK_APP_ID!,
          process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN!,
          false, // debug
          // Hand SKAN to react-native-skadnetwork; stop the TikTok SDK from
          // also writing conversion values. Requires the patch (see §7.1).
          { disableSKAdNetworkSupport: true }
        );
      } catch (error) {
        console.error('Failed to setup TikTok SDK:', error);
      }
    };
    setupTikTokSDK();
  }, []);

  // (2) Request ATT permission. 1-sec delay so the system has time to settle the
  //     splash/UI before the modal appears (otherwise prompt is sometimes dropped).
  useEffect(() => {
    const setupAppTrackingTransparency = async () => {
      if (Platform.OS !== 'ios') return;
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const { status } = await requestTrackingPermissionsAsync();
        console.log('ATT permission status:', status);
        // (other SDKs that need to know ATT outcome go here — e.g. FB SDK)
      } catch (error) {
        console.error('Failed to request ATT permission:', error);
      }
    };
    setupAppTrackingTransparency();
  }, []);

  // (3) Fire SKAN install event ONCE per device. Dedupe is in MMKV.
  //     This is what kicks off the SKAN attribution window.
  useEffect(() => {
    trackInstallIfNeeded();
  }, [trackInstallIfNeeded]);

  // ... rest of layout
}
```

### 6.2 Signup screen (e.g. `app/signup/confirm.tsx`)

Call **both** trackers immediately after the signup API succeeds and you receive an auth token. Do not block on them.

```tsx
import { useSKAdNetwork } from '~/lib/useSKAdNetwork';
import { useTikTokEvents } from '~/lib/useTikTokEvents';

const { logSignup: logSKANSignup } = useSKAdNetwork();
const { logSignup: logTikTokSignup } = useTikTokEvents();

const handleConfirm = async () => {
  const response = await api.post('/auth/signup', { /* ... */ });

  if (response.data?.auth_token) {
    login(response.data.auth_token);
    logSKANSignup();    // SKAN postback conversion value = 2
    logTikTokSignup();  // TikTok 'Registration' event
    router.replace('/paywall');
  }
};
```

### 6.3 Purchase flow

Purchases come from RevenueCat. The PM-requested **single** trigger should fire as soon as the subscription becomes `ACTIVE`. In this app there are **two** places that detect it:

#### (a) Right after the paywall is dismissed (primary path — `lib/usePaywall.ts`)

After `RevenueCatUI.presentPaywall()` returns `PAYWALL_RESULT.PURCHASED`, the hook polls the backend every 2 s for up to 16 s until the user's access is reflected server-side, then fetches the active subscription and reports.

```tsx
import { useSKAdNetwork } from '~/lib/useSKAdNetwork';
import { useTikTokEvents } from '~/lib/useTikTokEvents';

const { trackPurchaseIfNeeded } = useSKAdNetwork();
const { logTrialStarted, logPurchase: logTikTokPurchase } = useTikTokEvents();

// inside the effect that runs when polling resolves with `access === true`:
fetchSubscriptions(api).then((subscriptions) => {
  const subscription = subscriptions.find(
    (s) => s.state === SubscriptionState.ACTIVE || s.state === SubscriptionState.TRIAL
  );
  if (!subscription) return;

  if (subscription.state === SubscriptionState.TRIAL) {
    logTrialStarted(); // TikTok 'StartTrial'
  }

  if (subscription.state === SubscriptionState.ACTIVE && subscription.id) {
    trackPurchaseIfNeeded(subscription.id.toString()); // SKAN postback (fineValue 4) — deduped per sub id
    logTikTokPurchase();                                // TikTok 'Purchase'
  }
});
```

#### (b) Safety net on app start (`app/(tabs)/_layout.tsx`)

For users who completed a purchase off-device (e.g. restore on a fresh install, or the paywall flow was interrupted), this catches them when they next open the app. Uses the **separate** `tracked_subscription_conversions` key so it doesn't double-fire with (a).

```tsx
import { useSKAdNetwork } from '~/lib/useSKAdNetwork';
import { useTikTokEvents } from '~/lib/useTikTokEvents';
import { addTrackedConversion, hasTrackedConversion } from '~/lib/storage';

const { logPurchase: logPurchaseSKAN } = useSKAdNetwork();
const { logPurchase: logPurchaseTikTok } = useTikTokEvents();

useEffect(() => {
  if (!subscriptions?.length) return;
  const active = subscriptions.find((s) => s.state === SubscriptionState.ACTIVE);
  if (!active?.id) return;

  const subId = active.id.toString();
  if (!hasTrackedConversion(subId)) {
    logPurchaseSKAN();
    logPurchaseTikTok();
    addTrackedConversion(subId);
    console.log('Tracked purchase conversion for subscription:', active.id);
  }
}, [subscriptions, logPurchaseSKAN, logPurchaseTikTok]);
```

> The dedupe keys are independent so flow (a) and (b) won't suppress each other if they happen in opposite orders, but the per-subscription-id check ensures the event still fires only once across the device's lifetime per real purchase.

---

## 7. Native bridge specifics (for debugging only — no app changes needed)

These files live inside the npm packages; you don't touch them, but understanding them helps debug.

### 7.1 TikTok `TikTokBusinessModule.swift`

Important behaviors:
- `initializeSdk(...)` constructs `TikTokConfig(accessToken:appId:tiktokAppId:)`.
- **Reads the `options` dict and, when `disableSKAdNetworkSupport == true`, calls `config?.disableSKAdNetworkSupport()` before init**, because the dedicated `react-native-skadnetwork` module owns the conversion-value pipeline. This app passes that flag (see §5/§6.1). Do not remove the flag; if you do, two libraries will fight for `updatePostbackConversionValue` and clobber each other.
- **This SKAN-disable option does not exist in the upstream `react-native-tiktok-business-sdk@1.6.2`** — it is added by the patch in `patches/react-native-tiktok-business-sdk+1.6.2.patch`, applied automatically via the `postinstall: patch-package` script. The patch touches `ios/TikTokBusinessModule.swift` (the `disableSKAdNetworkSupport()` call) plus `src/index.tsx` and both compiled `lib/typescript/.../index.d.ts` (the `disableSKAdNetworkSupport?: boolean` type). If the package is upgraded, regenerate the patch.
- `trackEvent(eventName, eventId, parameters)` builds a `TikTokBaseEvent(eventName:eventId:)`, copies any properties in, and dispatches via `TikTokBusiness.trackTTEvent(event)`.
- Module name (used from JS): `TikTokBusinessModule`.

### 7.2 SKAN `SKAdNetworkModule.m`

- Single exported method: `setConversionValue(fineValue:coarseValue:lockWindow:resolver:rejecter:)`.
- Validates: `0 ≤ fineValue ≤ 63`, `0 ≤ coarseValue ≤ 2`.
- Branches on iOS version (see §5.2 table).
- Module name: `SKAdNetworkModule`.

---

## 8. Required setup checklist (for the target app)

Tick these off when porting:

- [ ] `npm install react-native-tiktok-business-sdk react-native-skadnetwork expo-tracking-transparency react-native-mmkv`
- [ ] Add `pod 'TikTokBusinessSDK', :modular_headers => true` in `ios/Podfile` inside the main target
- [ ] `cd ios && pod install`
- [ ] iOS deployment target ≥ 15.1 (TikTok SDK requirement; SKAN works ≥ 14 but the fallback chain handles older versions)
- [ ] Apply the SKAN-disable patch: `npm i -D patch-package`, add `"postinstall": "patch-package"`, copy `patches/react-native-tiktok-business-sdk+<version>.patch`, then `npm install` (adds the `disableSKAdNetworkSupport` option — see §7.1)
- [ ] Pass `{ disableSKAdNetworkSupport: true }` to `TikTokBusiness.initializeSdk(...)` at init (§6.1)
- [ ] `Info.plist`: add `NSUserTrackingUsageDescription` copy
- [ ] `Info.plist`: add `SKAdNetworkItems` with both TikTok identifiers (`v9wttpbfk9.skadnetwork`, `n38lu8286q.skadnetwork`)
- [ ] `.env`: add `EXPO_PUBLIC_APP_ID`, `EXPO_PUBLIC_TIKTOK_APP_ID`, `EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN` (values from TikTok Events Manager; reuse the same values across apps unless TikTok issues new ones)
- [ ] Copy `lib/useTikTokEvents.ts` and `lib/useSKAdNetwork.ts` verbatim
- [ ] Add the MMKV helper functions in §5.3 to `lib/storage.ts`
- [ ] In root layout: TikTok SDK init effect + ATT request effect + `trackInstallIfNeeded` effect
- [ ] In signup screen: call `logSKANSignup()` and `logTikTokSignup()` after successful signup API call
- [ ] In purchase completion handler: call `trackPurchaseIfNeeded(subscriptionId)` and `logTikTokPurchase()`
- [ ] Add the app-start "safety net" effect that fires both purchase events if there is an `ACTIVE` subscription and `hasTrackedConversion(subId)` is false
- [ ] In TikTok Events Manager → SKAN setup, configure a conversion-value schema mapping fine value `1`→install, `2`→signup, `4`→purchase (matches the bit-encoding the JS library produces)

---

## 9. SKAN conversion-value schema (TikTok dashboard config)

Mirror this in TikTok's SKAN configuration UI so the postbacks decode correctly:

| Fine value | Bit set | Lifecycle event |
|---|---|---|
| 1 | bit 0 | App install |
| 2 | bit 1 | Signup (Registration) |
| 4 | bit 2 | First purchase / subscription active |

> If TikTok requires a *cumulative* schema where later events also include earlier bits (e.g. purchase = bits 0+1+2 → fine value `7`), modify `logEventSKAdNetwork` to OR the new bit into the previously stored value. The current implementation sets only the latest event's bit. The current behavior matches an *exclusive* schema (one-event-per-postback), which is what TikTok's "single event per attribution window" SKAN config expects.

---

## 10. Testing & verification

1. **Build a non-dev release** (SKAN won't fire in `__DEV__` builds because Apple disables it on debug installs).
2. Launch on a fresh device or simulator → check console for:
   - `[TikTokBusiness] TikTokBusiness initialized OK` (native) and `TikTok SDK initialized` (JS)
   - `SKAdNetwork: Successfully logged event 0`
3. Complete signup → expect `Registration` in TikTok Events Manager and `SKAdNetwork: Successfully logged event 1`.
4. Complete a purchase → expect `Purchase` in Events Manager and `SKAdNetwork: Successfully logged event 2`.
5. TikTok-side attribution shows up in the dashboard hours-to-days later (Apple delays SKAN postbacks by up to 35 days; the test postback for a fresh install typically arrives within 24 h).

---

## 11. Gotchas

- **Android is not implemented.** All three hooks early-return on non-iOS. SKAN is iOS-only by design; if Android tracking is required, add TikTok-Android initialization separately (the same npm package supports it).
- **Keep `disableSKAdNetworkSupport: true` in the TikTok `initializeSdk` options** (§6.1). Removing it lets the TikTok SDK write SKAN conversion values too, and two pipelines racing on `updatePostbackConversionValue` will silently lose conversion data. The flag relies on the patch in `patches/` — if the patch fails to apply (e.g. after a package bump), the option is silently ignored and TikTok SKAN turns back on.
- **ATT must be requested**. Without `granted`, both TikTok server-event matching and SKAN attribution accuracy drop dramatically (though SKAN postbacks still fire — they just match less well).
- **`SKAdNetworkItems` is build-time only.** Adding TikTok's identifiers after the app is already shipped requires a new build & resubmit.
- **The "install" event in §6.1 step (3) MUST fire** — it's what calls `updatePostbackConversionValue` for the first time, which under the hood is what registers the install with SKAN. Skipping it means TikTok never sees the install postback and downstream signup/purchase postbacks won't attribute either.
- **MMKV dedupe is per-device-install only.** If a user reinstalls, install/signup/purchase events fire again (which is correct for SKAN — Apple treats reinstalls as new installs).