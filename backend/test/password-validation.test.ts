import { describe, it, expect } from 'bun:test';
import { validatePassword, type PasswordPolicy } from '../src/services/password-validation.service';

describe('validatePassword', () => {
  const fullPolicy: PasswordPolicy = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSymbol: true,
  };

  it('should pass a valid password that meets all requirements', () => {
    const errors = validatePassword('Test123!@', fullPolicy);
    expect(errors).toHaveLength(0);
  });

  it('should fail if password is too short', () => {
    const errors = validatePassword('Te1!', fullPolicy);
    expect(errors).toContainEqual(expect.stringContaining('at least 8'));
  });

  it('should fail if password is missing uppercase', () => {
    const errors = validatePassword('testpass1!', fullPolicy);
    expect(errors).toContainEqual(expect.stringContaining('uppercase'));
  });

  it('should fail if password is missing lowercase', () => {
    const errors = validatePassword('TESTPASS1!', fullPolicy);
    expect(errors).toContainEqual(expect.stringContaining('lowercase'));
  });

  it('should fail if password is missing number', () => {
    const errors = validatePassword('TestPass!@', fullPolicy);
    expect(errors).toContainEqual(expect.stringContaining('number'));
  });

  it('should fail if password is missing special character', () => {
    const errors = validatePassword('TestPass12', fullPolicy);
    expect(errors).toContainEqual(expect.stringContaining('special'));
  });

  it('should return multiple errors for multiple violations', () => {
    const errors = validatePassword('test', fullPolicy);
    expect(errors.length).toBeGreaterThan(1);
  });

  it('should not require uppercase when policy disables it', () => {
    const policy: PasswordPolicy = { ...fullPolicy, requireUppercase: false };
    const errors = validatePassword('testpass1!', policy);
    expect(errors).toHaveLength(0);
  });

  it('should not require lowercase when policy disables it', () => {
    const policy: PasswordPolicy = { ...fullPolicy, requireLowercase: false };
    const errors = validatePassword('TESTPASS1!', policy);
    expect(errors).toHaveLength(0);
  });

  it('should not require number when policy disables it', () => {
    const policy: PasswordPolicy = { ...fullPolicy, requireNumber: false };
    const errors = validatePassword('TestPass!@', policy);
    expect(errors).toHaveLength(0);
  });

  it('should not require symbol when policy disables it', () => {
    const policy: PasswordPolicy = { ...fullPolicy, requireSymbol: false };
    const errors = validatePassword('TestPass12', policy);
    expect(errors).toHaveLength(0);
  });

  it('should use custom min length', () => {
    const policy: PasswordPolicy = { ...fullPolicy, minLength: 12 };
    const errors = validatePassword('Test123!', policy);
    expect(errors).toContainEqual(expect.stringContaining('at least 12'));
  });

  it('should pass with minimal policy (no complexity)', () => {
    const minimalPolicy: PasswordPolicy = {
      minLength: 1,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSymbol: false,
    };
    const errors = validatePassword('a', minimalPolicy);
    expect(errors).toHaveLength(0);
  });
});
