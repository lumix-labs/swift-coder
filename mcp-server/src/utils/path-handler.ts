/**
 * Path handling utilities for the MCP server
 * Provides consistent path validation and resolution across tools
 */
import { repoManager } from './repoManager.js';

/**
 * Enum for different path format types
 */
export enum PathFormatType {
  ABSOLUTE_PATH = 'absolute_path', // /repoId/path/to/file.js
  REPOSITORY_PREFIXED = 'repository_prefixed', // repoId://path/to/file.js
  RELATIVE_PATH = 'relative_path', // path/to/file.js
  UNKNOWN = 'unknown',
}

/**
 * Determine the format type of a path
 * @param path Path string to check
 * @returns The path format type
 */
export function getPathFormatType(path: string): PathFormatType {
  if (!path) return PathFormatType.UNKNOWN;

  if (path.startsWith('/')) {
    return PathFormatType.ABSOLUTE_PATH;
  } else if (path.includes('://')) {
    return PathFormatType.REPOSITORY_PREFIXED;
  } else {
    return PathFormatType.RELATIVE_PATH;
  }
}

/**
 * Parse a path into its components based on its format
 * @param path Path to parse
 * @returns Object with parsed components
 */
export function parsePathFormat(path: string): {
  repoId: string;
  relativePath: string;
  formatType: PathFormatType;
} {
  const formatType = getPathFormatType(path);
  let repoId = '';
  let relativePath = '';

  switch (formatType) {
    case PathFormatType.ABSOLUTE_PATH: {
      // Format: /repoId/path/to/file.js
      const parts = path.substring(1).split('/');
      if (parts.length < 2) {
        throw new Error(`Invalid absolute path format: ${path}`);
      }
      repoId = parts[0];
      relativePath = parts.slice(1).join('/');
      break;
    }

    case PathFormatType.REPOSITORY_PREFIXED: {
      // Format: repoId://path/to/file.js
      const [prefix, rest] = path.split('://');
      if (!prefix || !rest) {
        throw new Error(`Invalid repository prefixed path: ${path}`);
      }
      repoId = prefix;
      relativePath = rest;
      break;
    }

    case PathFormatType.RELATIVE_PATH:
      // Use default repository
      repoId = repoManager.defaultRepoId;
      relativePath = path;
      break;

    default:
      throw new Error(`Unknown or invalid path format: ${path}`);
  }

  return { repoId, relativePath, formatType };
}

/**
 * Validates a path format for a specific tool
 * Ensures the path meets the requirements of absolute paths for all tools
 *
 * @param path Path string to validate
 * @param _toolName Name of the tool to validate path for (unused)
 * @returns Validation result with error message if invalid
 */
export function validatePathForTool(
  path: string,
  _toolName: string
): { isValid: boolean; errorMessage?: string } {
  const formatType = getPathFormatType(path);

  // New validation logic enforcing absolute paths only
  if (formatType !== PathFormatType.ABSOLUTE_PATH) {
    // For backward compatibility, include conversion example
    let examplePath: string;

    if (formatType === PathFormatType.REPOSITORY_PREFIXED) {
      const parts = path.split('://');
      examplePath = `/${parts[0]}/${parts[1]}`;
    } else {
      // relative path
      examplePath = `/${repoManager.defaultRepoId}/${path}`;
    }

    return {
      isValid: false,
      errorMessage: `ABSOLUTE PATH REQUIRED: All tools now require absolute paths in the format: /repoId/path/to/file
Convert your path to: ${examplePath}`,
    };
  }

  // For absolute paths, verify it correctly follows the /repoId/path pattern
  const parts = path.substring(1).split('/');
  if (parts.length < 2 || !parts[0]) {
    return {
      isValid: false,
      errorMessage: `INVALID ABSOLUTE PATH: Path must follow pattern: /repoId/path/to/file`,
    };
  }

  // Verify the repoId exists
  const repoId = parts[0];
  if (!repoManager.getRepository(repoId)) {
    return {
      isValid: false,
      errorMessage: `INVALID REPOSITORY ID: '${repoId}' not found in registered repositories.`,
    };
  }

  // Path is valid
  return { isValid: true };
}

/**
 * Tool-specific path validation configuration
 */
export const toolPathValidationConfig = {
  'read-file': { requiresAbsolutePath: true },
  'create-file': { requiresAbsolutePath: true },
  'update-file': { requiresAbsolutePath: true },
  'search-files': { requiresAbsolutePath: true },
  'exec-shell-command': { requiresAbsolutePath: true },
  'path-demo': { requiresAbsolutePath: true },
  'repo-tree': { requiresAbsolutePath: true },
  'ensure-dir-exists': { requiresAbsolutePath: true },
  'get-repositories': { requiresAbsolutePath: false },
};

/**
 * Format a path for a tool based on its requirements
 * @param path Path or path object to format
 * @param _toolName Name of the tool (unused)
 * @returns Formatted path
 */
export function formatPathForTool(
  path: string | { repoId: string; relativePath: string },
  _toolName: string
): string {
  let repoId: string;
  let relativePath: string;

  if (typeof path === 'string') {
    const parsedPath = parsePathFormat(path);
    repoId = parsedPath.repoId;
    relativePath = parsedPath.relativePath;
  } else {
    repoId = path.repoId;
    relativePath = path.relativePath;
  }

  return `/${repoId}/${relativePath}`;
}

/**
 * Resolve a path to an absolute path on the filesystem
 * @param path Path to resolve (in any format)
 * @returns Absolute filesystem path
 */
export function resolveToAbsolutePath(path: string): string {
  const { repoId, relativePath } = parsePathFormat(path);

  const repo = repoManager.getRepository(repoId);
  if (!repo) {
    throw new Error(`Repository not found: ${repoId}`);
  }

  return `${repo.path}/${relativePath}`;
}
