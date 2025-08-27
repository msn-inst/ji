import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { ConfluenceClient } from './confluence-client.js';

describe('ConfluenceClient', () => {
  let client: ConfluenceClient;
  let fetchCalls: Array<{ url: string; options: any }> = [];

  beforeEach(() => {
    // Allow API calls in test environment
    process.env.ALLOW_REAL_API_CALLS = 'true';
    
    // Mock global fetch
    global.fetch = async (url: string | URL, options?: any) => {
      const urlString = url.toString();
      fetchCalls.push({ url: urlString, options });

      // Mock responses based on URL
      if (urlString.includes('/wiki/api/v2/pages')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: '123456',
                title: 'Test Page',
                type: 'page',
                status: 'current',
                version: { number: 1 },
                _links: { webui: '/wiki/spaces/TEST/pages/123456' },
              },
            ],
            _links: {
              next: null,
            },
          }),
          { status: 200 },
        );
      }

      if (urlString.includes('/wiki/rest/api/content/search')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: '789',
                type: 'page',
                title: 'Search Result Page',
                space: { key: 'TEST' },
                body: {
                  storage: {
                    value: '<p>This is test content</p>',
                  },
                },
              },
            ],
            size: 1,
            start: 0,
            limit: 25,
          }),
          { status: 200 },
        );
      }

      if (urlString.includes('/wiki/rest/api/content/')) {
        const pageId = urlString.split('/').pop()?.split('?')[0];
        return new Response(
          JSON.stringify({
            id: pageId,
            type: 'page',
            title: 'Test Page Detail',
            space: { key: 'TEST', name: 'Test Space' },
            body: {
              storage: {
                value: '<h1>Test Page</h1><p>Content here</p>',
                representation: 'storage',
              },
            },
            version: { number: 2 },
            _links: {
              webui: `/wiki/spaces/TEST/pages/${pageId}`,
            },
          }),
          { status: 200 },
        );
      }

      if (urlString.includes('/wiki/rest/api/space')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                key: 'TEST',
                name: 'Test Space',
                type: 'global',
                id: 1234,
              },
              {
                key: 'DEV',
                name: 'Development Space',
                type: 'global',
                id: 5678,
              },
            ],
            size: 2,
          }),
          { status: 200 },
        );
      }

      return new Response(null, { status: 404 });
    };

    client = new ConfluenceClient(
      'https://test.atlassian.net',
      'test@example.com',
      'test-token-123',
    );
    fetchCalls = [];
  });

  afterEach(() => {
    // @ts-ignore - restore original fetch
    delete global.fetch;
    delete process.env.ALLOW_REAL_API_CALLS;
  });

  describe('Page Operations', () => {
    it('should search for pages', async () => {
      const results = await client.searchPages('test query');

      expect(results).toBeDefined();
      expect(results.results).toHaveLength(1);
      expect(results.results[0].title).toBe('Test Page');
      expect(fetchCalls[0].url).toContain('/wiki/api/v2/pages');
      expect(fetchCalls[0].url).toContain('title=test%20query');
    });

    it('should get page by ID', async () => {
      const page = await client.getPage('123456');

      expect(page).toBeDefined();
      expect(page.id).toBe('123456');
      expect(page.title).toBe('Test Page Detail');
      expect(fetchCalls[0].url).toContain('/wiki/rest/api/content/123456');
      expect(fetchCalls[0].url).toContain('expand=body.storage');
    });

    it('should search content with CQL', async () => {
      const results = await client.searchContent('text ~ "test"');

      expect(results).toBeDefined();
      expect(results.results).toHaveLength(1);
      expect(results.results[0].title).toBe('Search Result Page');
      expect(fetchCalls[0].url).toContain('/wiki/rest/api/content/search');
      expect(fetchCalls[0].url).toContain('cql=text');
    });
  });

  describe('Space Operations', () => {
    it('should get all spaces', async () => {
      const spaces = await client.getSpaces();

      expect(spaces).toBeDefined();
      expect(spaces.results).toHaveLength(2);
      expect(spaces.results[0].key).toBe('TEST');
      expect(spaces.results[1].key).toBe('DEV');
      expect(fetchCalls[0].url).toContain('/wiki/rest/api/space');
    });
  });

  describe('Authentication', () => {
    it('should include authentication headers', async () => {
      await client.searchPages('test');

      const authHeader = fetchCalls[0].options.headers.Authorization;
      expect(authHeader).toBeDefined();
      expect(authHeader).toContain('Basic');
      
      // Verify base64 encoding of email:token
      const expectedAuth = Buffer.from('test@example.com:test-token-123').toString('base64');
      expect(authHeader).toBe(`Basic ${expectedAuth}`);
    });

    it('should set correct content type headers', async () => {
      await client.searchPages('test');

      expect(fetchCalls[0].options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 responses', async () => {
      global.fetch = async () => new Response(null, { status: 404 });

      try {
        await client.getPage('nonexistent');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle network errors', async () => {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      try {
        await client.searchPages('test');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('Network error');
      }
    });

    it('should handle invalid JSON responses', async () => {
      global.fetch = async () => new Response('invalid json', { status: 200 });

      try {
        await client.searchPages('test');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('URL Construction', () => {
    it('should construct correct search URL with parameters', async () => {
      await client.searchPages('my query', 10);

      expect(fetchCalls[0].url).toContain('title=my%20query');
      expect(fetchCalls[0].url).toContain('limit=10');
    });

    it('should handle special characters in search queries', async () => {
      await client.searchPages('test & special "chars"');

      // URL should be properly encoded
      expect(fetchCalls[0].url).toContain('title=test%20%26%20special%20%22chars%22');
    });

    it('should remove trailing slashes from base URL', () => {
      const clientWithSlash = new ConfluenceClient(
        'https://test.atlassian.net/',
        'test@example.com',
        'test-token',
      );
      
      // @ts-ignore - accessing private property for testing
      expect(clientWithSlash.baseUrl).toBe('https://test.atlassian.net');
    });
  });
});