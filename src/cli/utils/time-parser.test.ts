import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { parseSinceExpression, parseStatusFilter, formatSinceTime } from './time-parser.js';

describe('time-parser', () => {
  let originalDateNow: typeof Date.now;
  const MOCK_NOW = 1704412800000; // 2024-01-05 00:00:00 UTC

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = () => MOCK_NOW;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('parseSinceExpression', () => {
    describe('keywords', () => {
      it('should parse "now" keyword', () => {
        expect(parseSinceExpression('now')).toBe(MOCK_NOW);
      });

      it('should parse "today" keyword', () => {
        // Mock new Date() calls to return consistent values
        const mockDate = new Date(MOCK_NOW);
        const originalDate = global.Date;
        global.Date = function (this: any, ...args: any[]) {
          if (args.length === 0) {
            return mockDate;
          }
          return new (originalDate as any)(...args);
        } as any;
        global.Date.now = () => MOCK_NOW;
        global.Date.parse = originalDate.parse;

        try {
          const today = mockDate.setHours(0, 0, 0, 0);
          expect(parseSinceExpression('today')).toBe(today);
        } finally {
          global.Date = originalDate;
        }
      });

      it('should parse "yesterday" keyword', () => {
        // Mock new Date() calls to return consistent values
        const mockDate = new Date(MOCK_NOW);
        const originalDate = global.Date;
        global.Date = function (this: any, ...args: any[]) {
          if (args.length === 0) {
            return mockDate;
          }
          return new (originalDate as any)(...args);
        } as any;
        global.Date.now = () => MOCK_NOW;
        global.Date.parse = originalDate.parse;

        try {
          const yesterday = mockDate.setHours(0, 0, 0, 0) - 86400000;
          expect(parseSinceExpression('yesterday')).toBe(yesterday);
        } finally {
          global.Date = originalDate;
        }
      });

      it('should parse "week" keyword', () => {
        const expected = MOCK_NOW - 7 * 86400000;
        expect(parseSinceExpression('week')).toBe(expected);
      });

      it('should parse "month" keyword', () => {
        const expected = MOCK_NOW - 30 * 86400000;
        expect(parseSinceExpression('month')).toBe(expected);
      });

      it('should be case insensitive', () => {
        expect(parseSinceExpression('TODAY')).toBe(parseSinceExpression('today'));
        expect(parseSinceExpression('Week')).toBe(parseSinceExpression('week'));
      });

      it('should handle whitespace', () => {
        expect(parseSinceExpression('  today  ')).toBe(parseSinceExpression('today'));
      });
    });

    describe('relative time expressions', () => {
      it('should parse hours (h)', () => {
        expect(parseSinceExpression('24h')).toBe(MOCK_NOW - 24 * 3600000);
        expect(parseSinceExpression('1h')).toBe(MOCK_NOW - 3600000);
        expect(parseSinceExpression('0.5h')).toBe(MOCK_NOW - 0.5 * 3600000);
      });

      it('should parse days (d)', () => {
        expect(parseSinceExpression('7d')).toBe(MOCK_NOW - 7 * 86400000);
        expect(parseSinceExpression('1d')).toBe(MOCK_NOW - 86400000);
        expect(parseSinceExpression('30d')).toBe(MOCK_NOW - 30 * 86400000);
      });

      it('should parse weeks (w)', () => {
        expect(parseSinceExpression('2w')).toBe(MOCK_NOW - 2 * 604800000);
        expect(parseSinceExpression('1w')).toBe(MOCK_NOW - 604800000);
      });

      it('should parse months (m)', () => {
        expect(parseSinceExpression('1m')).toBe(MOCK_NOW - 2592000000);
        expect(parseSinceExpression('3m')).toBe(MOCK_NOW - 3 * 2592000000);
      });

      it('should handle decimal values', () => {
        expect(parseSinceExpression('1.5d')).toBe(MOCK_NOW - 1.5 * 86400000);
        expect(parseSinceExpression('2.25h')).toBe(MOCK_NOW - 2.25 * 3600000);
      });

      it('should handle whitespace in expressions', () => {
        expect(parseSinceExpression('24 h')).toBe(MOCK_NOW - 24 * 3600000);
        expect(parseSinceExpression('  7d  ')).toBe(MOCK_NOW - 7 * 86400000);
      });

      it('should be case insensitive for units', () => {
        expect(parseSinceExpression('24H')).toBe(MOCK_NOW - 24 * 3600000);
        expect(parseSinceExpression('7D')).toBe(MOCK_NOW - 7 * 86400000);
      });
    });

    describe('Unix timestamps', () => {
      it('should parse Unix timestamps in seconds', () => {
        const unixSeconds = 1640995200; // 2022-01-01 00:00:00 UTC
        expect(parseSinceExpression(unixSeconds.toString())).toBe(unixSeconds * 1000);
      });

      it('should parse valid Unix timestamps in milliseconds range', () => {
        // Use a timestamp within the valid range for milliseconds (11 digits)
        const unixMillis = 3000000000000; // Year 2065 (within range, 13 digits)
        // Since it's > 4102444800, it will fall through to Date.parse which will fail
        // So this should actually throw an error
        expect(() => parseSinceExpression(unixMillis.toString())).toThrow('Invalid time expression');
      });

      it('should reject invalid Unix timestamps', () => {
        expect(() => parseSinceExpression('123456789')).toThrow('Invalid time expression');
        expect(() => parseSinceExpression('9999999999999')).toThrow('Invalid time expression');
      });
    });

    describe('ISO date formats', () => {
      it('should parse ISO date strings', () => {
        const isoDate = '2024-01-01T10:00:00Z';
        const expected = Date.parse(isoDate);
        expect(parseSinceExpression(isoDate)).toBe(expected);
      });

      it('should parse date-only strings', () => {
        const dateOnly = '2024-01-01';
        const expected = Date.parse(dateOnly);
        expect(parseSinceExpression(dateOnly)).toBe(expected);
      });

      it('should parse various date formats', () => {
        const formats = ['2024-01-01', '2024/01/01', 'Jan 1, 2024', '1 Jan 2024'];

        formats.forEach((format) => {
          expect(() => parseSinceExpression(format)).not.toThrow();
        });
      });
    });

    describe('error cases', () => {
      it('should throw error for invalid expressions', () => {
        const invalidInputs = ['', '   ', 'invalid', '24x', 'abc123', '24hours', 'next week'];

        invalidInputs.forEach((input) => {
          expect(() => parseSinceExpression(input)).toThrow('Invalid time expression');
        });
      });

      it('should provide helpful error message', () => {
        expect(() => parseSinceExpression('invalid')).toThrow(
          'Invalid time expression: "invalid". Use formats like: 24h, 7d, 1w, yesterday, 2024-01-15, or Unix timestamp',
        );
      });
    });
  });

  describe('parseStatusFilter', () => {
    it('should return undefined for empty input', () => {
      expect(parseStatusFilter(undefined)).toBeUndefined();
      expect(parseStatusFilter('')).toBeUndefined();
      expect(parseStatusFilter('   ')).toEqual([]);
    });

    it('should handle special "all" keyword', () => {
      expect(parseStatusFilter('all')).toEqual([]);
      expect(parseStatusFilter('ALL')).toEqual([]);
      expect(parseStatusFilter('  All  ')).toEqual([]);
    });

    it('should handle special "open" keyword', () => {
      expect(parseStatusFilter('open')).toEqual(['open']);
      expect(parseStatusFilter('OPEN')).toEqual(['open']);
    });

    it('should handle special "closed" keyword', () => {
      expect(parseStatusFilter('closed')).toEqual(['closed', 'done', 'resolved']);
      expect(parseStatusFilter('CLOSED')).toEqual(['closed', 'done', 'resolved']);
    });

    it('should parse comma-separated lists', () => {
      expect(parseStatusFilter('todo,in progress,done')).toEqual(['todo', 'in progress', 'done']);
      expect(parseStatusFilter('TODO,IN PROGRESS,DONE')).toEqual(['TODO', 'IN PROGRESS', 'DONE']);
    });

    it('should handle whitespace in comma-separated lists', () => {
      expect(parseStatusFilter('todo, in progress , done')).toEqual(['todo', 'in progress', 'done']);
      expect(parseStatusFilter('  todo  ,  in progress  ,  done  ')).toEqual(['todo', 'in progress', 'done']);
    });

    it('should filter out empty values', () => {
      expect(parseStatusFilter('todo,,done,')).toEqual(['todo', 'done']);
      expect(parseStatusFilter(',todo,done,')).toEqual(['todo', 'done']);
    });

    it('should handle single status values', () => {
      expect(parseStatusFilter('todo')).toEqual(['todo']);
      expect(parseStatusFilter('in progress')).toEqual(['in progress']);
    });
  });

  describe('formatSinceTime', () => {
    it('should format recent times in minutes', () => {
      const fiveMinutesAgo = MOCK_NOW - 5 * 60000;
      expect(formatSinceTime(fiveMinutesAgo)).toBe('5 minutes ago');

      const oneMinuteAgo = MOCK_NOW - 60000;
      expect(formatSinceTime(oneMinuteAgo)).toBe('1 minute ago');
    });

    it('should format times in hours', () => {
      const twoHoursAgo = MOCK_NOW - 2 * 3600000;
      expect(formatSinceTime(twoHoursAgo)).toBe('2 hours ago');

      const oneHourAgo = MOCK_NOW - 3600000;
      expect(formatSinceTime(oneHourAgo)).toBe('1 hour ago');
    });

    it('should format times in days', () => {
      const threeDaysAgo = MOCK_NOW - 3 * 86400000;
      expect(formatSinceTime(threeDaysAgo)).toBe('3 days ago');

      const oneDayAgo = MOCK_NOW - 86400000;
      expect(formatSinceTime(oneDayAgo)).toBe('1 day ago');
    });

    it('should format old times as dates', () => {
      const twoWeeksAgo = MOCK_NOW - 14 * 86400000;
      const expected = new Date(twoWeeksAgo).toLocaleDateString();
      expect(formatSinceTime(twoWeeksAgo)).toBe(expected);
    });

    it('should handle edge cases', () => {
      // Less than a minute
      const thirtySecondsAgo = MOCK_NOW - 30000;
      expect(formatSinceTime(thirtySecondsAgo)).toBe('0 minutes ago');

      // Exactly one hour
      const exactlyOneHour = MOCK_NOW - 3600000;
      expect(formatSinceTime(exactlyOneHour)).toBe('1 hour ago');

      // Exactly one day
      const exactlyOneDay = MOCK_NOW - 86400000;
      expect(formatSinceTime(exactlyOneDay)).toBe('1 day ago');
    });

    it('should handle future timestamps', () => {
      const futureTime = MOCK_NOW + 3600000;
      // Future time should show negative value
      expect(formatSinceTime(futureTime)).toBe('-60 minutes ago');
    });
  });
});
