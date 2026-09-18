import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { StorageUsageService } from '@services/user/storage-usage.service';
import { formatBytes } from '@utils/format-bytes';

/**
 * Compact "used / allowance" meter for the current user's sync capacity.
 *
 * Renders nothing until usage has loaded, and stays silent in local mode
 * (there is no server allowance to report). Three visual states map to the
 * service's thresholds: normal, warning (>=80%) and over (>=100%).
 */
@Component({
  selector: 'app-storage-meter',
  imports: [
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './storage-meter.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './storage-meter.component.scss',
})
export class StorageMeterComponent implements OnInit {
  private readonly storageUsage = inject(StorageUsageService);

  /**
   * The signed-in user's id. Passed by hosts so the cached value can be tied
   * to an account — otherwise usage from a previous session could flash for
   * whoever signs in next.
   */
  readonly userId = input<string | undefined>(undefined);

  readonly usage = this.storageUsage.usage;
  readonly isLoading = this.storageUsage.isLoading;

  /** Rounded percentage for the bar; capped at 100 so an over-quota bar stays sane. */
  readonly percent = computed(() => {
    const u = this.usage();
    if (!u || u.quotaBytes <= 0) return 0;
    return Math.min(100, Math.round((u.usedBytes / u.quotaBytes) * 100));
  });

  readonly state = computed<'normal' | 'warning' | 'over'>(() => {
    const u = this.usage();
    if (!u) return 'normal';
    if (u.overQuota) return 'over';
    if (u.overSoftLimit) return 'warning';
    return 'normal';
  });

  readonly usedLabel = computed(() => {
    const u = this.usage();
    return u ? formatBytes(u.usedBytes) : '';
  });

  readonly quotaLabel = computed(() => {
    const u = this.usage();
    return u ? formatBytes(u.quotaBytes) : '';
  });

  ngOnInit(): void {
    // Fetch on first use, or when the account changed; the service keeps the
    // last value for repeat visits by the same user.
    void this.storageUsage.load(this.userId());
  }
}
