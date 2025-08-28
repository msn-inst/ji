import chalk from 'chalk';
import { Effect, Console, pipe } from 'effect';
import { ConfigManager } from '../../lib/config.js';
import { JiraClient } from '../../lib/jira-client.js';

// Error types
class ConnectionError extends Error {
  readonly _tag = 'ConnectionError';
}

class ConfigurationError extends Error {
  readonly _tag = 'ConfigurationError';
}

// Effect-based implementation following project patterns
const checkConnectionEffect = Effect.gen(function* () {
  yield* Console.log(chalk.gray('Checking Jira connection...'));

  const configManager = new ConfigManager();
  const config = yield* Effect.promise(() => configManager.getConfig());

  if (!config) {
    return yield* Effect.fail(
      new ConfigurationError('No configuration found. Please run "ji setup" first.')
    );
  }

  const jiraClient = new JiraClient(config);

  // Test connection by fetching current user
  const currentUser = yield* Effect.tryPromise({
    try: () => jiraClient.getCurrentUser(),
    catch: (error) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      if (message.includes('401') || message.includes('Unauthorized')) {
        return new ConnectionError('Authentication failed. Please check your API token.');
      } else if (message.includes('404')) {
        return new ConnectionError('Jira URL might be incorrect. Please verify the URL.');
      } else if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
        return new ConnectionError('Cannot reach Jira server. Please check your internet connection and URL.');
      }
      return new ConnectionError(`Failed to connect: ${message}`);
    }
  });

  yield* Console.log(chalk.green('✓ Successfully connected to Jira'));
  yield* Console.log();
  yield* Console.log(chalk.gray('Configuration:'));
  yield* Console.log(`  URL: ${chalk.cyan(config.jiraUrl)}`);
  yield* Console.log(`  Email: ${chalk.cyan(config.email)}`);
  yield* Console.log();
  yield* Console.log(chalk.gray('Current User:'));
  yield* Console.log(`  Name: ${chalk.cyan(currentUser.displayName)}`);
  yield* Console.log(`  Account ID: ${chalk.gray(currentUser.accountId)}`);

  if (currentUser.emailAddress && currentUser.emailAddress !== config.email) {
    yield* Console.log(`  Email: ${chalk.cyan(currentUser.emailAddress)}`);
  }

  // Try to fetch issue statistics (optional)
  yield* Effect.tryPromise({
    try: async () => {
      const jql = 'assignee = currentUser() AND status NOT IN (Closed, Done, Resolved)';
      const result = await jiraClient.searchIssues(jql, { maxResults: 0 });
      
      await Console.log().pipe(Effect.runPromise);
      await Console.log(chalk.gray('Statistics:')).pipe(Effect.runPromise);
      await Console.log(`  Open issues assigned to you: ${chalk.cyan(result.total)}`).pipe(Effect.runPromise);
      
      return result;
    },
    catch: () => {
      // Silently ignore statistics errors
      return null;
    }
  });

  // Clean up resources
  configManager.close();
  
  return { config, currentUser };
});

// Main effect with comprehensive error handling
const statusEffect = pipe(
  checkConnectionEffect,
  Effect.catchAll((error) => {
    switch (error._tag) {
      case 'ConfigurationError':
        return pipe(
          Console.error(chalk.red(`✗ ${error.message}`)),
          Effect.flatMap(() => Effect.fail(error))
        );
      
      case 'ConnectionError':
        return pipe(
          Console.error(chalk.red('✗ Failed to connect to Jira')),
          Effect.flatMap(() => Console.error()),
          Effect.flatMap(() => Console.error(chalk.yellow(error.message))),
          Effect.flatMap(() => {
            if (error.message.includes('Authentication failed')) {
              return pipe(
                Console.error(chalk.gray('You can generate a new token at:')),
                Effect.flatMap(() => Console.error(chalk.cyan('https://id.atlassian.com/manage/api-tokens')))
              );
            } else if (error.message.includes('URL might be incorrect')) {
              return Console.error(chalk.gray('Please verify your Jira URL configuration.'));
            } else if (error.message.includes('Cannot reach Jira server')) {
              return pipe(
                Console.error(chalk.gray('  - Your internet connection')),
                Effect.flatMap(() => Console.error(chalk.gray('  - The Jira URL is correct')))
              );
            }
            return Effect.succeed(undefined);
          }),
          Effect.flatMap(() => Console.error()),
          Effect.flatMap(() => Console.error(chalk.gray('Run "ji setup" to reconfigure your connection.'))),
          Effect.flatMap(() => Effect.fail(error))
        );
      
      default:
        return pipe(
          Console.error(chalk.red('Status check failed:')),
          Effect.flatMap(() => Console.error(error instanceof Error ? error.message : 'Unknown error')),
          Effect.flatMap(() => Effect.fail(error))
        );
    }
  })
);

// Async wrapper for CLI compatibility
export async function statusCommand(): Promise<void> {
  try {
    await Effect.runPromise(statusEffect);
  } catch (error) {
    // Error already displayed by Effect error handling
    process.exit(1);
  }
}