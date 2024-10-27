import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unavailable',
  templateUrl: './unavailable.component.html',
  styleUrls: ['./unavailable.component.scss'],
  standalone: true,
  imports: [MatCardModule, MatButtonModule, RouterLink],
})
export class UnavailableComponent {}
