import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AriaTabPanelComponent } from './aria-tab-panel.component';

describe('AriaTabPanelComponent', () => {
  let component: AriaTabPanelComponent;
  let fixture: ComponentFixture<AriaTabPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AriaTabPanelComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AriaTabPanelComponent);
    component = fixture.componentInstance;
    component.key = 'test-panel';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept key input', () => {
    expect(component.key).toBe('test-panel');
  });

  it('should have contentTemplate reference', () => {
    expect(component.contentTemplate).toBeTruthy();
  });

  it('should update key when input changes', () => {
    component.key = 'new-key';
    fixture.detectChanges();

    expect(component.key).toBe('new-key');
  });
});
