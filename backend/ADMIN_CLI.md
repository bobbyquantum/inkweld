# Inkweld Admin CLI

A standalone command-line tool for administering your Inkweld instance. This tool connects directly to the database and bypasses the web application, making it perfect for server administration over SSH.

## Features

- **User Management**: List, approve, reject, enable, disable, and delete users
- **Registration Approval**: Manage pending user registrations  
- **Project Oversight**: List all projects with owner information
- **Disk Usage**: Calculate and report storage usage
- **System Statistics**: Get overview of users, projects, and storage

## Setup

The CLI tool automatically connects to your database using the same configuration as your Inkweld instance. Make sure your `.env` file is properly configured.

## Usage

```bash
# Navigate to the server directory
cd server

# Run any admin command
bun run admin help
```

### Available Commands

#### System Information
```bash
# Show system statistics
bun run admin stats
```

#### User Management
```bash
# List all users
bun run admin users list

# List pending users awaiting approval
bun run admin users pending

# Approve a pending user
bun run admin users approve alice
bun run admin users approve 123e4567-e89b-12d3-a456-426614174000

# Reject and delete a pending user
bun run admin users reject bob

# Enable/disable existing users
bun run admin users enable alice
bun run admin users disable bob

# Delete a user (with confirmation)
bun run admin users delete alice
```

#### Project Management
```bash
# List all projects
bun run admin projects list
```

#### Storage Management
```bash
# Show disk usage report
bun run admin disk usage
```

## Registration Approval Workflow

By default, new user registrations require admin approval:

1. User registers via the web interface
2. User account is created but marked as `approved: false` and `enabled: false`
3. Admin uses CLI to review pending users: `bun run admin users pending`
4. Admin approves: `bun run admin users approve username` (sets both `approved: true` and `enabled: true`)
5. User can now log in and use the application

Alternatively, admins can reject registrations: `bun run admin users reject username`

## User States

- **Pending**: `approved: false, enabled: false` - New registration waiting for approval
- **Active**: `approved: true, enabled: true` - Can use the application
- **Disabled**: `approved: true, enabled: false` - Account exists but access is disabled

## Security Notes

- This tool connects directly to the database
- Use with caution in production environments
- Always test commands in development first
- User deletion is permanent and cannot be undone
- The tool will prompt for confirmation on destructive operations

## SSH Usage

Perfect for remote server administration:

```bash
# SSH into your server
ssh user@your-server.com

# Navigate to Inkweld backend
cd /path/to/inkweld/backend

# Use the admin CLI
bun run admin users pending
bun run admin users approve alice
```

## Environment Variables

The CLI uses the same environment variables as your Inkweld instance:

- `DATABASE_URL` - PostgreSQL connection string (production)
- `DATA_PATH` - Data directory path (also used for SQLite in development)

If `DATABASE_URL` is not set, the CLI will use SQLite at `DATA_PATH/database.sqlite`. 
