#!/usr/bin/env bun
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from './src/user/user.entity.js';
import { ProjectEntity } from './src/project/project.entity.js';
import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';

// Load environment variables
config({ path: '../.env.local' });
config({ path: '../.env' });

interface AdminStats {
  userCount: number;
  projectCount: number;
  pendingUserCount: number;
  totalDiskUsage: number;
  formattedDiskUsage: string;
}

interface ProjectDiskUsage {
  project: ProjectEntity;
  diskUsage: number;
  formattedDiskUsage: string;
}

interface UserDiskUsage {
  user: UserEntity;
  projectCount: number;
  diskUsage: number;
  formattedDiskUsage: string;
}

class AdminCLI {
  private dataSource: DataSource;
  public readonly dataDir: string;
  public readonly verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
    this.dataDir = path.resolve(process.env.DATA_PATH || './data');
    
    // Configure database connection based on environment
    const dbConfig = this.getDatabaseConfig();
    
    this.dataSource = new DataSource({
      ...dbConfig,
      entities: [UserEntity, ProjectEntity],
      synchronize: false, // Don't auto-sync in production
      logging: false,
    });
  }

  private getDatabaseConfig() {
    const dbType = process.env.DB_TYPE || 'postgres';
    const databaseUrl = process.env.DATABASE_URL;
    
    if (this.verbose) {
      console.log('🔧 Database Configuration:');
      console.log(`   DB_TYPE: ${dbType}`);
      console.log(`   DATA_PATH: ${process.env.DATA_PATH || './data'}`);
      console.log(`   DATABASE_URL: ${databaseUrl ? '[SET]' : '[NOT SET]'}`);
    }
    
    if (dbType === 'sqlite') {
      // SQLite database configuration
      const dbPath = process.env.DB_PATH || './data/system.db';
      const resolvedPath = path.resolve(process.cwd(), dbPath);
      
      if (this.verbose) {
        console.log(`   DB_PATH: ${dbPath}`);
        console.log(`   Using SQLite database at: ${resolvedPath}`);
        console.log(`   Database file exists: ${fs.existsSync(resolvedPath)}`);
        
        if (fs.existsSync(resolvedPath)) {
          const stats = fs.statSync(resolvedPath);
          console.log(`   Database file size: ${this.formatBytes(stats.size)}`);
          console.log(`   Last modified: ${stats.mtime.toISOString()}`);
        }
      }
      
      return {
        type: 'sqlite' as const,
        database: resolvedPath,
      };
    } else if (databaseUrl) {
      // Production database (PostgreSQL) from DATABASE_URL
      if (this.verbose) {
        console.log(`   Using PostgreSQL from DATABASE_URL`);
      }
      return {
        type: 'postgres' as const,
        url: databaseUrl,
      };
    } else {
      // Default PostgreSQL configuration using individual environment variables
      if (this.verbose) {
        console.log(`   Using PostgreSQL with individual config variables`);
      }
      return {
        type: 'postgres' as const,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USERNAME || 'user',
        password: process.env.DB_PASSWORD || 'secret',
        database: process.env.DB_NAME || 'db',
      };
    }
  }

  async connect() {
    if (this.verbose) {
      console.log('📡 Connecting to database...');
    }
    
    try {
      await this.dataSource.initialize();
      if (this.verbose) {
        console.log('✅ Connected to database successfully');
      }
      
      // Test the connection by checking if tables exist
      await this.checkDatabaseTables();
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async checkDatabaseTables() {
    try {
      const userRepo = this.dataSource.getRepository(UserEntity);
      const projectRepo = this.dataSource.getRepository(ProjectEntity);
      
      // Try to count records to verify tables exist
      const userCount = await userRepo.count();
      const projectCount = await projectRepo.count();
      
      if (this.verbose) {
        console.log('📋 Database tables verified:');
        console.log(`   Users table: ✅ (${userCount} records)`);
        console.log(`   Projects table: ✅ (${projectCount} records)`);
      }
    } catch (error: any) {
      console.log('⚠️  Database table check failed:');
      if (error.message.includes('no such table')) {
        console.log('   Tables do not exist - database may need to be initialized');
        console.log('   Run the web application first to create tables, or run database migrations');
      } else {
        console.log(`   Error: ${error.message}`);
      }
      throw error;
    }
  }

  async disconnect() {
    await this.dataSource.destroy();
  }

  async getSystemStats(): Promise<AdminStats> {
    const userRepo = this.dataSource.getRepository(UserEntity);
    const projectRepo = this.dataSource.getRepository(ProjectEntity);

    const userCount = await userRepo.count();
    const projectCount = await projectRepo.count();
    const pendingUserCount = await userRepo.count({ where: { approved: false } });
    
    const diskUsage = await this.calculateDiskUsage();
    
    return {
      userCount,
      projectCount,
      pendingUserCount,
      totalDiskUsage: diskUsage,
      formattedDiskUsage: this.formatBytes(diskUsage),
    };
  }

  async listAllUsers(): Promise<UserEntity[]> {
    const userRepo = this.dataSource.getRepository(UserEntity);
    return userRepo.find({ order: { username: 'ASC' } });
  }

  async listPendingUsers(): Promise<UserEntity[]> {
    const userRepo = this.dataSource.getRepository(UserEntity);
    return userRepo.find({
      where: { approved: false },
      order: { username: 'ASC' },
    });
  }

  async findUser(identifier: string): Promise<UserEntity | null> {
    const userRepo = this.dataSource.getRepository(UserEntity);
    
    // Try by ID first
    let user = await userRepo.findOne({ where: { id: identifier } });
    if (user) return user;
    
    // Try by username
    user = await userRepo.findOne({ where: { username: identifier } });
    return user;
  }

  async approveUser(identifier: string): Promise<UserEntity> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    user.approved = true;
    user.enabled = true;
    
    const userRepo = this.dataSource.getRepository(UserEntity);
    return userRepo.save(user);
  }

  async rejectUser(identifier: string): Promise<void> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    const userRepo = this.dataSource.getRepository(UserEntity);
    await userRepo.remove(user);
  }

  async enableUser(identifier: string): Promise<UserEntity> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    user.enabled = true;
    
    const userRepo = this.dataSource.getRepository(UserEntity);
    return userRepo.save(user);
  }

  async disableUser(identifier: string): Promise<UserEntity> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    user.enabled = false;
    
    const userRepo = this.dataSource.getRepository(UserEntity);
    return userRepo.save(user);
  }

  async deleteUser(identifier: string): Promise<void> {
    const user = await this.findUser(identifier);
    if (!user) {
      throw new Error(`User not found: ${identifier}`);
    }

    const userRepo = this.dataSource.getRepository(UserEntity);
    await userRepo.remove(user);
  }

  async listAllProjects(): Promise<ProjectEntity[]> {
    const projectRepo = this.dataSource.getRepository(ProjectEntity);
    return projectRepo.find({
      relations: ['user'],
      order: { createdDate: 'DESC' },
    });
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

  formatUserInfo(user: UserEntity): string {
    const status = user.approved ? (user.enabled ? 'Active' : 'Disabled') : 'Pending';
    const auth = user.githubId ? ' [GitHub]' : ' [Local]';
    
    return `${user.username} (${user.id}) - ${status}${auth} - ${user.email || 'No email'}`;
  }

  formatProjectInfo(project: ProjectEntity): string {
    return `${project.user.username}/${project.slug} - "${project.title}" (Created: ${project.createdDate.toISOString().split('T')[0]})`;
  }

  async getProjectDiskUsage(): Promise<ProjectDiskUsage[]> {
    const projects = await this.listAllProjects();
    const results: ProjectDiskUsage[] = [];

    for (const project of projects) {
      // Calculate disk usage for this project's directory
      const projectDir = path.join(this.dataDir, 'projects', project.user.username, project.slug);
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
    const users = await this.listAllUsers();
    const results: UserDiskUsage[] = [];

    for (const user of users) {
      // Get all projects for this user
      const projectRepo = this.dataSource.getRepository(ProjectEntity);
      const userProjects = await projectRepo.find({ 
        where: { user: { id: user.id } },
        relations: ['user'] 
      });

      // Calculate total disk usage for this user's projects
      let totalDiskUsage = 0;
      const userDir = path.join(this.dataDir, 'projects', user.username);
      
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
  bun run admin-cli.ts [--verbose] <command> [options]

OPTIONS:
  --verbose, -v                   Show detailed debug information

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
  disk usage                      Show disk usage report
  disk by-project                 Show disk usage by project
  disk by-user                    Show disk usage by user
  help                           Show this help message

EXAMPLES:
  bun run admin-cli.ts stats
  bun run admin-cli.ts --verbose debug
  bun run admin-cli.ts users pending
  bun run admin-cli.ts users approve alice
  bun run admin-cli.ts users disable bob
  bun run admin-cli.ts projects list
  bun run admin-cli.ts disk usage
  bun run admin-cli.ts disk by-project
  bun run admin-cli.ts disk by-user

NOTE: This tool connects directly to the database and bypasses the web application.
      Use with caution in production environments.
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse verbose flag
  const verboseIndex = args.findIndex(arg => arg === '--verbose' || arg === '-v');
  const verbose = verboseIndex !== -1;
  if (verbose) {
    args.splice(verboseIndex, 1);
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
    console.log(`   Node.js version: ${process.version}`);
    console.log('');
  }

  const cli = new AdminCLI(verbose);
  
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
        await handleDiskCommands(cli, args.slice(1));
        break;
      
      default:
        console.error(`Unknown command: ${args[0]}`);
        console.log('Run "bun run admin-cli.ts help" for usage information.');
        process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error occurred:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('no such table')) {
      console.log('\n💡 Possible solutions:');
      console.log('   1. Run the web application first to initialize the database');
      console.log('   2. Check if you\'re in the correct directory (should be in /server)');
      console.log('   3. Verify your .env file contains the correct DATA_PATH');
      console.log('   4. If using PostgreSQL, ensure DATABASE_URL is correct');
    }
    
    process.exit(1);
  } finally {
    await cli.disconnect();
  }
}

async function handleStats(cli: AdminCLI) {
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

async function handleDebug(cli: AdminCLI) {
  console.log('🔍 Gathering detailed environment and database information...\n');
  
  console.log('🔧 Database Configuration:');
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
  
  console.log('');
}

async function handleUserCommands(cli: AdminCLI, args: string[]) {
  if (args.length === 0) {
    console.error('User command requires a subcommand: list, pending, approve, reject, enable, disable, delete');
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

async function handleProjectCommands(cli: AdminCLI, args: string[]) {
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

async function listAllUsers(cli: AdminCLI) {
  console.log('👥 All Users');
  console.log('═'.repeat(80));
  
  const users = await cli.listAllUsers();
  
  if (users.length === 0) {
    console.log('No users found.');
    return;
  }

  users.forEach(user => {
    console.log(cli.formatUserInfo(user));
  });
  
  console.log(`\nTotal: ${users.length} users`);
}

async function listPendingUsers(cli: AdminCLI) {
  console.log('⏳ Pending Users Awaiting Approval');
  console.log('═'.repeat(80));
  
  const users = await cli.listPendingUsers();
  
  if (users.length === 0) {
    console.log('No pending users found.');
    return;
  }

  users.forEach(user => {
    console.log(cli.formatUserInfo(user));
  });
  
  console.log(`\nTotal: ${users.length} pending users`);
}

async function approveUser(cli: AdminCLI, identifier: string) {
  console.log(`✅ Approving user: ${identifier}`);
  
  const user = await cli.approveUser(identifier);
  console.log(`User approved: ${cli.formatUserInfo(user)}`);
}

async function rejectUser(cli: AdminCLI, identifier: string) {
  console.log(`❌ Rejecting user: ${identifier}`);
  
  await cli.rejectUser(identifier);
  console.log(`User rejected and removed: ${identifier}`);
}

async function enableUser(cli: AdminCLI, identifier: string) {
  console.log(`✅ Enabling user: ${identifier}`);
  
  const user = await cli.enableUser(identifier);
  console.log(`User enabled: ${cli.formatUserInfo(user)}`);
}

async function disableUser(cli: AdminCLI, identifier: string) {
  console.log(`🚫 Disabling user: ${identifier}`);
  
  const user = await cli.disableUser(identifier);
  console.log(`User disabled: ${cli.formatUserInfo(user)}`);
}

async function deleteUser(cli: AdminCLI, identifier: string) {
  console.log(`🗑️  Deleting user: ${identifier}`);
  
  // Confirm deletion
  const confirm = prompt(`Are you sure you want to delete user '${identifier}'? This cannot be undone. (yes/no): `);
  if (confirm?.toLowerCase() !== 'yes') {
    console.log('Delete cancelled.');
    return;
  }
  
  await cli.deleteUser(identifier);
  console.log(`User deleted: ${identifier}`);
}

async function listAllProjects(cli: AdminCLI) {
  console.log('📋 All Projects');
  console.log('═'.repeat(80));
  
  const projects = await cli.listAllProjects();
  
  if (projects.length === 0) {
    console.log('No projects found.');
    return;
  }

  projects.forEach(project => {
    console.log(cli.formatProjectInfo(project));
  });
  
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
  projectUsage.forEach(item => {
    totalUsage += item.diskUsage;
    console.log(`${item.formattedDiskUsage.padStart(10)} | ${item.project.user.username}/${item.project.slug} - "${item.project.title}"`);
  });
  
  console.log('─'.repeat(80));
  console.log(`${cli.formatBytes(totalUsage).padStart(10)} | Total (${projectUsage.length} projects)`);
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
  userUsage.forEach(item => {
    totalUsage += item.diskUsage;
    const status = item.user.approved ? (item.user.enabled ? 'Active' : 'Disabled') : 'Pending';
    console.log(`${item.formattedDiskUsage.padStart(10)} | ${item.user.username} (${item.projectCount} projects) - ${status}`);
  });
  
  console.log('─'.repeat(80));
  console.log(`${cli.formatBytes(totalUsage).padStart(10)} | Total (${userUsage.length} users)`);
  console.log('');
}

// Run the CLI
main().catch(console.error); 