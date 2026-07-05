/**
 * Local type stub for the private `@hinged/flag-sdk` package.
 *
 * The real package is published to Hinged's registry and is installed via the
 * `@hinged/flag-sdk` dependency in package.json for actual app builds. This
 * stub only backs `npm run build` (see tsconfig.build.json), so the flag wiring
 * type-checks in environments that don't have the private registry configured.
 * It mirrors only the surface `lib/hinged-flags.ts` depends on.
 */
import type { Provider } from '@openfeature/server-sdk';

/** HTTP client for the Hinged flag edge. */
export declare class HttpEdgeClient {
  constructor(edgeUrl: string, sdkKey: string);
}

/** Sink that records flag exposure events back to the Hinged edge. */
export declare class HttpExposureSink {
  constructor(edgeUrl: string, sdkKey: string);
}

export interface HingedFlagProviderConfig {
  edge: HttpEdgeClient;
  exposure: { sink: HttpExposureSink };
}

/** OpenFeature provider backed by Hinged's flag edge. */
export declare class HingedFlagProvider implements Provider {
  constructor(config: HingedFlagProviderConfig);
  readonly metadata: Provider['metadata'];
  readonly runsOn: Provider['runsOn'];
  readonly hooks: Provider['hooks'];
  resolveBooleanEvaluation: Provider['resolveBooleanEvaluation'];
  resolveStringEvaluation: Provider['resolveStringEvaluation'];
  resolveNumberEvaluation: Provider['resolveNumberEvaluation'];
  resolveObjectEvaluation: Provider['resolveObjectEvaluation'];
}
