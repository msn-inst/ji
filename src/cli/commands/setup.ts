import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { input, password } from '@inquirer/prompts';
import { Console, Effect, pipe } from 'effect';
import { ConfigManager } from '../../lib/config.js';

// Effect wrapper for HTTP requests
const verifyCredentials = (config: { jiraUrl: string; email: string; apiToken: string }) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${config.jiraUrl}/rest/api/3/myself`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    },
    catch: (error) => {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          return new Error('Invalid credentials. Please check your email and API token.');
        }
        if (error.message.includes('ENOTFOUND')) {
          return new Error('Could not connect to Jira. Please check the URL.');
        }
        return error;
      }
      return new Error('Unknown error occurred');
    },
  });

// Effect wrapper for config operations
const saveConfig = (config: {
  jiraUrl: string;
  email: string;
  apiToken: string;
  analysisPrompt?: string;
  analysisCommand?: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const configManager = new ConfigManager();
      try {
        await configManager.setConfig(config);
        return config;
      } finally {
        configManager.close();
      }
    },
    catch: (error) => new Error(`Failed to save configuration: ${error}`),
  });

// Helper to expand tilde in file paths
const expandTilde = (path: string): string => {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
};

// Validate analysis prompt file path
const validateAnalysisPromptFile = (path: string): string | undefined => {
  if (!path) {
    return undefined;
  }

  const expandedPath = expandTilde(path);
  if (existsSync(expandedPath)) {
    return path;
  }

  return undefined;
};

// Effect wrapper for getting existing config
const getExistingConfig = () =>
  Effect.tryPromise({
    try: async () => {
      const configManager = new ConfigManager();
      try {
        const config = await configManager.getConfig();
        return config;
      } finally {
        configManager.close();
      }
    },
    catch: () => null, // Return null if no config exists
  });

// Pure Effect-based setup implementation using inquirer
const setupEffect = () =>
  pipe(
    getExistingConfig(),
    Effect.flatMap((existingConfig) =>
      pipe(
        Console.log('Jira & Confluence CLI Authentication Setup'),
        Effect.flatMap(() => {
          if (existingConfig) {
            return Console.log(chalk.dim('(Press Enter to keep existing values)'));
          }
          return Effect.succeed(undefined);
        }),
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: async () => {
              console.log('');

              // Jira URL
              const jiraUrl = await input({
                message: 'Jira URL (e.g., https://company.atlassian.net)',
                default: existingConfig?.jiraUrl,
              });

              // Email
              const email = await input({
                message: 'Email',
                default: existingConfig?.email,
              });

              // API Token
              const apiToken =
                (await password({
                  message: 'API Token',
                })) ||
                existingConfig?.apiToken ||
                '';

              console.log('');
              console.log(chalk.yellow('Optional: AI Analysis Configuration'));

              // Analysis command
              const analysisCommand = await input({
                message: 'Analysis tool command (e.g., claude, gemini, opencode)',
                default: existingConfig?.analysisCommand || '',
              });

              // Analysis prompt file
              let analysisPrompt = await input({
                message: 'Path to custom analysis prompt file (optional)',
                default: existingConfig?.analysisPrompt || '',
              });

              // Validate the prompt file if provided
              if (analysisPrompt) {
                const validated = validateAnalysisPromptFile(analysisPrompt);
                if (!validated) {
                  console.log(chalk.red(`File not found: ${analysisPrompt}`));
                  analysisPrompt = await input({
                    message: 'Enter a valid path or press Enter to skip',
                    default: '',
                  });
                  if (analysisPrompt) {
                    const secondValidation = validateAnalysisPromptFile(analysisPrompt);
                    if (!secondValidation) {
                      console.log(chalk.yellow('Skipping custom prompt file'));
                      analysisPrompt = '';
                    }
                  }
                }
              }

              return {
                jiraUrl: jiraUrl.endsWith('/') ? jiraUrl.slice(0, -1) : jiraUrl,
                email,
                apiToken,
                ...(analysisCommand && { analysisCommand }),
                ...(analysisPrompt && { analysisPrompt }),
              };
            },
            catch: (error) => {
              if (error instanceof Error && error.message.includes('User force closed')) {
                console.log(`\n${chalk.yellow('Setup cancelled')}`);
                process.exit(0);
              }
              return new Error(`Failed to get user input: ${error}`);
            },
          }),
        ),
      ),
    ),
    Effect.tap(() => Console.log('\nVerifying credentials...')),
    Effect.flatMap((config) =>
      pipe(
        verifyCredentials(config),
        Effect.map((user) => ({ config, user })),
      ),
    ),
    Effect.tap(({ user }) => {
      // Type guard for the user object
      if (typeof user === 'object' && user !== null && 'displayName' in user && 'emailAddress' in user) {
        return Console.log(chalk.green(`Successfully authenticated as ${user.displayName} (${user.emailAddress})`));
      } else {
        return Console.log(chalk.green('Successfully authenticated'));
      }
    }),
    Effect.flatMap(({ config }) => saveConfig(config)),
    Effect.tap(() => Console.log(chalk.green('\nConfiguration saved successfully!'))),
    Effect.tap(() => Console.log('You can now use:')),
    Effect.tap(() => Console.log('  • "ji mine" to view your issues')),
    Effect.tap(() => Console.log('  • "ji analyze <ISSUE-KEY>" to analyze issues with AI')),
    Effect.catchAll((error) =>
      pipe(
        Console.error(
          chalk.red(`\nAuthentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
        ),
        Effect.flatMap(() => Console.error('Please check your credentials and try again.')),
        Effect.flatMap(() => Effect.fail(error)),
      ),
    ),
  );

export async function setup() {
  const program = setupEffect();

  try {
    await Effect.runPromise(program);
  } catch (_error) {
    // Error already handled and displayed
    process.exit(1);
  }
}
