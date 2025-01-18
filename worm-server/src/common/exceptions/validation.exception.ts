import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(
    public readonly errors: Record<string, string[]>,
    message = 'Validation failed',
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        errors,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
