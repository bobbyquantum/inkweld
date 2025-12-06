/**
 * Default Relationship Types
 *
 * Built-in relationship types that are available in all projects.
 * Users can create additional custom types per project.
 */

import { RelationshipCategory, RelationshipType } from './element-ref.model';

/**
 * Default built-in relationship types
 */
export const DEFAULT_RELATIONSHIP_TYPES: RelationshipType[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Reference (for document mentions)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'referenced-in',
    category: RelationshipCategory.Reference,
    label: 'Referenced in',
    inverseLabel: 'References',
    icon: 'link',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'mentioned',
    category: RelationshipCategory.Reference,
    label: 'Mentions',
    inverseLabel: 'Mentioned by',
    icon: 'chat',
    isBuiltIn: true,
    isSymmetric: false,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Familial Relationships
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'parent-of',
    category: RelationshipCategory.Familial,
    label: 'Parent of',
    inverseLabel: 'Child of',
    icon: 'family_restroom',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'sibling-of',
    category: RelationshipCategory.Familial,
    label: 'Sibling of',
    inverseLabel: 'Sibling of',
    icon: 'people',
    isBuiltIn: true,
    isSymmetric: true,
  },
  {
    id: 'spouse-of',
    category: RelationshipCategory.Familial,
    label: 'Spouse of',
    inverseLabel: 'Spouse of',
    icon: 'favorite',
    isBuiltIn: true,
    isSymmetric: true,
  },
  {
    id: 'ancestor-of',
    category: RelationshipCategory.Familial,
    label: 'Ancestor of',
    inverseLabel: 'Descendant of',
    icon: 'account_tree',
    isBuiltIn: true,
    isSymmetric: false,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Professional Relationships
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'employer-of',
    category: RelationshipCategory.Professional,
    label: 'Employer of',
    inverseLabel: 'Works for',
    icon: 'business',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'colleague-of',
    category: RelationshipCategory.Professional,
    label: 'Colleague of',
    inverseLabel: 'Colleague of',
    icon: 'groups',
    isBuiltIn: true,
    isSymmetric: true,
  },
  {
    id: 'mentor-of',
    category: RelationshipCategory.Professional,
    label: 'Mentor of',
    inverseLabel: 'Student of',
    icon: 'school',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'member-of',
    category: RelationshipCategory.Professional,
    label: 'Member of',
    inverseLabel: 'Has member',
    icon: 'badge',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'leader-of',
    category: RelationshipCategory.Professional,
    label: 'Leader of',
    inverseLabel: 'Led by',
    icon: 'military_tech',
    isBuiltIn: true,
    isSymmetric: false,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Social Relationships
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'friend-of',
    category: RelationshipCategory.Social,
    label: 'Friend of',
    inverseLabel: 'Friend of',
    icon: 'handshake',
    isBuiltIn: true,
    isSymmetric: true,
  },
  {
    id: 'enemy-of',
    category: RelationshipCategory.Social,
    label: 'Enemy of',
    inverseLabel: 'Enemy of',
    icon: 'swords',
    isBuiltIn: true,
    isSymmetric: true,
  },
  {
    id: 'ally-of',
    category: RelationshipCategory.Social,
    label: 'Ally of',
    inverseLabel: 'Ally of',
    icon: 'shield',
    isBuiltIn: true,
    isSymmetric: true,
  },
  {
    id: 'rival-of',
    category: RelationshipCategory.Social,
    label: 'Rival of',
    inverseLabel: 'Rival of',
    icon: 'sports_martial_arts',
    isBuiltIn: true,
    isSymmetric: true,
  },
  {
    id: 'romantic-interest-of',
    category: RelationshipCategory.Social,
    label: 'Romantic interest of',
    inverseLabel: 'Has romantic interest in',
    icon: 'heart_broken',
    isBuiltIn: true,
    isSymmetric: false,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Spatial Relationships
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'located-in',
    category: RelationshipCategory.Spatial,
    label: 'Located in',
    inverseLabel: 'Contains',
    icon: 'place',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'lives-in',
    category: RelationshipCategory.Spatial,
    label: 'Lives in',
    inverseLabel: 'Home of',
    icon: 'home',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'originated-from',
    category: RelationshipCategory.Spatial,
    label: 'Originated from',
    inverseLabel: 'Origin of',
    icon: 'flag',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'adjacent-to',
    category: RelationshipCategory.Spatial,
    label: 'Adjacent to',
    inverseLabel: 'Adjacent to',
    icon: 'compare_arrows',
    isBuiltIn: true,
    isSymmetric: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Temporal Relationships
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'happened-before',
    category: RelationshipCategory.Temporal,
    label: 'Happened before',
    inverseLabel: 'Happened after',
    icon: 'history',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'caused',
    category: RelationshipCategory.Temporal,
    label: 'Caused',
    inverseLabel: 'Caused by',
    icon: 'bolt',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'contemporary-of',
    category: RelationshipCategory.Temporal,
    label: 'Contemporary of',
    inverseLabel: 'Contemporary of',
    icon: 'schedule',
    isBuiltIn: true,
    isSymmetric: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Ownership Relationships
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'owns',
    category: RelationshipCategory.Ownership,
    label: 'Owns',
    inverseLabel: 'Owned by',
    icon: 'inventory_2',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'created',
    category: RelationshipCategory.Ownership,
    label: 'Created',
    inverseLabel: 'Created by',
    icon: 'construction',
    isBuiltIn: true,
    isSymmetric: false,
  },
  {
    id: 'wields',
    category: RelationshipCategory.Ownership,
    label: 'Wields',
    inverseLabel: 'Wielded by',
    icon: 'gavel',
    isBuiltIn: true,
    isSymmetric: false,
  },
];

