import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { debounceTime, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-user-profile',
  imports: [RouterModule],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss',
})
export class UserProfileComponent implements OnInit, OnDestroy {
  username: string | null = null;
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        debounceTime(10), // Prevent rapid succession processing
        takeUntil(this.destroy$)
      )
      .subscribe(params => {
        this.username = params.get('username');
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
