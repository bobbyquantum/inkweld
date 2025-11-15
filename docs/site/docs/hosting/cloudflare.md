---
title: Cloudflare Workers Deployment
description: Deploy Inkweld to Cloudflare Workers with D1 database, R2 storage, and Durable Objects for real-time collaboration.
---

## Overview

Inkweld can be deployed to Cloudflare Workers, leveraging Cloudflare's edge platform for global, low-latency access. This deployment method uses:

- **Cloudflare Workers** - Serverless compute for the backend API
- **D1 Database** - Cloudflare's SQLite-based database for user data and projects
- **R2 Storage** - Object storage for project files and uploads
- **Durable Objects** - For real-time collaborative editing with Yjs

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Wrangler CLI installed: `npm install -g wrangler`
- **For production use**: Cloudflare Workers Paid plan ($5/month minimum) is recommended for increased limits
- **For development/testing**: Workers Free plan is sufficient

## Free Tier Availability

Cloudflare provides generous free tiers for development and small-scale production use:

### Workers Free Plan (Automatic)

By default, all users have access to the Workers Free plan, which includes limited usage of Workers, Pages Functions, Workers KV, Hyperdrive, D1, and Durable Objects:

- **100,000 requests per day** (Workers & Pages Functions)
- **Up to 10ms CPU time per request** (requests exceeding this may be terminated)
- **1 concurrent build slot**
- **Up to 3,000 build minutes per month**
- No credit card required to start

### D1 Database Free Tier (Automatic)

D1 is available on the Workers Free plan:

- **5 million rows read per day**
- **100,000 rows written per day**
- **5 GB total storage** (across all databases)
- Limits reset daily at 00:00 UTC (UTC+0)

### R2 Storage Free Tier (Requires Signup)

R2 offers a free tier for Standard storage that includes 10 GB of storage per month, 1 million Class A operations (writes/modifications), and 10 million Class B operations (reads). **Note**: Storage is billed using gigabyte-month (GB-month) as the billing metric, calculated by averaging the peak storage per day over a billing period.

- **10 GB storage** (stored constantly for 30 days = 10 GB-months)
- **1 million Class A operations per month** (PUT, POST, COPY, DELETE)
- **10 million Class B operations per month** (GET, HEAD, LIST)
- **Zero egress fees** (no charges for data transfer out)
- **Requires adding a payment method** to your Cloudflare account (even though usage stays free within limits)

### Durable Objects Free Tier (Automatic)

Durable Objects can be used on the Workers Free plan for building collaboration tools and real-time applications:

- **100,000 requests per day**
- **13,000 GB-seconds of duration per day**
- **5 GB total storage** (SQLite-backed)
- **5 million rows read per day**
- **100,000 rows written per day**
- Limits reset daily at 00:00 UTC (UTC+0)

#### Understanding Gigabyte-Seconds (GB-seconds)

**GB-seconds** measure the compute duration of a Durable Object weighted by its memory usage. Durable Objects are billed for duration while the Durable Object is active and running in memory. The calculation is:

```
GB-seconds = (Memory in GB) × (Active Duration in seconds)
```

For example:

- A Durable Object using 1 GB of memory active for 13,000 seconds = 13,000 GB-seconds
- A Durable Object using 100 MB (0.1 GB) active for 1 second = 0.1 GB-seconds

**For real-time collaboration**: If you estimate a project open for collaboration uses approximately 10 GB-seconds per minute (0.167 GB-seconds per second), this would mean:

- 13,000 GB-seconds ÷ 10 GB-s per minute = **1,300 minutes** (approximately **21.7 hours**) of continuous collaboration per day on the free tier

This is quite generous for typical usage patterns where Durable Objects hibernate between messages and aren't continuously active.

### Workers Paid Plan ($5/month)

Upgrading to the paid plan provides:

- **10 million requests per month** (included)
- **30 seconds CPU time per request** (up to 5 minutes configurable)
- **50 milliseconds of CPU time per request** (included before additional charges)
- **D1**: 25 million rows read, 50 million rows written per month
- **Durable Objects**: 1 million requests, 400,000 GB-seconds per month (included)
- **No credit card charges until you explicitly purchase** the paid plan

## Setup Steps

### 1. Install Dependencies

