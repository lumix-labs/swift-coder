/**
 * Search Files Tool
 * Provides a way to search for patterns in files across the repository
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

import { resolveToAbsolutePath, validatePathForTool } from '../utils/path-handler.js';

/**
 * Interface for search files parameters
 */
export interface SearchFilesParams {
  pattern: string;
  directory?: string;
  fileExtensions?: string[];
  ignoreCase?: boolean;
  maxResults?: number;
  repoId?: string;
}

type MatchResult = {
  file: string;
  line: number;
  lineContent: string;
  matchedText: string;
  columnStart: number;
  columnEnd: number;
};

/**
 * Implementation of the search files tool
 * This is the core functionality, separate from registration logic
 *
 * @param params Tool parameters
 * @returns Tool result
 */
export async function searchFilesImpl(params: SearchFilesParams): Promise<CallToolResult> {
  const { pattern, directory = '.', fileExtensions, ignoreCase = false, maxResults = 100 } = params;

  try {
    // Validate the directory path - enforce absolute path format
    if (directory !== '.') {
      const pathValidation = validatePathForTool(directory, 'search-files');
      if (!pathValidation.isValid) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: pathValidation.errorMessage || 'Invalid directory path format',
            },
          ],
        };
      }
    }

    // Resolve directory path using the path resolution system
    const searchDir = resolveToAbsolutePath(directory);
    const repoRoot = resolveToAbsolutePath(
      directory.startsWith('/') ? `/${directory.split('/')[1]}` : '.'
    );

    if (!fs.existsSync(searchDir)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Directory does not exist: ${directory}`,
          },
        ],
        isError: true,
      };
    }

    const results: MatchResult[] = [];
    const flags = ignoreCase ? 'gi' : 'g';

    // Validate the regex pattern
    try {
      new RegExp(pattern, flags);
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Invalid regular expression pattern: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }

    const regex = new RegExp(pattern, flags);
    const excludeDirs = ['node_modules', '.git', 'build', 'dist', 'coverage'];

    await recursiveSearchDirectory(
      searchDir,
      repoRoot,
      regex,
      results,
      maxResults,
      excludeDirs,
      fileExtensions
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              pattern: pattern,
              directory: directory,
              totalMatches: results.length,
              results,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error(`Error in searchFiles:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text' as const,
          text: `Search failed: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Recursively search a directory for files matching the pattern
 */
async function recursiveSearchDirectory(
  dirPath: string,
  repoRoot: string,
  pattern: RegExp,
  results: MatchResult[],
  maxResults: number,
  excludeDirs: string[],
  fileExtensions?: string[]
): Promise<void> {
  if (results.length >= maxResults) return;

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      if (results.length >= maxResults) return;

      const itemPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        if (!excludeDirs.includes(item.name)) {
          await recursiveSearchDirectory(
            itemPath,
            repoRoot,
            pattern,
            results,
            maxResults,
            excludeDirs,
            fileExtensions
          );
        }
      } else if (item.isFile()) {
        // Check if file has the specific extension if provided
        if (fileExtensions && fileExtensions.length > 0) {
          const ext = path.extname(item.name);
          if (!fileExtensions.includes(ext)) {
            continue;
          }
        }

        // Skip binary files
        const ext = path.extname(item.name).toLowerCase();
        const binaryExts = ['.jpg', '.png', '.gif', '.pdf', '.exe', '.zip', '.bin'];
        if (binaryExts.includes(ext)) continue;

        searchFile(itemPath, repoRoot, pattern, results, maxResults);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dirPath}:`, err);
  }
}

/**
 * Search a single file for the pattern
 */
function searchFile(
  filePath: string,
  repoRoot: string,
  pattern: RegExp,
  results: MatchResult[],
  maxResults: number
): void {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relativePath = path.relative(repoRoot, filePath);

    for (let i = 0; i < lines.length; i++) {
      if (results.length >= maxResults) return;

      const line = lines[i];
      // Reset the RegExp lastIndex to start searching from the beginning of the line
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(line)) !== null) {
        results.push({
          file: relativePath,
          line: i + 1,
          lineContent: line.trim(),
          matchedText: match[0],
          columnStart: match.index,
          columnEnd: match.index + match[0].length,
        });

        if (results.length >= maxResults) return;
      }
    }
  } catch (error) {
    // Skip files that can't be read as text
    console.error(`Error reading file ${filePath}:`, error);
  }
}

// Type-safe wrapper for the implementation
const typedSearchFilesWrapper = (
  params: SearchFilesParams,
  _extra: unknown
): Promise<CallToolResult> => {
  return searchFilesImpl(params);
};

/**
 * Register the searchFiles tool with the MCP server
 *
 * @param {McpServer} server - The MCP server instance
 * @returns {void}
 */
export function registerSearchFilesTool(server: McpServer): void {
  server.tool(
    'search-files',
    'Search for patterns in files across the repository. REQUIRES absolute path format: /repoId/path/to/dir for directory parameter. Returns JSON with matched files and line content.',
    {
      pattern: z.string().describe('REQUIRED: Regular expression pattern to search for'),
      directory: z
        .string()
        .default('.')
        .describe(
          'Directory to search in absolute format: /repoId/path/to/dir (or "." for current)'
        ),
      fileExtensions: z
        .array(z.string())
        .optional()
        .describe('Specific file extensions to search (e.g., [".md", ".ts"])'),
      ignoreCase: z.boolean().default(false).describe('Whether to ignore case in pattern matching'),
      maxResults: z.number().default(100).describe('Maximum number of results to return'),
      repoId: z
        .string()
        .optional()
        .describe('Repository ID to target - derived from directory path if not provided'),
    },
    // Use the typed wrapper to ensure type safety
    typedSearchFilesWrapper
  );
}
