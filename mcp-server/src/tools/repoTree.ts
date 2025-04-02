/**
 * Repository Tree Tool
 * Displays the directory structure of a repository or a specific path within it
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { z } from 'zod';

import { resolveToAbsolutePath } from '../utils/path-handler.js';
import { repoManager } from '../utils/repoManager.js';

const execAsync = promisify(exec);

// Define the type for the parameter
interface RepoTreeParams {
  repoId?: string;
  moduleName?: string;
  path?: string;
  depth?: number;
}

/**
 * Register the repo tree tool with the MCP server
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerRepoTreeTool(server: McpServer): void {
  server.tool(
    'repo-tree', // Tool name
    'Display repository directory tree. Requires repoId and moduleName to determine the starting location. Path is relative to the module root.', // Description
    {
      repoId: z.string().describe('Repository ID to target (e.g., "swift-coder")'),
      moduleName: z.string().describe('Module name within the repository (e.g., "mcp-server")'),
      path: z
        .string()
        .optional()
        .default('')
        .describe('Relative path from the module root to display, default is module root'),
      depth: z.number().optional().default(1).describe('Depth of the tree, default is 1'),
    },
    async (params: RepoTreeParams) => {
      try {
        // Extract parameters with defaults
        let { repoId, moduleName, path: dirPath = '', depth = 1 } = params;

        if (!repoId || !moduleName) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Both repoId and moduleName are required for repo-tree tool.',
              },
            ],
          };
        }

        // Construct the absolute path
        const absoluteDirPath = `/${repoId}/${moduleName}${dirPath ? `/${dirPath}` : ''}`;

        // Verify the directory exists
        try {
          const resolvedPath = resolveToAbsolutePath(absoluteDirPath);
          
          if (!fs.existsSync(resolvedPath)) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Path not found: '${dirPath}' in module '${moduleName}' of repository '${repoId}'`,
                },
              ],
            };
          }

          // Verify it's a directory
          const stats = fs.statSync(resolvedPath);
          if (!stats.isDirectory()) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Path is not a directory: '${dirPath}' in module '${moduleName}' of repository '${repoId}'`,
                },
              ],
            };
          }

          // Check for the tree command
          const treeCommand = await getTreeCommand();
          if (treeCommand) {
            // Use tree command with appropriate options
            // -L: depth, --charset=ASCII: use ASCII characters, -I: exclude pattern
            const { stdout, stderr } = await execAsync(
              `${treeCommand} -L ${depth} --charset=ASCII -I "node_modules|.git|__pycache__|venv|.venv|.env|dist|build|.next|out" "${resolvedPath}"`,
              { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
            );

            if (stderr && stderr.trim()) {
              console.error('Tree command stderr:', stderr);
            }

            // Replace the absolute path in the output with a relative path
            const cleanOutput = stdout
              .replace(new RegExp(`^${resolvedPath}`, 'm'), dirPath || '.')
              .trim();

            return {
              content: [
                {
                  type: 'text',
                  text: `\`\`\`\n${cleanOutput}\n\`\`\``,
                },
              ],
            };
          } else {
            // Fallback to custom directory listing
            const tree = await generateDirectoryTree(resolvedPath, depth);
            return {
              content: [
                {
                  type: 'text',
                  text: `\`\`\`\n${dirPath || '.'}\n${tree}\n\`\`\``,
                },
              ],
            };
          }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error resolving path: ${(error as Error).message}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error displaying directory tree: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );
}

/**
 * Check if the tree command is available and return the command name
 * @returns The tree command name or null if not available
 */
async function getTreeCommand(): Promise<string | null> {
  try {
    // Check for tree command
    await execAsync('tree --version');
    return 'tree';
  } catch {
    try {
      // Check for find command as a fallback
      await execAsync('find --version');
      return 'find';
    } catch {
      // Neither command is available
      return null;
    }
  }
}

/**
 * Generate a directory tree without using the tree command
 * @param dirPath Directory path to start from
 * @param maxDepth Maximum depth to traverse
 * @param currentDepth Current depth in the traversal
 * @param prefix Prefix for the current line
 * @returns The directory tree as a string
 */
async function generateDirectoryTree(
  dirPath: string,
  maxDepth: number,
  currentDepth: number = 0,
  prefix: string = ''
): Promise<string> {
  if (currentDepth >= maxDepth) {
    return '';
  }

  // Skip common directories that should be ignored
  const ignorePatterns = [
    'node_modules',
    '.git',
    '__pycache__',
    'venv',
    '.venv',
    '.env',
    'dist',
    'build',
    '.next',
    'out',
  ];

  // Read the directory
  const items = fs.readdirSync(dirPath).filter(item => !ignorePatterns.includes(item));

  // Sort directories first, then files
  const sortedItems = items.sort((a, b) => {
    const aStat = fs.statSync(path.join(dirPath, a));
    const bStat = fs.statSync(path.join(dirPath, b));
    if (aStat.isDirectory() && !bStat.isDirectory()) {
      return -1;
    }
    if (!aStat.isDirectory() && bStat.isDirectory()) {
      return 1;
    }
    return a.localeCompare(b);
  });

  // Generate the tree
  let result = '';
  const lastIndex = sortedItems.length - 1;

  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    const itemPath = path.join(dirPath, item);
    const isLast = i === lastIndex;
    const isDir = fs.statSync(itemPath).isDirectory();

    // Add the current item to the tree
    result += `${prefix}${isLast ? '└── ' : '├── '}${item}${isDir ? '/' : ''}\n`;

    // Recursively process subdirectories
    if (isDir && currentDepth + 1 < maxDepth) {
      const newPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
      result += await generateDirectoryTree(itemPath, maxDepth, currentDepth + 1, newPrefix);
    }
  }

  return result;
}
