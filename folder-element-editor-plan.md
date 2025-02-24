# Folder Element Editor Implementation Plan

Based on my analysis of the existing codebase, I'll outline a detailed plan for implementing the new folder-element-editor component that will display child elements in either a grid layout or sortable list format, with the view choice persisted in the element's metadata.

## 1. Component Structure

The folder-element-editor component will follow the same pattern as the existing element editors:

```
frontend/src/app/components/folder-element-editor/
├── folder-element-editor.component.ts
├── folder-element-editor.component.html
├── folder-element-editor.component.scss
└── folder-element-editor.component.spec.ts
```

## 2. Component Implementation Details

### 2.1 Component Class

The component will:

- Accept an `elementId` input to identify the folder being edited
- Fetch and display the child elements of the folder
- Implement two view modes: grid and list
- Store the view preference in the element's metadata
- Support sorting/reordering of elements within the folder

### 2.2 View Modes

1. **Grid Layout**:

   - Display elements as cards in a responsive grid
   - Show element icons, names, and potentially thumbnails for images
   - Support drag and drop for reordering

2. **Sortable List**:
   - Display elements in a vertical list
   - Include more details like element type, creation date, etc.
   - Support drag and drop for reordering
   - Allow sorting by different properties (name, type, date)

### 2.3 Metadata Usage

The component will use the element's metadata to store:

- Current view mode (grid/list)
- Sort order preferences
- Any custom display settings

## 3. Technical Implementation

### 3.1 Dependencies

The component will use:

- Angular Material components for UI elements
- CDK Drag/Drop for sortable functionality
- Angular signals for state management
- ProjectStateService for accessing element data

### 3.2 Key Features

1. **View Toggle**:

   - Button/toggle to switch between grid and list views
   - Automatically save preference to element metadata

2. **Element Display**:

   - Show appropriate icons based on element type
   - For images, display thumbnails
   - For documents, show a preview if possible

3. **Interaction**:

   - Double-click to open elements
   - Context menu for actions (rename, delete, etc.)
   - Drag and drop for reordering

4. **Empty State**:
   - Display a message and action button when folder is empty

## 4. Integration with Existing Components

The folder-element-editor will:

- Be registered in the app.routes.ts for routing
- Be integrated with the project-tree component for navigation
- Use the same styling patterns as other element editors for consistency

## 5. Testing Strategy

1. **Unit Tests**:

   - Test view switching functionality
   - Test metadata persistence
   - Test element display logic

2. **Integration Tests**:
   - Test interaction with ProjectStateService
   - Test navigation between elements

## 6. Implementation Steps

1. Create the component files
2. Implement the basic component structure
3. Add the grid and list view implementations
4. Implement metadata persistence
5. Add drag and drop functionality
6. Integrate with the project-tree component
7. Add tests
8. Refine styling and UX

## 7. Considerations and Edge Cases

- Handle large folders with many elements (pagination or virtualization)
- Consider accessibility for keyboard navigation and screen readers
- Ensure responsive design for different screen sizes
- Handle errors gracefully if elements can't be loaded
