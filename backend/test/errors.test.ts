import { describe, it, expect } from 'bun:test';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  InternalError,
  ValidationError,
} from '../src/errors';

describe('Error classes', () => {
  describe('UnauthorizedError', () => {
    it('should create with default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Unauthorized');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create with custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.message).toBe('Token expired');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should be instance of Error', () => {
      const error = new UnauthorizedError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ForbiddenError', () => {
    it('should create with default message', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Access denied');
      expect(error.name).toBe('ForbiddenError');
    });

    it('should create with custom message', () => {
      const error = new ForbiddenError('Admin only');
      expect(error.message).toBe('Admin only');
      expect(error.name).toBe('ForbiddenError');
    });

    it('should be instance of Error', () => {
      const error = new ForbiddenError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotFoundError', () => {
    it('should create with default message', () => {
      const error = new NotFoundError();
      expect(error.message).toBe('Resource not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should create with custom message', () => {
      const error = new NotFoundError('User not found');
      expect(error.message).toBe('User not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should be instance of Error', () => {
      const error = new NotFoundError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('BadRequestError', () => {
    it('should create with default message', () => {
      const error = new BadRequestError();
      expect(error.message).toBe('Bad request');
      expect(error.name).toBe('BadRequestError');
    });

    it('should create with custom message', () => {
      const error = new BadRequestError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('BadRequestError');
    });

    it('should be instance of Error', () => {
      const error = new BadRequestError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('InternalError', () => {
    it('should create with default message', () => {
      const error = new InternalError();
      expect(error.message).toBe('Internal server error');
      expect(error.name).toBe('InternalError');
    });

    it('should create with custom message', () => {
      const error = new InternalError('Database connection failed');
      expect(error.message).toBe('Database connection failed');
      expect(error.name).toBe('InternalError');
    });

    it('should be instance of Error', () => {
      const error = new InternalError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ValidationError', () => {
    it('should create with default message', () => {
      const error = new ValidationError();
      expect(error.message).toBe('Validation failed');
      expect(error.name).toBe('ValidationError');
      expect(error.details).toBeUndefined();
    });

    it('should create with custom message', () => {
      const error = new ValidationError('Email is invalid');
      expect(error.message).toBe('Email is invalid');
      expect(error.name).toBe('ValidationError');
    });

    it('should create with details', () => {
      const details = { field: 'email', issue: 'invalid format' };
      const error = new ValidationError('Validation failed', details);
      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual(details);
      expect(error.cause).toEqual(details);
    });

    it('should be instance of Error', () => {
      const error = new ValidationError();
      expect(error).toBeInstanceOf(Error);
    });

    it('should handle complex details object', () => {
      const details = {
        errors: [
          { field: 'email', message: 'Invalid email' },
          { field: 'password', message: 'Too short' },
        ],
        meta: { timestamp: new Date().toISOString() },
      };
      const error = new ValidationError('Multiple validation errors', details);
      expect(error.details).toEqual(details);
    });
  });
});
