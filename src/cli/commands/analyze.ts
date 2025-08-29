import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import chalk from 'chalk';
import { Console, Effect, pipe, Schema } from 'effect';
import { type Config, ConfigManager } from '../../lib/config.js';
import { type Issue, JiraClient } from '../../lib/jira-client.js';
import { formatDescription } from '../formatters/issue.js';

// ============= Schemas =============
const IssueKeySchema = Schema.String.pipe(
  Schema.pattern(/^[A-Z]+-\d+$/, {
    message: () => 'Issue key must be in format PROJECT-123',
  }),
);

const AnalyzeOptionsSchema = Schema.Struct({
  prompt: Schema.optional(Schema.String),
  tool: Schema.optional(Schema.Union(Schema.Literal('claude'), Schema.Literal('gemini'), Schema.Literal('opencode'))),
  comment: Schema.optional(Schema.Boolean),
  yes: Schema.optional(Schema.Boolean),
});

const ToolCommandSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.pattern(/^[a-z]+(\s+-p)?$/, {
    message: () => 'Tool command must be either "tool" or "tool -p"',
  }),
);

// ============= Error Types =============
export class AnalysisError extends Error {
  readonly _tag = 'AnalysisError';
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class ToolNotFoundError extends Error {
  readonly _tag = 'ToolNotFoundError';
  constructor(
    message: string,
    public readonly tools?: string[],
  ) {
    super(message);
  }
}

export class ResponseExtractionError extends Error {
  readonly _tag = 'ResponseExtractionError';
  constructor(
    message: string,
    public readonly output?: string,
  ) {
    super(message);
  }
}

export class ConfigurationError extends Error {
  readonly _tag = 'ConfigurationError';
}

export class JiraApiError extends Error {
  readonly _tag = 'JiraApiError';
  constructor(
    message: string,
    public readonly issueKey?: string,
  ) {
    super(message);
  }
}

// Type for all errors
type AnalyzeError = AnalysisError | ToolNotFoundError | ResponseExtractionError | ConfigurationError | JiraApiError;

// ============= Tool Detection =============
const checkCommand = (command: string): Effect.Effect<boolean, never> =>
  Effect.async<boolean, never>((resume) => {
    const which = spawn('which', [command], { stdio: 'ignore' });
    which.on('close', (code) => {
      resume(Effect.succeed(code === 0));
    });
    which.on('error', () => {
      resume(Effect.succeed(false));
    });
  });

const findAvailableTool = (): Effect.Effect<string, ToolNotFoundError> =>
  pipe(
    Effect.all({
      claude: checkCommand('claude'),
      gemini: checkCommand('gemini'),
      opencode: checkCommand('opencode'),
    }),
    Effect.flatMap(({ claude, gemini, opencode }) => {
      if (claude) return Effect.succeed('claude -p');
      if (gemini) return Effect.succeed('gemini -p');
      if (opencode) return Effect.succeed('opencode -p');
      return Effect.fail(
        new ToolNotFoundError('No analysis tool found. Please install claude, gemini, or opencode.', [
          'claude',
          'gemini',
          'opencode',
        ]),
      );
    }),
  );

// ============= Configuration =============
const getConfiguration = Effect.gen(function* () {
  const configManager = new ConfigManager();
  try {
    const config = yield* Effect.tryPromise({
      try: () => configManager.getConfig(),
      catch: () => new ConfigurationError('Failed to load configuration'),
    });

    if (!config) {
      return yield* Effect.fail(new ConfigurationError('Not authenticated. Please run "ji setup" first.'));
    }

    return config;
  } finally {
    configManager.close();
  }
});

// ============= Issue Fetching =============
const fetchIssue = (
  issueKey: string,
): Effect.Effect<{ issue: Issue; config: Config }, JiraApiError | ConfigurationError> =>
  pipe(
    getConfiguration,
    Effect.flatMap((config) =>
      Effect.gen(function* () {
        const jiraClient = new JiraClient(config);

        const issue = yield* Effect.tryPromise({
          try: async () => (await jiraClient.getIssue(issueKey)) as Issue,
          catch: (error) =>
            new JiraApiError(
              `Failed to fetch issue ${issueKey}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              issueKey,
            ),
        });

        return { issue, config };
      }),
    ),
  );

// ============= XML Formatting =============
const formatIssueAsXml = (issue: Issue, jiraUrl: string): Effect.Effect<string, never> =>
  Effect.sync(() => {
    let xml = '<issue>\n';
    xml += `  <key>${issue.key}</key>\n`;
    xml += `  <summary>${escapeXml(issue.fields.summary)}</summary>\n`;
    xml += `  <status>${issue.fields.status.name}</status>\n`;
    xml += `  <priority>${issue.fields.priority?.name || 'None'}</priority>\n`;

    // Handle issue type safely
    const issueType = issue.fields.issuetype;
    if (issueType && typeof issueType === 'object' && 'name' in issueType) {
      xml += `  <type>${issueType.name}</type>\n`;
    }

    xml += `  <assignee>${issue.fields.assignee?.displayName || 'Unassigned'}</assignee>\n`;
    xml += `  <reporter>${issue.fields.reporter?.displayName || 'Unknown'}</reporter>\n`;
    xml += `  <created>${issue.fields.created}</created>\n`;
    xml += `  <updated>${issue.fields.updated}</updated>\n`;
    xml += `  <link>${jiraUrl}/browse/${issue.key}</link>\n`;

    // Handle epic/parent safely
    if (issue.fields.parent && typeof issue.fields.parent === 'object' && 'key' in issue.fields.parent) {
      xml += '  <epic>\n';
      xml += `    <key>${issue.fields.parent.key}</key>\n`;
      if (
        'fields' in issue.fields.parent &&
        issue.fields.parent.fields &&
        typeof issue.fields.parent.fields === 'object' &&
        'summary' in issue.fields.parent.fields
      ) {
        xml += `    <summary>${escapeXml(String(issue.fields.parent.fields.summary))}</summary>\n`;
      }
      xml += '  </epic>\n';
    }

    // Add description
    if (issue.fields.description) {
      const formattedDescription = formatDescription(issue.fields.description);
      xml += '  <description>\n';
      xml += `    ${escapeXml(formattedDescription)}\n`;
      xml += '  </description>\n';
    }

    // Add acceptance criteria if present
    const acceptanceCriteria = issue.fields.customfield_10035 || issue.fields.customfield_10014;
    if (acceptanceCriteria) {
      const formattedCriteria = formatDescription(acceptanceCriteria);
      xml += '  <acceptance_criteria>\n';
      xml += `    ${escapeXml(formattedCriteria)}\n`;
      xml += '  </acceptance_criteria>\n';
    }

    xml += '</issue>';
    return xml;
  });

// Helper function to escape XML special characters
const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// ============= Comments Fetching =============
const fetchComments = (issueKey: string, jiraClient: JiraClient): Effect.Effect<string, JiraApiError> =>
  Effect.tryPromise({
    try: async () => {
      const comments = await jiraClient.getComments(issueKey);
      if (comments.length === 0) return '';

      let xml = '  <comments>\n';
      for (const comment of comments) {
        const formattedBody = formatDescription(comment.body);
        xml += '    <comment>\n';
        xml += `      <author>${escapeXml(comment.author.displayName)}</author>\n`;
        xml += `      <created>${comment.created}</created>\n`;
        xml += `      <body>${escapeXml(formattedBody)}</body>\n`;
        xml += '    </comment>\n';
      }
      xml += '  </comments>\n';
      return xml;
    },
    catch: (error) =>
      new JiraApiError(
        `Failed to fetch comments: ${error instanceof Error ? error.message : 'Unknown error'}`,
        issueKey,
      ),
  });

// Helper to expand tilde in file paths
const expandTilde = (path: string): string => {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
};

// ============= Prompt Loading =============
const loadPrompt = (promptPath?: string): Effect.Effect<string, ConfigurationError | null> =>
  Effect.gen(function* () {
    // Try custom prompt path first
    if (promptPath) {
      const expandedPath = expandTilde(promptPath);
      if (!existsSync(expandedPath)) {
        return yield* Effect.fail(new ConfigurationError(`Prompt file not found: ${promptPath}`));
      }
      return yield* Effect.try({
        try: () => readFileSync(expandedPath, 'utf-8'),
        catch: (error) => new ConfigurationError(`Failed to read prompt file: ${error}`),
      });
    }

    // Check config for default prompt (removed analysisPrompt support)
    yield* Effect.tryPromise<Config | null, null>({
      try: async () => {
        const configManager = new ConfigManager();
        try {
          return await configManager.getConfig();
        } finally {
          configManager.close();
        }
      },
      catch: () => null,
    });

    // Use default prompt
    const defaultPromptPath = join(import.meta.dir, '../../assets/default-analysis-prompt.md');
    if (existsSync(defaultPromptPath)) {
      return yield* Effect.try({
        try: () => readFileSync(defaultPromptPath, 'utf-8'),
        catch: (error) => new ConfigurationError(`Failed to read default prompt: ${error}`),
      });
    }

    // Fallback inline prompt
    return `# Jira Issue Analysis

Please analyze the following Jira issue and provide actionable recommendations for resolution.

Consider the following aspects in your analysis:
- Current status and blockers
- Technical approach and implementation suggestions
- Potential risks or dependencies
- Time estimation if applicable
- Next steps for the assignee

Focus on providing practical, specific guidance that will help move this issue forward.`;
  });

// ============= Tool Execution =============
const executeTool = (toolCommand: string, input: string): Effect.Effect<string, AnalysisError> =>
  Effect.async<string, AnalysisError>((resume) => {
    const [command, ...args] = toolCommand.split(' ');
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('error', (err) => {
      resume(Effect.fail(new AnalysisError(`Failed to spawn tool: ${err.message}`, err)));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resume(Effect.succeed(output));
      } else {
        resume(Effect.fail(new AnalysisError(`Tool exited with code ${code}: ${error}`, { code, error })));
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });

// ============= Response Extraction =============
const extractResponse = (output: string): Effect.Effect<string, ResponseExtractionError> =>
  Effect.gen(function* () {
    const responseMatch = output.match(/<response>([\s\S]*?)<\/response>/);
    if (!responseMatch || !responseMatch[1]) {
      // Check if output contains response-like content but without tags
      const hasContent = output.trim().length > 50;
      const errorMsg = hasContent
        ? 'Tool output does not contain <response> tags. The analysis tool must wrap its response in <response> tags.'
        : 'No response received from analysis tool';
      return yield* Effect.fail(new ResponseExtractionError(errorMsg, output));
    }
    const response = responseMatch[1].trim();
    if (!response) {
      return yield* Effect.fail(new ResponseExtractionError('Empty response in <response> tags', output));
    }
    return response;
  });

// ============= Comment Posting =============
const postComment = (issueKey: string, comment: string): Effect.Effect<void, JiraApiError | ConfigurationError> =>
  pipe(
    getConfiguration,
    Effect.flatMap((config) =>
      Effect.tryPromise({
        try: async () => {
          const jiraClient = new JiraClient(config);
          await jiraClient.addComment(issueKey, comment);
        },
        catch: (error) =>
          new JiraApiError(
            `Failed to post comment: ${error instanceof Error ? error.message : 'Unknown error'}`,
            issueKey,
          ),
      }),
    ),
  );

// ============= User Interaction =============
const showAnalysis = (analysis: string): Effect.Effect<void, never> =>
  Effect.sync(() => {
    console.log(`\n${chalk.yellow('─'.repeat(60))}`);
    console.log(`${chalk.yellow('│')} Analysis:`);
    console.log(chalk.yellow('─'.repeat(60)));
    console.log(analysis);
    console.log(`${chalk.yellow('─'.repeat(60))}\n`);
  });

const confirmComment = Effect.gen(function* () {
  const rl = readline.createInterface({ input, output });

  const result = yield* Effect.tryPromise({
    try: async () => {
      const answer = await rl.question('Post this comment? [y/N]: ');
      return answer.toLowerCase() === 'y';
    },
    catch: (error) => new AnalysisError(`Failed to get user input: ${error}`),
  });

  yield* Effect.sync(() => rl.close());
  return result;
});

// ============= Main Analysis Pipeline =============
const analyzeIssueEffect = (
  issueKey: string,
  options: {
    prompt?: string;
    tool?: string;
    comment?: boolean;
    yes?: boolean;
  },
): Effect.Effect<void, AnalyzeError | null> =>
  Effect.gen(function* () {
    // Extract issue key from URL if provided
    let extractedKey = issueKey;
    const urlMatch = issueKey.match(/\/browse\/([A-Z]+-\d+)/);
    if (urlMatch?.[1]) {
      extractedKey = urlMatch[1];
    }

    // Validate issue key
    yield* Schema.decodeUnknown(IssueKeySchema)(extractedKey).pipe(
      Effect.mapError(() => new ConfigurationError(`Invalid issue key: ${extractedKey}`)),
    );

    // Validate options
    yield* Schema.decodeUnknown(AnalyzeOptionsSchema)(options).pipe(
      Effect.mapError((error) => new ConfigurationError(`Invalid options: ${error}`)),
    );

    // Get configuration
    const config = yield* getConfiguration;

    // Determine tool to use
    const toolCommand = yield* (() => {
      if (options.tool) {
        return pipe(
          checkCommand(options.tool),
          Effect.flatMap((exists) =>
            exists
              ? Effect.succeed(`${options.tool} -p`)
              : Effect.fail(new ToolNotFoundError(`Tool '${options.tool}' not found`)),
          ),
        );
      }
      if (config.analysisCommand) {
        // Ensure the command has the -p flag if it doesn't already
        const cmd = config.analysisCommand;
        return Effect.succeed(cmd.includes('-p') ? cmd : `${cmd} -p`);
      }
      return findAvailableTool();
    })();

    // Validate tool command format
    yield* Schema.decodeUnknown(ToolCommandSchema)(toolCommand).pipe(
      Effect.mapError(() => new ConfigurationError(`Invalid tool command format: ${toolCommand}`)),
    );

    // Load prompt
    const prompt = yield* loadPrompt(options.prompt);

    // Fetch and format issue
    const fetchResult = yield* fetchIssue(extractedKey);
    const issue = fetchResult.issue;
    const issueConfig = fetchResult.config;

    // Format issue as XML
    const issueXml = yield* formatIssueAsXml(issue, issueConfig.jiraUrl);

    // Fetch comments
    const jiraClient = new JiraClient(issueConfig);
    const commentsXml = yield* fetchComments(extractedKey, jiraClient).pipe(
      Effect.orElse(() => Effect.succeed('')), // Continue even if comments fail
    );

    // Build complete issue data
    const fullIssueXml = commentsXml ? issueXml.replace('</issue>', `${commentsXml}</issue>`) : issueXml;

    // Build input for tool
    const systemPrompt = `IMPORTANT: Your entire response MUST be wrapped in <response> tags like this:
<response>
Your analysis goes here...
</response>

Do not include anything outside the <response> tags.

`;
    const fullInput = `${systemPrompt}\n\n${prompt}\n\n${fullIssueXml}`;

    // Run analysis
    const toolOutput = yield* executeTool(toolCommand, fullInput);

    // Extract response
    const response = yield* extractResponse(toolOutput);

    // For default output mode, just print the analysis directly
    if (!options.comment) {
      yield* Console.log(response);
      return;
    }

    // Show analysis with formatting for comment mode
    yield* showAnalysis(response);

    // Handle comment posting
    const shouldPost = options.yes
      ? true
      : yield* pipe(
          Console.log('Do you want to post this analysis as a comment to the Jira issue?'),
          Effect.flatMap(() => confirmComment),
        );

    if (shouldPost) {
      yield* Console.log('Posting comment...');
      yield* postComment(extractedKey, response);
      yield* Console.log(chalk.green('✓ Comment posted successfully'));
    } else {
      yield* Console.log(chalk.yellow('Comment not posted'));
    }
  });

// ============= Error Handling =============
const handleAnalyzeError = (error: AnalyzeError | null): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    if (!error) {
      yield* Console.error(chalk.red('An unknown error occurred'));
      return;
    }
    switch (error._tag) {
      case 'ToolNotFoundError':
        yield* Console.error(chalk.red(`Tool Error: ${error.message}`));
        if (error.tools) {
          yield* Console.error(chalk.dim(`Available tools: ${error.tools.join(', ')}`));
        }
        break;
      case 'ResponseExtractionError':
        yield* Console.error(chalk.red(`Response Error: ${error.message}`));
        if (error.output && process.env.DEBUG) {
          yield* Console.error(chalk.dim('Tool output:'));
          yield* Console.error(chalk.dim(error.output));
        }
        break;
      case 'JiraApiError':
        yield* Console.error(chalk.red(`Jira API Error: ${error.message}`));
        if (error.issueKey) {
          yield* Console.error(chalk.dim(`Issue: ${error.issueKey}`));
        }
        break;
      case 'ConfigurationError':
        yield* Console.error(chalk.red(`Configuration Error: ${error.message}`));
        break;
      case 'AnalysisError':
        yield* Console.error(chalk.red(`Analysis Error: ${error.message}`));
        if (error.cause && process.env.DEBUG) {
          yield* Console.error(chalk.dim(`Cause: ${JSON.stringify(error.cause)}`));
        }
        break;
      default:
        yield* Console.error(chalk.red(`Error: ${(error as Error).message || 'Unknown error'}`));
    }
  });

// ============= Public API =============
export async function analyzeIssue(
  issueKey: string,
  options: {
    prompt?: string;
    tool?: string;
    comment?: boolean;
    yes?: boolean;
  } = {},
): Promise<void> {
  await Effect.runPromise(
    pipe(
      analyzeIssueEffect(issueKey, options),
      Effect.catchAll((error) => {
        // In test mode, only re-throw validation errors for test assertions
        if (process.env.NODE_ENV === 'test' && error?._tag === 'ConfigurationError') {
          const message = error.message;
          if (message.includes('Invalid issue key') || message.includes('Invalid options')) {
            return Effect.fail(error);
          }
        }
        // Otherwise handle the error gracefully
        return handleAnalyzeError(error);
      }),
    ),
  );
}
