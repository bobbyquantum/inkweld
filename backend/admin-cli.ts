#!/usr/bin/env bun
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database as BunDatabase } from 'bun:sqlite';
import { eq, asc, desc, sql } from 'drizzle-orm';
import * as schema from './src/db/schema/index.js';
import { users } from './src/db/schema/users.js';
import { projects } from './src/db/schema/projects.js';
import type { User } from './src/db/schema/users.js';
import type { Project } from './src/db/schema/projects.js';
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { spawn, execSync } from 'child_process';
import { randomBytes } from 'crypto';

// Load environment variables
config({ path: '.env' });

interface AdminStats {
  userCount: number;
  projectCount: number;
  pendingUserCount: number;
  totalDiskUsage: number;
  formattedDiskUsage: string;
}

interface ProjectDiskUsage {
  project: Project;
  diskUsage: number;
  formattedDiskUsage: string;
}

interface UserDiskUsage {
  user: User;
  projectCount: number;
  diskUsage: number;
  formattedDiskUsage: string;
}

type DatabaseInstance = ReturnType<typeof drizzle>;

/**
 * D1 Admin CLI - executes wrangler commands for Cloudflare D1 database
 */
class D1AdminCLI {
  public readonly verbose: boolean;
  public readonly dbName: string;
  public readonly remote: boolean;

  constructor(verbose: boolean = false, remote: boolean = false) {
    this.verbose = verbose;
    this.remote = remote;

    // Try to read database name from wrangler.toml
    this.dbName = this.getD1DatabaseName();

    if (this.verbose) {
      console.log('🔧 D1 Database Configuration:');
      console.log(`   Database: ${this.dbName}`);
      console.log(`   Remote: ${this.remote ? 'Yes (production)' : 'No (local dev)'}`);
    }
  }

  private getD1DatabaseName(): string {
    // Try to read from wrangler.toml
    try {
      const wranglerConfig = fs.readFileSync('wrangler.toml', 'utf-8');
      const match = wranglerConfig.match(/database_name\s*=\s*"([^"]+)"/);
      if (match) {
        return match[1];
      }
    } catch {
      // Ignore errors
    }

    // Fallback to environment variable or default
    return process.env.D1_DATABASE_NAME || 'inkweld_dev';
  }

  private async executeWrangler(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        'd1',
        'execute',
        this.dbName,
        '--command',
        command,
        '--json', // Get JSON output instead of table
        ...(this.remote ? ['--remote'] : []),
      ];

      if (this.verbose) {
        console.log(`🔧 Executing: wrangler ${args.join(' ')}`);
      }

      const proc = spawn('wrangler', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Wrangler command failed: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  async connect() {
    if (this.verbose) {
      console.log('📡 Testing D1 connection...');
    }

    try {
      // Test connection by counting users
      await this.executeWrangler('SELECT COUNT(*) as count FROM users');
      if (this.verbose) {
        console.log('✅ Connected to D1 successfully');
      }
    } catch (error) {
      console.error('❌ Failed to connect to D1:', error);
      throw error;
    }
  }

  async disconnect() {
    // No-op for D1 (wrangler handles connections)
  }

  async getSystemStats(): Promise<AdminStats> {
    const userCountResult = await this.executeWrangler('SELECT COUNT(*) as count FROM users');
    const projectCountResult = await this.executeWrangler('SELECT COUNT(*) as count FROM projects');
    const pendingUserCountResult = await this.executeWrangler(
      'SELECT COUNT(*) as count FROM users WHERE approved = 0'
    );

    // Parse JSON results from wrangler output
    const userCount = this.parseWranglerResult(userCountResult)[0]?.count ?? 0;
    const projectCount = this.parseWranglerResult(projectCountResult)[0]?.count ?? 0;
    const pendingUserCount = this.parseWranglerResult(pendingUserCountResult)[0]?.count ?? 0;

    return {
      userCount,
      projectCount,
      pendingUserCount,
      totalDiskUsage: 0, // N/A for D1
      formattedDiskUsage: 'N/A (D1 storage)',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Wrangler output format varies
  private parseWranglerResult(output: string): any[] {
    try {
      // With --json flag, wrangler outputs in format: [{ "results": [...], "success": true, "meta": {...} }]
      const parsed = JSON.parse(output);

      // The output is an array with one object containing results
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].results) {
        return parsed[0].results;
      }

      // Fallback: if it's already an array, return it
      if (Array.isArray(parsed)) {
        return parsed;
      }

      return [];
    } catch (error) {
      if (this.verbose) {
        console.error('Failed to parse wrangler output:', error);
        console.error('Output was:', output);
      }
      return [];
    }
  }

  async listAllUsers(): Promise<User[]> {
    const result = await this.executeWrangler('SELECT * FROM users ORDER BY username ASC');
    return this.parseWranglerResult(result) as User[];
  }

  async listPendingUsers(): Promise<User[]> {
    const result = await this.executeWrangler(
      'SELECT * FROM users WHERE approved = 0 ORDER BY username ASC'
    );
    return this.parseWranglerResult(result) as User[];
  }

  async findUser(identifier: string): Promise<User | null> {
    // Try by ID first
    let result = await this.executeWrangler(
      `SELECT * FROM users WHERE id = '${identifier}' LIMIT 1`
    );
    let users = this.parseWranglerResult(result) as User[];

    if (users.length === 0) {
      // Try by username
      result = await this.executeWrangler(
        `SELECT * FROM users WHERE username = '${identifier}' LIMIT 1`
      );
      users = this.parseWranglerResult(result) as User[];
    }

    return users[0] ?? null;
  }

  async approveUser(identifier: string): Promise<User> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    await this.executeWrangler(`UPDATE users SET approved = 1 WHERE id = '${user.id}'`);

    return { ...user, approved: true };
  }

  async enableUser(identifier: string): Promise<User> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    await this.executeWrangler(`UPDATE users SET enabled = 1 WHERE id = '${user.id}'`);

    return { ...user, enabled: true };
  }

  async disableUser(identifier: string): Promise<User> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    await this.executeWrangler(`UPDATE users SET enabled = 0 WHERE id = '${user.id}'`);

    return { ...user, enabled: false };
  }

  async deleteUser(identifier: string): Promise<void> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    // D1 should have cascade delete configured
    await this.executeWrangler(`DELETE FROM users WHERE id = '${user.id}'`);
  }

  async rejectUser(identifier: string): Promise<void> {
    // For D1, reject is the same as delete
    await this.deleteUser(identifier);
  }

  async listAllProjects(): Promise<Project[]> {
    const result = await this.executeWrangler('SELECT * FROM projects ORDER BY updatedDate DESC');
    return this.parseWranglerResult(result) as Project[];
  }

  async deleteProject(identifier: string): Promise<void> {
    const result = await this.executeWrangler(
      `SELECT * FROM projects WHERE id = '${identifier}' OR slug = '${identifier}' LIMIT 1`
    );
    const projects = this.parseWranglerResult(result) as Project[];
    const project = projects[0];

    if (!project) {
      throw new Error(`Project not found: ${identifier}`);
    }

    await this.executeWrangler(`DELETE FROM projects WHERE id = '${project.id}'`);
  }

  async formatProjectInfo(projectId: string): Promise<string> {
    const projectResult = await this.executeWrangler(
      `SELECT * FROM projects WHERE id = '${projectId}' LIMIT 1`
    );
    const projects = this.parseWranglerResult(projectResult) as Project[];
    const project = projects[0];

    if (!project) return 'Project not found';

    const userResult = await this.executeWrangler(
      `SELECT * FROM users WHERE id = '${project.userId}' LIMIT 1`
    );
    const users = this.parseWranglerResult(userResult) as User[];
    const user = users[0];

    if (!user) return `${project.slug} - "${project.title}" (User not found)`;

    const createdDate = new Date(project.createdDate).toISOString().split('T')[0];
    return `${user.username}/${project.slug} - "${project.title}" (Created: ${createdDate})`;
  }

  formatBytes(_bytes: number): string {
    return 'N/A';
  }

  formatUserInfo(user: User): string {
    const status = user.approved ? (user.enabled ? 'Active' : 'Disabled') : 'Pending';
    const auth = user.githubId ? ' [GitHub]' : ' [Local]';
    return `${user.username} (${user.id}) - ${status}${auth} - ${user.email || 'No email'}`;
  }
}

