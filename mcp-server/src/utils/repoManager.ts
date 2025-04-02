/**
 * Repository Manager
 * Handles multiple repository configurations and provides paths and context
 */
import fs from 'fs';
import path from 'path';

/**
 * Repository Configuration interface
 */
export interface RepoConfig {
  id: string; // Unique identifier for the repository
  path: string; // Absolute path to the repository
  displayName: string; // Human-readable name
  moduleDetectionPatterns?: string[]; // Optional patterns to detect modules
}

/**
 * Repository Manager class
 * Manages multiple repositories and provides access to their paths and configurations
 */
export class RepoManager {
  private repositories: Map<string, RepoConfig> = new Map();
  private _defaultRepoId: string | null = null;
  private _initialWorkingDir: string;
  private _rootDir: string = '/';

  /**
   * Initialize the repository manager
   * Automatically loads repositories from environment variables
   */
  constructor() {
    // Store the initial working directory
    this._initialWorkingDir = process.cwd();

    this.loadFromEnvironment();

    // Always reset to root directory at initialization
    this.resetWorkingDirectory();
  }

  /**
   * Load repositories from environment variables
   * The environment variables should follow the pattern:
   * REPO_PATH_{ID}=/path/to/repo
   * e.g., REPO_PATH_ATLAS=/atlas, REPO_PATH_ABACUS=/abacus
   */
  private loadFromEnvironment(): void {
    // Scan all environment variables for repo path patterns
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('REPO_PATH_')) {
        const repoId = key.replace('REPO_PATH_', '').toLowerCase();
        const repoPath = process.env[key];

        if (repoPath && fs.existsSync(repoPath)) {
          // Get the display name from repo name environment variable or use ID
          const displayNameKey = `REPO_NAME_${repoId.toUpperCase()}`;
          const displayName = process.env[displayNameKey] || this.capitalizeRepoId(repoId);

          this.addRepository({
            id: repoId,
            path: repoPath,
            displayName,
          });

          // If this is the first repository, set it as default
          if (!this._defaultRepoId) {
            this._defaultRepoId = repoId;
          }
        }
      }
    });

    // Special case for swift-coder compatibility
    if (process.env.SWIFT_CODER_REPO_PATH && fs.existsSync(process.env.SWIFT_CODER_REPO_PATH)) {
      this.addRepository({
        id: 'swift-coder',
        path: process.env.SWIFT_CODER_REPO_PATH,
        displayName: 'Swift Coder',
      });

      // Always prefer Swift Coder as the default if available
      this._defaultRepoId = 'swift-coder';
    }

    // Log discovered repositories
    if (this.repositories.size === 0) {
      process.stderr.write('No valid repositories discovered in environment variables!\n');
      process.stderr.write(
        'Please set at least one environment variable in the format REPO_PATH_{ID}=/path/to/repo\n'
      );
    } else {
      process.stderr.write(`Discovered ${this.repositories.size} repositories:\n`);
      this.repositories.forEach(repo => {
        process.stderr.write(`- ${repo.displayName} (${repo.id}): ${repo.path}\n`);
      });
      process.stderr.write(`Default repository: ${this.defaultRepoId}\n`);
    }
  }

  /**
   * Capitalize the repository ID for display purposes
   */
  private capitalizeRepoId(repoId: string): string {
    return repoId.charAt(0).toUpperCase() + repoId.slice(1);
  }

  /**
   * Add a new repository to the manager
   * @param config Repository configuration
   */
  public addRepository(config: RepoConfig): void {
    // Ensure repository path is absolute
    if (!path.isAbsolute(config.path)) {
      config.path = path.resolve(this._rootDir, config.path);
    }

    this.repositories.set(config.id, config);

    // Set as default if no default is set
    if (!this._defaultRepoId) {
      this._defaultRepoId = config.id;
    }
  }

  /**
   * Get all repository configurations
   * @returns Array of repository configurations
   */
  public getAllRepositories(): RepoConfig[] {
    return Array.from(this.repositories.values());
  }

  /**
   * Get a repository configuration by ID
   * @param repoId Repository ID
   * @returns Repository configuration or undefined if not found
   */
  public getRepository(repoId?: string): RepoConfig | undefined {
    if (!repoId && this._defaultRepoId) {
      return this.repositories.get(this._defaultRepoId);
    }
    return repoId ? this.repositories.get(repoId) : undefined;
  }

  /**
   * Get the default repository ID
   */
  get defaultRepoId(): string {
    return this._defaultRepoId || 'unknown';
  }

  /**
   * Get the initial working directory that was set when the server started
   */
  get initialWorkingDir(): string {
    return this._initialWorkingDir;
  }

  /**
   * Set the working directory to the root directory
   * This ensures that the server operates from the expected root directory
   * rather than from a repository directory which could cause path resolution issues
   * @returns {boolean} True if successful, false otherwise
   */
  public resetWorkingDirectory(): boolean {
    try {
      // Only change directory if we're not already in the root
      if (process.cwd() !== this._rootDir) {
        process.chdir(this._rootDir);
        process.stderr.write(`Working directory reset to root: ${process.cwd()}\n`);
      }
      return true;
    } catch (error) {
      process.stderr.write(`Failed to reset working directory: ${error}\n`);
      return false;
    }
  }

  /**
   * Set the working directory to the specified repository
   * Always resets to root first for consistent behavior
   * @param {string} repoId Repository ID to set as working directory
   * @returns {boolean} True if successful, false otherwise
   */
  public setRepositoryAsWorkingDirectory(repoId?: string): boolean {
    try {
      // First reset to root to ensure consistent behavior
      this.resetWorkingDirectory();

      const repo = this.getRepository(repoId);
      if (!repo) {
        process.stderr.write(`Repository "${repoId || this.defaultRepoId}" not found\n`);
        return false;
      }

      // Change to the repository path
      process.chdir(repo.path);
      process.stderr.write(`Working directory set to repository ${repo.id}: ${process.cwd()}\n`);
      return true;
    } catch (error) {
      process.stderr.write(`Failed to set repository as working directory: ${error}\n`);
      return false;
    }
  }

  /**
   * Resolve a path relative to a repository root
   * @param relativePath Path relative to repository root
   * @param repoId Repository ID (uses default if not specified)
   * @returns Absolute path
   */
  public resolveRepoPath(relativePath: string, repoId?: string): string {
    // Always reset working directory first for consistency
    this.resetWorkingDirectory();

    const repo = this.getRepository(repoId);
    if (!repo) {
      throw new Error(`Repository "${repoId || this.defaultRepoId}" not found`);
    }

    return path.join(repo.path, relativePath);
  }

  /**
   * Extract repository ID from a path
   * This function handles paths that might be prefixed with "repoId://"
   * @param pathWithPossibleRepoPrefix Path that might contain repo prefix
   * @returns Object with repoId and cleaned path
   */
  public extractRepoFromPath(pathWithPossibleRepoPrefix: string): { repoId: string; path: string } {
    // Check if the path has the repo:// format
    const match = pathWithPossibleRepoPrefix.match(/^([a-zA-Z0-9_-]+):\/\/(.+)$/);

    if (match) {
      const [, repoId, cleanPath] = match;
      // Verify the repo exists
      if (!this.repositories.has(repoId)) {
        throw new Error(`Repository "${repoId}" not found in configured repositories`);
      }
      return { repoId, path: cleanPath };
    }

    // If no repo prefix, use the default repo
    return { repoId: this.defaultRepoId, path: pathWithPossibleRepoPrefix };
  }
}

