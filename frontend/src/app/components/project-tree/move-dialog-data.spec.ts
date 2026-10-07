import { describe, expect, it } from 'vitest';

import {
  buildElementPath,
  buildMoveDialogData,
  buildMovePositionLabel,
  type DropNode,
  findDropParentFolderId,
  type MoveDialogContext,
} from './move-dialog-data';

// Tree:
//   Manuscript (folder, L0)
//     Chapter 1 (L1)
//     Chapter 2 (L1)
//   Notes (folder, L0)
//   Loose (L0)
const elements = [
  { id: 'm', name: 'Manuscript', parentId: null },
  { id: 'c1', name: 'Chapter 1', parentId: 'm' },
  { id: 'c2', name: 'Chapter 2', parentId: 'm' },
  { id: 'n', name: 'Notes', parentId: null },
  { id: 'l', name: 'Loose', parentId: null },
];
const treeNodes: DropNode[] = [
  { id: 'm', name: 'Manuscript', level: 0, expandable: true },
  { id: 'c1', name: 'Chapter 1', level: 1, expandable: false },
  { id: 'c2', name: 'Chapter 2', level: 1, expandable: false },
  { id: 'n', name: 'Notes', level: 0, expandable: true },
  { id: 'l', name: 'Loose', level: 0, expandable: false },
];
const byId = (id: string) => treeNodes.find(n => n.id === id) ?? null;

const translate: MoveDialogContext['translate'] = (key, params) =>
  params ? `${key}:${params['name']}` : key;

function build(nodeId: string, nodeAboveId: string | null, dropLevel: number) {
  return buildMoveDialogData({
    node: elements.find(e => e.id === nodeId)!,
    treeNodes,
    elements,
    nodeAbove: nodeAboveId ? byId(nodeAboveId) : null,
    dropLevel,
    projectName: 'Proj',
    untitledName: 'Untitled',
    translate,
  });
}

describe('buildMoveDialogData', () => {
  it('names the folder when dropping below the last item inside it', () => {
    const data = build('c2', 'c1', 1);
    expect(data.fromPath).toBe('Proj › Manuscript › Chapter 2');
    expect(data.toPath).toBe('Proj › Manuscript');
    expect(data.positionLabel).toBe('dialogs.move.positionAfter:Chapter 1');
  });

  it('names the folder when dropping onto the folder row', () => {
    const data = build('l', 'm', 1);
    expect(data.toPath).toBe('Proj › Manuscript');
    expect(data.positionLabel).toBe('dialogs.move.positionInside:Manuscript');
  });

  it('shows the project root when dropping at root level', () => {
    const data = build('c1', 'm', 0);
    expect(data.toPath).toBe('Proj');
    expect(data.positionLabel).toBe('dialogs.move.positionAfter:Manuscript');
  });

  it('shows the project root and top note when dropping at the top', () => {
    const data = build('l', null, 0);
    expect(data.toPath).toBe('Proj');
    expect(data.positionLabel).toBe('dialogs.move.positionTop');
  });
});

describe('findDropParentFolderId', () => {
  it('returns the folder itself when dropping one level inside it', () => {
    expect(findDropParentFolderId(treeNodes, byId('n'), 1)).toBe('n');
  });

  it('walks back to the enclosing folder', () => {
    expect(findDropParentFolderId(treeNodes, byId('c2'), 1)).toBe('m');
  });

  it('returns null at root level', () => {
    expect(findDropParentFolderId(treeNodes, byId('c2'), 0)).toBeNull();
    expect(findDropParentFolderId(treeNodes, null, 1)).toBeNull();
  });
});

describe('buildElementPath', () => {
  it('returns the project name for a null or unknown id', () => {
    expect(buildElementPath(elements, null, 'Proj', 'Untitled')).toBe('Proj');
    expect(buildElementPath(elements, 'zzz', 'Proj', 'Untitled')).toBe('Proj');
  });

  it('falls back to the untitled name for unnamed elements', () => {
    expect(
      buildElementPath(
        [{ id: 'a', name: '', parentId: null }],
        'a',
        'Proj',
        'Untitled'
      )
    ).toBe('Proj › Untitled');
  });

  it('does not loop on cyclic parent links', () => {
    const cyclic = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ];
    expect(buildElementPath(cyclic, 'a', 'Proj', 'Untitled')).toBe(
      'Proj › B › A'
    );
  });
});

describe('buildMovePositionLabel', () => {
  it('uses the "after" note at the same level', () => {
    expect(buildMovePositionLabel(byId('c1'), 1, translate)).toBe(
      'dialogs.move.positionAfter:Chapter 1'
    );
  });
});
