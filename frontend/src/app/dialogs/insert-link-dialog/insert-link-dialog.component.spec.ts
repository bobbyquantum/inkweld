import {
  NO_ERRORS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
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
    imports: [translocoTestProvider(), InsertLinkDialogComponent],
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
      component['form'].linkText().value.set('');
      component['form'].href().value.set('');
      expect(component['form']().invalid()).toBe(true);
    });

    it('should be valid with linkText and a https URL', () => {
      component['form'].linkText().value.set('My link');
      component['form'].href().value.set('https://example.com');
      expect(component['form']().valid()).toBe(true);
    });

    it('should close with result on confirm when valid', () => {
      component['form'].linkText().value.set('Click me');
      component['form'].href().value.set('https://example.com');
      component.model.update(m => ({ ...m, openInNewTab: false }));
      component.onConfirm();
      expect(closeSpy).toHaveBeenCalledWith({
        href: 'https://example.com',
        openInNewTab: false,
        linkText: 'Click me',
      });
    });

    it('should trim whitespace from href and linkText on confirm', () => {
      component['form'].linkText().value.set('  My link  ');
      component['form'].href().value.set('  https://example.com  ');
      component.onConfirm();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          href: 'https://example.com',
          linkText: 'My link',
        })
      );
    });

    it('should not close when form is invalid', () => {
      component['form'].linkText().value.set('');
      component['form'].href().value.set('');
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
      component['form'].href().value.set('https://example.com');
      expect(component['form']().valid()).toBe(true);
    });

    it('should close with undefined linkText on confirm', () => {
      component['form'].href().value.set('https://example.com');
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
      expect(component['form'].href().value()).toBe('https://old.com');
    });

    it('should close with empty href on remove', () => {
      component.onRemoveLink();
      expect(closeSpy).toHaveBeenCalledWith({ href: '', openInNewTab: false });
    });

    it('should close with updated href on confirm', () => {
      component['form'].href().value.set('https://new.com');
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
      component['form'].href().value.set('https://example.com');
      expect(component['form'].href().errors()).toEqual([]);
    });

    it('should accept http URLs', () => {
      component['form'].href().value.set('http://example.com');
      expect(component['form'].href().errors()).toEqual([]);
    });

    it('should accept mailto: links', () => {
      component['form'].href().value.set('mailto:user@example.com');
      expect(component['form'].href().errors()).toEqual([]);
    });

    it('should accept tel: links', () => {
      component['form'].href().value.set('tel:+1234567890');
      expect(component['form'].href().errors()).toEqual([]);
    });

    it('should accept root-relative paths', () => {
      component['form'].href().value.set('/about');
      expect(component['form'].href().errors()).toEqual([]);
    });

    it('should accept same-page anchors', () => {
      component['form'].href().value.set('#section-1');
      expect(component['form'].href().errors()).toEqual([]);
    });

    it('should reject javascript: URLs', () => {
      component['form'].href().value.set('javascript:alert(1)');
      expect(
        component['form']
          .href()
          .errors()
          .some(e => e.kind === 'invalidUrl')
      ).toBe(true);
    });

    it('should reject vbscript: URLs', () => {
      component['form'].href().value.set('vbscript:msgbox(1)');
      expect(
        component['form']
          .href()
          .errors()
          .some(e => e.kind === 'invalidUrl')
      ).toBe(true);
    });

    it('should reject data: URLs', () => {
      component['form'].href().value.set('data:text/html,<h1>xss</h1>');
      expect(
        component['form']
          .href()
          .errors()
          .some(e => e.kind === 'invalidUrl')
      ).toBe(true);
    });

    it('should reject protocol-relative URLs (//example.com)', () => {
      component['form'].href().value.set('//example.com');
      expect(
        component['form']
          .href()
          .errors()
          .some(e => e.kind === 'invalidUrl')
      ).toBe(true);
    });

    it('should reject bare hostnames without protocol', () => {
      component['form'].href().value.set('example.com');
      expect(
        component['form']
          .href()
          .errors()
          .some(e => e.kind === 'invalidUrl')
      ).toBe(true);
    });

    it('should be required — reject empty string', () => {
      component['form'].href().value.set('');
      expect(
        component['form']
          .href()
          .errors()
          .some(e => e.kind === 'required')
      ).toBe(true);
    });

    it('urlValidator should return null for empty/whitespace-only value (no protocol check needed)', () => {
      // urlValidator trims the value; whitespace-only is treated as empty and
      // returns null (no invalidUrl error) — the required validator handles emptiness
      component['form'].href().value.set('   ');
      expect(
        component['form']
          .href()
          .errors()
          .some(e => e.kind === 'invalidUrl')
      ).toBe(false);
    });
  });

  describe('onConfirm null-coalescing branches', () => {
    it('should fall back to empty string when href control value is null', () => {
      const closeSpy = vi.fn();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [translocoTestProvider(), InsertLinkDialogComponent],
        schemas: [NO_ERRORS_SCHEMA],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MAT_DIALOG_DATA, useValue: { selectedText: 'hi' } },
          { provide: MatDialogRef, useValue: { close: closeSpy } },
        ],
      });
      const fixture = TestBed.createComponent(InsertLinkDialogComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      // Stub form as valid and model to return null href/openInNewTab,
      // exercising the `?? ''` / `?? true` null-coalescing branches in onConfirm.
      const fakeState = {
        valid: () => true,
        invalid: () => false,
        errors: () => [],
        pending: () => false,
        touched: () => false,
        dirty: () => false,
        disabled: () => false,
        readonly: () => false,
        value: () => ({ linkText: '', href: null, openInNewTab: null }),
      };
      Object.defineProperty(comp, 'form', {
        value: () => fakeState,
        configurable: true,
      });
      Object.defineProperty(comp, 'model', {
        value: () => ({
          linkText: '',
          href: null as unknown as string,
          openInNewTab: null as unknown as boolean,
        }),
        configurable: true,
      });
      comp.onConfirm();

      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ href: '', openInNewTab: true })
      );
    });

    it('should fall back to empty string when linkText control value is null', () => {
      const closeSpy = vi.fn();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [translocoTestProvider(), InsertLinkDialogComponent],
        schemas: [NO_ERRORS_SCHEMA],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MAT_DIALOG_DATA, useValue: {} },
          { provide: MatDialogRef, useValue: { close: closeSpy } },
        ],
      });
      const fixture = TestBed.createComponent(InsertLinkDialogComponent);
      const comp = fixture.componentInstance;
      fixture.detectChanges();

      const fakeState = {
        valid: () => true,
        invalid: () => false,
        errors: () => [],
        pending: () => false,
        touched: () => false,
        dirty: () => false,
        disabled: () => false,
        readonly: () => false,
        value: () => ({
          linkText: null,
          href: 'https://example.com',
          openInNewTab: true,
        }),
      };
      Object.defineProperty(comp, 'form', {
        value: () => fakeState,
        configurable: true,
      });
      Object.defineProperty(comp, 'model', {
        value: () => ({
          linkText: null as unknown as string,
          href: 'https://example.com',
          openInNewTab: true,
        }),
        configurable: true,
      });
      comp.onConfirm();

      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ linkText: '' })
      );
    });
  });
});
