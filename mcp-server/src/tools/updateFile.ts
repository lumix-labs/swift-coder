/**
 * Tool for updating file content
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';

import { resolveToAbsolutePath } from '../utils/path-handler.js';

/**
 * Schema properties for the update-file tool
 */
const updateFileSchemaProps = {
  path: z.string().describe('REQUIRED: Target file path in format: /repoId/path/to/file'),
  content: z.string().describe('REQUIRED: New file content'),
  createIfMissing: z
    .boolean()
    .optional()
    .default(false)
    .describe('Create the file if it does not exist'),
  repoId: z
    .string()
    .optional()
    .describe('Repository ID to target - derived from path if not provided'),
};

/**
 * Type for update-file parameters
 */
type UpdateFileParams = {
  path: string;
  content: string;
  createIfMissing?: boolean;
  repoId?: string;
};

/**
 * Handler for the update-file tool
 * Updates an existing file with new content
 *
 * @param params Parameters for the update-file tool
 * @returns Result of the operation
 */
async function updateFileHandler(params: UpdateFileParams): Promise<CallToolResult> {
  try {
    const { path: filePath, content, createIfMissing } = params;

    // Resolve to absolute filesystem path
    const absolutePath = resolveToAbsolutePath(filePath);

    // Check if the file exists
    const fileExists = await fs
      .access(absolutePath)
      .then(() => true)
      .catch(() => false);

    if (!fileExists && !createIfMissing) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `File not found: ${filePath}. Use createIfMissing: true to create it.`,
          },
        ],
      };
    }

    // Create parent directories if they don't exist
    if (!fileExists && createIfMissing) {
      const dirname = path.dirname(absolutePath);
      await fs.mkdir(dirname, { recursive: true });
    }

    // Write the file
    await fs.writeFile(absolutePath, content, 'utf-8');

    // Return success
    return {
      content: [
        {
          type: 'text' as const,
          text: `Successfully ${fileExists ? 'updated' : 'created'} file: ${filePath}`,
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `Error updating file: ${(error as Error).message}`,
        },
      ],
    };
  }
}

// Type-safe wrapper function that matches the expected signature for server.tool
const typedUpdateFileWrapper = (
  args: UpdateFileParams,
  _extra: unknown
): Promise<CallToolResult> => {
  return updateFileHandler(args);
};

/**
 * Register the update-file tool with the MCP server
 *
 * @param server MCP server instance
 */
export function registerUpdateFileTool(server: McpServer): void {
  // Register the tool with raw schema properties to avoid ZodRawShape type issues
  server.tool(
    'update-file', // Tool name
    'Updates an existing file with new content. Supports multiple path formats including repository prefixes and absolute paths. Use for modifying existing files (use create-file for new files). For partial changes, prefer insert-lines, replace-lines, or clean-lines when possible.', // Description
    updateFileSchemaProps, // Pass raw schema properties instead of Zod object
    typedUpdateFileWrapper
  );
}
