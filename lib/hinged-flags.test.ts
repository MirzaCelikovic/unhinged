/**
 * Tests for the Hinged feature-flag wiring.
 *
 * The private `@hinged/flag-sdk` package is mocked (virtual) so these tests run
 * without the private registry. They assert two things the wiring must get
 * right: the provider is constructed with an `HttpExposureSink`, and flag
 * evaluation falls open to the caller-supplied default when no SDK key is set.
 */

// Virtual mock of the private SDK. The mock classes record their constructor
// args so we can assert how the provider was wired.
jest.mock(
  '@hinged/flag-sdk',
  () => {
    class HttpEdgeClient {
      constructor(
        public edgeUrl: string,
        public sdkKey: string
      ) {}
    }
    class HttpExposureSink {
      constructor(
        public edgeUrl: string,
        public sdkKey: string
      ) {}
    }
    class HingedFlagProvider {
      readonly metadata = { name: 'hinged-mock' };
      constructor(public config: { edge: HttpEdgeClient; exposure: { sink: HttpExposureSink } }) {}
    }
    return { HttpEdgeClient, HttpExposureSink, HingedFlagProvider };
  },
  { virtual: true }
);

describe('hinged-flags wiring', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.HINGED_SDK_KEY;
    delete process.env.FLAGS_EDGE_URL;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('wires HingedFlagProvider with an HttpExposureSink using env-provided secrets', async () => {
    process.env.HINGED_SDK_KEY = 'test-sdk-key';
    process.env.FLAGS_EDGE_URL = 'https://example.test/flags';

    const { OpenFeature } = require('@openfeature/server-sdk');
    const setProvider = jest.spyOn(OpenFeature, 'setProviderAndWait').mockResolvedValue(undefined);
    const { HingedFlagProvider, HttpExposureSink, HttpEdgeClient } = require('@hinged/flag-sdk');
    const { initHingedFlags } = require('./hinged-flags');

    await initHingedFlags();

    expect(setProvider).toHaveBeenCalledTimes(1);
    const provider = setProvider.mock.calls[0][0];
    expect(provider).toBeInstanceOf(HingedFlagProvider);
    expect(provider.config.edge).toBeInstanceOf(HttpEdgeClient);
    expect(provider.config.exposure.sink).toBeInstanceOf(HttpExposureSink);

    // The SDK key and edge URL come from the environment, never hardcoded.
    expect(provider.config.exposure.sink.sdkKey).toBe('test-sdk-key');
    expect(provider.config.exposure.sink.edgeUrl).toBe('https://example.test/flags');
  });

  it('only initializes the provider once across repeated calls', async () => {
    process.env.HINGED_SDK_KEY = 'test-sdk-key';

    const { OpenFeature } = require('@openfeature/server-sdk');
    const setProvider = jest.spyOn(OpenFeature, 'setProviderAndWait').mockResolvedValue(undefined);
    const { initHingedFlags } = require('./hinged-flags');

    await Promise.all([initHingedFlags(), initHingedFlags(), initHingedFlags()]);

    expect(setProvider).toHaveBeenCalledTimes(1);
  });

  it('falls open to the default value when no SDK key is configured', async () => {
    const { OpenFeature } = require('@openfeature/server-sdk');
    const setProvider = jest.spyOn(OpenFeature, 'setProviderAndWait');
    const { initHingedFlags, getFlagsClient, isFlagsConfigured } = require('./hinged-flags');

    expect(isFlagsConfigured()).toBe(false);

    await initHingedFlags();

    // No key -> no provider registered, so OpenFeature's default no-op provider
    // stays in place and evaluation returns the caller-supplied default.
    expect(setProvider).not.toHaveBeenCalled();

    const client = getFlagsClient('user-123');
    await expect(client.getBooleanValue('some-experiment', true)).resolves.toBe(true);
    await expect(client.getBooleanValue('some-experiment', false)).resolves.toBe(false);
  });

  it('requires a targetingKey so exposures can be joined to analytics', () => {
    const { getFlagsClient } = require('./hinged-flags');
    expect(() => getFlagsClient('')).toThrow(/targetingKey/);
  });
});
