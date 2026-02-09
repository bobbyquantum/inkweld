import { configService } from './config.service';
import type { DatabaseInstance } from '../types/context';

/**
 * Password policy loaded from the database/config.
 */
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

/**
 * Load the password policy from configuration.
 */
export async function getPasswordPolicy(db: DatabaseInstance): Promise<PasswordPolicy> {
  const [minLength, requireUppercase, requireLowercase, requireNumber, requireSymbol] =
    await Promise.all([
      configService.get(db, 'PASSWORD_MIN_LENGTH'),
      configService.getBoolean(db, 'PASSWORD_REQUIRE_UPPERCASE'),
      configService.getBoolean(db, 'PASSWORD_REQUIRE_LOWERCASE'),
      configService.getBoolean(db, 'PASSWORD_REQUIRE_NUMBER'),
      configService.getBoolean(db, 'PASSWORD_REQUIRE_SYMBOL'),
    ]);

  return {
    minLength: Math.max(1, parseInt(minLength.value, 10) || 8),
    requireUppercase,
    requireLowercase,
    requireNumber,
    requireSymbol,
  };
}

/**
 * Validate a password against the given policy.
 * Returns an array of error messages, or an empty array if valid.
 */
export function validatePassword(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSymbol && !/[@$!%*?&]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&)');
  }

  return errors;
}
