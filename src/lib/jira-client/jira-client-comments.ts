import { Effect, pipe } from 'effect';
import { JiraClientBase } from './jira-client-base.js';
import { AuthenticationError, NetworkError, NotFoundError, ValidationError } from './jira-client-types.js';

// ADF (Atlassian Document Format) type definitions
interface ADFTextNode {
  type: 'text';
  text: string;
  marks?: Array<{ type: 'code' | 'strong' | 'em' }>;
}

interface ADFHeading {
  type: 'heading';
  attrs: { level: number };
  content: ADFTextNode[];
}

interface ADFParagraph {
  type: 'paragraph';
  content: ADFTextNode[];
}

interface ADFListItem {
  type: 'listItem';
  content: ADFParagraph[];
}

interface ADFBulletList {
  type: 'bulletList';
  content: ADFListItem[];
}

type ADFContent = ADFHeading | ADFParagraph | ADFListItem | ADFBulletList;

interface ADFDocument {
  type: 'doc';
  version: 1;
  content: ADFContent[];
}

export class JiraClientComments extends JiraClientBase {
  /**
   * Format comment text for Jira REST API v2 (plain text/wiki markup)
   */
  private formatCommentForJira(comment: string): string {
    // For REST API v2, use plain text/wiki markup instead of ADF
    // Check if this looks like it's from the analysis command (contains wiki markup)
    const isAnalysisComment = comment.includes('h4.') || comment.includes(':robot:');

    if (isAnalysisComment) {
      // For analysis comments, preserve wiki markup formatting
      return comment.replace(':robot:', '🤖');
    }

    // For regular comments, return as plain text
    return comment;
  }

  /**
   * Convert Jira wiki markup to ADF format
   */
  private convertWikiMarkupToADF(text: string): ADFDocument {
    const lines = text.split('\n');
    const content: ADFContent[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        // Empty line - add paragraph break
        continue;
      }

      if (line.startsWith(':robot:')) {
        // Convert robot emoji to actual emoji and make it a heading
        const robotText = line.replace(':robot:', '🤖');
        content.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: robotText }],
        });
      } else if (line.startsWith('h4.')) {
        // Convert h4. headers to ADF headings
        const headerText = line.replace('h4.', '').trim();
        content.push({
          type: 'heading',
          attrs: { level: 4 },
          content: [{ type: 'text', text: headerText }],
        });
      } else if (line.startsWith('* ')) {
        // Handle bullet points
        const bulletText = line.replace('* ', '');

        // Check if this is a file path with description (contains: )
        if (bulletText.includes(': ') && bulletText.includes('{{') && bulletText.includes('}}')) {
          const [pathPart, description] = bulletText.split(': ', 2);
          const filePath = pathPart.replace(/[{}]/g, ''); // Remove {{ }}

          content.push({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: filePath, marks: [{ type: 'code' }] },
                  { type: 'text', text: `: ${description}` },
                ],
              },
            ],
          });
        } else {
          // Handle {{path}} formatting for code
          const formattedText = this.formatInlineCode(bulletText);
          content.push({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: formattedText,
              },
            ],
          });
        }
      } else {
        // Regular paragraph text
        const formattedText = this.formatInlineCode(line);
        content.push({
          type: 'paragraph',
          content: formattedText,
        });
      }
    }

    // Wrap bullet points in bulletList
    const processedContent: ADFContent[] = [];
    let currentList: ADFListItem[] = [];

    for (const item of content) {
      if (item.type === 'listItem') {
        currentList.push(item as ADFListItem);
      } else {
        if (currentList.length > 0) {
          processedContent.push({
            type: 'bulletList',
            content: currentList,
          });
          currentList = [];
        }
        processedContent.push(item);
      }
    }

    // Handle remaining list items
    if (currentList.length > 0) {
      processedContent.push({
        type: 'bulletList',
        content: currentList,
      });
    }

    // Ensure we have at least one content element
    if (processedContent.length === 0) {
      processedContent.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'No content' }],
      });
    }

    return {
      type: 'doc',
      version: 1,
      content: processedContent,
    };
  }

  /**
   * Convert simple markdown to ADF format
   */
  private convertMarkdownToADF(text: string): ADFDocument {
    const lines = text.split('\n');
    const content: ADFContent[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const formattedText = this.formatInlineCode(line);
      content.push({
        type: 'paragraph',
        content: formattedText,
      });
    }

    // Ensure we have at least one content element
    if (content.length === 0) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'No content' }],
      });
    }

    return {
      type: 'doc',
      version: 1,
      content: content,
    };
  }

  /**
   * Format inline code and text with proper ADF marks
   */
  private formatInlineCode(text: string): ADFTextNode[] {
    const result: ADFTextNode[] = [];
    const parts = text.split(/(\{\{[^}]+\}\})/g);

    for (const part of parts) {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        // Code block
        const code = part.slice(2, -2);
        result.push({
          type: 'text',
          text: code,
          marks: [{ type: 'code' }],
        });
      } else if (part) {
        // Regular text
        result.push({
          type: 'text',
          text: part,
        });
      }
    }

    return result.length > 0 ? result : [{ type: 'text', text: text }];
  }
  /**
   * Effect-based version of addComment with structured error handling
   */
  addCommentEffect(
    issueKey: string,
    comment: string,
  ): Effect.Effect<void, ValidationError | NotFoundError | NetworkError | AuthenticationError> {
    return pipe(
      // Validate inputs
      Effect.sync(() => {
        if (!issueKey || !issueKey.match(/^[A-Z]+-\d+$/)) {
          throw new ValidationError('Invalid issue key format. Expected format: PROJECT-123');
        }
        if (!comment || comment.trim().length === 0) {
          throw new ValidationError('Comment cannot be empty');
        }
      }),
      Effect.flatMap(() => {
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
