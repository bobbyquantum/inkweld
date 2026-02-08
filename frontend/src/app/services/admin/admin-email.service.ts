import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SetupService } from '../core/setup.service';

export interface TestEmailResult {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminEmailService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  private get baseUrl(): string {
    return `${this.basePath}/api/v1/admin/email`;
  }

  async sendTestEmail(): Promise<TestEmailResult> {
    return await firstValueFrom(
      this.http.post<TestEmailResult>(
        `${this.baseUrl}/test`,
        {},
        {
          withCredentials: true,
        }
      )
    );
  }
}
