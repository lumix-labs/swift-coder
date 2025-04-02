/**
 * Basic Prompt
 *
 * Provides a simple starting point for the Swift Coder MCP server.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Register the Basic Prompt with the MCP server
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerBasicPrompt(server: McpServer): void {
  server.prompt(
    'basic-prompt', // Prompt name
    'A simple starting point for Swift Coder MCP server', // Description
    {}, // No parameters needed
    () => {
      const basicInstructions = `# Swift Coder MCP Server

Work begins here.

You are now connected to the Swift Coder MCP server, which provides context and tools for working with the swift-coder repository.

You can use this server to:
- Explore the repository structure
- Read and write files
- Execute commands
- And more!

Get started by exploring the available tools and repository structure.
`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: basicInstructions,
            },
          },
        ],
      };
    }
  );
}
