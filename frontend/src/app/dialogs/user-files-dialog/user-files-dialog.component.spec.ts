import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { FileAPIService } from 'worm-api-client';

import { UserFilesDialogComponent } from './user-files-dialog.component';

describe('UserFilesDialogComponent', () => {
  let component: UserFilesDialogComponent;
  let fixture: ComponentFixture<UserFilesDialogComponent>;
  let fileServiceMock: jest.Mocked<Partial<FileAPIService>>;

  beforeEach(async () => {
    fileServiceMock = {
      searchFiles: jest.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [UserFilesDialogComponent, NoopAnimationsModule],
      providers: [
        provideHttpClientTesting(),
        { provide: FileAPIService, useValue: fileServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserFilesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