```bash
cd backend
bun install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

This will open a browser window to authorize Wrangler with your Cloudflare account.

### 3. Create D1 Databases

Create separate databases for development and production:

```bash
# Development database
npx wrangler d1 create inkweld_dev

# Production database
npx wrangler d1 create inkweld_prod
```

Save the `database_id` values from the output - you'll need them in the next step.

### 4. Configure wrangler.toml

Copy the example configuration:

```bash
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` and update the database IDs:

```toml
# Development environment
[[env.dev.d1_databases]]
binding = "DB"
database_name = "inkweld_dev"
database_id = "your-dev-database-id-here"  # Replace with actual ID

# Production environment
[[env.production.d1_databases]]
binding = "DB"
database_name = "inkweld_prod"
database_id = "your-prod-database-id-here"  # Replace with actual ID
```

### 5. Run Database Migrations

Apply the schema to your D1 databases:

```bash
# Development
npx wrangler d1 execute inkweld_dev --file=./drizzle/0000_safe_mysterio.sql

# Production
npx wrangler d1 execute inkweld_prod --file=./drizzle/0000_safe_mysterio.sql
```

### 6. Set Secrets

Configure sensitive environment variables using Wrangler secrets:

```bash
# Required: Session encryption key (32+ characters)
echo "your-super-secret-session-key-here-make-it-long" | npx wrangler secret put SESSION_SECRET

# Optional: GitHub OAuth (if enabled)
echo "your-github-client-id" | npx wrangler secret put GITHUB_CLIENT_ID
echo "your-github-client-secret" | npx wrangler secret put GITHUB_CLIENT_SECRET

# Optional: reCAPTCHA (if enabled)
echo "your-recaptcha-site-key" | npx wrangler secret put RECAPTCHA_SITE_KEY
echo "your-recaptcha-secret-key" | npx wrangler secret put RECAPTCHA_SECRET_KEY
```

For production environment, add `--env production` to each command:

```bash
echo "your-production-session-key" | npx wrangler secret put SESSION_SECRET --env production
```

### 7. Deploy

Deploy to your chosen environment:

```bash
# Deploy to development
bun run deploy:dev

# Deploy to production
bun run deploy:prod
```

Your Worker will be deployed to a `*.workers.dev` subdomain by default.

## Custom Domain

To use your own domain:

1. Add your domain to Cloudflare (if not already added)
2. In the Cloudflare dashboard, go to **Workers & Pages** → Select your worker
3. Click **Settings** → **Triggers** → **Add Custom Domain**
4. Enter your domain (e.g., `app.inkweld.com`) and click **Add Custom Domain**

Update your `wrangler.toml` to include the custom domain in `ALLOWED_ORIGINS`:

```toml
[env.production.vars]
ALLOWED_ORIGINS = "https://app.inkweld.com"
```

Redeploy for the changes to take effect.

## Configuration Options

### Environment Variables

Configure these in the `[vars]` section of `wrangler.toml`:

| Variable                 | Default      | Description                             |
| ------------------------ | ------------ | --------------------------------------- |
| `NODE_ENV`               | `production` | Environment mode                        |
| `PORT`                   | `8333`       | HTTP port (informational in Workers)    |
| `DB_TYPE`                | `d1`         | Database type (use `d1` for Cloudflare) |
| `ALLOWED_ORIGINS`        | Required     | Comma-separated list of allowed origins |
| `USER_APPROVAL_REQUIRED` | `false`      | Require admin approval for new users    |
| `GITHUB_ENABLED`         | `false`      | Enable GitHub OAuth login               |
| `RECAPTCHA_ENABLED`      | `false`      | Enable reCAPTCHA for registration       |

### R2 Storage (Optional)

To enable file uploads using R2:

1. **Add a payment method** to your Cloudflare account (required for R2, even on free tier)

2. Create an R2 bucket:

```bash
npx wrangler r2 bucket create inkweld-storage
```

3. Uncomment the R2 configuration in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "STORAGE"
bucket_name = "inkweld-storage"
```

4. Redeploy the worker

### Durable Objects (Real-time Collaboration)

Durable Objects configuration is already set up in the codebase for Yjs-based real-time collaboration. The configuration in `wrangler.toml` enables this:

