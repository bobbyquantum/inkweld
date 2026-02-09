/**
 * Transactional email templates for Inkweld.
 *
 * - Clean, minimal HTML that renders well in all email clients (table-based layout, inline styles)
 * - Every HTML email has a plain-text alternative
 * - No images, no template engine — plain string interpolation
 */

/** Shared inline styles */
const STYLES = {
  container:
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 0;',
  card: 'background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 32px; margin: 24px 0;',
  heading: 'margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #1a1a1a;',
  text: 'color: #333333; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;',
  button:
    'display: inline-block; background-color: #1a73e8; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 500;',
  footer:
    'color: #888888; font-size: 12px; line-height: 1.5; margin: 24px 0 0 0; padding-top: 16px; border-top: 1px solid #e0e0e0;',
  hr: 'border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;',
} as const;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function footerHtml(instanceUrl: string): string {
  const safeUrl = escapeHtml(instanceUrl);
  return `<p style="${STYLES.footer}">You're receiving this because you have an account on <a href="${safeUrl}" style="color: #1a73e8;">${safeUrl}</a>. If you didn't request this, you can safely ignore this email.</p>`;
}

function footerText(instanceUrl: string): string {
  return `---\nYou're receiving this because you have an account on ${instanceUrl}. If you didn't request this, you can safely ignore this email.`;
}

// ---------------------------------------------------------------------------
// Welcome Email
// ---------------------------------------------------------------------------
export function welcomeEmail(params: { userName: string; loginUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.userName);
  const safeLoginUrl = escapeHtml(params.loginUrl);

  return {
    subject: 'Welcome to Inkweld!',
    html: `
<div style="${STYLES.container}">
  <div style="${STYLES.card}">
    <h1 style="${STYLES.heading}">Welcome to Inkweld!</h1>
    <p style="${STYLES.text}">Hi ${safeName},</p>
    <p style="${STYLES.text}">Your account has been created and is ready to use. You can now log in and start writing.</p>
    <p style="margin: 24px 0; text-align: center;">
      <a href="${safeLoginUrl}" style="${STYLES.button}">Log In to Inkweld</a>
    </p>
    <p style="${STYLES.text}">Happy writing!</p>
    ${footerHtml(params.loginUrl)}
  </div>
</div>`,
    text: `Welcome to Inkweld!

Hi ${params.userName},

Your account has been created and is ready to use. You can now log in and start writing.

Log in here: ${params.loginUrl}

Happy writing!

${footerText(params.loginUrl)}`,
  };
}

// ---------------------------------------------------------------------------
// Awaiting Approval Email
// ---------------------------------------------------------------------------
export function awaitingApprovalEmail(params: { userName: string; instanceUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.userName);

  return {
    subject: 'Inkweld — Account Awaiting Approval',
    html: `
<div style="${STYLES.container}">
  <div style="${STYLES.card}">
    <h1 style="${STYLES.heading}">Account Created</h1>
    <p style="${STYLES.text}">Hi ${safeName},</p>
    <p style="${STYLES.text}">Your Inkweld account has been created successfully. However, this instance requires admin approval before you can log in.</p>
    <p style="${STYLES.text}">You'll receive another email once your account has been approved.</p>
    <p style="${STYLES.text}">Thanks for your patience!</p>
    ${footerHtml(params.instanceUrl)}
  </div>
</div>`,
    text: `Inkweld — Account Awaiting Approval

Hi ${params.userName},

Your Inkweld account has been created successfully. However, this instance requires admin approval before you can log in.

You'll receive another email once your account has been approved.

Thanks for your patience!

${footerText(params.instanceUrl)}`,
  };
}

