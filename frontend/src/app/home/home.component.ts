import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ThemeService } from '../../themes/theme.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { UserMenuComponent } from '../components/user-menu/user-menu.component';
import {
  Project,
  ProjectAPIService,
  User,
  UserAPIService,
} from 'worm-api-client';
import { firstValueFrom } from 'rxjs';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatToolbarModule,
    UserMenuComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  protected user: User | null = null;
  projects: Project[] = [];
  constructor(
    private themeService: ThemeService,
    private userService: UserAPIService,
    private projectService: ProjectAPIService
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
  }

  toggleTheme() {
    this.themeService.update(
      this.themeService.isDarkMode() ? 'light-theme' : 'dark-theme'
    );
  }
}
