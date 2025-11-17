import {
  animate,
  group,
  query,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';

import { ConnectionSettingsComponent } from './tabs/connection-settings/connection-settings.component';
import { GeneralSettingsComponent } from './tabs/general-settings/general-settings.component';
import { ProjectSettingsComponent } from './tabs/project-settings/project-settings.component';
import { ProjectTreeSettingsComponent } from './tabs/project-tree-settings/project-tree-settings.component';

const slideAnimation = trigger('slideAnimation', [
  transition(
    '* => *',
    [
      query(':enter, :leave', style({ position: 'absolute', width: '100%' }), {
        optional: true,
      }),
      group([
        query(
          ':enter',
          [
            style({ transform: 'translateY({{enterTransform}})' }),
            animate('300ms ease-out', style({ transform: 'translateY(0%)' })),
          ],
          { optional: true }
        ),
        query(
          ':leave',
          [
            animate(
              '300ms ease-out',
              style({ transform: 'translateY({{leaveTransform}})' })
            ),
          ],
          { optional: true }
        ),
      ]),
    ],
    { params: { enterTransform: '100%', leaveTransform: '-100%' } }
  ),
]);

@Component({
  selector: 'app-user-settings-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogClose,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    GeneralSettingsComponent,
    ProjectTreeSettingsComponent,
    ProjectSettingsComponent,
    ConnectionSettingsComponent,
  ],
  animations: [slideAnimation],
  templateUrl: './user-settings-dialog.component.html',
  styleUrl: './user-settings-dialog.component.scss',
})
export class UserSettingsDialogComponent implements OnInit, OnDestroy {
  private breakpointObserver = inject(BreakpointObserver);
  private dialogData = inject<{ selectedCategory?: string }>(MAT_DIALOG_DATA, {
    optional: true,
  });

  @Input() selectedCategory:
    | 'general'
    | 'account'
    | 'connection'
    | 'project-tree'
    | 'project' = 'general';
  previousCategory:
    | 'general'
    | 'account'
    | 'connection'
    | 'project-tree'
    | 'project' = 'general';
  isMobile = false;
  private destroyed = new Subject<void>();

  ngOnInit() {
    // Set initial category from dialog data if provided
    if (this.dialogData?.selectedCategory) {
      this.selectedCategory = this.dialogData
        .selectedCategory as typeof this.selectedCategory;
      this.previousCategory = this.selectedCategory;
    }

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
    category: 'general' | 'account' | 'connection' | 'project-tree' | 'project'
  ) {
    this.previousCategory = this.selectedCategory;
    this.selectedCategory = category;
  }

  getAnimationState() {
    const categories = [
      'general',
      'account',
      'connection',
      'project-tree',
      'project',
    ];
    const currentIndex = categories.indexOf(this.selectedCategory);
    const previousIndex = categories.indexOf(this.previousCategory);
    const isMovingDown = currentIndex > previousIndex;

    return {
      value: this.selectedCategory,
      params: {
        enterTransform: isMovingDown ? '100%' : '-100%',
        leaveTransform: isMovingDown ? '-100%' : '100%',
      },
    };
  }
}
