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
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';

import { GeneralSettingsComponent } from './tabs/general-settings/general-settings.component';
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
  ],
  animations: [slideAnimation],
  templateUrl: './user-settings-dialog.component.html',
  styleUrl: './user-settings-dialog.component.scss',
})
export class UserSettingsDialogComponent implements OnInit, OnDestroy {
  @Input() selectedCategory: 'general' | 'account' | 'project-tree' = 'general';
  previousCategory: 'general' | 'account' | 'project-tree' = 'general';
  isMobile = false;
  private destroyed = new Subject<void>();
  private breakpointObserver = inject(BreakpointObserver);

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

  selectCategory(category: 'general' | 'account' | 'project-tree') {
    this.previousCategory = this.selectedCategory;
    this.selectedCategory = category;
  }

  getAnimationState() {
    const isMovingDown =
      (this.selectedCategory === 'account' &&
        this.previousCategory === 'general') ||
      (this.selectedCategory === 'project-tree' &&
        this.previousCategory === 'account');
    return {
      value: this.selectedCategory,
      params: {
        enterTransform: isMovingDown ? '100%' : '-100%',
        leaveTransform: isMovingDown ? '-100%' : '100%',
      },
    };
  }
}