class AdminCLI {
  public readonly db: DatabaseInstance; // Make public for display functions
  private sqlite: BunDatabase;
  public readonly dataDir: string;
  public readonly verbose: boolean;
  public readonly dbType: string;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
    this.dataDir = path.resolve(process.env.DATA_PATH || './data');
    this.dbType = process.env.DB_TYPE || 'sqlite';

    // Only support bun-sqlite for local database
    const dbPath = process.env.DB_PATH || path.join(this.dataDir, 'inkweld.db');
    const resolvedPath = path.resolve(process.cwd(), dbPath);

    if (this.verbose) {
      console.log('🔧 Database Configuration:');
      console.log(`   DB_TYPE: ${this.dbType}`);
      console.log(`   DB_PATH: ${resolvedPath}`);
      console.log(`   DATA_PATH: ${this.dataDir}`);
      console.log(`   Database file exists: ${fs.existsSync(resolvedPath)}`);

      if (fs.existsSync(resolvedPath)) {
        const stats = fs.statSync(resolvedPath);
        console.log(`   Database file size: ${this.formatBytes(stats.size)}`);
        console.log(`   Last modified: ${stats.mtime.toISOString()}`);
      }
    }

    // Initialize bun:sqlite
    this.sqlite = new BunDatabase(resolvedPath);
    this.db = drizzle(this.sqlite, { schema });
  }

  async connect() {
    if (this.verbose) {
      console.log('📡 Connecting to database...');
    }

    try {
      // Test the connection by checking if tables exist
      await this.checkDatabaseTables();
      if (this.verbose) {
        console.log('✅ Connected to database successfully');
      }
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async checkDatabaseTables() {
    try {
      // Try to count records to verify tables exist
      const userCount = await this.db.select({ count: sql<number>`count(*)` }).from(users);
      const projectCount = await this.db.select({ count: sql<number>`count(*)` }).from(projects);

      if (this.verbose) {
        console.log('📋 Database tables verified:');
        console.log(`   Users table: ✅ (${userCount[0]?.count ?? 0} records)`);
        console.log(`   Projects table: ✅ (${projectCount[0]?.count ?? 0} records)`);
      }
    } catch (error: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling needs message property
      const err = error as any;
      console.log('⚠️  Database table check failed:');
      if (err.message?.includes('no such table')) {
        console.log('   Tables do not exist - database may need to be initialized');
        console.log(
          '   Run the web application first to create tables, or run database migrations'
        );
      } else {
        console.log(`   Error: ${err.message || 'Unknown error'}`);
      }
      throw error;
    }
  }

  async disconnect() {
    // Close the SQLite connection
    this.sqlite.close();
  }

  async getSystemStats(): Promise<AdminStats> {
    const userCountResult = await this.db.select({ count: sql<number>`count(*)` }).from(users);
    const projectCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(projects);
    const pendingUserCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.approved, false));

    const userCount = userCountResult[0]?.count ?? 0;
    const projectCount = projectCountResult[0]?.count ?? 0;
    const pendingUserCount = pendingUserCountResult[0]?.count ?? 0;

    const diskUsage = await this.calculateDiskUsage();

    return {
      userCount,
      projectCount,
      pendingUserCount,
      totalDiskUsage: diskUsage,
      formattedDiskUsage: this.formatBytes(diskUsage),
    };
  }

  async listAllUsers(): Promise<User[]> {
    return await this.db.select().from(users).orderBy(asc(users.username));
  }

  async listPendingUsers(): Promise<User[]> {
    return await this.db
      .select()
      .from(users)
      .where(eq(users.approved, false))
      .orderBy(asc(users.username));
  }

  async findUser(identifier: string): Promise<User | null> {
    // Try by ID first
    let userResults = await this.db.select().from(users).where(eq(users.id, identifier));

    if (userResults.length === 0) {
      // Try by username
      userResults = await this.db.select().from(users).where(eq(users.username, identifier));
    }

    return userResults[0] ?? null;
  }

  async approveUser(identifier: string): Promise<User> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    const updated = await this.db
      .update(users)
      .set({ approved: true })
      .where(eq(users.id, user.id))
      .returning();

    return updated[0];
  }

  async rejectUser(identifier: string): Promise<User> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    const updated = await this.db
      .update(users)
      .set({ approved: false })
      .where(eq(users.id, user.id))
      .returning();

    return updated[0];
  }

  async enableUser(identifier: string): Promise<User> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    const updated = await this.db
      .update(users)
      .set({ enabled: true })
      .where(eq(users.id, user.id))
      .returning();

    return updated[0];
  }

  async disableUser(identifier: string): Promise<User> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    const updated = await this.db
      .update(users)
      .set({ enabled: false })
      .where(eq(users.id, user.id))
      .returning();

    return updated[0];
  }

  async deleteUser(identifier: string): Promise<void> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    if (!user.username) {
      throw new Error(`User has no username: ${identifier}`);
    }

    // Delete user's data directory
    const userDataDir = path.join(this.dataDir, user.username);
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true });
      if (this.verbose) {
        console.log(`   Deleted data directory: ${userDataDir}`);
      }
    }

    // Delete user from database (will cascade to projects)
    await this.db.delete(users).where(eq(users.id, user.id));
  }

  async listAllProjects(): Promise<Project[]> {
    return await this.db.select().from(projects).orderBy(desc(projects.updatedDate));
  }

  async listUserProjects(identifier: string): Promise<Project[]> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    return await this.db
      .select()
      .from(projects)
      .where(eq(projects.userId, user.id))
      .orderBy(desc(projects.updatedDate));
  }

  async findProject(identifier: string): Promise<Project | null> {
    // Try by ID first
    let projectResults = await this.db.select().from(projects).where(eq(projects.id, identifier));

    if (projectResults.length === 0) {
      // Try by slug
      projectResults = await this.db.select().from(projects).where(eq(projects.slug, identifier));
    }

    return projectResults[0] ?? null;
  }

  async deleteProject(identifier: string): Promise<void> {
    const project = await this.findProject(identifier);
    if (!project) {
      throw new Error(`Project not found: ${identifier}`);
    }

    // Get user to find data directory
    const userResults = await this.db.select().from(users).where(eq(users.id, project.userId));
    const user = userResults[0];

    if (user) {
      if (!user.username) {
        console.warn(`User ${project.userId} has no username`);
        return;
      }

      // TypeScript doesn't narrow after early return, so we know username is non-null here
      const username = user.username as string;

      // Delete project's data directory
      const projectDataDir = path.join(this.dataDir, username, project.slug);
      if (fs.existsSync(projectDataDir)) {
        fs.rmSync(projectDataDir, { recursive: true });
        if (this.verbose) {
          console.log(`   Deleted data directory: ${projectDataDir}`);
        }
      }
    }

    // Delete project from database
    await this.db.delete(projects).where(eq(projects.id, project.id));
  }

  async calculateDiskUsage(): Promise<number> {
    if (!fs.existsSync(this.dataDir)) {
      return 0;
    }

    return this.getDirectorySize(this.dataDir);
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    let size = 0;

    try {
      const stat = await fs.promises.stat(dirPath);

      if (stat.isFile()) {
        return stat.size;
      }

      if (stat.isDirectory()) {
        const items = await fs.promises.readdir(dirPath);

        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          size += await this.getDirectorySize(itemPath);
        }
      }
    } catch (error) {
      console.warn(`Error calculating size for ${dirPath}:`, error);
    }

    return size;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUserInfo(user: User): string {
    const status = user.approved ? (user.enabled ? 'Active' : 'Disabled') : 'Pending';
    const auth = user.githubId ? ' [GitHub]' : ' [Local]';

    return `${user.username} (${user.id}) - ${status}${auth} - ${user.email || 'No email'}`;
  }

  async formatProjectInfo(projectId: string): Promise<string> {
    const project = await this.findProject(projectId);
    if (!project) return 'Project not found';

    const userResults = await this.db.select().from(users).where(eq(users.id, project.userId));
    const user = userResults[0];

    if (!user) return `${project.slug} - "${project.title}" (User not found)`;

    const createdDate = new Date(project.createdDate).toISOString().split('T')[0];
    return `${user.username}/${project.slug} - "${project.title}" (Created: ${createdDate})`;
  }

  async getProjectDiskUsage(): Promise<ProjectDiskUsage[]> {
    const allProjects = await this.listAllProjects();
    const results: ProjectDiskUsage[] = [];

    for (const project of allProjects) {
      // Get user for this project
      const userResults = await this.db.select().from(users).where(eq(users.id, project.userId));
      const user = userResults[0];

      if (!user || !user.username) continue;

      // TypeScript doesn't narrow after continue, so we know username is non-null here
      const username = user.username as string;

      // Calculate disk usage for this project's directory
      const projectDir = path.join(this.dataDir, username, project.slug);
      const diskUsage = await this.getDirectorySize(projectDir);

      results.push({
        project,
        diskUsage,
        formattedDiskUsage: this.formatBytes(diskUsage),
      });
    }

    // Sort by disk usage descending
    return results.sort((a, b) => b.diskUsage - a.diskUsage);
  }

  async getUserDiskUsage(): Promise<UserDiskUsage[]> {
    const allUsers = await this.listAllUsers();
    const results: UserDiskUsage[] = [];

    for (const user of allUsers) {
      // Get all projects for this user
      const userProjects = await this.listUserProjects(user.id);

      // Calculate total disk usage for this user's projects
      let totalDiskUsage = 0;
      const userDir = path.join(this.dataDir, user.username || 'unknown');

      if (fs.existsSync(userDir)) {
        totalDiskUsage = await this.getDirectorySize(userDir);
      }

      results.push({
        user,
        projectCount: userProjects.length,
        diskUsage: totalDiskUsage,
        formattedDiskUsage: this.formatBytes(totalDiskUsage),
      });
    }

    // Sort by disk usage descending
    return results.sort((a, b) => b.diskUsage - a.diskUsage);
  }
}

