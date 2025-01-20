import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
@Injectable({
  providedIn: 'root',
})
export class XsrfService {
  private document = inject(DOCUMENT);

  getXsrfToken(): string {
    const cookies = this.document.cookie.split(';');
    const xsrfCookie = cookies.find(cookie => {
      return /^\s*XSRF-TOKEN\s*=/.test(cookie);
    });
    if (!xsrfCookie) return 'fake';
    const equalsIndex = xsrfCookie.indexOf('=');
    return xsrfCookie.slice(equalsIndex + 1).trim();
  }
}
