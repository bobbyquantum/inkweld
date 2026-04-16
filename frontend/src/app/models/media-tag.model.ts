/**
 * Media Tag Models
 *
 * Media tags create a many-to-many association between media library items
 * and worldbuilding elements. They're stored centrally in the project
 * elements Yjs document alongside elementTags and relationships.
 */

/**
 * Assignment of a media item to a worldbuilding element.
 * Stored in the project elements Yjs document as a `mediaTags` Y.Array.
 */
export interface MediaTag {
  /** Unique ID of this tag assignment */
  id: string;
  /** The media item ID (e.g. "img-abc123", "generated-1234") */
  mediaId: string;
  /** The worldbuilding element ID */
  elementId: string;
  /** When the tag was added */
  createdAt: string;
}
