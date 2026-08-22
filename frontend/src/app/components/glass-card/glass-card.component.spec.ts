import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { GlassCardComponent } from './glass-card.component';

describe('GlassCardComponent', () => {
  let component: GlassCardComponent;
  let fixture: ComponentFixture<GlassCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GlassCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(GlassCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a title and icon header', () => {
    fixture.componentRef.setInput('title', 'Menu background');
    fixture.componentRef.setInput('icon', 'palette');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.glass-card-title')?.textContent).toContain(
      'Menu background'
    );
    expect(el.querySelector('.glass-card-icon')).toBeTruthy();
  });

  it('should not render a header when no title or icon', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.glass-card-header')).toBeNull();
  });

  it('should project body content', () => {
    fixture.nativeElement.innerHTML += '<p class="body-content">Hello</p>';
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.glass-card-body')
    ).toBeTruthy();
  });
});
