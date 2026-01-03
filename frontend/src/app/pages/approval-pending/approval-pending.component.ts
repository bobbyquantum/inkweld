import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '@components/theme-toggle/theme-toggle.component';
import { SystemConfigService } from '@services/core/system-config.service';

@Component({
  selector: 'app-approval-pending',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    ThemeToggleComponent,
  ],
  templateUrl: './approval-pending.component.html',
  styleUrl: './approval-pending.component.scss',
})
export class ApprovalPendingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private systemConfigService = inject(SystemConfigService);

  username = '';
  name = '';
  userId = '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    this.username = (params['username'] as string) || '';
    this.name = (params['name'] as string) || '';
    this.userId = (params['userId'] as string) || '';
  }

  get serverName(): string {
    return (
      this.systemConfigService.systemFeatures().defaultServerName || 'Inkweld'
    );
  }

  get displayName(): string {
    if (this.name && this.name.trim()) {
      return this.name.trim();
    } else if (this.username && this.username.trim()) {
      return this.username.trim();
    } else {
      return 'User';
    }
  }
}