async function showHelp() {
  console.log(`
Inkweld Admin CLI - Standalone Database Management Tool

USAGE:
  bun run admin-cli.ts [--verbose] [--remote] <command> [options]

OPTIONS:
  --verbose, -v                   Show detailed debug information
  --remote, -r                    Use remote D1 database (for D1 only, accesses production)

COMMANDS:
  stats                           Show system statistics
  debug                           Show detailed environment and database information
  users list                      List all users
  users pending                   List pending users awaiting approval
  users approve <username|id>     Approve a pending user
  users reject <username|id>      Reject and delete a pending user
  users enable <username|id>      Enable a user account
  users disable <username|id>     Disable a user account
  users delete <username|id>      Delete a user account
  projects list                   List all projects with owners
  disk usage                      Show disk usage report (SQLite only)
  disk by-project                 Show disk usage by project (SQLite only)
  disk by-user                    Show disk usage by user (SQLite only)
  deploy                          Interactive deployment wizard
  help                            Show this help message

EXAMPLES:
  # Local SQLite (default)
  bun run admin-cli.ts stats
  bun run admin-cli.ts --verbose debug
  bun run admin-cli.ts users approve alice

  # D1 Database (set DB_TYPE=d1 in .env)
  DB_TYPE=d1 bun run admin-cli.ts stats                    # Local D1 dev
  DB_TYPE=d1 bun run admin-cli.ts --remote users list      # Remote D1 prod
  DB_TYPE=d1 bun run admin-cli.ts --remote users approve alice

NOTE: This tool connects directly to the database and bypasses the web application.
      Use with caution in production environments.

      For D1 databases, this CLI wraps 'wrangler d1 execute' commands.
      Make sure wrangler is installed and configured.
`);
}

