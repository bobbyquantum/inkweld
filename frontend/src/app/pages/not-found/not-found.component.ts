import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div class="not-found-container">
      <h1>404 - Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <a routerLink="/">Return to Home</a>
    </div>
  `,
  styles: [
    `
      .not-found-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        padding: 2rem;
      }

      h1 {
        margin-bottom: 1rem;
      }

      a {
        margin-top: 1rem;
        color: var(--primary-color);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class NotFoundComponent {}




