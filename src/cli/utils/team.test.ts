import { describe, expect, it } from 'bun:test';
import { getTeamFromMetadata } from './team.js';

describe('team utilities', () => {
  describe('getTeamFromMetadata', () => {
    it('should extract team from spaceName in metadata', () => {
      const content = {
        metadata: {
          spaceName: 'Engineering Team',
        },
      };

      expect(getTeamFromMetadata(content)).toBe('Engineering Team');
    });

    it('should extract team from assignee in metadata', () => {
      const content = {
        metadata: {
          assignee: 'john.doe@company.com',
        },
      };

      expect(getTeamFromMetadata(content)).toBe('john.doe');
    });

    it('should extract team from spaceKey when metadata is not available', () => {
      const content = {
        spaceKey: 'PROJ',
      };

      expect(getTeamFromMetadata(content)).toBe('PROJ');
    });

    it('should prioritize spaceName over assignee', () => {
      const content = {
        metadata: {
          spaceName: 'Design Team',
          assignee: 'jane.smith@company.com',
        },
      };

      expect(getTeamFromMetadata(content)).toBe('Design Team');
    });

    it('should prioritize spaceName over spaceKey', () => {
      const content = {
        metadata: {
          spaceName: 'Product Team',
        },
        spaceKey: 'PROD',
      };

      expect(getTeamFromMetadata(content)).toBe('Product Team');
    });

    it('should prioritize assignee over spaceKey', () => {
      const content = {
        metadata: {
          assignee: 'dev.team@company.com',
        },
        spaceKey: 'DEV',
      };

      expect(getTeamFromMetadata(content)).toBe('dev.team');
    });

    it('should handle assignee without @ symbol', () => {
      const content = {
        metadata: {
          assignee: 'username',
        },
      };

      expect(getTeamFromMetadata(content)).toBe('username');
    });

    it('should handle assignee with multiple @ symbols', () => {
      const content = {
        metadata: {
          assignee: 'user@company@domain.com',
        },
      };

      // Should split on first @ and take the first part
      expect(getTeamFromMetadata(content)).toBe('user');
    });

    it('should return "Unknown" when no valid team information is available', () => {
      const content = {};
      expect(getTeamFromMetadata(content)).toBe('Unknown');
    });

    it('should return "Unknown" when metadata exists but has no team info', () => {
      const content = {
        metadata: {
          someOtherField: 'value',
        },
      };

      expect(getTeamFromMetadata(content)).toBe('Unknown');
    });

    it('should handle null metadata', () => {
      const content = {
        metadata: null as any, // TypeScript workaround for test
      };

      expect(getTeamFromMetadata(content)).toBe('Unknown');
    });

    it('should handle undefined metadata', () => {
      const content = {
        metadata: undefined,
      };

      expect(getTeamFromMetadata(content)).toBe('Unknown');
    });

    it('should handle non-string spaceName', () => {
      const content = {
        metadata: {
          spaceName: 123,
        },
      };

      expect(getTeamFromMetadata(content)).toBe('Unknown');
    });

    it('should handle non-string assignee', () => {
      const content = {
        metadata: {
          assignee: { name: 'John Doe' },
        },
      };

      expect(getTeamFromMetadata(content)).toBe('Unknown');
    });

    it('should handle empty strings', () => {
      const content = {
        metadata: {
          spaceName: '',
          assignee: '',
        },
        spaceKey: '',
      };

      // Empty string is falsy, so it will skip spaceName and assignee, and also skip empty spaceKey
      expect(getTeamFromMetadata(content)).toBe('Unknown');
    });

    it('should handle whitespace-only strings', () => {
      const content = {
        metadata: {
          spaceName: '   ',
          assignee: '  \t  ',
        },
      };

      // Should return the whitespace string as-is (no trimming)
      expect(getTeamFromMetadata(content)).toBe('   ');
    });

    it('should handle complex assignee email formats', () => {
      const testCases = [
        {
          assignee: 'first.last@company.co.uk',
          expected: 'first.last',
        },
        {
          assignee: 'user+tag@domain.com',
          expected: 'user+tag',
        },
        {
          assignee: 'user-name@sub.domain.org',
          expected: 'user-name',
        },
        {
          assignee: 'user_123@example.io',
          expected: 'user_123',
        },
      ];

      testCases.forEach(({ assignee, expected }) => {
        const content = {
          metadata: { assignee },
        };
        expect(getTeamFromMetadata(content)).toBe(expected);
      });
    });

    it('should handle mixed case and special characters in spaceName', () => {
      const testCases = [
        'Engineering Team',
        'MARKETING',
        'qa-team',
        'Design & UX',
        'Product/Strategy',
        '中文团队', // Unicode characters
        'Team 123',
        'R&D (Research)',
      ];

      testCases.forEach((spaceName) => {
        const content = {
          metadata: { spaceName },
        };
        expect(getTeamFromMetadata(content)).toBe(spaceName);
      });
    });

    it('should work with minimal content objects', () => {
      const testCases = [
        { spaceKey: 'TEAM1' },
        { metadata: { spaceName: 'Team2' } },
        { metadata: { assignee: 'user@example.com' } },
      ];

      const expectedResults = ['TEAM1', 'Team2', 'user'];

      testCases.forEach((content, index) => {
        expect(getTeamFromMetadata(content)).toBe(expectedResults[index]);
      });
    });

    it('should handle complex nested metadata structures', () => {
      const content = {
        metadata: {
          spaceName: 'Main Team',
          assignee: 'backup@company.com',
          nested: {
            someField: 'value',
          },
          array: [1, 2, 3],
        },
        spaceKey: 'BACKUP',
        otherField: 'ignored',
      };

      expect(getTeamFromMetadata(content)).toBe('Main Team');
    });
  });
});
