import { HttpClient } from '@angular/common/http';
import { Component, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SetupService } from '@services/core/setup.service';
import { firstValueFrom } from 'rxjs';

interface SystemStats {
  userCount: number;
  projectCount: number;
  pendingUserCount: number;
  version: string;
  uptime: number;
  runtime: string;
}

@Component({
  selector: 'app-admin-system-health',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
  ],
  templateUrl: './system-health.component.html',
  styleUrl: './system-health.component.scss',
})
export class AdminSystemHealthComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  readonly stats = signal<SystemStats | null>(null);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);

  private get baseUrl(): string {
    const server = this.setupService.getServerUrl() ?? '';
    return `${server}/api/v1/admin`;
  }

  ngOnInit() {
    void this.loadStats();
  }

  async loadStats() {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const stats = await firstValueFrom(
        this.http.get<SystemStats>(`${this.baseUrl}/stats`)
      );
      this.stats.set(stats);
    } catch {
      this.error.set('Failed to load system statistics');
    } finally {
      this.isLoading.set(false);
    }
  }

  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}
