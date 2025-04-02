/**
 * Ensure Directory Exists Tool
 * A tool for creating directories in the repository if they don't already exist
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs/promises';
import { z } from 'zod';

import { resolveToAbsolutePath, validatePathForTool } from '../utils/path-handler.js';

/**
 * Register the ensure directory exists tool with the MCP server
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerEnsureDirExistsTool(server: McpServer): void {
  server.tool(
    'ensure-dir-exists',
    'Creates a directory if it does not already exist',
    {
      path: z.string().describe('Path to the directory to create, relative to repo root'),
      mode: z.number().optional().describe('Permission mode (default: 0o755, i.e., rwxr-xr-x)'),
      recursive: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to create parent directories if they do not exist'),
    },
    async ({ path: dirPath, mode, recursive }) => {
      try {
        // Validate path format
        if (dirPath.startsWith('/')) {
          const pathValidation = validatePathForTool(dirPath, 'ensure-dir-exists');
          if (!pathValidation.isValid) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: pathValidation.errorMessage || 'Invalid path format',
                },
              ],
            };
          }
        }

        // Get full path
        const fullPath = resolveToAbsolutePath(dirPath);

        // Check if directory already exists
        let dirExists = false;
        try {
          const stats = await fs.stat(fullPath);
          dirExists = stats.isDirectory();

          if (!dirExists) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: Path '${dirPath}' exists but is not a directory.`,
                },
              ],
              isError: true,
            };
          }
        } catch {
          // Directory doesn't exist, which is expected and will be created
          // No need to log here, this is expected behavior
        }

        if (dirExists) {
          return {
            content: [
              {
                type: 'text',
                text: `Directory already exists: ${dirPath}`,
              },
            ],
          };
        }

        // Create the directory
        try {
          // Use the provided mode or default to 0o755 (rwxr-xr-x)
          const dirMode = mode !== undefined ? mode : 0o755;
          await fs.mkdir(fullPath, { recursive, mode: dirMode });

          return {
            content: [
              {
                type: 'text',
                text: `Successfully created directory: ${dirPath}`,
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: `Error creating directory '${dirPath}': ${(err as Error).message}`,
              },
            ],
            isError: true,
          };
        }
      } catch (err) {
        console.error('Error in ensureDirExists tool:', err);
        return {
          content: [
            {
              type: 'text',
              text: `Error ensuring directory exists '${dirPath}': ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
