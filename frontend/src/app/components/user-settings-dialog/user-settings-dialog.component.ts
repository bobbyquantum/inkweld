import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogContent,
  MatDialogTitle,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { GeneralSettingsComponent } from './tabs/general-settings/general-settings.component';
import {
  trigger,
  transition,
  style,
  animate,
  query,
  group,
} from '@angular/animations';

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
  standalone: true,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    GeneralSettingsComponent,
  ],
  animations: [slideAnimation],
  templateUrl: './user-settings-dialog.component.html',
  styleUrl: './user-settings-dialog.component.scss',
})
export class UserSettingsDialogComponent {
  selectedCategory: 'general' | 'account' = 'general';
  previousCategory: 'general' | 'account' = 'general';

  selectCategory(category: 'general' | 'account') {
    this.previousCategory = this.selectedCategory;
    this.selectedCategory = category;
  }

  getAnimationState() {
    const isMovingDown =
      this.selectedCategory === 'account' &&
      this.previousCategory === 'general';
    return {
      value: this.selectedCategory,
      params: {
        enterTransform: isMovingDown ? '100%' : '-100%',
        leaveTransform: isMovingDown ? '-100%' : '100%',
      },
    };
  }
}
