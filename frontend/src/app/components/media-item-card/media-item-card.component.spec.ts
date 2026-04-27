import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaItemCardComponent } from './media-item-card.component';

describe('MediaItemCardComponent', () => {
  let component: MediaItemCardComponent;
  let fixture: ComponentFixture<MediaItemCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MediaItemCardComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaItemCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display image when isImage and imageUrl are set', () => {
    fixture.componentRef.setInput('imageUrl', 'https://example.com/image.png');
    fixture.componentRef.setInput('altText', 'Test image');
    fixture.detectChanges();

    const imgs = fixture.nativeElement.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute('src')).toBe('https://example.com/image.png');
    expect(imgs[0].getAttribute('alt')).toBe('Test image');
    expect(imgs[1].getAttribute('src')).toBe('https://example.com/image.png');
  });

  it('should show file icon when isImage is false', () => {
    fixture.componentRef.setInput('isImage', false);
    fixture.componentRef.setInput('fileIcon', 'insert_drive_file');
    fixture.detectChanges();

    const fileIcon = fixture.nativeElement.querySelector('.file-icon');
    expect(fileIcon).toBeTruthy();
    expect(fileIcon.textContent.trim()).toBe('insert_drive_file');
  });

  it('should show custom file icon when provided', () => {
    fixture.componentRef.setInput('isImage', false);
    fixture.componentRef.setInput('fileIcon', 'picture_as_pdf');
    fixture.detectChanges();

    const fileIcon = fixture.nativeElement.querySelector('.file-icon');
    expect(fileIcon.textContent.trim()).toBe('picture_as_pdf');
  });

  it('should show placeholder icon when isImage is true but imageUrl is not set', () => {
    fixture.componentRef.setInput('isImage', true);
    fixture.componentRef.setInput('imageUrl', undefined);
    fixture.detectChanges();

    const placeholder = fixture.nativeElement.querySelector('.placeholder');
    expect(placeholder).toBeTruthy();
    const placeholderIcon = placeholder.querySelector('mat-icon');
    expect(placeholderIcon.textContent.trim()).toBe('image');
  });

  it('should emit cardClick when card-preview is clicked and isImage is true', () => {
    const clickSpy = vi.spyOn(component.cardClick, 'emit');
    fixture.componentRef.setInput('isImage', true);
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('.card-preview');
    preview.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('should emit cardClick when card-overlay is clicked and isImage is true', () => {
    const clickSpy = vi.spyOn(component.cardClick, 'emit');
    fixture.componentRef.setInput('isImage', true);
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.card-overlay');
    overlay.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('should not emit cardClick when isImage is false', () => {
    const clickSpy = vi.spyOn(component.cardClick, 'emit');
    fixture.componentRef.setInput('isImage', false);
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('.card-preview');
    preview.click();

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('should set role and tabindex when isImage is true', () => {
    fixture.componentRef.setInput('isImage', true);
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('.card-preview');
    expect(preview.getAttribute('role')).toBe('button');
    expect(preview.getAttribute('tabindex')).toBe('0');
  });

  it('should not set role when isImage is false', () => {
    fixture.componentRef.setInput('isImage', false);
    fixture.detectChanges();

    const preview = fixture.nativeElement.querySelector('.card-preview');
    expect(preview.getAttribute('role')).toBeNull();
  });
});