async function handleDeployWizard() {
  console.log('🚀 Inkweld Deployment Wizard');
  console.log('═'.repeat(80));
  console.log('');
  console.log('This wizard will help you deploy Inkweld using your preferred method.');
  console.log('');

  // Deployment method selection
  console.log('📦 Choose your deployment method:');
  console.log('');
  console.log('1. Docker (Recommended for self-hosting)');
  console.log('   ✓ Easy to set up and maintain');
  console.log('   ✓ Runs on any server with Docker');
  console.log('   ✓ Full control over your data');
  console.log('');
  console.log('2. Cloudflare Workers');
  console.log('   ✓ Serverless, globally distributed');
  console.log('   ✓ Low latency worldwide');
  console.log('   ✓ Pay-per-use pricing');
  console.log('');
  console.log('3. Docker Compose (Multi-container setup)');
  console.log('   ✓ Includes PostgreSQL database');
  console.log('   ✓ Production-ready configuration');
  console.log('   ✓ Easy to scale');
  console.log('');

  const method = await promptSelection('Select deployment method (1-3):', ['1', '2', '3']);

  switch (method) {
    case '1':
      await showDockerDeployment();
      break;
    case '2':
      await showCloudflareDeployment();
      break;
    case '3':
      await showDockerComposeDeployment();
      break;
  }

  // Close stdin to allow process to exit
  process.stdin.pause();
  process.stdin.destroy();
}

async function promptSelection(question: string, validOptions: string[]): Promise<string> {
  console.log('');
  process.stdout.write(`${question} `);

  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data: string) => {
      const input = data.trim();
      if (validOptions.includes(input)) {
        resolve(input);
      } else {
        console.log(`Invalid option. Please enter one of: ${validOptions.join(', ')}`);
        resolve(promptSelection(question, validOptions));
      }
    });
  });
}

async function showDockerDeployment() {
  console.log('');
  console.log('🐳 Interactive Docker Deployment');
  console.log('═'.repeat(80));
  console.log('');
  console.log('This wizard will help you configure and deploy Inkweld with Docker.');
  console.log('');

  // Check if Docker is installed
  try {
    execSync('docker --version', { stdio: 'ignore' });
  } catch {
    console.error('❌ Docker is not installed or not in PATH');
    console.log('');
    console.log('Please install Docker first:');
    console.log('  • Windows/Mac: https://www.docker.com/products/docker-desktop');
    console.log('  • Linux: https://docs.docker.com/engine/install/');
    console.log('');
    return;
  }

  console.log('✅ Docker is installed');
  console.log('');

  // Check for existing .env file
  const envPath = path.join(process.cwd(), '.env');
  let config: Record<string, string> = {};

  if (fs.existsSync(envPath)) {
    console.log('📄 Found existing .env file');
    const useExisting = await promptYesNo('Use existing configuration?', true);

    if (useExisting) {
      console.log('✅ Using existing .env configuration');
      console.log('');

      // Parse existing .env to get PORT for display
      const envContent = fs.readFileSync(envPath, 'utf8');
      const portMatch = envContent.match(/^PORT=(.+)$/m);
      config.PORT = portMatch ? portMatch[1] : '8333';
      const clientUrlMatch = envContent.match(/^CLIENT_URL=(.+)$/m);
      config.CLIENT_URL = clientUrlMatch ? clientUrlMatch[1] : 'http://localhost:8333';

      await buildAndRunDocker(config);
      return;
    } else {
      console.log('');
      console.log('Creating new configuration...');
      console.log('');
    }
  }

  // Get configuration from user
  config = await gatherDockerConfig();

  // Generate .env file
  await generateEnvFile(config);

  // Ask if they want to build and run now
  const shouldDeploy = await promptYesNo('Build and start Docker container now?', true);

  if (shouldDeploy) {
    await buildAndRunDocker(config);
  } else {
    console.log('');
    console.log('📝 Configuration saved to .env file');
    console.log('');
    console.log('To build and run manually:');
    console.log('  $ docker build -t inkweld/backend:local -f backend/Dockerfile .');
    console.log(
      '  $ docker run -d -p 8333:8333 -v inkweld_data:/data --env-file backend/.env --name inkweld-backend inkweld/backend:local'
    );
    console.log('');
  }
}

