/**
 * Prompt Registration Module
 * Centralizes registration of all prompts with the MCP server
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Import all prompt registrations
import { registerBasicPrompt } from './basicPrompt.js';

/**
 * Register all prompts with the MCP server
 * @param server The MCP server instance
 */
export function registerAllPrompts(server: McpServer): void {
  const promptRegistrations = [{ register: registerBasicPrompt, name: 'Basic' }];

  // Register each prompt with error handling
  for (const { register, name } of promptRegistrations) {
    try {
      register(server);
      console.error(`${name} prompt registered successfully`);
    } catch (error) {
      console.error(`Error registering ${name} prompt:`, error);
    }
  }
}
