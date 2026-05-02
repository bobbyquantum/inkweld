import { Component, DestroyRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CanvasKeyboardHandlers,
  CanvasKeyboardService,
} from './canvas-keyboard.service';

@Component({
  selector: 'app-host',
  template: '',
  providers: [CanvasKeyboardService],
})
class HostComponent {
  readonly svc = inject(CanvasKeyboardService);
  readonly destroyRef = inject(DestroyRef);
}

function createHandlers(): CanvasKeyboardHandlers {
  return {
    onCopy: vi.fn(),
    onCut: vi.fn(),
    onPaste: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onEscape: vi.fn(),
    onToolChange: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFitAll: vi.fn(),
  };
}

function makeEvent(
  key: string,
  opts: { ctrl?: boolean; meta?: boolean; target?: EventTarget } = {}
): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrl,
    metaKey: opts.meta,
  });
  if (opts.target) Object.defineProperty(ev, 'target', { value: opts.target });
  vi.spyOn(ev, 'preventDefault');
  return ev;
}

describe('CanvasKeyboardService', () => {
  let svc: CanvasKeyboardService;
  let handlers: CanvasKeyboardHandlers;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    svc = fixture.componentInstance.svc;
    handlers = createHandlers();
  });

  describe('typing target guard', () => {
    it('ignores events from input elements', () => {
      const target = document.createElement('input');
      svc.dispatch(makeEvent('c', { ctrl: true, target }), handlers);
      expect(handlers.onCopy).not.toHaveBeenCalled();
    });

    it('ignores events from textarea elements', () => {
      const target = document.createElement('textarea');
      svc.dispatch(makeEvent('v', { ctrl: true, target }), handlers);
      expect(handlers.onPaste).not.toHaveBeenCalled();
    });

    it('ignores events from contentEditable elements', () => {
      const target = document.createElement('div');
      target.setAttribute('contenteditable', 'true');
      svc.dispatch(makeEvent('d', { ctrl: true, target }), handlers);
      expect(handlers.onDuplicate).not.toHaveBeenCalled();
    });
  });

  describe('clipboard shortcuts', () => {
    it('Ctrl+C → onCopy', () => {
      const ev = makeEvent('c', { ctrl: true });
      svc.dispatch(ev, handlers);
      expect(handlers.onCopy).toHaveBeenCalled();
      expect(ev.preventDefault).toHaveBeenCalled();
    });

    it('Cmd+X → onCut', () => {
      svc.dispatch(makeEvent('x', { meta: true }), handlers);
      expect(handlers.onCut).toHaveBeenCalled();
    });

    it('Ctrl+V → onPaste', () => {
      svc.dispatch(makeEvent('v', { ctrl: true }), handlers);
      expect(handlers.onPaste).toHaveBeenCalled();
    });

    it('Ctrl+D → onDuplicate', () => {
      svc.dispatch(makeEvent('d', { ctrl: true }), handlers);
      expect(handlers.onDuplicate).toHaveBeenCalled();
    });

    it('plain "c" without modifier does not trigger copy', () => {
      svc.dispatch(makeEvent('c'), handlers);
      expect(handlers.onCopy).not.toHaveBeenCalled();
    });
  });

  describe('tool selection shortcuts', () => {
    it.each([
      ['v', 'select'],
      ['r', 'rectSelect'],
      ['h', 'pan'],
      ['p', 'pin'],
      ['l', 'line'],
      ['s', 'shape'],
      ['t', 'text'],
    ])('"%s" → onToolChange(%s)', (key, tool) => {
      svc.dispatch(makeEvent(key), handlers);
      expect(handlers.onToolChange).toHaveBeenCalledWith(tool);
    });

    it('does not switch tool when modifier is held', () => {
      svc.dispatch(makeEvent('p', { ctrl: true }), handlers);
      expect(handlers.onToolChange).not.toHaveBeenCalled();
    });
  });

  describe('editing shortcuts', () => {
    it('Delete → onDelete', () => {
      svc.dispatch(makeEvent('Delete'), handlers);
      expect(handlers.onDelete).toHaveBeenCalled();
    });

    it('Backspace → onDelete', () => {
      svc.dispatch(makeEvent('Backspace'), handlers);
      expect(handlers.onDelete).toHaveBeenCalled();
    });

    it('Escape → onEscape', () => {
      svc.dispatch(makeEvent('Escape'), handlers);
      expect(handlers.onEscape).toHaveBeenCalled();
    });
  });

  describe('zoom shortcuts', () => {
    it('Ctrl++ → onZoomIn', () => {
      svc.dispatch(makeEvent('=', { ctrl: true }), handlers);
      expect(handlers.onZoomIn).toHaveBeenCalled();
    });

    it('Ctrl+- → onZoomOut', () => {
      svc.dispatch(makeEvent('-', { ctrl: true }), handlers);
      expect(handlers.onZoomOut).toHaveBeenCalled();
    });

    it('Ctrl+0 → onFitAll', () => {
      svc.dispatch(makeEvent('0', { ctrl: true }), handlers);
      expect(handlers.onFitAll).toHaveBeenCalled();
    });

    it('plain "0" without modifier is ignored', () => {
      svc.dispatch(makeEvent('0'), handlers);
      expect(handlers.onFitAll).not.toHaveBeenCalled();
    });
  });

  describe('attach', () => {
    it('registers a document listener that dispatches', () => {
      svc.attach(handlers);
      const ev = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true });
      document.dispatchEvent(ev);
      expect(handlers.onCopy).toHaveBeenCalled();
    });

    it('is idempotent', () => {
      svc.attach(handlers);
      svc.attach(handlers);
      const ev = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true });
      document.dispatchEvent(ev);
      expect(handlers.onCopy).toHaveBeenCalledTimes(1);
    });
  });
});
