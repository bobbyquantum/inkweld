import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SetupService } from '../core/setup.service';

/** The two independently configurable background surfaces. */
export type BrandingSurface = 'login' | 'home';

/**
 * Admin-side branding image upload.
 *
 * Only the image bytes need a dedicated endpoint — the external URLs, scrim
 * opacity, blur and personalisation toggles are ordinary config keys handled by
 * {@link AdminConfigService}.
 */
@Injectable({ providedIn: 'root' })
export class AdminAppearanceService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  private get baseUrl(): string {
    const base = this.setupService.getServerUrl() ?? '';
    return `${base}/api/v1/admin/appearance`;
  }

  async uploadBackground(
    surface: BrandingSurface,
    file: Blob,
    filename: string
  ): Promise<void> {
    const form = new FormData();
    form.append('background', file, filename);

    await firstValueFrom(
      this.http.put(`${this.baseUrl}/background/${surface}`, form, {
        withCredentials: true,
      })
    );
  }

  async deleteBackground(surface: BrandingSurface): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/background/${surface}`, {
        withCredentials: true,
      })
    );
  }
}
