import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** Minimal structural shape of a Signal Forms validation error. */
interface FormValidationError {
  readonly kind: string;
  readonly message?: string;
}

/**
 * Maps Signal Forms validation error kinds to i18n keys.
 *
 * Signal Forms schemas bind validators with a static `kind`; rendering the
 * human-readable text through Transloco keeps validator messages localised
 * without hardcoding English strings in every schema.
 */
@Injectable({ providedIn: 'root' })
export class FormErrorTranslationService {
  private readonly transloco = inject(TranslocoService);

  private readonly kindToKey: Record<string, string> = {
    required: 'validation.required',
    email: 'validation.emailInvalid',
    minLength: 'validation.minLength',
    maxLength: 'validation.maxLength',
    whitespace: 'validation.required',
    usernameTaken: 'validation.usernameTaken',
    invalidUrl: 'validation.invalidUrl',
  };

  /** Resolve the display text for the first error of a field's errors array. */
  first(errors: readonly FormValidationError[]): string {
    const error = errors[0];
    if (!error) return '';

    const key = this.kindToKey[error.kind];
    if (!key) return error.message ?? error.kind;

    const params = this.errorParams(error);
    return this.transloco.translate(key, params);
  }

  /** Resolve the display text for a specific error kind if present. */
  kind(errors: readonly FormValidationError[], kind: string): string {
    const error = errors.find(e => e.kind === kind);
    return error ? this.first([error]) : '';
  }

  private errorParams(error: FormValidationError): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(error as object)) {
      if (key === 'kind' || key === 'message' || key === 'fieldTree') continue;
      if (typeof value === 'number' || typeof value === 'string') {
        params[key] = value;
      }
    }
    return params;
  }
}
