/**
 * Module Manager
 * Handles the detection, registration, and management of modules across repositories
 */
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { repoManager } from './repoManager.js';

const execFileAsync = promisify(execFile);

/**
 * Module information interface
 */
export interface ModuleInfo {
  id: string; // Unique identifier for the module
  name: string; // Human-readable name
  path: string; // Path relative to repository root
  type: ModuleType; // Type of module
  language: string; // Primary programming language
  repoId?: string; // Repository ID
}

/**
 * Module type enum
 */
export type ModuleType =
  | 'api'
  | 'service'
  | 'web'
  | 'library'
  | 'static-site'
  | 'utility'
  | 'docs'
  | 'config'
  | 'unknown';

/**
 * Module Manager class
 * Handles the detection and management of modules across repositories
 */
export class ModuleManager {
  private modulesByRepo: Map<string, Map<string, ModuleInfo>> = new Map();

  /**
   * Initialize the module manager
   */
  constructor() {
    // Will be populated during auto-detection
  }

  /**
   * Register a module with the module manager
   * @param repoId Repository ID
   * @param moduleInfo Module information
   */
  public registerModule(repoId: string, moduleInfo: ModuleInfo): void {
    // Ensure the repository map exists
    if (!this.modulesByRepo.has(repoId)) {
      this.modulesByRepo.set(repoId, new Map<string, ModuleInfo>());
    }

    // Add the module to the repository with repoId
    const moduleWithRepo = { ...moduleInfo, repoId };
    this.modulesByRepo.get(repoId)!.set(moduleInfo.id, moduleWithRepo);
  }

  /**
   * Get all modules for a specific repository
   * @param repoId Repository ID
   * @returns Array of module information objects or empty array if repository not found
   */
  public getModulesForRepo(repoId: string): ModuleInfo[] {
    const repoModules = this.modulesByRepo.get(repoId);
    if (!repoModules) {
      return [];
    }
    return Array.from(repoModules.values());
  }

  /**
   * Get module by ID for a specific repository
   * @param moduleId Module ID
   * @param repoId Repository ID (uses default if not specified)
   * @returns Module information or undefined if not found
   */
  public getModule(moduleId: string, repoId?: string): ModuleInfo | undefined {
    const targetRepoId = repoId || repoManager.defaultRepoId;
    const repoModules = this.modulesByRepo.get(targetRepoId);
    if (!repoModules) {
      return undefined;
    }
    return repoModules.get(moduleId);
  }

  /**
   * Get module by name across all repositories
   * @param moduleName Module name
   * @returns Module information or undefined if not found
   */
  public getModuleByName(moduleName: string): ModuleInfo | undefined {
    // First check if this is a module ID
    for (const [, modules] of this.modulesByRepo.entries()) {
      if (modules.has(moduleName)) {
        return modules.get(moduleName);
      }
    }

    // Then look through all repositories for a matching name
    for (const [, modules] of this.modulesByRepo.entries()) {
      for (const module of modules.values()) {
        if (module.name === moduleName || module.id === moduleName) {
          return module;
        }
      }
    }

    // If nothing found, try to find a fuzzy match
    for (const [, modules] of this.modulesByRepo.entries()) {
      for (const module of modules.values()) {
        if (
          module.name.toLowerCase().includes(moduleName.toLowerCase()) ||
          module.id.toLowerCase().includes(moduleName.toLowerCase())
        ) {
          return module;
        }
      }
    }

    return undefined;
  }

  /**
   * Get all modules across all repositories
   * @returns Map of repository IDs to arrays of module information objects
   */
  public getAllModulesByRepo(): Record<string, ModuleInfo[]> {
    const result: Record<string, ModuleInfo[]> = {};

    this.modulesByRepo.forEach((modules, repoId) => {
      result[repoId] = Array.from(modules.values());
    });

    return result;
  }

  /**
   * Auto-detect modules in all registered repositories
   * @returns Total number of modules detected
   */
  public async autoDetectAllModules(): Promise<number> {
    let totalModules = 0;

    // Get all repositories
    const repositories = repoManager.getAllRepositories();

    process.stderr.write(`Scanning ${repositories.length} repositories for modules...\n`);

    // Scan each repository for modules
    for (const repo of repositories) {
      process.stderr.write(`Scanning ${repo.displayName} (${repo.id}) for modules...\n`);
      try {
        const modules = await this.detectModulesInRepository(repo.path, repo.id);

        // Register each module
        modules.forEach(module => {
          this.registerModule(repo.id, module);
        });

        process.stderr.write(`Found ${modules.length} modules in ${repo.displayName}\n`);
        totalModules += modules.length;
      } catch {
        process.stderr.write(`Error scanning ${repo.displayName} for modules\n`);
      }
    }

    process.stderr.write(`Total modules detected across all repositories: ${totalModules}\n`);
    return totalModules;
  }

