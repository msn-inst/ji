import chalk from 'chalk';
import { Console, Effect, pipe } from 'effect';
import { ConfigManager } from '../../lib/config.js';
import { JiraClient } from '../../lib/jira-client.js';

// Helper function to escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface SprintIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    priority?: { name: string } | null;
    assignee?: { displayName: string } | null;
  };
  sprintName: string;
  boardName: string;
  projectKey: string;
}

// Effect wrapper for getting configuration and jira client
const getConfigEffect = () =>
  Effect.tryPromise({
    try: async () => {
      const configManager = new ConfigManager();
      try {
        const config = await configManager.getConfig();
        if (!config) {
          throw new Error('No configuration found. Please run "ji setup" first.');
        }
        const jiraClient = new JiraClient(config);
        return { config, configManager, jiraClient };
      } catch (error) {
        configManager.close();
        throw error;
      }
    },
    catch: (error) => new Error(`Failed to get configuration: ${error}`),
  });

// Effect for fetching sprint issues
const getSprintIssuesEffect = (jiraClient: JiraClient, projectFilter?: string, unassigned?: boolean) =>
  Effect.tryPromise({
    try: async () => {
      const boards = await jiraClient.getBoards();
      const activeSprintIssues: SprintIssue[] = [];

      // Use project filter or get all boards
      const effectiveProject = projectFilter;
      const filteredBoards = effectiveProject
        ? boards.filter((board) => board.location?.projectKey?.toUpperCase() === effectiveProject.toUpperCase())
        : boards;

      if (filteredBoards.length === 0) {
        return { issues: [], effectiveProject };
      }

      // Get issues from active sprints
      for (const board of filteredBoards) {
        try {
          const activeSprints = await jiraClient.getActiveSprints(board.id);

          for (const sprint of activeSprints) {
            const sprintResult = await jiraClient.getSprintIssues(sprint.id);
            const sprintIssues = sprintResult.issues;

            // Filter by assignment if requested
            const filteredIssues = unassigned ? sprintIssues.filter((issue) => !issue.fields.assignee) : sprintIssues;

            activeSprintIssues.push(
              ...filteredIssues.map((issue) => ({
                key: issue.key,
                fields: issue.fields,
                sprintName: sprint.name,
                boardName: board.name,
                projectKey: board.location?.projectKey || issue.key.split('-')[0],
              })),
            );
          }
        } catch (error) {
          // Continue with other boards if one fails
          console.error(`Failed to get sprint data for board ${board.name}: ${error}`);
        }
      }

      return { issues: activeSprintIssues, effectiveProject };
    },
    catch: (error) => new Error(`Failed to fetch sprint issues: ${error}`),
  });

// Main Effect for showing sprints
const showSprintEffect = (projectFilter?: string, options: { unassigned?: boolean; xml?: boolean } = {}) =>
  pipe(
    getConfigEffect(),
    Effect.flatMap(({ config, configManager, jiraClient }) =>
      pipe(
        getSprintIssuesEffect(jiraClient, projectFilter || config.defaultProject, options.unassigned),
        Effect.flatMap(({ issues, effectiveProject }) => {
          if (issues.length === 0) {
            const message = effectiveProject
              ? effectiveProject
                ? `No boards found for project ${effectiveProject.toUpperCase()}`
                : 'No boards found'
              : options.unassigned
                ? 'No unassigned issues in active sprints'
                : 'No issues in active sprints';

            return Effect.sync(() => console.log(message));
          }

          // Display results
          return Effect.sync(() => {
            if (!options.xml) {
              displayPrettySprintResults(issues, options.unassigned);
            } else {
              displayXMLSprintResults(issues, options.unassigned);
            }
          });
        }),
        Effect.tap(() => Effect.sync(() => configManager.close())),
      ),
    ),
    Effect.catchAll((error) =>
      pipe(
        Console.error('Error fetching sprint data:', error.message),
        Effect.flatMap(() => Effect.fail(error)),
      ),
    ),
  );

export async function showSprint(projectFilter?: string, options: { unassigned?: boolean; xml?: boolean } = {}) {
  try {
    await Effect.runPromise(showSprintEffect(projectFilter, options));
  } catch (_error) {
    process.exit(1);
  }
}

function displayPrettySprintResults(issues: SprintIssue[], unassigned?: boolean) {
  console.log(
    chalk.gray(
      `Found ${issues.length} ${unassigned ? 'unassigned ' : ''}issue${issues.length !== 1 ? 's' : ''} in active sprints\n`,
    ),
  );

  // Group by sprint
  const bySprintAndBoard = issues.reduce(
    (acc, issue) => {
      const key = `${issue.boardName} - ${issue.sprintName}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(issue);
      return acc;
    },
    {} as Record<string, SprintIssue[]>,
  );

  Object.entries(bySprintAndBoard).forEach(([sprintBoardKey, sprintIssues]) => {
    console.log(chalk.bold.cyan(sprintBoardKey));
    console.log(chalk.gray('─'.repeat(50)));

    sprintIssues.forEach((issue) => {
      const assignee = issue.fields.assignee?.displayName || 'Unassigned';
      const priority = issue.fields.priority?.name || 'None';

      console.log(`  ${chalk.bold(issue.key)} ${issue.fields.summary}`);
      console.log(`    ${chalk.gray(issue.fields.status.name)} • ${priority} • ${assignee}`);
    });
    console.log();
  });
}

function displayXMLSprintResults(issues: SprintIssue[], unassigned?: boolean) {
  console.log('<sprint_issues>');
  console.log(`  <filter_type>${unassigned ? 'unassigned' : 'all'}</filter_type>`);
  console.log(`  <count>${issues.length}</count>`);

  if (issues.length > 0) {
    // Group by sprint
    const bySprintAndBoard = issues.reduce(
      (acc, issue) => {
        const key = `${issue.boardName}|||${issue.sprintName}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(issue);
        return acc;
      },
      {} as Record<string, SprintIssue[]>,
    );

    console.log('  <sprints>');
    Object.entries(bySprintAndBoard).forEach(([sprintBoardKey, sprintIssues]) => {
      const [boardName, sprintName] = sprintBoardKey.split('|||');
      console.log('    <sprint>');
      console.log(`      <board>${escapeXml(boardName)}</board>`);
      console.log(`      <name>${escapeXml(sprintName)}</name>`);
      console.log('      <issues>');

      sprintIssues.forEach((issue) => {
        console.log('        <issue>');
        console.log(`          <key>${escapeXml(issue.key)}</key>`);
        console.log(`          <title>${escapeXml(issue.fields.summary)}</title>`);
        console.log(`          <status>${escapeXml(issue.fields.status.name)}</status>`);
        console.log(`          <priority>${escapeXml(issue.fields.priority?.name || 'None')}</priority>`);
        console.log(`          <assignee>${escapeXml(issue.fields.assignee?.displayName || 'Unassigned')}</assignee>`);
        console.log(`          <project>${escapeXml(issue.projectKey)}</project>`);
        console.log('        </issue>');
      });

      console.log('      </issues>');
      console.log('    </sprint>');
    });
    console.log('  </sprints>');
  }

  console.log('</sprint_issues>');
}
