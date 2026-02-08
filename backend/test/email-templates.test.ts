import { describe, it, expect } from 'bun:test';
import {
  welcomeEmail,
  awaitingApprovalEmail,
  passwordResetRequestEmail,
  passwordResetConfirmEmail,
} from '../src/services/email-templates';

describe('Email Templates', () => {
  describe('welcomeEmail', () => {
    it('should return subject, html, and text', () => {
      const result = welcomeEmail({
        userName: 'Alice',
        loginUrl: 'https://ink.example.com',
      });

      expect(result.subject).toBe('Welcome to Inkweld!');
      expect(typeof result.html).toBe('string');
      expect(typeof result.text).toBe('string');
    });

    it('should include user name in body', () => {
      const result = welcomeEmail({
        userName: 'Bob',
        loginUrl: 'https://ink.example.com',
      });

      expect(result.html).toContain('Bob');
      expect(result.text).toContain('Bob');
    });

    it('should include login URL in body', () => {
      const result = welcomeEmail({
        userName: 'Alice',
        loginUrl: 'https://ink.example.com',
      });

      expect(result.html).toContain('https://ink.example.com');
      expect(result.text).toContain('https://ink.example.com');
    });

    it('should escape HTML in user name', () => {
      const result = welcomeEmail({
        userName: '<script>alert("xss")</script>',
        loginUrl: 'https://ink.example.com',
      });

      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;script&gt;');
    });
  });

  describe('awaitingApprovalEmail', () => {
    it('should return subject, html, and text', () => {
      const result = awaitingApprovalEmail({
        userName: 'Charlie',
        instanceUrl: 'https://ink.example.com',
      });

      expect(result.subject).toContain('Awaiting Approval');
      expect(typeof result.html).toBe('string');
      expect(typeof result.text).toBe('string');
    });

    it('should mention approval in body', () => {
      const result = awaitingApprovalEmail({
        userName: 'Charlie',
        instanceUrl: 'https://ink.example.com',
      });

      expect(result.html).toContain('approval');
      expect(result.text).toContain('approval');
    });

    it('should include user name', () => {
      const result = awaitingApprovalEmail({
        userName: 'Dana',
        instanceUrl: 'https://ink.example.com',
      });

      expect(result.html).toContain('Dana');
      expect(result.text).toContain('Dana');
    });
  });

  describe('passwordResetRequestEmail', () => {
    it('should return subject, html, and text', () => {
      const result = passwordResetRequestEmail({
        userName: 'Eve',
        resetUrl: 'https://ink.example.com/reset-password?token=abc123',
        expiresInMinutes: 60,
      });

      expect(result.subject).toBeTruthy();
      expect(typeof result.html).toBe('string');
      expect(typeof result.text).toBe('string');
    });

    it('should include reset URL in body', () => {
      const resetUrl = 'https://ink.example.com/reset-password?token=abc123';
      const result = passwordResetRequestEmail({
        userName: 'Eve',
        resetUrl,
        expiresInMinutes: 60,
      });

      expect(result.html).toContain(resetUrl);
      expect(result.text).toContain(resetUrl);
    });

    it('should mention expiry time', () => {
      const result = passwordResetRequestEmail({
        userName: 'Eve',
        resetUrl: 'https://ink.example.com/reset-password?token=abc123',
        expiresInMinutes: 60,
      });

      expect(result.html).toContain('60');
      expect(result.text).toContain('60');
    });
  });

  describe('passwordResetConfirmEmail', () => {
    it('should return subject, html, and text', () => {
      const result = passwordResetConfirmEmail({
        userName: 'Frank',
        loginUrl: 'https://ink.example.com',
      });

      expect(result.subject).toBeTruthy();
      expect(typeof result.html).toBe('string');
      expect(typeof result.text).toBe('string');
    });

    it('should confirm password was changed', () => {
      const result = passwordResetConfirmEmail({
        userName: 'Frank',
        loginUrl: 'https://ink.example.com',
      });

      // Should mention password change/reset in some form
      const text = result.text.toLowerCase();
      expect(
        text.includes('password') &&
          (text.includes('changed') || text.includes('reset') || text.includes('updated'))
      ).toBe(true);
    });

    it('should include login URL', () => {
      const result = passwordResetConfirmEmail({
        userName: 'Frank',
        loginUrl: 'https://ink.example.com',
      });

      expect(result.html).toContain('https://ink.example.com');
      expect(result.text).toContain('https://ink.example.com');
    });
  });
});
