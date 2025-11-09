import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unavailable',
  templateUrl: './unavailable.component.html',
  styleUrls: ['./unavailable.component.scss'],
  imports: [MatCardModule, MatButtonModule, RouterLink],
})
export class UnavailableComponent {}




