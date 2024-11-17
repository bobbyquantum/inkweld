import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { XsrfService } from '@services/xsrf.service';
import { firstValueFrom } from 'rxjs';
import {
  RegisterUserRequest,
  UserAPIService,
  UsernameAvailabilityResponse,
} from 'worm-api-client';

@Component({
  selector: 'app-register',
  standalone: true,
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

  githubEnabled = false;
  googleEnabled = false;
  facebookEnabled = false;
  discordEnabled = false;
  appleEnabled = false;

  private userService = inject(UserAPIService);
  private snackBar = inject(MatSnackBar);
  private ngZone = inject(NgZone);
  private router = inject(Router);
  private xsrfService = inject(XsrfService);

  async ngOnInit() {
    this.isMobile = window.innerWidth < 768;

    try {
      const providers = await firstValueFrom(
        this.userService.getEnabledOAuth2Providers()
      );
      console.log('Enabled OAuth2 providers:', providers);
      providers.forEach(provider => {
        if (provider === 'github') this.githubEnabled = true;
        if (provider === 'google') this.googleEnabled = true;
        if (provider === 'facebook') this.facebookEnabled = true;
        if (provider === 'discord') this.discordEnabled = true;
        if (provider === 'apple') this.appleEnabled = true;
      });
    } catch (error) {
      console.error('Error fetching OAuth2 providers:', error);
      this.snackBar.open('Failed to load OAuth2 providers', 'Close', {
        duration: 5000,
      });
    }
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
        this.userService.registerUser(xsrfToken, registerRequest)
      );
      this.snackBar.open('Registration successful!', 'Close', {
        duration: 3000,
      });
      this.router.navigate(['/home']);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        console.error('Error during registration:', error.message);
        this.snackBar.open(`Registration failed: ${error.message}`, 'Close', {
          duration: 5000,
        });
      } else {
        console.error('Unknown error during registration:', error);
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
    this.checkUsernameAvailability();
  }

  registerWithOAuth(provider: string) {
    console.log(`Register with ${provider} clicked`);
    this.ngZone.runOutsideAngular(() => {
      window.location.href = `/oauth2/authorization/${provider.toLowerCase()}`;
    });
  }
}