async function gatherDockerConfig(): Promise<Record<string, string>> {
  console.log('📋 Configuration Questions');
  console.log('─'.repeat(80));
  console.log('');

  const config: Record<string, string> = {};

  // Port
  config.PORT = await promptWithDefault('Port to run on', '8333');

  // Session secret
  const generateSecret = await promptYesNo('Generate a secure session secret automatically?', true);
  if (generateSecret) {
    config.SESSION_SECRET = randomBytes(32).toString('hex');
    console.log(`  Generated: ${config.SESSION_SECRET.substring(0, 16)}...`);
  } else {
    config.SESSION_SECRET = await promptRequired('Enter session secret (32+ characters)');
  }

  // Database type
  console.log('');
  console.log('Database options:');
  console.log('  1. SQLite (simpler, single file)');
  console.log('  2. PostgreSQL (production-ready, requires separate DB)');
  const dbChoice = await promptSelection('Select database type (1-2):', ['1', '2']);
  config.DB_TYPE = dbChoice === '1' ? 'sqlite' : 'postgres';

  if (config.DB_TYPE === 'postgres') {
    config.DATABASE_URL = await promptRequired('Enter PostgreSQL connection URL');
  }

  // Client URL / Domain
  config.CLIENT_URL = await promptWithDefault(
    'Domain/URL where Inkweld will be accessed',
    'http://localhost:8333'
  );
  config.ALLOWED_ORIGINS = config.CLIENT_URL;

  // User approval
  config.USER_APPROVAL_REQUIRED = (await promptYesNo(
    'Require admin approval for new user signups?',
    true
  ))
    ? 'true'
    : 'false';

  // GitHub OAuth
  const enableGitHub = await promptYesNo('Enable GitHub OAuth login?', false);
  config.GITHUB_ENABLED = enableGitHub ? 'true' : 'false';

  if (enableGitHub) {
    config.GITHUB_CLIENT_ID = await promptRequired('GitHub OAuth Client ID');
    config.GITHUB_CLIENT_SECRET = await promptRequired('GitHub OAuth Client Secret');
    config.GITHUB_CALLBACK_URL = `${config.CLIENT_URL}/api/auth/github/callback`;
  }

  console.log('');
  return config;
}

async function generateEnvFile(config: Record<string, string>): Promise<void> {
  console.log('📝 Generating .env file...');

  const envContent = [
    '# Inkweld Configuration',
    '# Generated by deployment wizard',
    `# Generated at: ${new Date().toISOString()}`,
    '',
    '# Server Configuration',
    `PORT=${config.PORT}`,
    `SESSION_SECRET=${config.SESSION_SECRET}`,
    '',
    '# Database Configuration',
    `DB_TYPE=${config.DB_TYPE}`,
  ];

  if (config.DATABASE_URL) {
    envContent.push(`DATABASE_URL=${config.DATABASE_URL}`);
  }

  envContent.push(
    '',
    '# CORS and Security',
    `CLIENT_URL=${config.CLIENT_URL}`,
    `ALLOWED_ORIGINS=${config.ALLOWED_ORIGINS}`,
    '',
    '# User Management',
    `USER_APPROVAL_REQUIRED=${config.USER_APPROVAL_REQUIRED}`,
    '',
    '# GitHub OAuth',
    `GITHUB_ENABLED=${config.GITHUB_ENABLED}`
  );

  if (config.GITHUB_CLIENT_ID) {
    envContent.push(
      `GITHUB_CLIENT_ID=${config.GITHUB_CLIENT_ID}`,
      `GITHUB_CLIENT_SECRET=${config.GITHUB_CLIENT_SECRET}`,
      `GITHUB_CALLBACK_URL=${config.GITHUB_CALLBACK_URL}`
    );
  }

  const envPath = path.join(process.cwd(), '.env');
  fs.writeFileSync(envPath, envContent.join('\n'));

  console.log(`✅ Configuration saved to ${envPath}`);
  console.log('');
}

async function buildAndRunDocker(config: Record<string, string>): Promise<void> {
  console.log('🔨 Building Docker image...');
  console.log('');

  // Check if we're in the backend directory
  const isInBackend = process.cwd().endsWith('backend');
  const projectRoot = isInBackend ? path.join(process.cwd(), '..') : process.cwd();
  const dockerfilePath = path.join(projectRoot, 'backend', 'Dockerfile');

  if (!fs.existsSync(dockerfilePath)) {
    console.error('❌ Could not find backend/Dockerfile');
    console.log('   Make sure you run this from the project root or backend directory');
    return;
  }

  try {
    // Build the image
    console.log('Building image (this may take a few minutes)...');
    execSync(`docker build -t inkweld/backend:local -f ${dockerfilePath} ${projectRoot}`, {
      stdio: 'inherit',
      cwd: projectRoot,
    });

    console.log('');
    console.log('✅ Docker image built successfully');
    console.log('');

    // Check if container already exists
    try {
      execSync('docker ps -a --filter name=inkweld-backend --format "{{.Names}}"', {
        stdio: 'pipe',
      });
      const containerExists = execSync(
        'docker ps -a --filter name=inkweld-backend --format "{{.Names}}"',
        { encoding: 'utf8' }
      ).trim();

      if (containerExists) {
        console.log('⚠️  Container "inkweld-backend" already exists');
        const shouldRemove = await promptYesNo(
          'Remove existing container and create new one?',
          true
        );

        if (shouldRemove) {
          console.log('Stopping and removing existing container...');
          execSync('docker stop inkweld-backend', { stdio: 'ignore' });
          execSync('docker rm inkweld-backend', { stdio: 'ignore' });
        } else {
          console.log('Keeping existing container. Exiting.');
          return;
        }
      }
    } catch {
      // Container doesn't exist, continue
    }

    // Create volume if it doesn't exist
    console.log('Creating data volume...');
    try {
      execSync('docker volume create inkweld_data', { stdio: 'pipe' });
      console.log('✅ Volume created');
    } catch {
      console.log('✅ Volume already exists');
    }
    console.log('');

    // Run the container
    console.log('🚀 Starting Inkweld container...');
    const envPath = path.join(process.cwd(), '.env');

    execSync(
      `docker run -d -p ${config.PORT}:${config.PORT} -v inkweld_data:/data --env-file ${envPath} --name inkweld-backend inkweld/backend:local`,
      { stdio: 'inherit' }
    );

    console.log('');
    console.log('✅ Inkweld is now running!');
    console.log('');
    console.log('═'.repeat(80));
    console.log('');
    console.log(`🌐 Access Inkweld at: ${config.CLIENT_URL}`);
    console.log('');
    console.log('Useful commands:');
    console.log('  View logs:       docker logs -f inkweld-backend');
    console.log('  Stop container:  docker stop inkweld-backend');
    console.log('  Start container: docker start inkweld-backend');
    console.log('  Remove container: docker rm -f inkweld-backend');
    console.log('');
    console.log('📖 Documentation: https://inkweld.org/docs');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Deployment failed');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
    console.log('');
    console.log('💡 Try running the commands manually to see detailed error messages');
  }
}

