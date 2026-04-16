/**
 * Media Project Tag Models
 *
 * Media project tags create a many-to-many association between media library items
 * and project tag definitions (TagDefinition). They're stored centrally in the project
 * elements Yjs document alongside mediaTags and elementTags.
 *
 * This is separate from MediaTag (media→element) — this links media→project tags.
 */

/**
 * Assignment of a project tag to a media item.
 * Stored in the project elements Yjs document as a `mediaProjectTags` Y.Array.
 */
export interface MediaProjectTag {
  /** Unique ID of this tag assignment */
  id: string;
  /** The media item ID (e.g. "img-abc123", "generated-1234") */
  mediaId: string;
  /** The tag definition ID (references TagDefinition.id) */
  tagId: string;
  /** When the tag was added */
  createdAt: string;
}
