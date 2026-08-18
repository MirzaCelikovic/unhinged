import { I18nManager } from 'react-native';

// Locales that render right-to-left. Of the run's supported set only `ar` is RTL,
// but keep the full common set so adding he/fa/ur later needs no change here.
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * Set the process-level RTL flag to match the resolved locale, guarded so it only
 * toggles when the current direction is wrong (toggling is a no-op reload trigger
 * otherwise).
 *
 * `forceRTL` flips a native flag; full layout mirroring only takes hold after the
 * next app relaunch. We intentionally do NOT call an updates-based reload here:
 * `expo-updates` is not a dependency, and a static `require('expo-updates')` would
 * fail Metro bundling. Mirroring therefore applies on the next manual relaunch —
 * add a soft `expo-updates` reload here if/when that dep is added.
 */
export function applyRTL(locale: string): void {
  const shouldBeRTL = RTL_LOCALES.has(locale);
  if (I18nManager.isRTL === shouldBeRTL) return; // already correct — don't toggle
  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);
}
