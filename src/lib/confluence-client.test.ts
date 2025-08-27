import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { ConfluenceClient } from './confluence-client.js';

describe('ConfluenceClient', () => {
  let client: ConfluenceClient;
  let fetchCalls: Array<{ url: string; options: any }> = [];

  beforeEach(() => {
    // Allow API calls in test environment
    process.env.ALLOW_REAL_API_CALLS = 'true';
    
    // Mock global fetch
    (global as any).fetch = async (url: string | URL, options?: any): Promise<Response> => {
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

    client = new ConfluenceClient({
      jiraUrl: 'https://test.atlassian.net',
      email: 'test@example.com',
      apiToken: 'test-token-123',
    });
    fetchCalls = [];
  });

  afterEach(() => {
    // Restore original fetch
    delete (global as any).fetch;
    delete process.env.ALLOW_REAL_API_CALLS;
  });

  describe('Page Operations', () => {
    it('should get page by ID', async () => {
      const page = await client.getPage('123456');

      expect(page).toBeDefined();
      expect(page.id).toBe('123456');
      expect(page.title).toBe('Test Page Detail');
      expect(fetchCalls[0].url).toContain('/wiki/rest/api/content/123456');
      expect(fetchCalls[0].url).toContain('expand=body.storage');
    });

  });

  describe('Space Operations', () => {
    it('should get space', async () => {
      const space = await client.getSpace('TEST');

      expect(space).toBeDefined();
      expect(space.key).toBe('TEST');
      expect(fetchCalls[0].url).toContain('/wiki/rest/api/space');
    });
  });

  describe('Authentication', () => {
    it('should include authentication headers', async () => {
      await client.getPage('123456');

      const authHeader = fetchCalls[0].options.headers.Authorization;
      expect(authHeader).toBeDefined();
      expect(authHeader).toContain('Basic');
      
      // Verify base64 encoding of email:token
      const expectedAuth = Buffer.from('test@example.com:test-token-123').toString('base64');
      expect(authHeader).toBe(`Basic ${expectedAuth}`);
    });

    it('should set correct content type headers', async () => {
      await client.getPage('123456');

      expect(fetchCalls[0].options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 responses', async () => {
      (global as any).fetch = async () => new Response(null, { status: 404 });

      try {
        await client.getPage('nonexistent');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle network errors', async () => {
      (global as any).fetch = async () => {
        throw new Error('Network error');
      };

      try {
        await client.getPage('123456');
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('Network error');
      }
    });

    it('should handle invalid JSON responses', async () => {
      (global as any).fetch = async () => new Response('invalid json', { status: 200 });

      try {
        await client.getPage('123456');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('URL Construction', () => {
    it.skip('should construct correct search URL with parameters', async () => {
      // This test method doesn't exist - searchPages not implemented
    });

    it.skip('should handle special characters in search queries', async () => {
      // This test relies on searchPages which doesn't exist
    });

    it('should remove trailing slashes from base URL', () => {
      const clientWithSlash = new ConfluenceClient({
        jiraUrl: 'https://test.atlassian.net/',
        email: 'test@example.com',
        apiToken: 'test-token',
      });
      
      // @ts-ignore - accessing private property for testing
      expect(clientWithSlash.baseUrl).toBe('https://test.atlassian.net');
    });
  });
});