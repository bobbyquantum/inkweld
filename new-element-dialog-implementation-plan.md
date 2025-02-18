# New Element Dialog Implementation Plan

## 1. Create New Element Dialog Component

Create a new component at `frontend/src/app/dialogs/new-element-dialog`:

```typescript
// new-element-dialog.component.ts
@Component({
  selector: "app-new-element-dialog",
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
})
export class NewElementDialogComponent {
  form = new FormGroup({
    name: new FormControl("", Validators.required),
    type: new FormControl<ElementType>(ElementType.ITEM, Validators.required),
    file: new FormControl<File | null>(null),
  });

  // Image upload functionality from ImageElementEditorComponent
  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.form.patchValue({ file });
    }
  }
}
```

Template should include:

- Name input field
- Element type dropdown
- Conditional image upload section when type is IMAGE
- Cancel/Create buttons

## 2. Update ProjectStateService

```typescript
// project-state.service.ts
export class ProjectStateService {
  // ... existing code ...

  showNewElementDialog(parentElement?: ProjectElement) {
    const dialog = inject(MatDialog);
    const dialogRef = dialog.open(NewElementDialogComponent, {
      width: "400px",
      data: { parentElement },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        const { name, type, file } = result;
        this.createNewElement(name, type, file, parentElement);
      }
    });
  }

  private async createNewElement(name: string, type: ElementType, file: File | null, parentElement?: ProjectElement) {
    // Get current elements
    const elements = this.elements();
    const treeManipulator = new TreeManipulator(elements);

    // Add new element
    const newElement = treeManipulator.addNode(type, parentElement);
    newElement.name = name;

    // Update state
    this.updateElements(treeManipulator.getData());

    // Handle image upload if needed
    if (type === ElementType.IMAGE && file) {
      await this.uploadImage(newElement.id, file);
    }

    // Save changes
    const project = this.project();
    if (project?.user?.username && project?.slug) {
      await this.saveProjectElements(project.user.username, project.slug, treeManipulator.getData());
    }
  }

  private async uploadImage(elementId: string, file: File) {
    const project = this.project();
    if (!project?.user?.username || !project?.slug) {
      throw new Error("Project information not available");
    }

    return this.projectApiService.projectElementControllerUploadImage(project.user.username, project.slug, elementId, file).toPromise();
  }
}
```

## 3. Update Project Tree Component

### Update Context Menu Template

```html
<!-- project-tree.component.html -->
<div class="context-menu">
  <button mat-menu-item (click)="projectState.showNewElementDialog(contextItem)">
    <mat-icon>add</mat-icon>
    <span>New Element</span>
  </button>
  <!-- existing menu items -->
</div>
```

### Remove Element Creation Logic

Remove the direct element creation methods from ProjectTreeComponent since this is now handled by ProjectStateService.

## 4. Update Project Component

### Add Toolbar Buttons

```html
<!-- Desktop toolbar -->
<mat-toolbar class="project-toolbar">
  <!-- existing buttons -->
  <button mat-icon-button (click)="projectState.showNewElementDialog()">
    <mat-icon>add</mat-icon>
  </button>
</mat-toolbar>

<!-- Mobile toolbar -->
<mat-toolbar class="mobile-toolbar">
  <!-- existing buttons -->
  <button mat-icon-button (click)="projectState.showNewElementDialog()">
    <mat-icon>add</mat-icon>
  </button>
</mat-toolbar>
```

### Update Home Screen

```html
<div class="start-actions">
  <button mat-button color="primary" (click)="projectState.showNewElementDialog()">New Element</button>
  <!-- other buttons -->
</div>
```

## 5. Testing Plan

1. ProjectStateService Tests:

   - Dialog opening
   - Element creation
   - Image upload handling
   - State updates
   - Error handling

2. NewElementDialogComponent Tests:

   - Form validation
   - Type selection changes
   - File upload handling
   - Dialog actions (cancel/create)

3. Integration Tests:
   - Element creation from different locations
   - State updates propagation
   - Tree view updates

## Implementation Steps

1. Create NewElementDialogComponent and its tests
2. Add new methods to ProjectStateService
3. Update ProjectTreeComponent to use ProjectStateService
4. Update ProjectComponent to use ProjectStateService
5. Add e2e tests for the complete flow
6. Update existing tests that might be affected

## Notes

- All new components should be standalone
- Reuse existing image upload functionality
- Maintain consistent styling with existing dialogs
- Consider accessibility in dialog design
- Add proper error handling for file uploads
- ProjectStateService becomes the single source of truth for element operations
