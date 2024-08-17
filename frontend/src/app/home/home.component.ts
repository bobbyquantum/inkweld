import { Component, OnDestroy, OnInit } from '@angular/core';
import { ThemeService } from '../../themes/theme.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatGridListModule } from '@angular/material/grid-list';
import { UserMenuComponent } from '../components/user-menu/user-menu.component';
import {
  Project,
  ProjectAPIService,
  User,
  UserAPIService,
} from 'worm-api-client';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ProjectCardComponent } from '../components/project-card/project-card.component';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    UserMenuComponent,
    MatToolbarModule,
    ProjectCardComponent,
    MatGridListModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  protected user: User | null = null;
  projects: Project[] = [];
  cols = 4;
  private destroy$ = new Subject<void>();

  constructor(
    private themeService: ThemeService,
    private userService: UserAPIService,
    private projectService: ProjectAPIService,
    private breakpointObserver: BreakpointObserver
  ) {}

  ngOnInit() {
    firstValueFrom(this.userService.getCurrentUser())
      .then(result => {
        this.user = result;
      })
      .catch(error => {
        console.log('Error', error);
      });

    firstValueFrom(this.projectService.getAllProjects()).then(result => {
      this.projects = result;
    });
    this.breakpointObserver
      .observe([
        Breakpoints.XSmall,
        Breakpoints.Small,
        Breakpoints.Medium,
        Breakpoints.Large,
        Breakpoints.XLarge,
      ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result.breakpoints[Breakpoints.XSmall]) {
          this.cols = 1;
        } else if (result.breakpoints[Breakpoints.Small]) {
          this.cols = 2;
        } else if (result.breakpoints[Breakpoints.Medium]) {
          this.cols = 3;
        } else if (result.breakpoints[Breakpoints.Large]) {
          this.cols = 4;
        } else if (result.breakpoints[Breakpoints.XLarge]) {
          this.cols = 6;
        }
      });
  }

  toggleTheme() {
    this.themeService.update(
      this.themeService.isDarkMode() ? 'light-theme' : 'dark-theme'
    );
  }
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
