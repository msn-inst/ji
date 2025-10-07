import { Effect, pipe } from 'effect';
import { JiraClientBase, type SafeModeError } from './jira-client-base.js';
import { AuthenticationError, NetworkError, NotFoundError, ValidationError } from './jira-client-types.js';

export class JiraClientComments extends JiraClientBase {
  /**
   * Format comment text for Jira REST API v2 (plain text/wiki markup)
   */
  private formatCommentForJira(comment: string): string {
    // For REST API v2, use plain text/wiki markup instead of ADF
    // Check if this looks like it's from the analysis command with more robust detection
    const isAnalysisComment = this.isAnalysisComment(comment);

    if (isAnalysisComment) {
      // For analysis comments, preserve wiki markup formatting and replace robot emoji
      return comment.replace(/:robot:/g, '🤖');
    }

    // For regular comments, return as plain text
    return comment;
  }

  /**
   * Detect if a comment is from the analysis command using multiple indicators
   */
  private isAnalysisComment(comment: string): boolean {
    const analysisIndicators = [
      // Starts with robot emoji or contains it at the beginning of a line
      /(?:^|\n):robot:/,
      // Contains h4. headers at the beginning of lines
      /(?:^|\n)h4\.\s+\w+/,
      // Contains typical analysis sections
      /(?:^|\n)h4\.\s+(Summary|Affected components|Key files|Proposal|Next steps)/i,
      // Contains Claude Code attribution
      /🤖\s+Claude Code/,
    ];

    return analysisIndicators.some((indicator) => indicator.test(comment));
  }

  /**
   * Effect-based version of addComment with structured error handling
   */
  addCommentEffect(
    issueKey: string,
    comment: string,
  ): Effect.Effect<void, ValidationError | NotFoundError | NetworkError | AuthenticationError | SafeModeError> {
    return pipe(
      // Check safe mode
      Effect.sync(() => this.checkSafeMode()),
      Effect.flatMap(() =>
        // Validate inputs
        Effect.sync(() => {
          if (!issueKey || !issueKey.match(/^[A-Z]+-\d+$/)) {
            throw new ValidationError('Invalid issue key format. Expected format: PROJECT-123');
          }
          if (!comment || comment.trim().length === 0) {
            throw new ValidationError('Comment cannot be empty');
          }
        }),
      ),
      Effect.flatMap(() => {
        // Use REST API v2 for posting comments to support wiki markup format
        const url = `${this.config.jiraUrl}/rest/api/2/issue/${issueKey}/comment`;

        return Effect.tryPromise({
          try: async () => {
            const response = await fetch(url, {
              method: 'POST',
              headers: this.getHeaders(),
              body: JSON.stringify({
                body: this.formatCommentForJira(comment),
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();

              if (response.status === 404) {
                throw new NotFoundError(`Issue ${issueKey} not found`);
              }

              if (response.status === 401 || response.status === 403) {
                throw new AuthenticationError('Not authorized to add comments to this issue');
              }

              throw new NetworkError(`Failed to add comment: ${response.status} - ${errorText}`);
            }
          },
          catch: (error) => {
            if (
              error instanceof NotFoundError ||
              error instanceof AuthenticationError ||
              error instanceof NetworkError
            ) {
              return error;
            }
            return new NetworkError(`Network error: ${error}`);
          },
        });
      }),
    );
  }

  // Backward compatible version
  async addComment(issueKey: string, comment: string): Promise<void> {
    await Effect.runPromise(this.addCommentEffect(issueKey, comment));
  }

  /**
   * Effect-based version of getting comments for an issue
   */
  getCommentsEffect(issueKey: string): Effect.Effect<
    Array<{
      id: string;
      author: { displayName: string; emailAddress?: string };
      body: unknown;
      created: string;
      updated: string;
      jirareactions?: Array<{
        value: string;
        users: Array<{
          displayName: string;
        }>;
        count: number;
      }>;
    }>,
    ValidationError | NotFoundError | NetworkError | AuthenticationError
  > {
    return pipe(
      // Validate issue key
      Effect.sync(() => {
        if (!issueKey || !issueKey.match(/^[A-Z]+-\d+$/)) {
          throw new ValidationError('Invalid issue key format. Expected format: PROJECT-123');
        }
      }),
      Effect.flatMap(() => {
        // Use REST API v3 for reading comments (standard for retrieval operations)
        const url = `${this.config.jiraUrl}/rest/api/3/issue/${issueKey}/comment`;

        return Effect.tryPromise({
          try: async () => {
            const response = await fetch(url, {
              method: 'GET',
              headers: this.getHeaders(),
              signal: AbortSignal.timeout(10000),
            });

            if (response.status === 404) {
              const errorText = await response.text();
              throw new NotFoundError(`Issue ${issueKey} not found: ${errorText}`);
            }

            if (response.status === 401 || response.status === 403) {
              const errorText = await response.text();
              throw new AuthenticationError(`Not authorized to view comments: ${response.status} - ${errorText}`);
            }

            if (!response.ok) {
              const errorText = await response.text();
              throw new NetworkError(`Failed to get comments: ${response.status} - ${errorText}`);
            }

            const data = (await response.json()) as {
              comments?: Array<{
                id: string;
                author: { displayName: string; emailAddress?: string };
                body: unknown;
                created: string;
                updated: string;
                jirareactions?: Array<{
                  value: string;
                  users: Array<{
                    displayName: string;
                  }>;
                  count: number;
                }>;
              }>;
            };
            return data.comments || [];
          },
          catch: (error) => {
            if (
              error instanceof NotFoundError ||
              error instanceof AuthenticationError ||
              error instanceof NetworkError
            ) {
              return error;
            }
            return new NetworkError(`Failed to fetch comments: ${error}`);
          },
        });
      }),
    );
  }

  // Backward compatible version
  async getComments(issueKey: string): Promise<
    Array<{
      id: string;
      author: { displayName: string; emailAddress?: string };
      body: unknown;
      created: string;
      updated: string;
      jirareactions?: Array<{
        value: string;
        users: Array<{
          displayName: string;
        }>;
        count: number;
      }>;
    }>
  > {
    return Effect.runPromise(this.getCommentsEffect(issueKey));
  }
}
