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
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';

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
    MatDividerModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ProjectTreeSettingsComponent,
    ProjectSettingsComponent,
  ],
  animations: [slideAnimation],
  templateUrl: './user-settings-dialog.component.html',
  styleUrl: './user-settings-dialog.component.scss',
})
export class UserSettingsDialogComponent implements OnInit, OnDestroy {
  private breakpointObserver = inject(BreakpointObserver);

  @Input() selectedCategory: 'project-tree' | 'project' = 'project-tree';
  previousCategory: 'project-tree' | 'project' = 'project-tree';
  isMobile = false;
  private destroyed = new Subject<void>();

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

  selectCategory(category: 'project-tree' | 'project') {
    this.previousCategory = this.selectedCategory;
    this.selectedCategory = category;
  }

  getAnimationState() {
    const categories = ['project-tree', 'project'];
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
