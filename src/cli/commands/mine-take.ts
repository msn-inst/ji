import chalk from 'chalk';
import { Effect, pipe, Schema } from 'effect';
import { ConfigManager } from '../../lib/config.js';
import { JiraClient } from '../../lib/jira-client.js';

// Schema for validating issue key format
const IssueKeySchema = Schema.String.pipe(
  Schema.pattern(/^[A-Z]+-\d+$/),
  Schema.annotations({
    message: () => 'Invalid issue key format. Expected format: PROJECT-123',
  }),
);

// Get configuration Effect
const getConfigEffect = () =>
  Effect.tryPromise({
    try: async () => {
      const configManager = new ConfigManager();
      try {
        const config = await configManager.getConfig();
        if (!config) {
          throw new Error('No configuration found. Please run "ji setup" first.');
        }
        return { config, configManager };
      } catch (error) {
        configManager.close();
        throw error;
      }
    },
    catch: (error) => new Error(`Failed to get configuration: ${error}`),
  });

// Effect for taking an issue
const takeIssueEffect = (issueKey: string) =>
  pipe(
    // Validate issue key with Effect Schema
    Schema.decodeUnknown(IssueKeySchema)(issueKey),
    Effect.mapError((error) => new Error(`Invalid issue key: ${error}`)),
    Effect.flatMap((_validIssueKey) =>
      pipe(
        getConfigEffect(),
        Effect.flatMap(({ config, configManager }) => {
          const client = new JiraClient(config);

          return pipe(
            // Get current user
            Effect.tryPromise({
              try: async () => client.getCurrentUser(),
              catch: (error) => new Error(`Failed to get current user: ${error}`),
            }),
            Effect.tap((currentUser) =>
              Effect.sync(() => {
                console.log(chalk.dim(`Assigning ${issueKey} to ${currentUser.displayName}...`));
              }),
            ),
            Effect.flatMap((currentUser) =>
              Effect.tryPromise({
                try: async () => client.assignIssue(issueKey, currentUser.accountId),
                catch: (error) => new Error(`Failed to assign issue: ${error}`),
              }).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    console.log(chalk.green(`✓ Assigned ${issueKey} to you`));
                  }),
                ),
              ),
            ),
            Effect.tap(() => Effect.sync(() => configManager.close())),
            Effect.catchAll((error) =>
              pipe(
                Effect.sync(() => {
                  const message = error instanceof Error ? error.message : String(error);
                  console.error(chalk.red('Error:'), message);
                  configManager.close();
                }),
                Effect.flatMap(() => Effect.fail(error)),
              ),
            ),
          );
        }),
      ),
    ),
  );

export async function takeIssue(issueKey: string) {
  try {
    await Effect.runPromise(takeIssueEffect(issueKey));
  } catch (_error) {
    process.exit(1);
  }
}