// Create singleton instance
export const repoManager = new RepoManager();

// Helper functions for backward compatibility
export function getRepoBasePath(repoId?: string): string {
  // Always reset to root directory first
  repoManager.resetWorkingDirectory();

  const repo = repoManager.getRepository(repoId);
  if (!repo) {
    throw new Error(`Repository "${repoId || repoManager.defaultRepoId}" not found`);
  }
  return repo.path;
}

export function getRepoPath(relativePath?: string, repoId?: string): string {
  // Always reset to root directory first
  repoManager.resetWorkingDirectory();

  if (!relativePath) {
    return getRepoBasePath(repoId);
  }

  // Check if the path already has a repo prefix
  const { repoId: extractedRepoId, path: cleanPath } =
    repoManager.extractRepoFromPath(relativePath);

  // Use the extracted repoId if available, otherwise use the provided or default
  const finalRepoId = repoId || extractedRepoId;

  return repoManager.resolveRepoPath(cleanPath, finalRepoId);
}

export function resolveRepoPath(relativePath: string, repoId?: string): string {
  // Always reset to root directory first
  repoManager.resetWorkingDirectory();

  return getRepoPath(relativePath, repoId);
}

/**
 * Reset the working directory to the root directory
 * This is useful for ensuring that the server operates from the expected directory
 * @returns {boolean} True if successful, false otherwise
 */
export function resetWorkingDirectoryToRoot(): boolean {
  return repoManager.resetWorkingDirectory();
}

/**
 * Switch to the specified repository as the working directory
 * Always resets to root first for consistent behavior
 * @param {string} repoId Repository ID to switch to
 * @returns {boolean} True if successful, false otherwise
 */
export function switchToRepository(repoId?: string): boolean {
  return repoManager.setRepositoryAsWorkingDirectory(repoId);
}
