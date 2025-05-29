import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ValidationException } from '../exceptions/validation.exception.js';
import { ValidationFilter } from './validation.filter.js';
import { describe, beforeEach, jest, expect, it } from 'bun:test';

describe('ValidationFilter', () => {
  let filter: ValidationFilter;
  let mockResponse: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new ValidationFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle ValidationException', () => {
    const errors = { field: ['error1', 'error2'] };
    const exception = new ValidationException(errors);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors,
    });
  });

  it('should handle single ValidationError', () => {
    const exception = new ValidationError();
    exception.property = 'username';
    exception.constraints = { isNotEmpty: 'username should not be empty' };

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors: { username: ['username should not be empty'] },
    });
  });

  it('should handle array of ValidationError', () => {
    const error1 = new ValidationError();
    error1.property = 'username';
    error1.constraints = { isNotEmpty: 'username should not be empty' };

    const error2 = new ValidationError();
    error2.property = 'password';
    error2.constraints = {
      minLength: 'password must be at least 8 characters',
    };

    const exception = [error1, error2];

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors: {
        username: ['username should not be empty'],
        password: ['password must be at least 8 characters'],
      },
    });
  });

  it('should handle ValidationError without constraints', () => {
    const exception = new ValidationError();
    exception.property = 'username';
    // no constraints

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors: {},
    });
  });
});