async function promptWithDefault(question: string, defaultValue: string): Promise<string> {
  process.stdout.write(`${question} [${defaultValue}]: `);

  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data: string) => {
      const input = data.trim();
      resolve(input || defaultValue);
    });
  });
}

async function promptRequired(question: string): Promise<string> {
  process.stdout.write(`${question}: `);

  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data: string) => {
      const input = data.trim();
      if (input) {
        resolve(input);
      } else {
        console.log('This field is required.');
        resolve(promptRequired(question));
      }
    });
  });
}

async function promptYesNo(question: string, defaultValue: boolean): Promise<boolean> {
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';
  process.stdout.write(`${question} [${defaultStr}]: `);

  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data: string) => {
      const input = data.trim().toLowerCase();
      if (input === '') {
        resolve(defaultValue);
      } else if (input === 'y' || input === 'yes') {
        resolve(true);
      } else if (input === 'n' || input === 'no') {
        resolve(false);
      } else {
        console.log('Please answer yes or no.');
        resolve(promptYesNo(question, defaultValue));
      }
    });
  });
}

async function showCloudflareDeployment() {
  console.log('');
  console.log('☁️  Cloudflare Workers Deployment Guide');
  console.log('═'.repeat(80));
  console.log('');
  console.log('Prerequisites:');
  console.log('  • Cloudflare account with Workers Paid plan');
  console.log('  • Wrangler CLI installed (npm install -g wrangler)');
  console.log('');
  console.log('Step 1: Login to Cloudflare');
  console.log('  $ npx wrangler login');
  console.log('');
  console.log('Step 2: Create D1 databases');
  console.log('  $ npx wrangler d1 create inkweld_dev');
  console.log('  $ npx wrangler d1 create inkweld_prod');
  console.log('  ');
  console.log('  Save the database IDs from the output');
  console.log('');
  console.log('Step 3: Configure wrangler.toml');
  console.log('  $ cd backend');
  console.log('  $ cp wrangler.toml.example wrangler.toml');
  console.log('  ');
  console.log('  Edit wrangler.toml and add your database IDs');
  console.log('');
  console.log('Step 4: Run database migrations');
  console.log('  $ npx wrangler d1 execute inkweld_dev --file=./drizzle/0000_safe_mysterio.sql');
  console.log('  $ npx wrangler d1 execute inkweld_prod --file=./drizzle/0000_safe_mysterio.sql');
  console.log('');
  console.log('Step 5: Set secrets');
  console.log('  $ echo "your-secret-key" | npx wrangler secret put SESSION_SECRET');
  console.log(
    '  $ echo "your-secret-key" | npx wrangler secret put SESSION_SECRET --env production'
  );
  console.log('');
  console.log('Step 6: Deploy');
  console.log('  $ bun run deploy:dev      # Deploy to dev');
  console.log('  $ bun run deploy:prod     # Deploy to production');
  console.log('');
  console.log('Step 7: Configure custom domain (optional)');
  console.log('  Go to Workers & Pages → Your worker → Settings → Triggers');
  console.log('  Add your custom domain');
  console.log('');
  console.log('📖 For detailed documentation, see:');
  console.log('   https://inkweld.org/docs/hosting/cloudflare');
  console.log('');
}

