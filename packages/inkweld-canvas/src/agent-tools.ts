/**
 * How the canvas tools present themselves to an agent. The server MCP tools
 * and the browser's WebMCP tools share these, so an agent learns one interface.
 */

import { DEFAULT_OBJECT_LIMIT, MAX_OBJECT_IDS } from './agent-read';
import { MAX_OBJECTS_PER_EDIT } from './agent-edit';

export const GET_CANVAS_DESCRIPTION = `Read a canvas element (a drawing, map, mood board or cover): its page colours, layers, frames and objects, listed back to front.

By default objects are summarised and paged: a path or polygon reports pointCount and bounds instead of its points, and long text and inline images are cut. Pass objectIds to get specific objects whole, or layerId to list one layer. A canvas nobody has drawn on has no layers yet; edit_canvas creates the first one.`;

export const EDIT_CANVAS_DESCRIPTION = `Change a canvas element in one step: add, update, delete and restack objects, and change its layers, frames and page colours. Nothing is written unless the whole request is valid.

Coordinates are canvas units, with y growing downward. An object's x and y place its top-left corner, except an ellipse and a pin, which are placed by their centre. The points of a path, polygon, line or arrow are relative to x and y. Objects never move each other: nothing flows or wraps around anything else, so work out positions yourself. A line of text is about fontSize tall and each character about half fontSize wide; set width to wrap text. A frame of kind "canvas" sets the page size and is what exports use, for example 1000 by 1600 for a book cover.

Object types and what add needs (everything else has a default):
- text: text. Optional fontSize, fontFamily, fontStyle (normal, bold, italic, bold italic), fill, width (0 = no wrapping), align.
- shape: shapeType (rect, ellipse, polygon, line, arrow), with width and height, or points for a polygon, line or arrow. Optional fill (a colour or a CSS gradient), stroke, strokeWidth, cornerRadius, dash, linkedElementId (makes it a clickable region).
- path: points, flat as [x1, y1, x2, y2, …]. Optional stroke, strokeWidth, closed, fill, tension (0 = straight, up to 1 = smooth), pressures.
- image: src, width, height. src is project media (media://name.png) or a small data: image. Optional isBackground (a backdrop that cannot be selected).
- pin: label. Optional icon (a Material icon name), color, note, linkedElementId (links the pin to that element).
All objects also take id, layerId (default: the topmost visible, unlocked layer), x, y, rotation, scaleX, scaleY, visible, locked, name, opacity.

Update merges the fields you send into the object; null removes an optional field. Changing or deleting a locked object is refused until an update unlocks it, which may be in the same edit, and so is anything but a pin on a locked layer until the layer is unlocked. Restacking is not refused. Pass layers or frames as the complete list you want; an entry with a known id keeps the fields you leave out. A layer's position in the list is its stacking order, and removing a layer requires deleting or moving its objects in the same edit.

The result's undo holds arguments for edit_canvas that reverse this edit. Keep it if the user may want to go back: this is the only way to undo an agent's edit, and the app's own undo does not cover it.`;

const objectFieldProperties = {
  id: { type: 'string', description: 'Optional for add. Required for update.' },
  type: {
    type: 'string',
    enum: ['text', 'shape', 'path', 'image', 'pin'],
    description: 'Required for add.',
  },
  layerId: { type: 'string' },
  x: { type: 'number' },
  y: { type: 'number' },
  rotation: { type: 'number', description: 'Degrees.' },
  scaleX: { type: 'number' },
  scaleY: { type: 'number' },
  visible: { type: 'boolean' },
  locked: { type: 'boolean' },
  name: { type: 'string' },
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  text: { type: 'string' },
  fontSize: { type: 'number' },
  fontFamily: { type: 'string' },
  fontStyle: {
    type: 'string',
    enum: ['normal', 'bold', 'italic', 'bold italic'],
  },
  align: { type: 'string', enum: ['left', 'center', 'right'] },
  shapeType: {
    type: 'string',
    enum: ['rect', 'ellipse', 'polygon', 'line', 'arrow'],
  },
  width: { type: 'number' },
  height: { type: 'number' },
  points: { type: 'array', items: { type: 'number' } },
  fill: { type: 'string' },
  stroke: { type: 'string' },
  strokeWidth: { type: 'number' },
  cornerRadius: { type: 'number' },
  dash: { type: 'array', items: { type: 'number' } },
  closed: { type: 'boolean' },
  tension: { type: 'number', minimum: 0, maximum: 1 },
  pressures: { type: 'array', items: { type: 'number' } },
  src: { type: 'string' },
  isBackground: { type: 'boolean' },
  label: { type: 'string' },
  icon: { type: 'string' },
  color: { type: 'string' },
  note: { type: 'string' },
  linkedElementId: {
    type: 'string',
    description: 'Pins and shapes: the element to link to.',
  },
};

const objectIdList = (description: string) => ({
  type: 'array',
  items: { type: 'string' },
  description,
});

/** JSON Schema properties of `get_canvas`, besides the element id. */
export const GET_CANVAS_PROPERTIES = {
  objectIds: objectIdList(
    `Return these objects whole, with their points and full text (at most ${MAX_OBJECT_IDS}).`,
  ),
  layerId: { type: 'string', description: 'List only this layer.' },
  offset: { type: 'number', description: 'Objects to skip. Default 0.' },
  limit: {
    type: 'number',
    description: `Objects to list. Default ${DEFAULT_OBJECT_LIMIT}.`,
  },
};

/** JSON Schema properties of `edit_canvas`, besides the element id. */
export const EDIT_CANVAS_PROPERTIES = {
  add: {
    type: 'array',
    description: `New objects, placed in front of everything else in the order given. At most ${MAX_OBJECTS_PER_EDIT} objects can change in one edit.`,
    items: {
      type: 'object',
      properties: objectFieldProperties,
      required: ['type'],
    },
  },
  update: {
    type: 'array',
    description: 'Changes to existing objects: an id and the fields to change.',
    items: {
      type: 'object',
      properties: objectFieldProperties,
      required: ['id'],
    },
  },
  delete: objectIdList('Ids of objects to delete.'),
  moveToFront: objectIdList(
    'Ids to bring in front of everything else, the last one frontmost.',
  ),
  moveToBack: objectIdList(
    'Ids to send behind everything else, the first one rearmost.',
  ),
  layers: {
    type: 'array',
    description: 'The complete list of layers, back to front.',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        visible: { type: 'boolean' },
        locked: { type: 'boolean' },
        opacity: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
  },
  frames: {
    type: 'array',
    description:
      'The complete list of frames. At most one has kind "canvas"; the others are named crops.',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        kind: { type: 'string', enum: ['canvas', 'crop'] },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        visible: { type: 'boolean' },
      },
    },
  },
  background: { type: 'string', description: 'Page colour.' },
  inkColor: {
    type: 'string',
    description: 'Default colour for new strokes and text.',
  },
};
