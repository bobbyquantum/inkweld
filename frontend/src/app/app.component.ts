import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'worm-frontend';
  loggedin = "checking";
  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.http.get('/api/users/me').subscribe(response => {
      console.log(response);
      this.loggedin="yes";
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
