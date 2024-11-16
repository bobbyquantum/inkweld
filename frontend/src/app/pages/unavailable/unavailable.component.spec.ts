import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnavailableComponent } from './unavailable.component';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

describe('UnavailableComponent', () => {
  let component: UnavailableComponent;
  let fixture: ComponentFixture<UnavailableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnavailableComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UnavailableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
