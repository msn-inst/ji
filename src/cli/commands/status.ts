import chalk from 'chalk';
import { ConfigManager } from '../../lib/config.js';
import { JiraClient } from '../../lib/jira-client.js';

export async function statusCommand() {
  try {
    const configManager = new ConfigManager();
    const config = await configManager.getConfig();

    if (!config) {
      console.error(chalk.red('✗ No configuration found. Please run "ji setup" first.'));
      process.exit(1);
    }

    console.log(chalk.gray('Checking Jira connection...'));

    const jiraClient = new JiraClient(config);

    try {
      // Test connection by fetching the current user
      const currentUser = await jiraClient.getCurrentUser();

      console.log(chalk.green('✓ Successfully connected to Jira'));
      console.log();
      console.log(chalk.gray('Configuration:'));
      console.log(`  URL: ${chalk.cyan(config.jiraUrl)}`);
      console.log(`  Email: ${chalk.cyan(config.email)}`);
      console.log();
      console.log(chalk.gray('Current User:'));
      console.log(`  Name: ${chalk.cyan(currentUser.displayName)}`);
      console.log(`  Account ID: ${chalk.gray(currentUser.accountId)}`);

      if (currentUser.emailAddress && currentUser.emailAddress !== config.email) {
        console.log(`  Email: ${chalk.cyan(currentUser.emailAddress)}`);
      }

      // Try to fetch a simple count of assigned issues
      try {
        const jql = 'assignee = currentUser() AND status NOT IN (Closed, Done, Resolved)';
        const result = await jiraClient.searchIssues(jql, { maxResults: 0 });
        console.log();
        console.log(chalk.gray('Statistics:'));
        console.log(`  Open issues assigned to you: ${chalk.cyan(result.total)}`);
      } catch (_error) {
        // Ignore if we can't fetch issues
      }

      configManager.close();
    } catch (error) {
      console.error(chalk.red('✗ Failed to connect to Jira'));
      console.error();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Provide helpful error messages
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        console.error(chalk.yellow('Authentication failed. Please check your API token.'));
        console.error(chalk.gray('You can generate a new token at:'));
        console.error(chalk.cyan('https://id.atlassian.com/manage/api-tokens'));
      } else if (errorMessage.includes('404')) {
        console.error(chalk.yellow('Jira URL might be incorrect. Please verify the URL.'));
        console.error(chalk.gray(`Current URL: ${config.jiraUrl}`));
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
        console.error(chalk.yellow('Cannot reach Jira server. Please check:'));
        console.error(chalk.gray('  - Your internet connection'));
        console.error(chalk.gray('  - The Jira URL is correct'));
        console.error(chalk.gray(`  - Current URL: ${config.jiraUrl}`));
      } else {
        console.error(chalk.gray(`Error: ${errorMessage}`));
      }

      console.error();
      console.error(chalk.gray('Run "ji setup" to reconfigure your connection.'));

      configManager.close();
      process.exit(1);
    }
  } catch (error) {
    console.error('Status check failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
