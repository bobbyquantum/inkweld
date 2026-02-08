import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SetupService } from '../core/setup.service';

@Injectable({
  providedIn: 'root',
})
export class PasswordResetService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  private get baseUrl(): string {
    return `${this.basePath}/api/v1/auth`;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    return await firstValueFrom(
      this.http.post<{ message: string }>(
        `${this.baseUrl}/forgot-password`,
        { email },
        { withCredentials: true }
      )
    );
  }

  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return await firstValueFrom(
      this.http.post<{ message: string }>(
        `${this.baseUrl}/reset-password`,
        { token, newPassword },
        { withCredentials: true }
      )
    );
  }
}
