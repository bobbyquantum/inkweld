import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import { UserService, UserServiceError } from '@services/user.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-welcome',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    OAuthProviderListComponent,
  ],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent {
  username = '';
  password = '';

  private snackBar = inject(MatSnackBar);
  private userService = inject(UserService);
  private destroy$ = new Subject<void>();

  async onLogin(): Promise<void> {
    try {
      await this.userService.login(this.username, this.password);
    } catch (error) {
      if (error instanceof UserServiceError) {
        if (error.code === 'LOGIN_FAILED') {
          this.snackBar.open(
            'Invalid username or password. Please check your credentials.',
            'Close',
            {
              duration: 5000,
              panelClass: ['error-snackbar'],
            }
          );
        } else {
          this.snackBar.open(error.message, 'Close', {
            duration: 5000,
          });
        }
      } else if (error instanceof Error) {
        this.snackBar.open(
          'An unexpected error occurred during login.',
          'Close',
          {
            duration: 5000,
          }
        );
      }
    }
  }
}
