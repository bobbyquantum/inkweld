import { TestBed } from '@angular/core/testing';

import { XsrfService } from './xsrf.service';

describe('XsrfService', () => {
  let service: XsrfService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(XsrfService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
