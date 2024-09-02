import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
@Injectable({
  providedIn: 'root',
})
export class XsrfService {
  private document = inject(DOCUMENT);

  getXsrfToken(): string {
    const cookies = this.document.cookie.split(';');
    const xsrfCookie = cookies.find(cookie =>
      cookie.trim().startsWith('XSRF-TOKEN=')
    );
    return xsrfCookie ? xsrfCookie.split('=')[1] : '';
  }
}
