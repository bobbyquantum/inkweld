import {
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import {
  RegistrationFormComponent,
  RegistrationResult,
} from '@components/registration-form/registration-form.component';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-register-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatDividerModule,
    OAuthProviderListComponent,
    RegistrationFormComponent,
  ],
  templateUrl: './register-dialog.component.html',
  styleUrl: './register-dialog.component.scss',
})
export class RegisterDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<RegisterDialogComponent>);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private changeDetectorRef = inject(ChangeDetectorRef);

  @ViewChild(RegistrationFormComponent)
  registrationForm?: RegistrationFormComponent;

  isMobile = false;
  readonly providersLoaded = signal(false);

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.isMobile = window.innerWidth < 768;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Handle providers loaded event
  onProvidersLoaded(): void {
    // Signal handles change detection properly, no setTimeout needed
    this.providersLoaded.set(true);
    this.changeDetectorRef.detectChanges();
  }

  // Handle successful registration
  onRegistered(result: RegistrationResult): void {
    if (result.requiresApproval) {
      // Close dialog and redirect to dedicated pending approval page
      this.dialogRef.close(false);
      void this.router.navigate(['/approval-pending'], {
        queryParams: {
          username: result.user.username,
          name: result.user.name || result.user.username,
          userId: result.user.id,
        },
      });
    } else {
      this.snackBar.open('Registration successful!', 'Close', {
        duration: 3000,
      });
      this.dialogRef.close(true); // Close with success result
      void this.router.navigate(['/']);
    }
  }

  // Handle registration error
  onRegistrationError(error: Error): void {
    this.snackBar.open(error.message, 'Close', { duration: 5000 });
  }

  onLoginClick(): void {
    this.dialogRef.close('login'); // Signal to open login dialog
  }
}
