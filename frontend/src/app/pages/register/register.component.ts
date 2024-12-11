import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import { XsrfService } from '@services/xsrf.service';
import { firstValueFrom } from 'rxjs';
import {
  RegisterUserRequest,
  UserAPIService,
  UsernameAvailabilityResponse,
} from 'worm-api-angular-client';

@Component({
  selector: 'app-register',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    OAuthProviderListComponent,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit {
  username = '';
  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  isMobile = false;
  usernameSuggestions: string[] | undefined = [];
  usernameAvailability: 'available' | 'unavailable' | 'unknown' = 'unknown';

  private userService = inject(UserAPIService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private xsrfService = inject(XsrfService);

  ngOnInit(): void {
    this.isMobile = window.innerWidth < 768;
  }

  async onRegister() {
    if (this.password !== this.confirmPassword) {
      this.snackBar.open('Passwords do not match', 'Close', { duration: 3000 });
      return;
    }

    try {
      const registerRequest: RegisterUserRequest = {
        username: this.username,
        name: this.name,
        email: this.email,
        password: this.password,
      };

      const xsrfToken = this.xsrfService.getXsrfToken();
      await firstValueFrom(
        this.userService.registerUser(registerRequest, xsrfToken)
      );
      this.snackBar.open('Registration successful!', 'Close', {
        duration: 3000,
      });
      void this.router.navigate(['/home']);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        this.snackBar.open(`Registration failed: ${error.message}`, 'Close', {
          duration: 5000,
        });
      } else {
        this.snackBar.open(
          'An unknown error occurred during registration. Please try again.',
          'Close',
          { duration: 5000 }
        );
      }
    }
  }

  async checkUsernameAvailability() {
    if (this.username.length < 3) {
      this.usernameAvailability = 'unknown';
      return;
    }

    try {
      const response: UsernameAvailabilityResponse = await firstValueFrom(
        this.userService.checkUsernameAvailability(this.username)
      );

      if (response.available) {
        this.usernameAvailability = 'available';
        this.usernameSuggestions = [];
      } else {
        this.usernameAvailability = 'unavailable';
        this.usernameSuggestions = response.suggestions;
      }
    } catch (error: unknown) {
      this.usernameAvailability = 'unknown';
      if (error instanceof HttpErrorResponse) {
        console.error('Error checking username availability:', error.message);
      } else {
        console.error('Unknown error checking username availability:', error);
      }
    }
  }

  selectSuggestion(suggestion: string) {
    this.username = suggestion;
    this.usernameSuggestions = [];
    void this.checkUsernameAvailability();
  }
}
