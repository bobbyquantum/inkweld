import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserFilesDialogComponent } from './user-files-dialog.component';

describe('UserFilesDialogComponent', () => {
  let component: UserFilesDialogComponent;
  let fixture: ComponentFixture<UserFilesDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserFilesDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UserFilesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
