/**
 * Tool Registration Module
 * Centralizes registration of all tools with the MCP server
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerCreateFileTool } from './createFile.js';
import { registerEnsureDirExistsTool } from './ensureDirExists.js';
import { registerGetRepositoriesTool } from './getRepositories.js';
import { registerReadFileTool } from './readFile.js';
import { registerRepoTreeTool } from './repoTree.js';
import { registerSearchFilesTool } from './searchFiles.js';
import { registerUpdateFileTool } from './updateFile.js';

/**
 * Register all tools with the MCP server
 * @param server The MCP server instance
 */
export function registerAllTools(server: McpServer): void {
  // Register repository and file system tools
  registerGetRepositoriesTool(server);
  registerRepoTreeTool(server);
  registerReadFileTool(server);
  registerSearchFilesTool(server);
  registerCreateFileTool(server);
  registerUpdateFileTool(server);
  registerEnsureDirExistsTool(server);
  
  console.error('Tool registration complete');
}
