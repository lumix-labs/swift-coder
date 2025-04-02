/**
 * Utility functions for working with file paths across multiple repositories
 *
 * Usage:
 * - All paths should be absolute from the repository root
 * - Paths can be prefixed with a repository ID (repoId://path/to/file)
 * - The default repository is used if no repository ID is specified
 */
import fs from 'fs';

import {
  getRepoBasePath as getBasePath,
  getRepoPath as getPath,
  repoManager,
  resetWorkingDirectoryToRoot,
  resolveRepoPath as resolvePath,
  switchToRepository,
} from './repoManager.js';

// Re-export functions from repoManager for backward compatibility
export const getRepoBasePath = getBasePath;
export const getRepoPath = getPath;
export const resolveRepoPath = resolvePath;

// Export working directory functions
export const resetToRootDirectory = resetWorkingDirectoryToRoot;
export const switchToRepositoryDirectory = switchToRepository;

/**
 * Parse a potentially repo-prefixed path
 * Handles paths in the format "repoId://path/to/file.ext"
 *
 * @param path Path that might contain repo prefix
 * @returns Object with repoId and cleaned path
 */
export function parseRepoPath(path: string): { repoId: string; path: string } {
  return repoManager.extractRepoFromPath(path);
}

/**
 * Ensures that all file operations use absolute paths
 * This function wraps operations to guarantee that the correct repository
 * path is used regardless of the current working directory
 *
 * @param relativePath Path relative to repository root
 * @param repoId Optional repository ID
 * @returns Absolute path to the file
 */
export async function ensureAbsolutePath(relativePath: string, repoId?: string): Promise<string> {
  // Always reset to root directory to ensure consistent path resolution
  resetWorkingDirectoryToRoot();

  try {
    // Handle repo-prefixed paths
    const { repoId: extractedRepoId, path: extractedPath } = parseRepoPath(relativePath);

    // Use provided repoId if specified, otherwise use the extracted one
    const finalRepoId = repoId || extractedRepoId;

    // Get absolute path from repo manager
    const absolutePath = getRepoPath(extractedPath, finalRepoId);

    return absolutePath;
  } catch {
    throw new Error('Error resolving path. Path must be absolute from repository root.');
  }
}

/**
 * Ensures that a given path is used as a working directory
 * by first resetting to root and then resolving the path
 *
 * @param workingDir Directory to use as working directory
 * @param repoId Optional repository ID
 * @returns Absolute path to the working directory
 */
export async function ensureWorkingDirectory(workingDir: string, repoId?: string): Promise<string> {
  // Always reset to root directory first
  resetWorkingDirectoryToRoot();

  try {
    // Handle repo-prefixed paths
    const { repoId: extractedRepoId, path: extractedPath } = parseRepoPath(workingDir);

    // Use provided repoId if specified, otherwise use the extracted one
    const finalRepoId = repoId || extractedRepoId;

    // Get absolute path from repo manager
    const absoluteWorkingDir = getRepoPath(extractedPath, finalRepoId);

    // Verify the directory exists
    if (!fs.existsSync(absoluteWorkingDir)) {
      throw new Error(`Working directory does not exist: ${absoluteWorkingDir}`);
    }

    // Verify it's a directory
    const stats = fs.statSync(absoluteWorkingDir);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absoluteWorkingDir}`);
    }

    return absoluteWorkingDir;
  } catch {
    throw new Error(
      'Error resolving working directory. Path must be absolute from repository root.'
    );
  }
}

/**
 * Validates that a path exists and is accessible
 *
 * @param path Path to validate
 * @returns Boolean indicating if path is valid
 */
export async function validatePath(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
