import chalk from 'chalk';
import { Effect, pipe, Schema } from 'effect';
import type { PullRequest } from '../../lib/jira-client/jira-client-types.js';
import { ConfigManager } from '../../lib/config.js';
import { JiraClient } from '../../lib/jira-client.js';

export const PlatformSchema = Schema.Literal('github', 'bitbucket', 'gitlab');
export type Platform = Schema.Schema.Type<typeof PlatformSchema>;

const PLATFORM_TO_APPLICATION_TYPE: Record<Platform, string> = {
  github: 'GitHub',
  bitbucket: 'bitbucket',
  gitlab: 'GitLab',
};

interface PrOptions {
  json?: boolean;
  platform?: Platform;
}

const IssueKeySchema = Schema.String.pipe(
  Schema.pattern(/^[A-Z]+-\d+$/),
  Schema.annotations({ message: () => 'Invalid issue key format. Expected format: PROJECT-123' }),
);

function formatOutput(prs: PullRequest[], options: PrOptions, issueKey: string): string {
  if (options.json) return JSON.stringify(prs, null, 2);
  if (prs.length === 0) return chalk.yellow(`No pull requests found for ${issueKey}`);
  return prs.map((pr) => pr.url).join('\n');
}

export async function showPullRequests(issueKey: string, options: PrOptions = {}) {
  const configManager = new ConfigManager();
  try {
    Schema.decodeUnknownSync(IssueKeySchema)(issueKey);
    const platform = Schema.decodeUnknownSync(PlatformSchema)(options.platform || 'github');
    const applicationType = PLATFORM_TO_APPLICATION_TYPE[platform];

    const config = await configManager.getConfig();
    if (!config) throw new Error('No configuration found. Please run "ji setup" first.');

    const jiraClient = new JiraClient(config);
    const prs = await Effect.runPromise(jiraClient.getIssuePullRequestsEffect(issueKey, applicationType));
    console.log(formatOutput(prs, options, issueKey));
    configManager.close();
  } catch (error) {
    configManager.close();
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
