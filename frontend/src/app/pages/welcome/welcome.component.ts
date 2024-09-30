import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { CommonModule } from '@angular/common';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
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

  setupBreakpointObserver() {
    this.breakpointObserver
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile = result.matches;
      });
  }

  onLogin() {
    // Implement login logic here
    console.log('Login attempted with:', this.username, this.password);
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
