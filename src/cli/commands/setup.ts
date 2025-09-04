import { spawn } from 'node:child_process';
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
  analysisCommand?: string;
  defaultProject?: string;
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

// Check if a command exists on the system
const checkCommandExists = (command: string): Promise<boolean> =>
  new Promise((resolve) => {
    const child = spawn('which', [command], { stdio: 'ignore' });
    child.on('close', (code) => {
      resolve(code === 0);
    });
    child.on('error', () => {
      resolve(false);
    });
  });

// AI tools to check for in order of preference
const AI_TOOLS = ['claude', 'gemini', 'opencode', 'ollama'] as const;

// Effect wrapper for detecting available AI tools
const detectAvailableAITools = () =>
  Effect.tryPromise({
    try: async () => {
      const availableTools: string[] = [];

      for (const tool of AI_TOOLS) {
        const exists = await checkCommandExists(tool);
        if (exists) {
          availableTools.push(tool);
        }
      }

      return availableTools;
    },
    catch: (error) => new Error(`Failed to detect AI tools: ${error}`),
  });

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
    Effect.all([getExistingConfig(), detectAvailableAITools()]),
    Effect.flatMap(([existingConfig, availableTools]) =>
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
              const apiTokenMessage = existingConfig?.apiToken
                ? `API Token ${chalk.dim('(press Enter to keep existing)')}`
                : 'API Token';

              const apiToken =
                (await password({
                  message: apiTokenMessage,
                  mask: true, // Show * characters as user types
                })) ||
                existingConfig?.apiToken ||
                '';

              // Default project key
              const defaultProject = await input({
                message: 'Default project key (e.g., PROJ) for sprint/board commands (optional)',
                default: existingConfig?.defaultProject || '',
              });

              console.log('');
              console.log(chalk.yellow('Optional: AI Analysis Configuration'));

              // Show detected AI tools
              if (availableTools.length > 0) {
                console.log(chalk.dim(`Detected AI tools: ${availableTools.join(', ')}`));
              }

              // Get default suggestion (claude first if available, otherwise first detected tool)
              const defaultCommand =
                existingConfig?.analysisCommand ||
                (availableTools.includes('claude') ? 'claude' : availableTools[0]) ||
                '';

              // Analysis command with smart default
              const analysisCommand = await input({
                message:
                  availableTools.length > 0
                    ? 'Analysis tool command'
                    : 'Analysis tool command (e.g., claude, gemini, opencode)',
                default: defaultCommand,
              });

              return {
                jiraUrl: jiraUrl.endsWith('/') ? jiraUrl.slice(0, -1) : jiraUrl,
                email,
                apiToken,
                ...(analysisCommand && { analysisCommand }),
                ...(defaultProject && { defaultProject }),
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
