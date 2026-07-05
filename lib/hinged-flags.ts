/**
 * Hinged feature-flag SDK wiring (server-only).
 *
 * Initializes the OpenFeature provider exactly once and exposes a helper for
 * obtaining a client scoped to an end-user. Evaluation is fail-open: if no SDK
 * key is configured (or provider init fails) we leave OpenFeature's default
 * no-op provider in place, so every evaluation returns the caller-supplied
 * default value instead of throwing into the request path.
 *
 * Secrets (the SDK key) are read from the environment only — never hardcoded.
 */
import { OpenFeature, type Client } from '@openfeature/server-sdk';
import { HingedFlagProvider, HttpEdgeClient, HttpExposureSink } from '@hinged/flag-sdk';

/** Default Hinged edge endpoint, used when FLAGS_EDGE_URL is not set. */
const DEFAULT_EDGE_URL = 'https://hinged.to/flags';

/** Memoized init so the provider is only set up once, no matter how often we call. */
let initPromise: Promise<void> | null = null;

/** Whether a Hinged SDK key is configured in the environment. */
export function isFlagsConfigured(): boolean {
  return Boolean(process.env.HINGED_SDK_KEY);
}

/**
 * Initialize the OpenFeature provider exactly once at server startup.
 *
 * Safe to call repeatedly — subsequent calls return the same promise. Never
 * throws: a missing or invalid key falls back to control (defaults) so flag
 * setup can never break startup or a request path.
 */
export function initHingedFlags(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sdkKey = process.env.HINGED_SDK_KEY;
    const edgeUrl = process.env.FLAGS_EDGE_URL || DEFAULT_EDGE_URL;

    // Fail open: with no key configured we keep OpenFeature's default no-op
    // provider, so evaluations return the caller-supplied default.
    if (!sdkKey) return;

    try {
      await OpenFeature.setProviderAndWait(
        new HingedFlagProvider({
          edge: new HttpEdgeClient(edgeUrl, sdkKey),
          exposure: { sink: new HttpExposureSink(edgeUrl, sdkKey) },
        })
      );
    } catch (err) {
      // Fail open: never let flag setup break startup or a request.
      console.warn('[hinged-flags] provider init failed; falling back to defaults', err);
    }
  })();

  return initPromise;
}

/**
 * Get an OpenFeature client for evaluating flags.
 *
 * Callers MUST pass the same end-user id used to key analytics events as the
 * `targetingKey`, so Hinged can join flag exposures to downstream outcomes.
 */
export function getFlagsClient(targetingKey: string): Client {
  if (!targetingKey) {
    throw new Error(
      'getFlagsClient requires a targetingKey (the end-user id used for analytics events).'
    );
  }
  return OpenFeature.getClient({ targetingKey });
}
