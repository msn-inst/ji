import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { Effect, pipe, Console, Duration } from 'effect';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  withTempDir,
  withEnvironment,
  expectSuccess,
  expectFailure,
  expectErrorType,
  MockFetch,
  JiraIssueBuilder,
  ConfigBuilder,
  withRetry,
} from './effect-test-helpers.js';
import { ConfigManager, ConfigError, ValidationError } from '../lib/config.js';

describe('Effect Integration Tests', () => {
  describe('ConfigManager with Effect patterns', () => {
    it('should handle configuration lifecycle with Effects', async () => {
      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-effect-integration', (tempDir) =>
            pipe(
              // Set environment
              Effect.sync(() => {
                process.env.JI_CONFIG_DIR = tempDir;
              }),
              // Create config manager
              Effect.flatMap(() => Effect.sync(() => new ConfigManager())),
              // Save configuration
              Effect.flatMap((manager) =>
                pipe(
                  manager.setConfigEffect(
                    new ConfigBuilder()
                      .withJiraUrl('https://effect.atlassian.net')
                      .withEmail('effect@example.com')
                      .withApiToken('effect-token')
                      .withAnalysisCommand('claude')
                      .build(),
                  ),
                  Effect.map(() => manager),
                ),
              ),
              // Read configuration back
              Effect.flatMap((manager) => manager.getConfigEffect()),
              // Verify
              Effect.tap((config) =>
                Effect.sync(() => {
                  expect(config.jiraUrl).toBe('https://effect.atlassian.net');
                  expect(config.email).toBe('effect@example.com');
                  expect(config.analysisCommand).toBe('claude');
                }),
              ),
            ),
          ),
        ),
      );

      await expectSuccess(program);
    });

    it('should handle missing configuration with error recovery', async () => {
      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-no-config', (tempDir) =>
            pipe(
              Effect.sync(() => {
                process.env.JI_CONFIG_DIR = tempDir;
              }),
              Effect.flatMap(() => {
                const manager = new ConfigManager();
                return pipe(
                  manager.getConfigEffect(),
                  Effect.catchTag('ConfigError', () =>
                    pipe(
                      Console.log('No config found, creating default'),
                      Effect.flatMap(() =>
                        manager.setConfigEffect({
                          jiraUrl: 'https://default.atlassian.net',
                          email: 'default@example.com',
                          apiToken: 'default-token',
                        }),
                      ),
                      Effect.flatMap(() => manager.getConfigEffect()),
                    ),
                  ),
                );
              }),
              Effect.tap((config) =>
                Effect.sync(() => {
                  expect(config.jiraUrl).toBe('https://default.atlassian.net');
                }),
              ),
            ),
          ),
        ),
      );

      await expectSuccess(program);
    });

    it('should validate configuration with schemas', async () => {
      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-validation', (tempDir) =>
            pipe(
              Effect.sync(() => {
                process.env.JI_CONFIG_DIR = tempDir;
                // Write invalid config directly
                const configPath = join(tempDir, 'config.json');
                writeFileSync(
                  configPath,
                  JSON.stringify({
                    jiraUrl: 'not-a-url',
                    email: 'invalid-email',
                    apiToken: '',
                  }),
                );
              }),
              Effect.flatMap(() => {
                const manager = new ConfigManager();
                return manager.getConfigEffect();
              }),
            ),
          ),
        ),
      );

      await expectErrorType(program, 'ValidationError');
    });
  });

  describe('Settings management with Effects', () => {
    it('should manage settings lifecycle', async () => {
      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-settings', (tempDir) =>
            pipe(
              Effect.sync(() => {
                process.env.JI_CONFIG_DIR = tempDir;
              }),
              Effect.flatMap(() => {
                const manager = new ConfigManager();
                return pipe(
                  // Save settings
                  manager.setSettingsEffect({
                    askModel: 'claude-3-opus',
                    embeddingModel: 'text-embedding-3-small',
                    analysisModel: 'gpt-4-turbo',
                    meilisearchIndexPrefix: 'test_prefix',
                  }),
                  // Read settings back
                  Effect.flatMap(() => manager.getSettingsEffect()),
                  // Verify
                  Effect.tap((settings) =>
                    Effect.sync(() => {
                      expect(settings.askModel).toBe('claude-3-opus');
                      expect(settings.embeddingModel).toBe('text-embedding-3-small');
                      expect(settings.analysisModel).toBe('gpt-4-turbo');
                      expect(settings.meilisearchIndexPrefix).toBe('test_prefix');
                    }),
                  ),
                );
              }),
            ),
          ),
        ),
      );

      await expectSuccess(program);
    });

    it('should validate Meilisearch index prefix format', async () => {
      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-prefix-validation', (tempDir) =>
            pipe(
              Effect.sync(() => {
                process.env.JI_CONFIG_DIR = tempDir;
              }),
              Effect.flatMap(() => {
                const manager = new ConfigManager();
                return manager.setSettingsEffect({
                  meilisearchIndexPrefix: 'invalid prefix!', // Invalid characters
                });
              }),
            ),
          ),
        ),
      );

      await expectErrorType(program, 'ValidationError');
    });
  });

  describe('Complex Effect compositions', () => {
    it('should handle complex authentication flow', async () => {
      const mockFetch = new MockFetch();
      mockFetch.addResponse('https://test.atlassian.net/rest/api/3/myself', 200, {
        displayName: 'Test User',
        emailAddress: 'test@example.com',
      });

      interface AuthConfig {
        jiraUrl: string;
        email: string;
        apiToken: string;
      }

      const authenticateEffect = (config: AuthConfig) =>
        Effect.tryPromise({
          try: async () => {
            const response = await mockFetch.createFetch()(`${config.jiraUrl}/rest/api/3/myself`, {
              headers: {
                Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
              },
            });
            if (!response.ok) {
              throw new Error(`Auth failed: ${response.status}`);
            }
            return response.json();
          },
          catch: (error) => new Error(`Authentication error: ${error}`),
        });

      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-auth-flow', (tempDir) =>
            pipe(
              // Setup
              Effect.sync(() => {
                process.env.JI_CONFIG_DIR = tempDir;
              }),
              // Create and save config
              Effect.flatMap(() => {
                const manager = new ConfigManager();
                const config = new ConfigBuilder().build();
                return pipe(
                  manager.setConfigEffect(config),
                  Effect.map(() => ({ manager, config })),
                );
              }),
              // Authenticate
              Effect.flatMap(({ manager, config }) =>
                pipe(
                  authenticateEffect(config),
                  Effect.tap((user: any) => Console.log(`Authenticated as ${user.displayName}`)),
                  Effect.map((user: any) => ({ manager, config, user })),
                ),
              ),
              // Update settings based on user
              Effect.flatMap(({ manager, user }: { manager: ConfigManager; user: any }) =>
                manager.setSettingsEffect({
                  meilisearchIndexPrefix: user.emailAddress.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_'),
                }),
              ),
            ),
          ),
        ),
      );

      await expectSuccess(program);
    });

    it('should handle retry with exponential backoff', async () => {
      let attempts = 0;
      const flakeyOperation = Effect.try({
        try: () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return 'Success!';
        },
        catch: (error) => error as Error,
      });

      const program = withRetry(flakeyOperation, {
        times: 3,
        delay: Duration.millis(10),
        factor: 2,
      });

      const result = await expectSuccess(program);
      expect(result).toBe('Success!');
      expect(attempts).toBe(3);
    });

    it('should compose multiple operations with proper error handling', async () => {
      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-compose', (tempDir) =>
            pipe(
              // Initialize
              Effect.all([
                Effect.sync(() => {
                  process.env.JI_CONFIG_DIR = tempDir;
                }),
                Effect.sync(() => new ConfigManager()),
              ]),
              // Save config and settings in parallel
              Effect.flatMap(([_, manager]) =>
                Effect.all(
                  [
                    manager.setConfigEffect(new ConfigBuilder().build()),
                    manager.setSettingsEffect({ askModel: 'claude' }),
                  ],
                  { concurrency: 'unbounded' },
                ).pipe(Effect.map(() => manager)),
              ),
              // Read everything back
              Effect.flatMap((manager) =>
                Effect.all({
                  config: manager.getConfigEffect(),
                  settings: manager.getSettingsEffect(),
                  prefix: manager.getMeilisearchIndexPrefixEffect(),
                }),
              ),
              // Verify
              Effect.tap(({ config, settings, prefix }) =>
                Effect.sync(() => {
                  expect(config.email).toBe('test@example.com');
                  expect(settings.askModel).toBe('claude');
                  expect(prefix).toBe('test'); // Derived from email
                }),
              ),
            ),
          ),
        ),
      );

      await expectSuccess(program);
    });
  });

  describe('Error boundaries and recovery', () => {
    it('should handle cascading errors gracefully', async () => {
      const program = pipe(
        withEnvironment(['JI_CONFIG_DIR'], () =>
          withTempDir('ji-errors', (tempDir) =>
            pipe(
              Effect.sync(() => {
                process.env.JI_CONFIG_DIR = tempDir;
                // Write corrupted config
                writeFileSync(join(tempDir, 'config.json'), '{corrupted', 'utf-8');
              }),
              Effect.flatMap(() => {
                const manager = new ConfigManager();
                return pipe(
                  manager.getConfigEffect(),
                  Effect.catchAll((error) => {
                    // Log the error type
                    const errorType = error instanceof Error ? error.constructor.name : 'Unknown';
                    return pipe(
                      Console.log(`Caught error: ${errorType}`),
                      Effect.flatMap(() =>
                        // Attempt recovery
                        manager.setConfigEffect(new ConfigBuilder().build()),
                      ),
                      Effect.flatMap(() => manager.getConfigEffect()),
                    );
                  }),
                );
              }),
              Effect.tap((config) =>
                Effect.sync(() => {
                  // Should have recovered with default config
                  expect(config.jiraUrl).toBe('https://test.atlassian.net');
                }),
              ),
            ),
          ),
        ),
      );

      await expectSuccess(program);
    });
  });
});
