/**
 * Create File Tool
 * Creates a new file with the provided content
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

import { resolveToAbsolutePath, validatePathForTool } from '../utils/path-handler.js';

/**
 * Interface for create file parameters
 */
export interface CreateFileParams {
  path: string;
  content: string;
  overwriteIfExists?: boolean;
  repoId?: string;
  moduleName?: string;
}

/**
 * Implementation of the create file tool
 * This is the core functionality, separate from registration logic
 *
 * @param params Tool parameters
 * @returns Tool result
 */
export async function createFileImpl(params: CreateFileParams): Promise<CallToolResult> {
  const { path: filePath, content, overwriteIfExists = false } = params;

  try {
    // Validate the path format
    const pathValidation = validatePathForTool(filePath, 'create-file');
    if (!pathValidation.isValid) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: pathValidation.errorMessage || 'Invalid path format',
          },
        ],
      };
    }

    // Use the new path resolution system
    const absoluteFilePath = resolveToAbsolutePath(filePath);

    // Check if file already exists
    if (existsSync(absoluteFilePath) && !overwriteIfExists) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `File already exists: '${filePath}'. Use overwriteIfExists=true to overwrite.`,
          },
        ],
      };
    }

    // Create parent directories if they don't exist
    const dirPath = path.dirname(absoluteFilePath);
    await fs.mkdir(dirPath, { recursive: true });

    // Write the file
    await fs.writeFile(absoluteFilePath, content);

    // Build response
    const response = [
      {
        type: 'text' as const,
        text: `File created successfully: '${filePath}'`,
      },
    ];

    return {
      content: response,
    };
  } catch (error) {
    console.error('Error in createFile tool:', error);
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: `Error creating file: ${(error as Error).message}`,
        },
      ],
    };
  }
}

// Type-safe wrapper for the implementation
const typedCreateFileWrapper = (
  params: CreateFileParams,
  _extra: unknown
): Promise<CallToolResult> => {
  return createFileImpl(params);
};

/**
 * Register the create file tool with the MCP server
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerCreateFileTool(server: McpServer): void {
  server.tool(
    'create-file', // Tool name
    'Creates a new file with the provided content. REQUIRES absolute path format: /repoId/path/to/file. Creates parent directories automatically. Runs linting by default. Returns success message with lint results.', // Description
    {
      path: z.string().describe('REQUIRED: Target file path in format: /repoId/path/to/file'),
      content: z.string().describe('REQUIRED: File content to write'),
      overwriteIfExists: z
        .boolean()
        .optional()
        .default(false)
        .describe('Overwrite the file if it already exists'),
      skipLinting: z
        .boolean()
        .optional()
        .default(false)
        .describe('Skip linting validation (use with caution)'),
      repoId: z
        .string()
        .optional()
        .describe('Repository ID to target - derived from path if not provided'),
      moduleName: z
        .string()
        .optional()
        .describe('Module name within the repository - derived from path if not provided'),
    },
    // Use the typed wrapper to ensure type safety
    typedCreateFileWrapper
  );
}
