import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  Component,
  inject,
  Input,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';

import { AccountSettingsComponent } from './tabs/account-settings/account-settings.component';
import { AuthorizedAppsComponent } from './tabs/authorized-apps/authorized-apps.component';
import { ProjectSettingsComponent } from './tabs/project-settings/project-settings.component';
import { ProjectTreeSettingsComponent } from './tabs/project-tree-settings/project-tree-settings.component';

const CATEGORIES = [
  'account',
  'authorized-apps',
  'project-tree',
  'project',
] as const;
type SettingsCategory = (typeof CATEGORIES)[number];

@Component({
  selector: 'app-user-settings-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogClose,
    MatDividerModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    AccountSettingsComponent,
    AuthorizedAppsComponent,
    ProjectTreeSettingsComponent,
    ProjectSettingsComponent,
  ],
  templateUrl: './user-settings-dialog.component.html',
  styleUrl: './user-settings-dialog.component.scss',
})
export class UserSettingsDialogComponent implements OnInit, OnDestroy {
  private readonly breakpointObserver = inject(BreakpointObserver);

  @Input() selectedCategory: SettingsCategory = 'account';
  previousCategory: SettingsCategory = 'account';
  isMobile = false;
  private readonly destroyed = new Subject<void>();

  ngOnInit() {
    this.breakpointObserver
      .observe([Breakpoints.HandsetPortrait, Breakpoints.TabletPortrait])
      .pipe(takeUntil(this.destroyed))
      .subscribe(result => {
        this.isMobile = result.matches;
      });
  }

  ngOnDestroy() {
    this.destroyed.next();
    this.destroyed.complete();
  }

  selectCategory(
    category: 'account' | 'authorized-apps' | 'project-tree' | 'project'
  ) {
    this.previousCategory = this.selectedCategory;
    this.selectedCategory = category;
  }

  getEnterAnimationClass() {
    const currentIndex = CATEGORIES.indexOf(this.selectedCategory);
    const previousIndex = CATEGORIES.indexOf(this.previousCategory);
    return currentIndex > previousIndex
      ? 'slide-from-bottom'
      : 'slide-from-top';
  }

  getLeaveAnimationClass() {
    const currentIndex = CATEGORIES.indexOf(this.selectedCategory);
    const previousIndex = CATEGORIES.indexOf(this.previousCategory);
    return currentIndex > previousIndex ? 'slide-to-top' : 'slide-to-bottom';
  }
}
