import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Correction } from '../../../api-client/model/correction';
import { LintOverlayComponent } from './lint-overlay.component';

describe('LintOverlayComponent', () => {
  let component: LintOverlayComponent;
  let fixture: ComponentFixture<LintOverlayComponent>;

  const mockCorrection: Correction = {
    originalText: 'teh',
    correctedText: 'the',
    startPos: 0,
    endPos: 3,
    errorType: 'spelling',
    recommendation: 'Use correct spelling',
  };

  const mockCorrections: Correction[] = [
    mockCorrection,
    {
      originalText: 'recieve',
      correctedText: 'receive',
      startPos: 10,
      endPos: 17,
      errorType: 'spelling',
      recommendation: 'Use correct spelling',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LintOverlayComponent, NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(LintOverlayComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should have empty tipContent initially', () => {
      expect(component.tipContent).toBe('');
    });

    it('should have default position as below', () => {
      expect(component.position).toBe('below');
    });

    it('should have empty recommendations initially', () => {
      expect(component.recommendations).toEqual([]);
    });
  });

  describe('ngOnInit', () => {
    it('should update tip content on init', () => {
      component.recommendations = mockCorrections;
      component.ngOnInit();
      expect(component.tipContent).not.toBe('');
    });

    it('should keep empty tip content when no recommendations', () => {
      component.recommendations = [];
      component.ngOnInit();
      expect(component.tipContent).toBe('');
    });
  });

  describe('ngOnChanges', () => {
    it('should update tip content when recommendations change', () => {
      component.recommendations = mockCorrections;
      component.ngOnChanges();
      expect(component.tipContent).toContain('the');
      expect(component.tipContent).toContain('receive');
    });

    it('should clear tip content when recommendations are cleared', () => {
      component.recommendations = mockCorrections;
      component.ngOnChanges();
      expect(component.tipContent).not.toBe('');

      component.recommendations = [];
      component.ngOnChanges();
      expect(component.tipContent).toBe('');
    });
  });

  describe('tipContent formatting', () => {
    it('should format single recommendation correctly', () => {
      component.recommendations = [mockCorrection];
      component.ngOnChanges();

      expect(component.tipContent).toContain('lint-tip-title');
      expect(component.tipContent).toContain('the');
      expect(component.tipContent).toContain('teh');
    });

    it('should format multiple recommendations with separators', () => {
      component.recommendations = mockCorrections;
      component.ngOnChanges();

      expect(component.tipContent).toContain('<hr');
      expect(component.tipContent).toContain('the');
      expect(component.tipContent).toContain('receive');
    });

    it('should include accept and reject buttons', () => {
      component.recommendations = [mockCorrection];
      component.ngOnChanges();

      expect(component.tipContent).toContain('lint-accept-button');
      expect(component.tipContent).toContain('lint-reject-button');
      expect(component.tipContent).toContain('Accept');
      expect(component.tipContent).toContain('Reject');
    });
  });

  describe('event handling', () => {
    it('should dispatch lint-correction-accept on handleAccept', () => {
      const dispatchSpy = vi.spyOn(document, 'dispatchEvent');
      const customEvent = new CustomEvent<Correction>('lint-accept', {
        detail: mockCorrection,
      });

      // Trigger the event
      document.dispatchEvent(customEvent);

      // The component listens and dispatches lint-correction-accept
      expect(dispatchSpy).toHaveBeenCalled();
      const dispatchedEvents = dispatchSpy.mock.calls;
      const acceptEvent = dispatchedEvents.find(
        call => (call[0] as CustomEvent).type === 'lint-correction-accept'
      );
      expect(acceptEvent).toBeDefined();
    });

    it('should dispatch lint-correction-reject on handleReject', () => {
      const dispatchSpy = vi.spyOn(document, 'dispatchEvent');
      const customEvent = new CustomEvent<Correction>('lint-reject', {
        detail: mockCorrection,
      });

      // Trigger the event
      document.dispatchEvent(customEvent);

      // The component listens and dispatches lint-correction-reject
      expect(dispatchSpy).toHaveBeenCalled();
      const dispatchedEvents = dispatchSpy.mock.calls;
      const rejectEvent = dispatchedEvents.find(
        call => (call[0] as CustomEvent).type === 'lint-correction-reject'
      );
      expect(rejectEvent).toBeDefined();
    });
  });

  describe('input binding', () => {
    it('should accept position input', () => {
      component.position = 'above';
      fixture.detectChanges();
      expect(component.position).toBe('above');
    });

    it('should accept recommendations input', () => {
      component.recommendations = mockCorrections;
      fixture.detectChanges();
      expect(component.recommendations).toEqual(mockCorrections);
    });
  });
});
