/**
 * Swift Coder MCP Server
 * Main entry point for the Model Context Protocol server for swift-coder repository
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import registration modules
import { registerAllPrompts } from './prompts/registerPrompts.js';
import { registerAllTools } from './tools/registerTools.js';
import { moduleManager } from './utils/moduleManager.js';
import { repoManager } from './utils/repoManager.js';

/**
 * Helper function to write to stderr safely
 * @param {string} message - Message to log
 */
function logToStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Initialize and start the MCP server
 * @returns {Promise<void>} Promise that resolves when server initialization is complete
 */
async function main(): Promise<void> {
  try {
    logToStderr('Starting Swift Coder MCP Server...');

    // Create the MCP server
    const server = new McpServer({
      name: 'swift-code-context-server',
      version: '1.0.0',
    });

    // Auto-detect repositories and modules
    try {
      const repos = await repoManager.getAllRepositories();
      logToStderr(`Loaded ${repos.length} repositories`);
      
      // If moduleManager exists, auto-detect modules
      if (moduleManager && typeof moduleManager.autoDetectAllModules === 'function') {
        const modulesCount = await moduleManager.autoDetectAllModules();
        logToStderr(`Detected ${modulesCount} modules across all repositories`);
      }
    } catch (error) {
      logToStderr(`Warning: Could not auto-detect repositories and modules: ${error}`);
    }

    // Register all components
    registerAllTools(server);
    registerAllPrompts(server);

    // Start the server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logToStderr('Swift Coder MCP Server started successfully');

    // Final confirmation of working directory
    logToStderr(`Server running with working directory: ${process.cwd()}`);
  } catch (error) {
    logToStderr(`Error starting MCP server: ${error}`);
    process.exit(1);
  }
}

// Run the server
main();
