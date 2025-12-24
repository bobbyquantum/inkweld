/**
 * Element Reference Context Menu Component Tests
 *
 * Tests for the context menu that appears when right-clicking
 * or long-pressing an element reference in the editor.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { ElementType } from '../../../../api-client';
import {
  ElementRefContextData,
  ElementRefContextMenuComponent,
} from './element-ref-context-menu.component';

describe('ElementRefContextMenuComponent', () => {
  let component: ElementRefContextMenuComponent;
  let fixture: ComponentFixture<ElementRefContextMenuComponent>;

  const mockContextData: ElementRefContextData = {
    elementId: 'elem-123',
    elementType: ElementType.Worldbuilding,
    displayText: 'John Smith',
    originalName: 'John Smith',
    nodePos: 42,
    position: { x: 150, y: 200 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ElementRefContextMenuComponent,
        FormsModule,
        MatButtonModule,
        MatDividerModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        NoopAnimationsModule,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementRefContextMenuComponent);
    component = fixture.componentInstance;
  });

  describe('Component Initialization', () => {
    it('should create the component', () => {
      fixture.detectChanges();
      expect(component).toBeTruthy();
    });

    it('should be closed initially', () => {
      fixture.detectChanges();
      expect(component.isOpen()).toBe(false);
    });

    it('should not show menu when no context data', () => {
      fixture.detectChanges();
      const menu = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-context-menu"]'
      );
      expect(menu).toBeNull();
    });
  });

  describe('Menu Opening', () => {
    it('should open menu when context data is set', () => {
      component.contextData = mockContextData;
      fixture.detectChanges();

      expect(component.isOpen()).toBe(true);
      const menu = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-context-menu"]'
      );
      expect(menu).toBeTruthy();
    });

    it('should set edit text from display text', () => {
      component.contextData = mockContextData;
      fixture.detectChanges();

      expect(component.editText()).toBe('John Smith');
    });

    it('should reset editing state when context data changes', () => {
      component.contextData = mockContextData;
      component['_isEditing'].set(true);
      fixture.detectChanges();

      // Setting new data should reset editing
      component.contextData = { ...mockContextData, displayText: 'Jane Doe' };
      fixture.detectChanges();

      expect(component.isEditing()).toBe(false);
    });

    it('should position menu at provided coordinates', () => {
      component.contextData = mockContextData;
      fixture.detectChanges();

      const menu = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-context-menu"]'
      );
      expect(menu.style.left).toBe('150px');
      expect(menu.style.top).toBe('200px');
    });
  });

  describe('Menu Position Boundaries', () => {
    it('should keep menu within viewport on the right edge', () => {
      // Simulate position near right edge
      const nearRightEdge: ElementRefContextData = {
        ...mockContextData,
        position: { x: window.innerWidth - 50, y: 200 },
      };

      component.contextData = nearRightEdge;
      fixture.detectChanges();

      const pos = component.menuPosition();
      expect(pos.x).toBeLessThanOrEqual(window.innerWidth - 280 - 8);
    });

    it('should keep menu within viewport on the bottom edge', () => {
      const nearBottomEdge: ElementRefContextData = {
        ...mockContextData,
        position: { x: 150, y: window.innerHeight - 50 },
      };

      component.contextData = nearBottomEdge;
      fixture.detectChanges();

      const pos = component.menuPosition();
      expect(pos.y).toBeLessThanOrEqual(window.innerHeight - 200 - 8);
    });

    it('should keep menu within viewport on left edge', () => {
      const nearLeftEdge: ElementRefContextData = {
        ...mockContextData,
        position: { x: 2, y: 200 },
      };

      component.contextData = nearLeftEdge;
      fixture.detectChanges();

      const pos = component.menuPosition();
      expect(pos.x).toBeGreaterThanOrEqual(8);
    });

    it('should keep menu within viewport on top edge', () => {
      const nearTopEdge: ElementRefContextData = {
        ...mockContextData,
        position: { x: 150, y: 2 },
      };

      component.contextData = nearTopEdge;
      fixture.detectChanges();

      const pos = component.menuPosition();
      expect(pos.y).toBeGreaterThanOrEqual(8);
    });

    it('should return zero position when no data', () => {
      fixture.detectChanges();
      const pos = component.menuPosition();
      expect(pos).toEqual({ x: 0, y: 0 });
    });
  });

  describe('Normal Menu Mode', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      fixture.detectChanges();
    });

    it('should show navigate button', () => {
      const navigateBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-navigate"]'
      );
      expect(navigateBtn).toBeTruthy();
      expect(navigateBtn.textContent).toContain('Go to element');
    });

    it('should show edit button', () => {
      const editBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-edit"]'
      );
      expect(editBtn).toBeTruthy();
      expect(editBtn.textContent).toContain('Edit display text');
    });

    it('should show delete button', () => {
      const deleteBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-delete"]'
      );
      expect(deleteBtn).toBeTruthy();
      expect(deleteBtn.textContent).toContain('Delete reference');
    });

    it('should not show editing mode elements', () => {
      const editInput = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-edit-input"]'
      );
      expect(editInput).toBeNull();
    });
  });

  describe('Navigate Action', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      fixture.detectChanges();
    });

    it('should emit navigate action when navigate button clicked', () => {
      const actionSpy = vi.spyOn(component.action, 'emit');

      const navigateBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-navigate"]'
      );
      navigateBtn.click();

      expect(actionSpy).toHaveBeenCalledWith({
        type: 'navigate',
        elementId: 'elem-123',
        elementType: ElementType.Worldbuilding,
      });
    });

    it('should close menu after navigate', () => {
      const navigateBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-navigate"]'
      );
      navigateBtn.click();

      expect(component.isOpen()).toBe(false);
    });
  });

  describe('Delete Action', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      fixture.detectChanges();
    });

    it('should emit delete action when delete button clicked', () => {
      const actionSpy = vi.spyOn(component.action, 'emit');

      const deleteBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-delete"]'
      );
      deleteBtn.click();

      expect(actionSpy).toHaveBeenCalledWith({
        type: 'delete',
        nodePos: 42,
        elementId: 'elem-123',
      });
    });

    it('should close menu after delete', () => {
      const deleteBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-delete"]'
      );
      deleteBtn.click();

      expect(component.isOpen()).toBe(false);
    });
  });

  describe('Edit Mode', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      fixture.detectChanges();
    });

    it('should enter edit mode when edit button clicked', () => {
      const editBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-edit"]'
      );
      editBtn.click();
      fixture.detectChanges();

      expect(component.isEditing()).toBe(true);
    });

    it('should show edit input in edit mode', () => {
      component['_isEditing'].set(true);
      fixture.detectChanges();

      const editInput = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-edit-input"]'
      );
      expect(editInput).toBeTruthy();
    });

    it('should show save button in edit mode', () => {
      component['_isEditing'].set(true);
      fixture.detectChanges();

      const saveBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-save"]'
      );
      expect(saveBtn).toBeTruthy();
    });

    it('should hide normal menu items in edit mode', () => {
      component['_isEditing'].set(true);
      fixture.detectChanges();

      const navigateBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-navigate"]'
      );
      expect(navigateBtn).toBeNull();
    });

    it('should update editText when input changes', () => {
      component['_isEditing'].set(true);
      fixture.detectChanges();

      const editInput = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-edit-input"]'
      ) as HTMLInputElement;
      editInput.value = 'New Name';
      editInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(component.editText()).toBe('New Name');
    });

    it('should save when Enter is pressed in edit input', () => {
      component['_isEditing'].set(true);
      component.editText.set('Entered Name');
      fixture.detectChanges();

      const actionSpy = vi.spyOn(component.action, 'emit');
      const editInput = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-edit-input"]'
      ) as HTMLInputElement;
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });
      editInput.dispatchEvent(enterEvent);

      expect(actionSpy).toHaveBeenCalledWith({
        type: 'edit-text',
        nodePos: 42,
        newText: 'Entered Name',
      });
    });

    it('should cancel editing when Escape is pressed in edit input', () => {
      component['_isEditing'].set(true);
      component.editText.set('Cancelled Name');
      fixture.detectChanges();

      const editInput = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-edit-input"]'
      ) as HTMLInputElement;
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      editInput.dispatchEvent(escapeEvent);

      expect(component.isEditing()).toBe(false);
      expect(component.editText()).toBe('John Smith'); // Reset to display text
    });
  });

  describe('Save Edit', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      component['_isEditing'].set(true);
      fixture.detectChanges();
    });

    it('should emit edit-text action when save clicked', () => {
      const actionSpy = vi.spyOn(component.action, 'emit');
      component.editText.set('Modified Name');

      const saveBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-save"]'
      );
      saveBtn.click();

      expect(actionSpy).toHaveBeenCalledWith({
        type: 'edit-text',
        nodePos: 42,
        newText: 'Modified Name',
      });
    });

    it('should close menu after save', () => {
      component.editText.set('Modified Name');

      const saveBtn = fixture.nativeElement.querySelector(
        '[data-testid="context-menu-save"]'
      );
      saveBtn.click();

      expect(component.isOpen()).toBe(false);
    });

    it('should not save when edit text is empty', () => {
      const actionSpy = vi.spyOn(component.action, 'emit');
      component.editText.set('   ');

      component.saveEdit();

      // Should emit close but not edit-text
      expect(actionSpy).toHaveBeenCalledWith({ type: 'close' });
      expect(actionSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'edit-text' })
      );
    });
  });

  describe('Cancel Editing', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      component['_isEditing'].set(true);
      component.editText.set('Changed Text');
      fixture.detectChanges();
    });

    it('should revert to original display text when cancelled', () => {
      component.cancelEditing();
      expect(component.editText()).toBe('John Smith');
    });

    it('should exit edit mode when cancelled', () => {
      component.cancelEditing();
      expect(component.isEditing()).toBe(false);
    });
  });

  describe('Reset to Original', () => {
    beforeEach(() => {
      const customDisplayData: ElementRefContextData = {
        ...mockContextData,
        displayText: 'Custom Display',
        originalName: 'Original Name',
      };
      component.contextData = customDisplayData;
      component['_isEditing'].set(true);
      fixture.detectChanges();
    });

    it('should reset text to original element name', () => {
      component.resetToOriginal();
      expect(component.editText()).toBe('Original Name');
    });

    it('should reset text when reset button is clicked', () => {
      // Set a different edit text
      component.editText.set('Something Different');
      fixture.detectChanges();

      // Find and click the reset button
      const resetButton = fixture.nativeElement.querySelector(
        'button.menu-item.small'
      );
      expect(resetButton).toBeTruthy();
      resetButton.click();
      fixture.detectChanges();

      expect(component.editText()).toBe('Original Name');
    });

    it('should disable reset button when editText equals originalName', () => {
      // Set text to original name
      component.editText.set('Original Name');
      fixture.detectChanges();

      const resetButton = fixture.nativeElement.querySelector(
        'button.menu-item.small'
      );
      expect(resetButton.disabled).toBe(true);
    });
  });

  describe('Close Menu', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      fixture.detectChanges();
    });

    it('should close menu and emit close action', () => {
      const actionSpy = vi.spyOn(component.action, 'emit');

      component.close();

      expect(component.isOpen()).toBe(false);
      expect(actionSpy).toHaveBeenCalledWith({ type: 'close' });
    });

    it('should reset editing state when closed', () => {
      component['_isEditing'].set(true);
      component.close();

      expect(component.isEditing()).toBe(false);
    });

    it('should close when backdrop clicked', () => {
      const backdrop = fixture.nativeElement.querySelector(
        '.context-menu-backdrop'
      );
      backdrop.click();

      expect(component.isOpen()).toBe(false);
    });

    it('should close when Escape is pressed on backdrop', () => {
      const backdrop = fixture.nativeElement.querySelector(
        '.context-menu-backdrop'
      );
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      backdrop.dispatchEvent(escapeEvent);

      expect(component.isOpen()).toBe(false);
    });

    it('should close and prevent context menu on backdrop right-click', () => {
      const backdrop = fixture.nativeElement.querySelector(
        '.context-menu-backdrop'
      );
      const contextMenuEvent = new Event('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(contextMenuEvent, 'preventDefault');

      backdrop.dispatchEvent(contextMenuEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(component.isOpen()).toBe(false);
    });
  });

  describe('Escape Key Handler', () => {
    it('should close menu on Escape key when open', () => {
      component.contextData = mockContextData;
      fixture.detectChanges();

      component.onEscape();

      expect(component.isOpen()).toBe(false);
    });

    it('should do nothing on Escape when menu is closed', () => {
      fixture.detectChanges();
      const actionSpy = vi.spyOn(component.action, 'emit');

      component.onEscape();

      expect(actionSpy).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      fixture.detectChanges();
    });

    it('should have correct role on menu', () => {
      const menu = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-context-menu"]'
      );
      expect(menu.getAttribute('role')).toBe('menu');
    });

    it('should have aria-label on menu', () => {
      const menu = fixture.nativeElement.querySelector(
        '[data-testid="element-ref-context-menu"]'
      );
      expect(menu.getAttribute('aria-label')).toBe('Element reference actions');
    });
  });

  describe('Edge Cases', () => {
    it('should handle navigate when data is null', () => {
      fixture.detectChanges();
      const actionSpy = vi.spyOn(component.action, 'emit');

      component.navigateToElement();

      // Should only emit close, not navigate
      expect(actionSpy).toHaveBeenCalledWith({ type: 'close' });
    });

    it('should handle delete when data is null', () => {
      fixture.detectChanges();
      const actionSpy = vi.spyOn(component.action, 'emit');

      component.deleteReference();

      // Should only emit close
      expect(actionSpy).toHaveBeenCalledWith({ type: 'close' });
    });

    it('should handle cancelEditing when data is null', () => {
      fixture.detectChanges();
      component.editText.set('something');

      expect(() => component.cancelEditing()).not.toThrow();
      expect(component.editText()).toBe('something');
    });

    it('should handle resetToOriginal when data is null', () => {
      fixture.detectChanges();
      component.editText.set('something');

      expect(() => component.resetToOriginal()).not.toThrow();
      expect(component.editText()).toBe('something');
    });

    it('should handle saveEdit when data is null', () => {
      fixture.detectChanges();
      const actionSpy = vi.spyOn(component.action, 'emit');
      component.editText.set('test');

      component.saveEdit();

      // Should only emit close
      expect(actionSpy).toHaveBeenCalledWith({ type: 'close' });
    });
  });

  describe('startEditing', () => {
    beforeEach(() => {
      component.contextData = mockContextData;
      fixture.detectChanges();
    });

    it('should enter editing mode', () => {
      component.startEditing();
      expect(component.isEditing()).toBe(true);
    });
  });

  describe('Data accessor', () => {
    it('should return null initially', () => {
      fixture.detectChanges();
      expect(component.data()).toBeNull();
    });

    it('should return context data when set', () => {
      component.contextData = mockContextData;
      fixture.detectChanges();

      expect(component.data()).toEqual(mockContextData);
    });
  });
});