// ---------------------------------------------------------------------------
// Password Reset Request Email
// ---------------------------------------------------------------------------
export function passwordResetRequestEmail(params: {
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(params.userName);
  const safeResetUrl = escapeHtml(params.resetUrl);

  return {
    subject: 'Inkweld — Password Reset Request',
    html: `
<div style="${STYLES.container}">
  <div style="${STYLES.card}">
    <h1 style="${STYLES.heading}">Password Reset Request</h1>
    <p style="${STYLES.text}">Hi ${safeName},</p>
    <p style="${STYLES.text}">We received a request to reset your password. Click the button below to choose a new password:</p>
    <p style="margin: 24px 0; text-align: center;">
      <a href="${safeResetUrl}" style="${STYLES.button}">Reset Password</a>
    </p>
    <p style="${STYLES.text}">This link will expire in ${params.expiresInMinutes} minutes.</p>
    <p style="${STYLES.text}">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    ${footerHtml(params.resetUrl.split('/reset-password')[0])}
  </div>
</div>`,
    text: `Inkweld — Password Reset Request

Hi ${params.userName},

We received a request to reset your password. Visit the link below to choose a new password:

${params.resetUrl}

This link will expire in ${params.expiresInMinutes} minutes.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

${footerText(params.resetUrl.split('/reset-password')[0])}`,
  };
}

// ---------------------------------------------------------------------------
// Account Approved Email (sent when admin approves a pending user)
// ---------------------------------------------------------------------------
export function accountApprovedEmail(params: { userName: string; loginUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.userName);
  const safeLoginUrl = escapeHtml(params.loginUrl);

  return {
    subject: 'Inkweld — Your Account Has Been Approved',
    html: `
<div style="${STYLES.container}">
  <div style="${STYLES.card}">
    <h1 style="${STYLES.heading}">Account Approved!</h1>
    <p style="${STYLES.text}">Hi ${safeName},</p>
    <p style="${STYLES.text}">Great news — your Inkweld account has been approved by an administrator. You can now log in and start writing.</p>
    <p style="margin: 24px 0; text-align: center;">
      <a href="${safeLoginUrl}" style="${STYLES.button}">Log In to Inkweld</a>
    </p>
    <p style="${STYLES.text}">We're excited to have you on board!</p>
    ${footerHtml(params.loginUrl)}
  </div>
</div>`,
    text: `Inkweld — Your Account Has Been Approved

Hi ${params.userName},

Great news — your Inkweld account has been approved by an administrator. You can now log in and start writing.

Log in here: ${params.loginUrl}

We're excited to have you on board!

${footerText(params.loginUrl)}`,
  };
}

// ---------------------------------------------------------------------------
// Account Rejected Email (sent when admin rejects a pending user)
// ---------------------------------------------------------------------------
export function accountRejectedEmail(params: { userName: string; instanceUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.userName);

  return {
    subject: 'Inkweld — Account Registration Update',
    html: `
<div style="${STYLES.container}">
  <div style="${STYLES.card}">
    <h1 style="${STYLES.heading}">Registration Update</h1>
    <p style="${STYLES.text}">Hi ${safeName},</p>
    <p style="${STYLES.text}">Thank you for your interest in Inkweld. Unfortunately, your account registration was not approved at this time.</p>
    <p style="${STYLES.text}">If you believe this was a mistake, please contact the site administrator.</p>
    ${footerHtml(params.instanceUrl)}
  </div>
</div>`,
    text: `Inkweld — Account Registration Update

Hi ${params.userName},

Thank you for your interest in Inkweld. Unfortunately, your account registration was not approved at this time.

If you believe this was a mistake, please contact the site administrator.

${footerText(params.instanceUrl)}`,
  };
}

// ---------------------------------------------------------------------------
// Password Reset Confirmation Email
// ---------------------------------------------------------------------------
export function passwordResetConfirmEmail(params: { userName: string; loginUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.userName);
  const safeLoginUrl = escapeHtml(params.loginUrl);

  return {
    subject: 'Inkweld — Password Changed Successfully',
    html: `
<div style="${STYLES.container}">
  <div style="${STYLES.card}">
    <h1 style="${STYLES.heading}">Password Changed</h1>
    <p style="${STYLES.text}">Hi ${safeName},</p>
    <p style="${STYLES.text}">Your password has been successfully changed. You can now log in with your new password.</p>
    <p style="margin: 24px 0; text-align: center;">
      <a href="${safeLoginUrl}" style="${STYLES.button}">Log In to Inkweld</a>
    </p>
    <p style="${STYLES.text}">If you didn't make this change, please contact your administrator immediately.</p>
    ${footerHtml(params.loginUrl)}
  </div>
</div>`,
    text: `Inkweld — Password Changed Successfully

Hi ${params.userName},

Your password has been successfully changed. You can now log in with your new password.

Log in here: ${params.loginUrl}

If you didn't make this change, please contact your administrator immediately.

${footerText(params.loginUrl)}`,
  };
}
