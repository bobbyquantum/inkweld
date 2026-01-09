import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ChangelogService } from '@services/core/changelog.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChangelogComponent } from './changelog.component';

describe('ChangelogComponent', () => {
  let component: ChangelogComponent;
  let fixture: ComponentFixture<ChangelogComponent>;
  let mockChangelogService: {
    getChangelog: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockChangelogService = {
      getChangelog: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [ChangelogComponent, NoopAnimationsModule],
      providers: [
        { provide: ChangelogService, useValue: mockChangelogService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChangelogComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load changelog on init', () => {
    const changelogData = [
      {
        version: '1.0.0',
        date: '2025-01-01',
        content: '<p>Initial release</p>',
      },
      { version: '1.1.0', date: '2025-01-15', content: '<p>New features</p>' },
    ];
    mockChangelogService.getChangelog.mockReturnValue(of(changelogData));

    fixture.detectChanges();

    expect(mockChangelogService.getChangelog).toHaveBeenCalled();
    expect(component.versions().length).toBe(2);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('should handle error when loading changelog fails', () => {
    mockChangelogService.getChangelog.mockReturnValue(
      throwError(() => new Error('Network error'))
    );

    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe(
      'Failed to load changelog. Please try again later.'
    );
    expect(component.versions().length).toBe(0);
  });

  it('should call window.history.back on goBack', () => {
    const historyBackSpy = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => {});

    component.goBack();

    expect(historyBackSpy).toHaveBeenCalled();
    historyBackSpy.mockRestore();
  });
});
