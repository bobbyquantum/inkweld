import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementEditorComponent } from './element-editor.component';

describe('ElementEditorComponent', () => {
  let component: ElementEditorComponent;
  let fixture: ComponentFixture<ElementEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElementEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ElementEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
