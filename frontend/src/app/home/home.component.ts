import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ThemeService } from '../../themes/theme.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { UserMenuComponent } from "../user-menu/user-menu.component";
import { UserDto, UserService } from 'worm-api-client';
import { firstValueFrom } from 'rxjs';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatToolbarModule,
    UserMenuComponent
],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

  protected user: UserDto | null = null;
  constructor(private themeService: ThemeService, private userService: UserService) { }

  ngOnInit() {
    firstValueFrom(this.userService.getCurrentUser()).then((result) => {
      this.user = result;
    }).catch(() => {

    })
  }

  toggleTheme() {
    this.themeService.update(this.themeService.isDarkMode() ? 'light-theme' : 'dark-theme');
  }

}
