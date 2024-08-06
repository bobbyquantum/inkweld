import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MatToolbarModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'worm-frontend';
  loggedin = "checking";
  user: any = {}
  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.http.get('/api/users/me').subscribe(response => {
      console.log(response);
      this.loggedin="yes";
      this.user = response;
    }, error => {
      console.error(error);
      if (error.status==401) {
          this.loggedin="denied";
      }
      else {
        this.loggedin=error.message;
      }
    });
  }
}
