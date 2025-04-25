import { Observable } from "rxjs";
import { HttpEvent } from "@angular/common/http";
import { of, throwError } from "rxjs";

export function apiOk<T>(body: T): Observable<HttpEvent<T>> {
  return of(body) as unknown as Observable<HttpEvent<T>>;
}
export function apiErr<T>(err: unknown): Observable<HttpEvent<T>> {
  return throwError(() => err) as unknown as Observable<HttpEvent<T>>;
}
