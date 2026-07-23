import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'app-unavailable',
  templateUrl: './unavailable.component.html',
  styleUrls: ['./unavailable.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatCardModule, MatButtonModule, RouterLink, TranslocoModule],
})
export class UnavailableComponent {}
