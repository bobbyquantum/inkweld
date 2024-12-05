import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import { XsrfService } from '@services/xsrf.service';
import { Subject, takeUntil } from 'rxjs';

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
    styleUrl: './welcome.component.scss'
})
export class WelcomeComponent implements OnDestroy {
  isMobile = false;
  username = '';
  password = '';

  private breakpointObserver = inject(BreakpointObserver);
  private http = inject(HttpClient);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private xsrfService = inject(XsrfService);
  private destroy$ = new Subject<void>();

  constructor() {
    this.setupBreakpointObserver();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onLogin(): void {
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
          void this.router.navigate(['/']);
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

  private setupBreakpointObserver(): void {
    this.breakpointObserver
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.isMobile = result.matches;
      });
  }
}