async function showDockerComposeDeployment() {
  console.log('');
  console.log('🐳 Docker Compose Deployment Guide');
  console.log('═'.repeat(80));
  console.log('');
  console.log('Prerequisites:');
  console.log('  • Docker and Docker Compose installed');
  console.log('  • Ports 8333 and 5432 available');
  console.log('');
  console.log('Step 1: Review compose.yaml');
  console.log('  The repository includes a compose.yaml with:');
  console.log('  • Inkweld backend service');
  console.log('  • PostgreSQL database');
  console.log('  • Named volumes for data persistence');
  console.log('');
  console.log('Step 2: Create .env file (if not exists)');
  console.log('  $ cp backend/.env.example backend/.env');
  console.log('');
  console.log('Step 3: Generate secrets');
  console.log('  Edit backend/.env and set:');
  console.log('  • SESSION_SECRET (32+ characters)');
  console.log('  • POSTGRES_PASSWORD');
  console.log('  • DATABASE_URL');
  console.log('');
  console.log('Step 4: Start services');
  console.log('  $ docker compose up -d');
  console.log('');
  console.log('Step 5: Check logs');
  console.log('  $ docker compose logs -f inkweld');
  console.log('');
  console.log('Step 6: Access Inkweld');
  console.log('  Open http://localhost:8333 in your browser');
  console.log('');
  console.log('Management commands:');
  console.log('  $ docker compose stop     # Stop services');
  console.log('  $ docker compose start    # Start services');
  console.log('  $ docker compose down     # Stop and remove containers');
  console.log('');
  console.log('📖 For detailed documentation, see:');
  console.log('   https://inkweld.org/docs/hosting/docker');
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const verboseIndex = args.findIndex((arg) => arg === '--verbose' || arg === '-v');
  const verbose = verboseIndex !== -1;
  if (verbose) {
    args.splice(verboseIndex, 1);
  }

  const remoteIndex = args.findIndex((arg) => arg === '--remote' || arg === '-r');
  const remote = remoteIndex !== -1;
  if (remote) {
    args.splice(remoteIndex, 1);
  }

  if (args.length === 0 || args[0] === 'help') {
    await showHelp();
    return;
  }

  // Add debug info only if verbose
  if (verbose) {
    console.log('🐛 Debug Information:');
    console.log(`   Current working directory: ${process.cwd()}`);
    console.log(`   Script location: ${import.meta.url}`);
    console.log(`   Bun version: ${process.version}`);
    console.log('');
  }

  // Determine which CLI to use based on DB_TYPE
  const dbType = process.env.DB_TYPE || 'sqlite';
  const cli: AdminCLI | D1AdminCLI =
    dbType === 'd1' ? new D1AdminCLI(verbose, remote) : new AdminCLI(verbose);

  try {
    await cli.connect();

    switch (args[0]) {
      case 'stats':
        await handleStats(cli);
        break;

      case 'debug':
        await handleDebug(cli);
        break;

      case 'users':
        await handleUserCommands(cli, args.slice(1));
        break;

      case 'projects':
        await handleProjectCommands(cli, args.slice(1));
        break;

      case 'disk':
        if (cli instanceof AdminCLI) {
          await handleDiskCommands(cli, args.slice(1));
        } else {
          console.log('💡 Disk usage is not available for D1 databases');
          console.log('   D1 storage is managed by Cloudflare');
        }
        break;

      case 'deploy':
        await handleDeployWizard();
        break;

      default:
        console.error(`Unknown command: ${args[0]}`);
        console.log('Run "bun run admin-cli.ts help" for usage information.');
        process.exit(1);
    }
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI error handling needs message access
    const err = error as any;
    console.error('\n❌ Error occurred:');
    console.error(`   ${err.message || 'Unknown error'}`);

    if (err.message?.includes('no such table')) {
      console.log('\n💡 Possible solutions:');
      console.log('   1. Run the web application first to initialize the database');
      console.log("   2. Check if you're in the correct directory (should be in /backend)");
      console.log('   3. Verify your .env file contains the correct DATA_PATH');
      console.log('   4. If using PostgreSQL, ensure DATABASE_URL is correct');
    }

    process.exit(1);
  } finally {
    await cli.disconnect();
  }
}

async function handleStats(cli: AdminCLI | D1AdminCLI) {
  if (cli.verbose) {
    console.log('🔍 Gathering system statistics...\n');
  }

  const stats = await cli.getSystemStats();

  console.log('📊 Inkweld System Statistics');
  console.log('═'.repeat(40));
  console.log(`👥 Total Users:        ${stats.userCount}`);
  console.log(`📋 Total Projects:     ${stats.projectCount}`);
  console.log(`⏳ Pending Users:      ${stats.pendingUserCount}`);
  console.log(`💾 Disk Usage:        ${stats.formattedDiskUsage}`);
  console.log('');
}

