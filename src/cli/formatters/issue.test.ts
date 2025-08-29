import { describe, expect, it } from 'bun:test';
import chalk from 'chalk';
import { formatDescription, parseADF, getJiraStatusIcon } from './issue.js';

describe('issue formatter', () => {
  describe('formatDescription', () => {
    it('should handle null/undefined descriptions', () => {
      expect(formatDescription(null)).toBe(chalk.gray('No description'));
      expect(formatDescription(undefined)).toBe(chalk.gray('No description'));
    });

    it('should handle empty string descriptions', () => {
      expect(formatDescription('')).toBe(chalk.gray('No description'));
      expect(formatDescription('   ')).toBe(chalk.gray('No description'));
    });

    it('should handle plain text descriptions', () => {
      expect(formatDescription('Simple text')).toBe('Simple text');
      expect(formatDescription('  Text with spaces  ')).toBe('Text with spaces');
      expect(formatDescription('Multi\nline\ntext')).toBe('Multi\nline\ntext');
    });

    it('should handle ADF format descriptions', () => {
      const adfDescription = {
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'This is a test description' }],
          },
        ],
      };

      expect(formatDescription(adfDescription)).toBe('This is a test description');
    });

    it('should handle complex ADF format with multiple nodes', () => {
      const complexAdf = {
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'mention', attrs: { text: 'john.doe' } },
              { type: 'text', text: '!' },
            ],
          },
        ],
      };

      expect(formatDescription(complexAdf)).toBe('Hello @john.doe!');
    });

    it('should handle invalid ADF-like objects', () => {
      const invalidAdf = { version: 1, notContent: [] };
      expect(formatDescription(invalidAdf)).toBe(chalk.gray('No description'));

      const partialAdf = { content: [] };
      expect(formatDescription(partialAdf)).toBe(chalk.gray('No description'));
    });

    it('should handle non-string, non-ADF objects', () => {
      expect(formatDescription({ random: 'object' })).toBe(chalk.gray('No description'));
      expect(formatDescription(42)).toBe(chalk.gray('No description'));
      expect(formatDescription([])).toBe(chalk.gray('No description'));
    });
  });

  describe('parseADF', () => {
    it('should handle empty nodes array', () => {
      expect(parseADF([])).toBe('');
    });

    it('should parse paragraph nodes', () => {
      const nodes = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph' }],
        },
      ];

      expect(parseADF(nodes)).toBe('First paragraphSecond paragraph');
    });

    it('should parse text nodes', () => {
      const nodes = [
        { type: 'text', text: 'Hello world' },
        { type: 'text', text: ' and more text' },
      ];

      expect(parseADF(nodes)).toBe('Hello world and more text');
    });

    it('should handle text nodes with empty/missing text', () => {
      const nodes = [
        { type: 'text', text: '' },
        { type: 'text' }, // missing text property
        { type: 'text', text: 'actual text' },
      ];

      expect(parseADF(nodes)).toBe('actual text');
    });

    it('should parse hard breaks', () => {
      const nodes = [{ type: 'text', text: 'Line 1' }, { type: 'hardBreak' }, { type: 'text', text: 'Line 2' }];

      expect(parseADF(nodes)).toBe('Line 1\nLine 2');
    });

    it('should parse mentions', () => {
      const nodes = [
        { type: 'text', text: 'Hello ' },
        { type: 'mention', attrs: { text: 'john.doe' } },
        { type: 'text', text: ' and ' },
        { type: 'mention', attrs: { text: 'jane.smith' } },
      ];

      expect(parseADF(nodes)).toBe('Hello @john.doe and @jane.smith');
    });

    it('should handle mentions without attrs or text', () => {
      const nodes = [
        { type: 'mention' },
        { type: 'mention', attrs: {} },
        { type: 'mention', attrs: { text: 'valid.user' } },
      ];

      expect(parseADF(nodes)).toBe('@user@user@valid.user');
    });

    it('should parse emojis', () => {
      const nodes = [
        { type: 'text', text: 'Happy face ' },
        { type: 'emoji', attrs: { shortName: ':smile:' } },
        { type: 'text', text: ' and sad ' },
        { type: 'emoji', attrs: { shortName: ':cry:' } },
      ];

      expect(parseADF(nodes)).toBe('Happy face :smile: and sad :cry:');
    });

    it('should handle emojis without attrs', () => {
      const nodes = [{ type: 'emoji' }, { type: 'emoji', attrs: {} }];

      expect(parseADF(nodes)).toBe('');
    });

    it('should parse bullet lists', () => {
      const nodes = [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'text', text: 'First item' }],
            },
            {
              type: 'listItem',
              content: [{ type: 'text', text: 'Second item' }],
            },
          ],
        },
      ];

      expect(parseADF(nodes)).toBe('\n  • First item  • Second item');
    });

    it('should parse ordered lists', () => {
      const nodes = [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'text', text: 'First' }],
            },
            {
              type: 'listItem',
              content: [{ type: 'text', text: 'Second' }],
            },
          ],
        },
      ];

      expect(parseADF(nodes)).toBe('\n  • First  • Second');
    });

    it('should parse list items', () => {
      const nodes = [
        {
          type: 'listItem',
          content: [{ type: 'text', text: 'Item content' }],
        },
      ];

      expect(parseADF(nodes)).toBe('  • Item content');
    });

    it('should handle empty lists and list items', () => {
      const nodes = [
        { type: 'bulletList' },
        { type: 'listItem' },
        {
          type: 'bulletList',
          content: [{ type: 'listItem' }],
        },
      ];

      expect(parseADF(nodes)).toBe('  • \n  • ');
    });

    it('should parse code blocks', () => {
      const nodes = [
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'console.log("hello");' }],
        },
      ];

      expect(parseADF(nodes)).toBe('\n```\nconsole.log("hello");\n```\n');
    });

    it('should handle empty code blocks', () => {
      const nodes = [{ type: 'codeBlock' }, { type: 'codeBlock', content: [] }];

      expect(parseADF(nodes)).toBe('\n```\n\n```\n');
    });

    it('should parse headings with different levels', () => {
      const nodes = [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Main Title' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Subtitle' }],
        },
        {
          type: 'heading', // default level should be 1
          content: [{ type: 'text', text: 'Default Level' }],
        },
      ];

      expect(parseADF(nodes)).toBe('\n# Main Title\n\n### Subtitle\n\n# Default Level\n');
    });

    it('should handle headings with invalid level attrs', () => {
      const nodes = [
        {
          type: 'heading',
          attrs: { level: 'invalid' },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'heading',
          attrs: {},
          content: [{ type: 'text', text: 'No Level' }],
        },
      ];

      expect(parseADF(nodes)).toBe('\n# Title\n\n# No Level\n');
    });

    it('should parse blockquotes', () => {
      const nodes = [
        {
          type: 'blockquote',
          content: [{ type: 'text', text: 'This is a quote' }],
        },
      ];

      expect(parseADF(nodes)).toBe('\n> This is a quote\n');
    });

    it('should handle empty blockquotes', () => {
      const nodes = [{ type: 'blockquote' }, { type: 'blockquote', content: [] }];

      expect(parseADF(nodes)).toBe('\n> \n');
    });

    it('should parse horizontal rules', () => {
      const nodes = [{ type: 'text', text: 'Above' }, { type: 'rule' }, { type: 'text', text: 'Below' }];

      expect(parseADF(nodes)).toBe('Above\n---\nBelow');
    });

    it('should parse links', () => {
      const nodes = [
        {
          type: 'link',
          attrs: { href: 'https://example.com' },
          content: [{ type: 'text', text: 'Example Link' }],
        },
        { type: 'text', text: ' and ' },
        {
          type: 'link',
          attrs: { href: 'https://test.com' },
          // no content, should use href as text
        },
      ];

      expect(parseADF(nodes)).toBe('[Example Link](https://example.com) and [https://test.com](https://test.com)');
    });

    it('should handle links with missing or invalid href', () => {
      const nodes = [
        {
          type: 'link',
          content: [{ type: 'text', text: 'No href' }],
        },
        {
          type: 'link',
          attrs: {},
          content: [{ type: 'text', text: 'Empty attrs' }],
        },
      ];

      expect(parseADF(nodes)).toBe('[No href](#)[Empty attrs](#)');
    });

    it('should handle unknown node types gracefully', () => {
      const nodes = [
        { type: 'unknown', content: [{ type: 'text', text: 'nested text' }] },
        { type: 'another-unknown', text: 'some text' },
        { type: 'text', text: 'normal text' },
      ];

      expect(parseADF(nodes)).toBe('nested textnormal text');
    });

    it('should handle complex nested structures', () => {
      const nodes = [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Start ' },
            {
              type: 'link',
              attrs: { href: 'https://jira.com' },
              content: [{ type: 'text', text: 'JIRA-123' }],
            },
            { type: 'text', text: ' end.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'text', text: 'Item with ' },
                { type: 'mention', attrs: { text: 'user' } },
              ],
            },
          ],
        },
      ];

      expect(parseADF(nodes)).toBe('Start [JIRA-123](https://jira.com) end.\n  • Item with @user');
    });
  });

  describe('getJiraStatusIcon', () => {
    describe('done/completed statuses', () => {
      it('should return ✅ for done statuses', () => {
        expect(getJiraStatusIcon('Done')).toBe('✅');
        expect(getJiraStatusIcon('DONE')).toBe('✅');
        expect(getJiraStatusIcon('done')).toBe('✅');
        expect(getJiraStatusIcon('Task Done')).toBe('✅');
      });

      it('should return ✅ for closed statuses', () => {
        expect(getJiraStatusIcon('Closed')).toBe('✅');
        expect(getJiraStatusIcon('CLOSED')).toBe('✅');
        expect(getJiraStatusIcon('Issue Closed')).toBe('✅');
      });

      it('should return ✅ for resolved statuses', () => {
        expect(getJiraStatusIcon('Resolved')).toBe('✅');
        expect(getJiraStatusIcon('RESOLVED')).toBe('✅');
        expect(getJiraStatusIcon('Bug Resolved')).toBe('✅');
      });
    });

    describe('in progress/review statuses', () => {
      it('should return 🔄 for progress statuses', () => {
        expect(getJiraStatusIcon('In Progress')).toBe('🔄');
        expect(getJiraStatusIcon('IN PROGRESS')).toBe('🔄');
        expect(getJiraStatusIcon('Work in Progress')).toBe('🔄');
        expect(getJiraStatusIcon('Development in Progress')).toBe('🔄');
      });

      it('should return 🔄 for review statuses', () => {
        expect(getJiraStatusIcon('In Review')).toBe('🔄');
        expect(getJiraStatusIcon('Code Review')).toBe('🔄');
        expect(getJiraStatusIcon('REVIEW')).toBe('🔄');
        expect(getJiraStatusIcon('Peer Review')).toBe('🔄');
      });
    });

    describe('blocked statuses', () => {
      it('should return 🚫 for blocked statuses', () => {
        expect(getJiraStatusIcon('Blocked')).toBe('🚫');
        expect(getJiraStatusIcon('BLOCKED')).toBe('🚫');
        expect(getJiraStatusIcon('Task Blocked')).toBe('🚫');
        expect(getJiraStatusIcon('Temporarily Blocked')).toBe('🚫');
      });
    });

    describe('todo/open/backlog statuses', () => {
      it('should return 📋 for todo statuses', () => {
        expect(getJiraStatusIcon('Todo')).toBe('📋');
        expect(getJiraStatusIcon('TODO')).toBe('📋');
        expect(getJiraStatusIcon('Task Todo')).toBe('📋');
        // "To Do" with space won't match because it looks for "todo" without space
        expect(getJiraStatusIcon('To Do')).toBe('❓');
      });

      it('should return 📋 for open statuses', () => {
        expect(getJiraStatusIcon('Open')).toBe('📋');
        expect(getJiraStatusIcon('OPEN')).toBe('📋');
        expect(getJiraStatusIcon('Issue Open')).toBe('📋');
      });

      it('should return 📋 for backlog statuses', () => {
        expect(getJiraStatusIcon('Backlog')).toBe('📋');
        expect(getJiraStatusIcon('BACKLOG')).toBe('📋');
        expect(getJiraStatusIcon('Product Backlog')).toBe('📋');
      });
    });

    describe('unknown/custom statuses', () => {
      it('should return ❓ for unknown statuses', () => {
        expect(getJiraStatusIcon('Custom Status')).toBe('❓');
        expect(getJiraStatusIcon('Weird State')).toBe('❓');
        expect(getJiraStatusIcon('')).toBe('❓');
        expect(getJiraStatusIcon('   ')).toBe('❓');
        expect(getJiraStatusIcon('New')).toBe('❓');
        expect(getJiraStatusIcon('Assigned')).toBe('❓');
      });
    });

    describe('edge cases', () => {
      it('should handle mixed case and partial matches', () => {
        expect(getJiraStatusIcon('DoNe')).toBe('✅');
        expect(getJiraStatusIcon('in-progress')).toBe('🔄');
        expect(getJiraStatusIcon('not-blocked')).toBe('🚫'); // contains 'blocked'
        expect(getJiraStatusIcon('todoist')).toBe('📋'); // contains 'todo'
      });

      it('should prioritize first matching pattern', () => {
        // 'done' appears before 'progress' in the status string, should match 'done'
        expect(getJiraStatusIcon('done in progress')).toBe('✅');
        // 'blocked' appears before 'todo', should match 'blocked'
        expect(getJiraStatusIcon('blocked todo item')).toBe('🚫');
      });
    });
  });
});
