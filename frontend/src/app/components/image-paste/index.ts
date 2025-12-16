/**
 * Image Paste Module
 *
 * Provides ProseMirror plugin for handling image paste/drop operations,
 * saving images to the media library instead of embedding base64.
 *
 * Also provides a NodeView for resolving media: URLs to blob URLs.
 */

export type {
  ImagePastePluginCallbacks,
  MediaImageNodeViewOptions,
} from './image-paste-plugin';
export {
  base64ToBlob,
  createImagePastePlugin,
  createMediaImageNodeViews,
  createMediaUrl,
  extractMediaId,
  extractMimeType,
  generateMediaId,
  imagePastePluginKey,
  isBase64ImageUrl,
  isMediaUrl,
  MEDIA_URL_PREFIX,
  MediaImageNodeView,
} from './image-paste-plugin';
