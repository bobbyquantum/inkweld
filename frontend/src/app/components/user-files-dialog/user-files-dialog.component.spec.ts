import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserFilesDialogComponent } from './user-files-dialog.component';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { FileAPIService } from 'worm-api-client';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('UserFilesDialogComponent', () => {
  let component: UserFilesDialogComponent;
  let fixture: ComponentFixture<UserFilesDialogComponent>;
  let fileServiceMock: jasmine.SpyObj<FileAPIService>;
  beforeEach(async () => {
    fileServiceMock = jasmine.createSpyObj<FileAPIService>('FileAPIService', [
      'searchFiles',
    ]);

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
