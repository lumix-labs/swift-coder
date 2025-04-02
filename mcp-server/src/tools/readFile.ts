/**
 * File Reader Tool
 * Provides a tool to read file contents from repositories
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import fs, { readFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';

import { resolveToAbsolutePath, validatePathForTool } from '../utils/path-handler.js';

// Define a type for NodeJS buffer encodings
type BufferEncoding =
  | 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'base64url'
  | 'latin1'
  | 'binary'
  | 'hex';

// Define ErrnoException interface
interface ErrnoException extends Error {
  errno?: number;
  code?: string;
  path?: string;
  syscall?: string;
}

// Define interface for the tool parameters
export interface ReadFileParams {
  path: string;
  encoding?: string;
  repoId?: string;
  moduleName?: string;
}

/**
 * Implementation of the file reader tool
 * This is the core functionality, separate from registration logic
 *
 * @param params Tool parameters
 * @returns Tool result
 */
export async function readFileImpl(params: ReadFileParams): Promise<CallToolResult> {
  // We use repoId and moduleName implicitly through the resolveToAbsolutePath function
  const { path: filePath, encoding = 'utf-8' } = params;

  try {
    // Validate the path format
    const pathValidation = validatePathForTool(filePath, 'read-file');
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

    // Check if path exists and is a file
    const stats = await fs.stat(absoluteFilePath);
    if (!stats.isFile()) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `Error: '${filePath}' is not a file. Please provide a valid file path.`,
          },
        ],
      };
    }

    // Check file size before reading
    if (stats.size > 10 * 1024 * 1024) {
      // 10MB limit
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `File is too large (${(stats.size / (1024 * 1024)).toFixed(2)}MB). Maximum size is 10MB.`,
          },
        ],
      };
    }

    // Read file contents
    const fileContent = await readFile(
      absoluteFilePath,
      encoding ? { encoding: encoding as BufferEncoding } : undefined
    );

    // Determine file type for output formatting
    const fileExt = path.extname(absoluteFilePath).toLowerCase();
    const isCode = [
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.py',
      '.java',
      '.go',
      '.sh',
      '.c',
      '.cpp',
      '.cs',
      '.php',
      '.rb',
      '.rs',
      '.swift',
      '.kt',
      '.json',
      '.yml',
      '.yaml',
      '.toml',
      '.xml',
      '.html',
      '.css',
      '.scss',
      '.less',
      '.sql',
    ].includes(fileExt);
    const isMarkdown = ['.md', '.markdown'].includes(fileExt);

    // Ensure text is always returned as string
    let text: string;
    if (typeof fileContent === 'string') {
      text = fileContent;
    } else if (Buffer.isBuffer(fileContent)) {
      text = fileContent.toString((encoding as BufferEncoding) || 'utf-8');
    } else {
      // Handle any other type more explicitly
      text = String(fileContent || '');
    }

    return {
      content: [
        {
          type: 'text' as const,
          text:
            isCode || isMarkdown
              ? `\`\`\`${isMarkdown ? 'markdown' : fileExt.slice(1)}\n${text}\n\`\`\``
              : text,
        },
      ],
    };
  } catch (error) {
    console.error('Error reading file:', error);

    // More descriptive error messages
    let errorMessage = `Error reading file: ${(error as Error).message}`;

    if ((error as ErrnoException).code === 'ENOENT') {
      errorMessage = `File not found: '${filePath}'. Please check the path and try again.`;
    } else if ((error as ErrnoException).code === 'EACCES') {
      errorMessage = `Permission denied: Cannot access '${filePath}'.`;
    } else if ((error as ErrnoException).code === 'EISDIR') {
      errorMessage = `'${filePath}' is a directory, not a file. Please specify a file path.`;
    }

    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: errorMessage,
        },
      ],
    };
  }
}

// Type-safe wrapper for the implementation
const typedReadFileWrapper = (params: ReadFileParams, _extra: unknown): Promise<CallToolResult> => {
  return readFileImpl(params);
};

/**
 * Register the file reader tool with the MCP server
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerReadFileTool(server: McpServer): void {
  // Define schema for tool parameters
  const toolParams = {
    path: z
      .string()
      .describe('REQUIRED: Absolute path to the file in format: /repoId/path/to/file'),
    encoding: z.string().optional().default('utf-8').describe('File encoding (default is utf-8)'),
    repoId: z
      .string()
      .optional()
      .describe('Repository ID to target - derived from path if not provided'),
    moduleName: z
      .string()
      .optional()
      .describe('Module name within the repository - derived from path if not provided'),
  };

  // Register the tool with the server
  server.tool(
    'read-file', // Tool name
    'Read contents of a file in the repository. REQUIRES absolute path format: /repoId/path/to/file. Returns formatted code for recognized file types. Maximum file size: 10MB.', // Description
    toolParams,
    typedReadFileWrapper
  );
}
