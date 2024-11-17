import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, inject, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { XsrfService } from '@services/xsrf.service';
import { Subject, takeUntil } from 'rxjs';
import { UserAPIService } from 'worm-api-client';

@Component({
  selector: 'app-welcome',
  standalone: true,
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
  ],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent implements OnInit, OnDestroy {
  private breakpointObserver = inject(BreakpointObserver);
  private ngZone = inject(NgZone);
  private userService = inject(UserAPIService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private xsrfService = inject(XsrfService);
  isMobile = false;
  private destroy$ = new Subject<void>();

  username = '';
  password = '';
  githubEnabled = false;
  googleEnabled = false;
  facebookEnabled = false;
  discordEnabled = false;
  appleEnabled = false;

  constructor() {
    this.setupBreakpointObserver();
  }

  async ngOnInit(): Promise<void> {
    this.userService.getEnabledOAuth2Providers().subscribe({
      next: providers => {
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
        console.log('Enabled OAuth2 providers:', providers);
      },
      error: error => {
        console.error('Error fetching OAuth2 providers:', error);
        this.snackBar.open(
          'Failed to load authentication providers.',
          'Close',
          { duration: 5000 }
        );
      },
    });
  }

  setupBreakpointObserver() {
    this.breakpointObserver
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile = result.matches;
      });
  }

  onLogin() {
    const body = new URLSearchParams();
    body.set('username', this.username);
    body.set('password', this.password);

    const xsrfToken = this.xsrfService.getXsrfToken();
    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-XSRF-TOKEN': xsrfToken,
    });

    this.http
      .post('/login', body.toString(), {
        headers,
        observe: 'response',
        withCredentials: true,
      })
      .subscribe({
        next: response => {
          console.log('Login successful', response);
          this.snackBar.open('Login successful', 'Close', { duration: 3000 });
          this.router.navigate(['/']);
        },
        error: error => {
          console.error('Login failed', error);
          this.snackBar.open(
            'Login failed. Please check your credentials.',
            'Close',
            { duration: 5000 }
          );
        },
      });
  }

  loginWithGoogle() {
    console.log('Google login attempted');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/google';
    });
  }

  loginWithFacebook() {
    console.log('Facebook login attempted');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/facebook';
    });
  }

  loginWithGithub() {
    console.log('GitHub login attempted');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/github';
    });
  }

  loginWithApple() {
    console.log('Apple login attempted');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/apple';
    });
  }

  loginWithDiscord() {
    console.log('Discord login attempted');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/discord';
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