/**
 * Get a relationship type by ID
 */
export function getRelationshipTypeById(
  id: string,
  customTypes: RelationshipType[] = []
): RelationshipType | undefined {
  // Check custom types first (allows overriding built-in)
  const custom = customTypes.find(t => t.id === id);
  if (custom) return custom;

  return DEFAULT_RELATIONSHIP_TYPES.find(t => t.id === id);
}

/**
 * Get all relationship types (built-in + custom)
 */
export function getAllRelationshipTypes(
  customTypes: RelationshipType[] = []
): RelationshipType[] {
  return [...DEFAULT_RELATIONSHIP_TYPES, ...customTypes];
}

/**
 * Get relationship types by category
 */
export function getRelationshipTypesByCategory(
  category: RelationshipCategory,
  customTypes: RelationshipType[] = []
): RelationshipType[] {
  const all = getAllRelationshipTypes(customTypes);
  return all.filter(t => t.category === category);
}

/**
 * Get the display label for a relationship (considering direction)
 */
export function getRelationshipLabel(
  type: RelationshipType,
  isIncoming: boolean
): string {
  if (isIncoming && type.inverseLabel) {
    return type.inverseLabel;
  }
  return type.label;
}

/**
 * Get the default icon for a relationship category
 */
export function getCategoryIcon(category: RelationshipCategory): string {
  switch (category) {
    case RelationshipCategory.Reference:
      return 'link';
    case RelationshipCategory.Familial:
      return 'family_restroom';
    case RelationshipCategory.Social:
      return 'people';
    case RelationshipCategory.Professional:
      return 'work';
    case RelationshipCategory.Spatial:
      return 'place';
    case RelationshipCategory.Temporal:
      return 'schedule';
    case RelationshipCategory.Ownership:
      return 'inventory_2';
    case RelationshipCategory.Custom:
      return 'tune';
    default:
      return 'link';
  }
}

/**
 * Get a human-readable label for a relationship category
 */
export function getCategoryLabel(category: RelationshipCategory): string {
  switch (category) {
    case RelationshipCategory.Reference:
      return 'References';
    case RelationshipCategory.Familial:
      return 'Family';
    case RelationshipCategory.Social:
      return 'Social';
    case RelationshipCategory.Professional:
      return 'Professional';
    case RelationshipCategory.Spatial:
      return 'Location';
    case RelationshipCategory.Temporal:
      return 'Timeline';
    case RelationshipCategory.Ownership:
      return 'Ownership';
    case RelationshipCategory.Custom:
      return 'Custom';
    default:
      return 'Other';
  }
}
