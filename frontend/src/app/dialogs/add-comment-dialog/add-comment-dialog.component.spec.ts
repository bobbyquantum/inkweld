import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AddCommentDialogComponent } from './add-comment-dialog.component';

describe('AddCommentDialogComponent', () => {
  let component: AddCommentDialogComponent;
  let fixture: ComponentFixture<AddCommentDialogComponent>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AddCommentDialogComponent, NoopAnimationsModule],
      providers: [{ provide: MatDialogRef, useValue: mockDialogRef }],
    }).compileComponents();

    fixture = TestBed.createComponent(AddCommentDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialise with empty comment text', () => {
    expect(component.commentText).toBe('');
  });

  describe('onSubmit', () => {
    it('should close dialog with trimmed text when text is non-empty', () => {
      component.commentText = '  Hello world  ';
      component.onSubmit();
      expect(mockDialogRef.close).toHaveBeenCalledWith('Hello world');
    });

    it('should not close dialog when text is empty or whitespace only', () => {
      component.commentText = '   ';
      component.onSubmit();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('onCancel', () => {
    it('should close dialog without a result', () => {
      component.onCancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith();
    });
  });

  describe('template', () => {
    it('should render the comment textarea', () => {
      const textarea = fixture.nativeElement.querySelector(
        '[data-testid="comment-text-input"]'
      );
      expect(textarea).toBeTruthy();
    });

    it('should render submit and cancel buttons', () => {
      const submit = fixture.nativeElement.querySelector(
        '[data-testid="submit-comment-btn"]'
      );
      const cancel = fixture.nativeElement.querySelector(
        '[data-testid="cancel-comment-btn"]'
      );
      expect(submit).toBeTruthy();
      expect(cancel).toBeTruthy();
    });

    it('should disable submit button when text is empty', () => {
      component.commentText = '';
      fixture.detectChanges();
      const submit = fixture.nativeElement.querySelector(
        '[data-testid="submit-comment-btn"]'
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });
  });
});
