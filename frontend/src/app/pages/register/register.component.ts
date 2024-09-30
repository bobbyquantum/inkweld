import { Component, inject, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserAPIService, UsernameAvailabilityResponse } from 'worm-api-client';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

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
  email = '';
  password = '';
  confirmPassword = '';
  isMobile = false;
  usernameSuggestions: string[] | undefined = [];

  githubEnabled = false;
  googleEnabled = false;
  facebookEnabled = false;
  discordEnabled = false;
  appleEnabled = false;

  private userService = inject(UserAPIService);
  private snackBar = inject(MatSnackBar);
  private ngZone = inject(NgZone);

  async ngOnInit() {
    // Simple mobile detection (can be improved with a proper responsive design service)
    this.isMobile = window.innerWidth < 768;

    // Fetch enabled OAuth2 providers
    const providers = await firstValueFrom(
      this.userService.getEnabledOAuth2Providers()
    );
    console.log('Enabled OAuth2 providers:', providers);
    providers.forEach(provider => {
      if (provider === 'github') {
        this.githubEnabled = true;
      }
      if (provider === 'google') {
        this.googleEnabled = true;
      }
      if (provider === 'facebook') {
        this.facebookEnabled = true;
      }
      if (provider === 'discord') {
        this.discordEnabled = true;
      }
      if (provider === 'apple') {
        this.appleEnabled = true;
      }
    });
  }

  onRegister() {
    // Implement registration logic here
    // this.userService.registerUser({
    //   username: this.username,
    //   name: 'test',
    //   password: this.password,
    // });
    console.log('Register clicked', {
      username: this.username,
      email: this.email,
    });
  }

  async checkUsernameAvailability() {
    if (this.username.length < 3) {
      return; // Don't check availability for usernames shorter than 3 characters
    }

    try {
      const response: UsernameAvailabilityResponse = await firstValueFrom(
        this.userService.checkUsernameAvailability(this.username)
      );

      if (response.available) {
        this.snackBar.open('Username is available!', 'Close', {
          duration: 3000,
        });
        this.usernameSuggestions = [];
      } else {
        this.snackBar.open(
          'Username is already taken. Try one of the suggestions below.',
          'Close',
          { duration: 5000 }
        );
        this.usernameSuggestions = response.suggestions;
      }
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        console.error('Error checking username availability:', error.message);
        this.snackBar.open(
          `Error checking username availability: ${error.message}. Please try again.`,
          'Close',
          { duration: 5000 }
        );
      } else {
        console.error('Unknown error checking username availability:', error);
        this.snackBar.open(
          'An unknown error occurred. Please try again.',
          'Close',
          { duration: 5000 }
        );
      }
    }
  }

  selectSuggestion(suggestion: string) {
    this.username = suggestion;
    this.usernameSuggestions = [];
    this.checkUsernameAvailability();
  }

  registerWithGoogle() {
    console.log('Register with Google clicked');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/google';
    });
  }

  registerWithFacebook() {
    console.log('Register with Facebook clicked');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/facebook';
    });
  }

  registerWithGithub() {
    console.log('Register with GitHub clicked');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/github';
    });
  }

  registerWithApple() {
    console.log('Register with Apple clicked');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/apple';
    });
  }

  registerWithDiscord() {
    console.log('Register with Discord clicked');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/discord';
    });
  }
}