async function handleDebug(cli: AdminCLI | D1AdminCLI) {
  console.log('🔍 Gathering detailed environment and database information...\n');

  console.log('🔧 Database Configuration:');

  if (cli instanceof D1AdminCLI) {
    console.log(`   Database Type: D1 (Cloudflare)`);
    console.log(`   Database Name: ${cli.dbName}`);
    console.log(`   Remote: ${cli.remote ? 'Yes (production)' : 'No (local dev)'}`);
  } else {
    console.log(`   DATA_PATH: ${cli.dataDir}`);
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '[SET]' : '[NOT SET]'}`);

    if (process.env.DATABASE_URL) {
      // Production database (PostgreSQL)
      console.log(`   Using PostgreSQL from DATABASE_URL`);
    } else {
      // Development database (SQLite)
      const dbPath = path.resolve(cli.dataDir, 'database.sqlite');
      console.log(`   Using SQLite database at: ${dbPath}`);
      console.log(`   Database file exists: ${fs.existsSync(dbPath)}`);

      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log(`   Database file size: ${cli.formatBytes(stats.size)}`);
        console.log(`   Last modified: ${stats.mtime.toISOString()}`);
      }
    }
  }

  console.log('');
}

async function handleUserCommands(cli: AdminCLI | D1AdminCLI, args: string[]) {
  if (args.length === 0) {
    console.error(
      'User command requires a subcommand: list, pending, approve, reject, enable, disable, delete'
    );
    return;
  }

  switch (args[0]) {
    case 'list':
      await listAllUsers(cli);
      break;

    case 'pending':
      await listPendingUsers(cli);
      break;

    case 'approve':
      if (args.length < 2) {
        console.error('approve command requires a username or ID');
        return;
      }
      await approveUser(cli, args[1]);
      break;

    case 'reject':
      if (args.length < 2) {
        console.error('reject command requires a username or ID');
        return;
      }
      await rejectUser(cli, args[1]);
      break;

    case 'enable':
      if (args.length < 2) {
        console.error('enable command requires a username or ID');
        return;
      }
      await enableUser(cli, args[1]);
      break;

    case 'disable':
      if (args.length < 2) {
        console.error('disable command requires a username or ID');
        return;
      }
      await disableUser(cli, args[1]);
      break;

    case 'delete':
      if (args.length < 2) {
        console.error('delete command requires a username or ID');
        return;
      }
      await deleteUser(cli, args[1]);
      break;

    default:
      console.error(`Unknown user command: ${args[0]}`);
  }
}

async function handleProjectCommands(cli: AdminCLI | D1AdminCLI, args: string[]) {
  if (args.length === 0 || args[0] !== 'list') {
    console.error('Project command requires "list" subcommand');
    return;
  }

  await listAllProjects(cli);
}

async function handleDiskCommands(cli: AdminCLI, args: string[]) {
  if (args.length === 0) {
    console.error('Disk command requires a subcommand: usage, by-project, by-user');
    return;
  }

  switch (args[0]) {
    case 'usage':
      await showDiskUsage(cli);
      break;

    case 'by-project':
      await showDiskUsageByProject(cli);
      break;

    case 'by-user':
      await showDiskUsageByUser(cli);
      break;

    default:
      console.error(`Unknown disk command: ${args[0]}`);
      console.log('Available subcommands: usage, by-project, by-user');
  }
}

async function listAllUsers(cli: AdminCLI | D1AdminCLI) {
  console.log('👥 All Users');
  console.log('═'.repeat(80));

  const users = await cli.listAllUsers();

  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  users.forEach((user) => {
    console.log(cli.formatUserInfo(user));
  });

  console.log(`\nTotal: ${users.length} users`);
}

async function listPendingUsers(cli: AdminCLI | D1AdminCLI) {
  console.log('⏳ Pending Users Awaiting Approval');
  console.log('═'.repeat(80));

  const users = await cli.listPendingUsers();

  if (users.length === 0) {
    console.log('No pending users found.');
    return;
  }

  users.forEach((user) => {
    console.log(cli.formatUserInfo(user));
  });

  console.log(`\nTotal: ${users.length} pending users`);
}

async function approveUser(cli: AdminCLI | D1AdminCLI, identifier: string) {
  console.log(`✅ Approving user: ${identifier}`);

  const user = await cli.approveUser(identifier);
  console.log(`User approved: ${cli.formatUserInfo(user)}`);
}

async function rejectUser(cli: AdminCLI | D1AdminCLI, identifier: string) {
  console.log(`❌ Rejecting user: ${identifier}`);

  await cli.rejectUser(identifier);
  console.log(`User rejected and removed: ${identifier}`);
}

async function enableUser(cli: AdminCLI | D1AdminCLI, identifier: string) {
  console.log(`✅ Enabling user: ${identifier}`);

  const user = await cli.enableUser(identifier);
  console.log(`User enabled: ${cli.formatUserInfo(user)}`);
}

async function disableUser(cli: AdminCLI | D1AdminCLI, identifier: string) {
  console.log(`🚫 Disabling user: ${identifier}`);

  const user = await cli.disableUser(identifier);
  console.log(`User disabled: ${cli.formatUserInfo(user)}`);
}

async function deleteUser(cli: AdminCLI | D1AdminCLI, identifier: string) {
  console.log(`🗑️  Deleting user: ${identifier}`);

  // Confirm deletion
  const confirm = prompt(
    `Are you sure you want to delete user '${identifier}'? This cannot be undone. (yes/no): `
  );
  if (confirm?.toLowerCase() !== 'yes') {
    console.log('Delete cancelled.');
    return;
  }

  await cli.deleteUser(identifier);
  console.log(`User deleted: ${identifier}`);
}

async function listAllProjects(cli: AdminCLI | D1AdminCLI) {
  console.log('📋 All Projects');
  console.log('═'.repeat(80));

  const projects = await cli.listAllProjects();

  if (projects.length === 0) {
    console.log('No projects found.');
    return;
  }

  for (const project of projects) {
    console.log(await cli.formatProjectInfo(project.id));
  }

  console.log(`\nTotal: ${projects.length} projects`);
}

async function showDiskUsage(cli: AdminCLI) {
  if (cli.verbose) {
    console.log('💾 Calculating disk usage...\n');
  }

  const usage = await cli.calculateDiskUsage();

  console.log('💾 Disk Usage Report');
  console.log('═'.repeat(40));
  console.log(`Total Usage: ${cli.formatBytes(usage)}`);
  console.log(`Data Directory: ${cli.dataDir}`);
  console.log('');
}

async function showDiskUsageByProject(cli: AdminCLI) {
  if (cli.verbose) {
    console.log('💾 Calculating disk usage by project...\n');
  }

  const projectUsage = await cli.getProjectDiskUsage();

  console.log('💾 Disk Usage by Project');
  console.log('═'.repeat(80));

  if (projectUsage.length === 0) {
    console.log('No projects found.');
    return;
  }

  let totalUsage = 0;
  for (const item of projectUsage) {
    totalUsage += item.diskUsage;
    // Get user for the project
    const userResults = await cli.db.select().from(users).where(eq(users.id, item.project.userId));
    const user = userResults[0];
    const username = user?.username || 'unknown';

    console.log(
      `${item.formattedDiskUsage.padStart(10)} | ${username}/${item.project.slug} - "${item.project.title}"`
    );
  }

  console.log('─'.repeat(80));
  console.log(
    `${cli.formatBytes(totalUsage).padStart(10)} | Total (${projectUsage.length} projects)`
  );
  console.log('');
}

async function showDiskUsageByUser(cli: AdminCLI) {
  if (cli.verbose) {
    console.log('💾 Calculating disk usage by user...\n');
  }

  const userUsage = await cli.getUserDiskUsage();

  console.log('💾 Disk Usage by User');
  console.log('═'.repeat(80));

  if (userUsage.length === 0) {
    console.log('No users found.');
    return;
  }

  let totalUsage = 0;
  userUsage.forEach((item) => {
    totalUsage += item.diskUsage;
    const status = item.user.approved ? (item.user.enabled ? 'Active' : 'Disabled') : 'Pending';
    console.log(
      `${item.formattedDiskUsage.padStart(10)} | ${item.user.username} (${item.projectCount} projects) - ${status}`
    );
  });

  console.log('─'.repeat(80));
  console.log(`${cli.formatBytes(totalUsage).padStart(10)} | Total (${userUsage.length} users)`);
  console.log('');
}

// Run the CLI
main().catch(console.error);
