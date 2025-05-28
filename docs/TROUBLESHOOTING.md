# Troubleshooting Guide

## Cookie Issues in Production

### Problem: Cookies Not Set in Production
When deploying to platforms like Render.com, you might see successful login responses but no `Set-Cookie` header, causing users to remain logged out.

### Root Causes
1. **Secure Cookie Flag**: In production (`NODE_ENV=production`), cookies are marked as `secure: true`, requiring HTTPS
2. **Proxy Configuration**: Platforms like Render.com use reverse proxies, and the app needs to trust the proxy headers
3. **Missing Environment Variables**: Production deployments need proper `SESSION_SECRET` and `ALLOWED_ORIGINS` configuration

### Solutions

#### 1. Proxy Trust Configuration
The app now includes `app.set('trust proxy', 1)` to properly detect HTTPS behind proxies.

#### 2. Environment Variables
Ensure these environment variables are set in production:

```bash
NODE_ENV=production
SESSION_SECRET=your-secure-random-session-secret
ALLOWED_ORIGINS=https://your-domain.com
```

#### 3. CORS Configuration
Make sure your frontend domain is included in `ALLOWED_ORIGINS` and the CORS configuration includes `credentials: true`.

### Debugging
The login service now includes debug logging. Check your production logs for:
- Session configuration details
- Protocol and security headers
- Session save success/failure messages

### Verification
After deployment, check the login response headers include:
```
Set-Cookie: connect.sid=...; Path=/; HttpOnly; Secure; SameSite=lax
``` 