```toml
[[durable_objects.bindings]]
name = "YJS_DOCUMENTS"
class_name = "YjsDocument"
script_name = "inkweld-backend"
```

This is automatically deployed with your worker and available on both free and paid plans.

## Monitoring and Logs

### View Logs

Stream real-time logs from your worker:

```bash
# Development
npx wrangler tail --env dev

# Production
npx wrangler tail --env production
```

### Analytics

View analytics in the Cloudflare dashboard:

1. Go to **Workers & Pages**
2. Select your worker
3. Click **Analytics** to see requests, errors, and performance metrics

## Database Management

### Query D1 Database

Execute queries directly:

```bash
# Development
npx wrangler d1 execute inkweld_dev --command="SELECT * FROM users LIMIT 10"

# Production
npx wrangler d1 execute inkweld_prod --command="SELECT * FROM users LIMIT 10"
```

### Backup D1 Database

Export your database:

```bash
npx wrangler d1 export inkweld_prod --output=backup.sql
```

### Restore from Backup

```bash
npx wrangler d1 execute inkweld_prod --file=backup.sql
```

## Troubleshooting

### Worker fails to deploy

- Ensure you're on a Workers Paid plan if you need extended limits (though free tier should work for development)
- Check that all database IDs in `wrangler.toml` are correct
- Verify secrets are set: `npx wrangler secret list`

### Database connection errors

- Confirm migrations have been run on your D1 database
- Check the binding name matches (`DB`) in your code and `wrangler.toml`

### Real-time collaboration not working

- Durable Objects are now available on the Workers Free plan with SQLite storage backend
- Check that the Durable Object binding (`YJS_DOCUMENTS`) is configured correctly
- Review worker logs for WebSocket connection errors

### CORS errors

- Update `ALLOWED_ORIGINS` in `wrangler.toml` to include your frontend domain
- Ensure the domain uses HTTPS in production
- Redeploy after making changes

### Free tier limit errors

- When your account hits the daily read and/or write limits, D1 API will return errors indicating that your daily limits have been exceeded
- Monitor usage in the Cloudflare dashboard to track consumption
- Consider upgrading to Workers Paid plan ($5/month) for higher limits

## Costs

### Free Tier (Forever Free)

- **Workers**: 100,000 requests/day (Workers & Pages Functions), up to 10ms CPU time per request
- **Workers Builds**: 1 concurrent build slot, up to 3,000 minutes per month
- **Workers Logs**: 200,000 events per day, 3 day retention
- **D1**: 5M rows read/day, 100K rows written/day, 5 GB total storage
- **Durable Objects**: 100K requests/day, 13,000 GB-seconds/day, 5 GB storage, 5M rows read/day, 100K rows written/day
- **KV**: 100K read operations/day, 1K write/delete/list operations/day
- **Hyperdrive**: 100K queries/day
- **Workers AI**: 10,000 neurons/day
- **R2**: 10 GB storage, 1M Class A ops/month, 10M Class B ops/month (requires payment method on file)
- **Ideal for**: Development, testing, and small personal projects

### Workers Paid Plan ($5/month minimum)

- **Workers**: 10 million requests included, then $0.50 per additional million
- **D1**:
  - 25 million rows read/month, then $0.001 per million
  - 50 million rows written/month, then $1.00 per million
  - 5 GB storage included
- **R2**:
  - $0.015 per GB/month storage (beyond free tier)
  - $4.50 per million Class A operations (beyond free tier)
  - $0.36 per million Class B operations (beyond free tier)
  - Zero egress fees
- **Durable Objects**:
  - 1 million requests included, then $0.15 per million
  - 400,000 GB-seconds included, then $12.50 per million GB-seconds

**Note**: There are no additional charges for data transfer (egress) or throughput (bandwidth) on Cloudflare Workers.

Most small-to-medium Inkweld installations will stay within the free tier limits or incur minimal charges on the paid plan.

## Next Steps

- [Configure user approval](./admin-cli.md#user-management)
- [Set up CI/CD](./ci-cd.md) for automated deployments
- [Enable GitHub OAuth](#set-secrets) for social login
- Monitor usage in the Cloudflare dashboard to stay within limits
- Upgrade to Workers Paid plan when ready to scale beyond free tier limits
