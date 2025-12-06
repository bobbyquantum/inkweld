import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SetupService } from '../core/setup.service';

export interface ConfigValue {
  key: string;
  value: string;
  source: 'database' | 'environment' | 'default';
}

@Injectable({
  providedIn: 'root',
})
export class AdminConfigService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  private get baseUrl(): string {
    return `${this.basePath}/api/v1/admin/config`;
  }

  async getConfig(key: string): Promise<ConfigValue | null> {
    try {
      return await firstValueFrom(
        this.http.get<ConfigValue>(`${this.baseUrl}/${key}`, {
          withCredentials: true,
        })
      );
    } catch {
      return null;
    }
  }

  async setConfig(key: string, value: string): Promise<void> {
    await firstValueFrom(
      this.http.put(
        `${this.baseUrl}/${key}`,
        { value },
        { withCredentials: true }
      )
    );
  }

  async deleteConfig(key: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/${key}`, { withCredentials: true })
    );
  }

  async getAllConfig(): Promise<Record<string, ConfigValue>> {
    return await firstValueFrom(
      this.http.get<Record<string, ConfigValue>>(this.baseUrl, {
        withCredentials: true,
      })
    );
  }
}
