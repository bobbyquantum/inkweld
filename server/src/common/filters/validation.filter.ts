import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { isArray } from 'class-validator';
import { ValidationException } from '../exceptions/validation.exception.js';

@Catch(ValidationError, ValidationException)
export class ValidationFilter implements ExceptionFilter {
  catch(
    exception: ValidationError | ValidationError[] | ValidationException,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let errors: Record<string, string[]>;

    if (exception instanceof ValidationException) {
      errors = exception.errors;
    } else {
      errors = this.transformValidationErrors(exception);
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      errors,
    });
  }

  private transformValidationErrors(
    exception: ValidationError | ValidationError[],
  ) {
    const errors = {};

    if (isArray(exception)) {
      exception.forEach((err) => {
        if (err.constraints) {
          errors[err.property] = Object.values(err.constraints);
        }
      });
    } else if (exception.constraints) {
      errors[exception.property] = Object.values(exception.constraints);
    }

    return errors;
  }
}
