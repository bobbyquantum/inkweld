import {
  NO_ERRORS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import {
  InsertLinkDialogComponent,
  type InsertLinkDialogData,
} from './insert-link-dialog.component';

function createFixture(data: InsertLinkDialogData): {
  fixture: ComponentFixture<InsertLinkDialogComponent>;
  component: InsertLinkDialogComponent;
  closeSpy: Mock;
} {
  const closeSpy = vi.fn();

  TestBed.configureTestingModule({
    imports: [InsertLinkDialogComponent, NoopAnimationsModule],
    schemas: [NO_ERRORS_SCHEMA],
    providers: [
      provideZonelessChangeDetection(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: closeSpy } },
    ],
  });

  const fixture = TestBed.createComponent(InsertLinkDialogComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, closeSpy };
}

describe('InsertLinkDialogComponent', () => {
  describe('insert mode (no selection)', () => {
    let component: InsertLinkDialogComponent;
    let closeSpy: Mock;

    beforeEach(() => {
      ({ component, closeSpy } = createFixture({}));
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should not be in editing mode', () => {
      expect((component as unknown as { isEditing: boolean }).isEditing).toBe(
        false
      );
    });

    it('should not have a selection', () => {
      expect(
        (component as unknown as { hasSelection: boolean }).hasSelection
      ).toBe(false);
    });

    it('should be invalid when linkText and href are empty', () => {
      component.linkTextControl.setValue('');
      component.hrefControl.setValue('');
      expect(component['form'].valid).toBe(false);
    });

    it('should be valid with linkText and a https URL', () => {
      component.linkTextControl.setValue('My link');
      component.hrefControl.setValue('https://example.com');
      expect(component['form'].valid).toBe(true);
    });

    it('should close with result on confirm when valid', () => {
      component.linkTextControl.setValue('Click me');
      component.hrefControl.setValue('https://example.com');
      component['form'].controls.openInNewTab.setValue(false);
      component.onConfirm();
      expect(closeSpy).toHaveBeenCalledWith({
        href: 'https://example.com',
        openInNewTab: false,
        linkText: 'Click me',
      });
    });

    it('should trim whitespace from href and linkText on confirm', () => {
      component.linkTextControl.setValue('  My link  ');
      component.hrefControl.setValue('  https://example.com  ');
      component.onConfirm();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          href: 'https://example.com',
          linkText: 'My link',
        })
      );
    });

    it('should not close when form is invalid', () => {
      component.linkTextControl.setValue('');
      component.hrefControl.setValue('');
      component.onConfirm();
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('should close without result on cancel', () => {
      component.onCancel();
      expect(closeSpy).toHaveBeenCalledOnce();
    });
  });

  describe('wrap selection mode (selectedText provided)', () => {
    let component: InsertLinkDialogComponent;
    let closeSpy: Mock;

    beforeEach(() => {
      ({ component, closeSpy } = createFixture({
        selectedText: 'hello world',
      }));
    });

    it('should have a selection', () => {
      expect(
        (component as unknown as { hasSelection: boolean }).hasSelection
      ).toBe(true);
    });

    it('should be valid with only a href when selection exists', () => {
      component.hrefControl.setValue('https://example.com');
      expect(component['form'].valid).toBe(true);
    });

    it('should close with undefined linkText on confirm', () => {
      component.hrefControl.setValue('https://example.com');
      component.onConfirm();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ linkText: undefined })
      );
    });
  });

  describe('edit mode (existingHref provided)', () => {
    let component: InsertLinkDialogComponent;
    let closeSpy: Mock;

    beforeEach(() => {
      ({ component, closeSpy } = createFixture({
        existingHref: 'https://old.com',
        selectedText: 'old text',
      }));
    });

    it('should be in editing mode', () => {
      expect((component as unknown as { isEditing: boolean }).isEditing).toBe(
        true
      );
    });

    it('should pre-fill the href field with the existing href', () => {
      expect(component.hrefControl.value).toBe('https://old.com');
    });

    it('should close with empty href on remove', () => {
      component.onRemoveLink();
      expect(closeSpy).toHaveBeenCalledWith({ href: '', openInNewTab: false });
    });

    it('should close with updated href on confirm', () => {
      component.hrefControl.setValue('https://new.com');
      component.onConfirm();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ href: 'https://new.com' })
      );
    });
  });

  describe('URL validation', () => {
    let component: InsertLinkDialogComponent;

    beforeEach(() => {
      ({ component } = createFixture({ selectedText: 'text' }));
    });

    it('should accept https URLs', () => {
      component.hrefControl.setValue('https://example.com');
      expect(component.hrefControl.errors).toBeNull();
    });

    it('should accept http URLs', () => {
      component.hrefControl.setValue('http://example.com');
      expect(component.hrefControl.errors).toBeNull();
    });

    it('should accept mailto: links', () => {
      component.hrefControl.setValue('mailto:user@example.com');
      expect(component.hrefControl.errors).toBeNull();
    });

    it('should accept tel: links', () => {
      component.hrefControl.setValue('tel:+1234567890');
      expect(component.hrefControl.errors).toBeNull();
    });

    it('should accept root-relative paths', () => {
      component.hrefControl.setValue('/about');
      expect(component.hrefControl.errors).toBeNull();
    });

    it('should accept same-page anchors', () => {
      component.hrefControl.setValue('#section-1');
      expect(component.hrefControl.errors).toBeNull();
    });

    it('should reject javascript: URLs', () => {
      component.hrefControl.setValue('javascript:alert(1)');
      expect(component.hrefControl.errors).toMatchObject({ invalidUrl: true });
    });

    it('should reject vbscript: URLs', () => {
      component.hrefControl.setValue('vbscript:msgbox(1)');
      expect(component.hrefControl.errors).toMatchObject({ invalidUrl: true });
    });

    it('should reject data: URLs', () => {
      component.hrefControl.setValue('data:text/html,<h1>xss</h1>');
      expect(component.hrefControl.errors).toMatchObject({ invalidUrl: true });
    });

    it('should reject protocol-relative URLs (//example.com)', () => {
      component.hrefControl.setValue('//example.com');
      expect(component.hrefControl.errors).toMatchObject({ invalidUrl: true });
    });

    it('should reject bare hostnames without protocol', () => {
      component.hrefControl.setValue('example.com');
      expect(component.hrefControl.errors).toMatchObject({ invalidUrl: true });
    });

    it('should be required — reject empty string', () => {
      component.hrefControl.setValue('');
      expect(component.hrefControl.errors).toMatchObject({ required: true });
    });
  });
});