  /**
   * Detect modules in a repository using various detection strategies
   * @param repoPath Absolute path to repository
   * @param repoId Repository ID
   * @returns Array of detected module information objects
   */
  private async detectModulesInRepository(repoPath: string, repoId: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];

    // Ensure we're working from the root directory
    repoManager.resetWorkingDirectory();

    try {
      // 1. Scan for conventional modules (package.json, requirements.txt, etc.)
      const conventionalModules = await this.detectConventionalModules(repoPath, repoId);
      modules.push(...conventionalModules);

      // 2. Look for static site modules (docs, gh-pages)
      const staticSiteModules = await this.detectStaticSiteModules(repoPath, repoId);
      modules.push(...staticSiteModules);

      // 3. Look for utility modules (scripts, examples, etc.)
      const utilityModules = await this.detectUtilityModules(repoPath, repoId);
      modules.push(...utilityModules);

      // 4. Create a catch-all root module if no modules were detected
      if (modules.length === 0) {
        modules.push({
          id: repoId,
          name: repoManager.getRepository(repoId)?.displayName || repoId,
          path: '',
          type: 'unknown',
          language: await this.detectLanguage(repoPath),
        });
      }
    } catch {
      process.stderr.write(`Error detecting modules in ${repoId}\n`);
    }

    return modules;
  }

  /**
   * Detect conventional modules such as those with package.json, requirements.txt, etc.
   * @param repoPath Absolute path to repository
   * @param _repoId Repository ID (unused parameter)
   * @returns Array of detected module information objects
   */
  private async detectConventionalModules(repoPath: string, _repoId: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];

    try {
      // Get top-level directories in the repository
      const topLevelItems = await fs.readdir(repoPath);

      // Check each directory for package.json, requirements.txt, etc.
      for (const item of topLevelItems) {
        const itemPath = path.join(repoPath, item);

        try {
          // Skip files and hidden directories
          const stats = await fs.stat(itemPath);
          if (!stats.isDirectory() || item.startsWith('.')) {
            continue;
          }

          // Check for JavaScript/TypeScript module (package.json)
          if (existsSync(path.join(itemPath, 'package.json'))) {
            try {
              const packageJsonContent = await fs.readFile(
                path.join(itemPath, 'package.json'),
                'utf8'
              );
              const packageJson = JSON.parse(packageJsonContent);

              // Determine module type
              let moduleType: ModuleType = 'unknown';

              if (item.startsWith('web-') || packageJson.dependencies?.react) {
                moduleType = 'web';
              } else if (
                item.includes('server') ||
                item.includes('api') ||
                packageJson.dependencies?.express ||
                packageJson.dependencies?.fastify ||
                packageJson.dependencies?.koa
              ) {
                moduleType = 'service';
              } else if (item.includes('lib') || packageJson.private === false) {
                moduleType = 'library';
              }

              modules.push({
                id: item,
                name: packageJson.name || this.toTitleCase(item),
                path: item,
                type: moduleType,
                language: 'typescript', // Default to TypeScript for now
              });

              continue;
            } catch {
              // If package.json parsing fails, continue with default detection
            }
          }

          // Check for Python module (requirements.txt, setup.py, pyproject.toml)
          if (
            existsSync(path.join(itemPath, 'requirements.txt')) ||
            existsSync(path.join(itemPath, 'setup.py')) ||
            existsSync(path.join(itemPath, 'pyproject.toml'))
          ) {
            // Determine module type
            let moduleType: ModuleType = 'unknown';

            if (item.startsWith('api') || item.includes('api')) {
              moduleType = 'api';
            } else if (item.includes('service') || item.includes('processor')) {
              moduleType = 'service';
            } else if (item.startsWith('web-') || existsSync(path.join(itemPath, 'templates'))) {
              moduleType = 'web';
            }

            modules.push({
              id: item,
              name: this.toTitleCase(item),
              path: item,
              type: moduleType,
              language: 'python',
            });

            continue;
          }

          // Check for Go module (go.mod)
          if (existsSync(path.join(itemPath, 'go.mod'))) {
            modules.push({
              id: item,
              name: this.toTitleCase(item),
              path: item,
              type: item.includes('api') ? 'api' : 'service',
              language: 'go',
            });

            continue;
          }

          // Check for Rust module (Cargo.toml)
          if (existsSync(path.join(itemPath, 'Cargo.toml'))) {
            modules.push({
              id: item,
              name: this.toTitleCase(item),
              path: item,
              type: 'service',
              language: 'rust',
            });

            continue;
          }
        } catch {
          // Skip items we can't access
          continue;
        }
      }
    } catch {
      process.stderr.write(`Error detecting conventional modules in repository\n`);
    }

    return modules;
  }

  /**
   * Detect static site modules such as docs or GitHub Pages
   * @param repoPath Absolute path to repository
   * @param _repoId Repository ID (unused parameter)
   * @returns Array of detected module information objects
   */
  private async detectStaticSiteModules(repoPath: string, _repoId: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];

    try {
      // Check for common static site directories
      const staticSiteDirs = ['docs', 'website', 'gh-pages', 'static'];

      for (const dir of staticSiteDirs) {
        const dirPath = path.join(repoPath, dir);

        if (existsSync(dirPath)) {
          try {
            const stats = await fs.stat(dirPath);

            if (stats.isDirectory()) {
              // Look for indicators of a static site
              const items = await fs.readdir(dirPath);
              const hasIndexHtml = items.includes('index.html');
              const hasMarkdown = items.some(file => file.endsWith('.md'));

              if (hasIndexHtml || hasMarkdown) {
                modules.push({
                  id: dir,
                  name: dir === 'docs' ? 'Documentation' : this.toTitleCase(dir),
                  path: dir,
                  type: 'static-site',
                  language: hasMarkdown ? 'markdown' : 'html',
                });
              }
            }
          } catch {
            // Skip directories we can't access
            continue;
          }
        }
      }
    } catch {
      process.stderr.write(`Error detecting static site modules in repository\n`);
    }

    return modules;
  }

  /**
   * Detect utility modules such as scripts, examples, etc.
   * @param repoPath Absolute path to repository
   * @param _repoId Repository ID (unused parameter)
   * @returns Array of detected module information objects
   */
  private async detectUtilityModules(repoPath: string, _repoId: string): Promise<ModuleInfo[]> {
    const modules: ModuleInfo[] = [];

    try {
      // Check for common utility directories
      const utilityDirs = ['scripts', 'examples', 'tools', 'config', 'utils'];

      for (const dir of utilityDirs) {
        const dirPath = path.join(repoPath, dir);

        if (existsSync(dirPath)) {
          try {
            const stats = await fs.stat(dirPath);

            if (stats.isDirectory()) {
              // Determine the primary language
              const language = await this.detectLanguage(dirPath);

              modules.push({
                id: dir,
                name: this.toTitleCase(dir),
                path: dir,
                type: 'utility',
                language,
              });
            }
          } catch {
            // Skip directories we can't access
            continue;
          }
        }
      }
    } catch {
      process.stderr.write(`Error detecting utility modules in repository\n`);
    }

    return modules;
  }

  /**
   * Detect the primary language of a directory by examining file extensions
   * @param dirPath Directory path
   * @returns Primary language of the directory
   */
  private async detectLanguage(dirPath: string): Promise<string> {
    try {
      // Use find command to get all files recursively
      const { stdout } = await execFileAsync('find', [
        dirPath,
        '-type',
        'f',
        '-name',
        '*.*',
        '-not',
        '-path',
        '*/node_modules/*',
        '-not',
        '-path',
        '*/.git/*',
        '-not',
        '-path',
        '*/venv/*',
        '-not',
        '-path',
        '*/build/*',
        '-not',
        '-path',
        '*/dist/*',
      ]);

      const files = stdout.split('\n').filter(Boolean);

      // Count file extensions
      const extCounts: Record<string, number> = {};

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext) {
          extCounts[ext] = (extCounts[ext] || 0) + 1;
        }
      }

      // Map extensions to languages
      const langMap: Record<string, string> = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.go': 'go',
        '.rs': 'rust',
        '.java': 'java',
        '.rb': 'ruby',
        '.php': 'php',
        '.c': 'c',
        '.cpp': 'cpp',
        '.cs': 'csharp',
        '.swift': 'swift',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.less': 'less',
        '.md': 'markdown',
        '.json': 'json',
        '.yml': 'yaml',
        '.yaml': 'yaml',
        '.toml': 'toml',
        '.sh': 'shell',
        '.bash': 'shell',
      };

      // Convert extension counts to language counts
      const langCounts: Record<string, number> = {};

      for (const [ext, count] of Object.entries(extCounts)) {
        const lang = langMap[ext] || 'unknown';
        langCounts[lang] = (langCounts[lang] || 0) + count;
      }

      // Find the most common language
      let maxCount = 0;
      let primaryLang = 'unknown';

      for (const [lang, count] of Object.entries(langCounts)) {
        if (count > maxCount) {
          maxCount = count;
          primaryLang = lang;
        }
      }

      return primaryLang;
    } catch {
      // Default to unknown if language detection fails
      return 'unknown';
    }
  }

  /**
   * Convert a string to title case (e.g., "hello-world" -> "Hello World")
   * @param str String to convert
   * @returns Title-cased string
   */
  private toTitleCase(str: string): string {
    return str
      .replace(/[-_]/g, ' ')
      .replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }
}

// Create singleton instance
export const moduleManager = new ModuleManager();
