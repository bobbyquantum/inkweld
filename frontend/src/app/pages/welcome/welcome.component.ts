import { Component, NgZone, OnDestroy, inject } from '@angular/core';
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
import { Subject, takeUntil } from 'rxjs';

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
export class WelcomeComponent implements OnDestroy {
  private breakpointObserver = inject(BreakpointObserver);
  private ngZone = inject(NgZone);
  isMobile = false;
  private destroy$ = new Subject<void>();

  username = '';
  password = '';

  constructor() {
    this.setupBreakpointObserver();
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
    // Implement Google OAuth login
    console.log('Google login attempted');
  }

  loginWithFacebook() {
    // Implement Facebook OAuth login
    console.log('Facebook login attempted');
  }

  loginWithGithub() {
    console.log('GitHub login attempted');
    this.ngZone.runOutsideAngular(() => {
      window.location.href = '/oauth2/authorization/github';
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
