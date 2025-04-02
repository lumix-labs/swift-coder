/**
 * Tool for detecting and managing Git repositories
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import { repoManager } from '../utils/repoManager.js';

// Schema for repositories tool parameters
// Define schema properties as a raw object (ZodRawShape) rather than a Zod object
const getRepositoriesSchemaProps = {
  rootPath: z
    .string()
    .optional()
    .default('/')
    .describe('Root directory to begin scanning (default: "/")'),
  depth: z
    .number()
    .optional()
    .default(2)
    .describe('Maximum directory depth to scan (default: 2)'),
  includeDetails: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include additional Git repository details in results'),
};

// Create the schema using the properties
const getRepositoriesSchema = z.object(getRepositoriesSchemaProps);

// Type definition for the parameters
type GetRepositoriesParams = {
  rootPath?: string;
  depth?: number;
  includeDetails?: boolean;
};

// Promisify exec for cleaner async code
const execAsync = promisify(exec);

/**
 * Scan directories to find Git repositories
 *
 * @param {string} rootPath - Root path to start scanning from
 * @param {number} currentDepth - Current depth of the scan
 * @param {number} maxDepth - Maximum depth to scan
 * @param {boolean} includeDetails - Whether to include Git details
 * @returns {Promise<Array<object>>} Array of repositories found
 */
async function scanForRepositories(
  rootPath: string,
  currentDepth: number,
  maxDepth: number,
  includeDetails: boolean
): Promise<any[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    let repositories: any[] = [];

    // Check if the current directory is a Git repository
    if (entries.some(entry => entry.name === '.git' && entry.isDirectory())) {
      const repoInfo: any = {
        path: rootPath,
        name: rootPath.split('/').filter(Boolean).pop() || 'root',
      };

      // Add Git details if requested
      if (includeDetails) {
        try {
          // Get remote URL
          const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url', {
            cwd: rootPath,
          });
          repoInfo.details = { remoteUrl: remoteUrl.trim() };

          // Get current branch
          const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', {
            cwd: rootPath,
          });
          repoInfo.details.branch = branch.trim();

          // Get last commit
          const { stdout: lastCommit } = await execAsync(
            'git log -1 --pretty=format:"%h - %an, %ar : %s"',
            { cwd: rootPath }
          );
          repoInfo.details.lastCommit = lastCommit.trim();
        } catch (error) {
          repoInfo.details = { error: `Failed to get Git details: ${(error as Error).message}` };
        }
      }

      repositories.push(repoInfo);
    }

    // Recursively scan subdirectories
    if (currentDepth < maxDepth) {
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
          const subDirPath = `${rootPath}/${entry.name}`;
          const subRepos = await scanForRepositories(
            subDirPath,
            currentDepth + 1,
            maxDepth,
            includeDetails
          );
          repositories = [...repositories, ...subRepos];
        }
      }
    }

    return repositories;
  } catch (error) {
    process.stderr.write(`Error scanning ${rootPath}: ${(error as Error).message}\n`);
    return [];
  }
}

/**
 * Auto-detect repositories from standard locations
 *
 * @returns {Promise<Array<object>>} Array of repositories found
 */
export async function autoDetectRepositories(): Promise<any[]> {
  try {
    // Always scan from root for consistency
    const rootPaths = ['/'];
    const repositories: any[] = [];

    for (const rootPath of rootPaths) {
      try {
        const repos = await scanForRepositories(rootPath, 0, 2, true);
        repos.forEach(repo => repositories.push(repo));
      } catch (error) {
        process.stderr.write(`Error auto-detecting in ${rootPath}: ${(error as Error).message}\n`);
      }
    }

    return repositories;
  } catch (error) {
    process.stderr.write(`Error in auto-detection: ${(error as Error).message}\n`);
    return [];
  }
}

/**
 * Register the getRepositories tool with the MCP server
 *
 * @param {McpServer} server - The MCP server instance
 */
export function registerGetRepositoriesTool(server: McpServer): void {
  server.tool(
    'get-repositories', // Tool name
    'Scan directories to identify Git repositories. Repositories are detected by looking for .git directories. Run this tool first to discover available repositories. This tool may be slow with high depth values.', // Description
    getRepositoriesSchemaProps, // Pass the raw schema properties directly
    async (params: GetRepositoriesParams) => {
      try {
        const { rootPath = '/', depth = 2, includeDetails = false } = params;

        // Verify root path exists
        try {
          const stats = await fs.stat(rootPath);
          if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${rootPath}`);
          }
        } catch {
          throw new Error(
            `Invalid root path: ${rootPath}. Please provide an absolute path from the root directory.`
          );
        }

        // Reset to root directory for consistent behavior
        repoManager.resetWorkingDirectory();

        // Scan for repositories
        const repositories = await scanForRepositories(rootPath, 0, depth, includeDetails);

        // Add repositories to the repo manager for future use
        for (const repo of repositories) {
          // Only add if not already configured
          if (!repoManager.getRepository(repo.name.toLowerCase())) {
            repoManager.addRepository({
              id: repo.name.toLowerCase(),
              path: repo.path,
              displayName: repo.name,
            });
            process.stderr.write(`Added repository to manager: ${repo.name} (${repo.path})\n`);
          }
        }

        // Format response
        const response = {
          totalRepositories: repositories.length,
          rootPath,
          scannedDepth: depth,
          repositories: repositories.sort((a, b) => a.path.localeCompare(b.path)),
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error detecting repositories: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );
}
