import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface DocStorageStats {
  documentId: string;
  hasSnapshot: boolean;
  incrementalRows: number;
  totalRows: number;
  loadedInMemory: boolean;
}

@Injectable({ providedIn: 'root' })
export class DocStatsService {
  private readonly http = inject(HttpClient);

  private readonly cache = new Map<
    string,
    { stats: DocStorageStats; ts: number }
  >();
  private readonly TTL_MS = 30_000;

  async fetchStats(documentId: string): Promise<DocStorageStats | null> {
    const cached = this.cache.get(documentId);
    if (cached && Date.now() - cached.ts < this.TTL_MS) {
      return cached.stats;
    }

    const baseUrl = environment.apiUrl;
    if (!baseUrl) return null;

    try {
      const stats = await firstValueFrom(
        this.http.get<DocStorageStats>(`${baseUrl}/api/v1/ws/yjs/do/stats`, {
          params: { documentId },
        })
      );
      this.cache.set(documentId, { stats, ts: Date.now() });
      return stats;
    } catch {
      return null;
    }
  }

  formatStats(stats: DocStorageStats | null): string {
    if (!stats) return 'Storage stats unavailable';
    const parts = [
      `Rows: ${stats.totalRows}`,
      stats.hasSnapshot ? 'Compacted' : 'No snapshot',
      stats.incrementalRows > 0 ? `${stats.incrementalRows} incremental` : '',
      stats.loadedInMemory ? 'In memory' : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }
}
