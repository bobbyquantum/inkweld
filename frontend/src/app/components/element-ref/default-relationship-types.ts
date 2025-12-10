/**
 * Default Relationship Types
 *
 * Built-in relationship types that are available in all projects.
 * Users can create additional custom types per project.
 */

import {
  RelationshipCategory,
  RelationshipType,
  RelationshipTypeDefinition,
} from './element-ref.model';

// ─────────────────────────────────────────────────────────────────────────────
// New Default Relationship Types (v2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default built-in relationship types using the new definition format.
 * These provide schema constraints and cardinality limits.
 */
export const DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS: RelationshipTypeDefinition[] =
  [
    // ─────────────────────────────────────────────────────────────────────────
    // Reference (for document mentions)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'referenced-in',
      name: 'Referenced in',
      inverseLabel: 'References',
      showInverse: true,
      category: RelationshipCategory.Reference,
      icon: 'link',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] }, // Any element
      targetEndpoint: { allowedSchemas: [] }, // Any element
    },
    {
      id: 'mentioned',
      name: 'Mentions',
      inverseLabel: 'Mentioned by',
      showInverse: true,
      category: RelationshipCategory.Reference,
      icon: 'chat',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Familial Relationships
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'parent',
      name: 'Parent',
      inverseLabel: 'Child of',
      showInverse: true,
      category: RelationshipCategory.Familial,
      icon: 'family_restroom',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'], maxCount: null }, // Can have many children
      targetEndpoint: { allowedSchemas: ['CHARACTER'], maxCount: 2 }, // Max 2 parents
    },
    {
      id: 'mother',
      name: 'Mother',
      inverseLabel: 'Child of',
      showInverse: false, // Hide awkward backlink, user adds Father/Mother from other side
      category: RelationshipCategory.Familial,
      icon: 'face_3',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'], maxCount: null },
      targetEndpoint: { allowedSchemas: ['CHARACTER'], maxCount: 1 }, // Max 1 mother
    },
    {
      id: 'father',
      name: 'Father',
      inverseLabel: 'Child of',
      showInverse: false,
      category: RelationshipCategory.Familial,
      icon: 'face',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'], maxCount: null },
      targetEndpoint: { allowedSchemas: ['CHARACTER'], maxCount: 1 }, // Max 1 father
    },
    {
      id: 'sibling',
      name: 'Sibling',
      inverseLabel: 'Sibling of',
      showInverse: true,
      category: RelationshipCategory.Familial,
      icon: 'people',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'brother',
      name: 'Brother',
      inverseLabel: 'Sibling of',
      showInverse: false,
      category: RelationshipCategory.Familial,
      icon: 'face',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'sister',
      name: 'Sister',
      inverseLabel: 'Sibling of',
      showInverse: false,
      category: RelationshipCategory.Familial,
      icon: 'face_3',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'spouse',
      name: 'Spouse',
      inverseLabel: 'Spouse of',
      showInverse: true,
      category: RelationshipCategory.Familial,
      icon: 'favorite',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'ancestor',
      name: 'Ancestor',
      inverseLabel: 'Descendant of',
      showInverse: true,
      category: RelationshipCategory.Familial,
      icon: 'account_tree',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Professional Relationships
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'employer',
      name: 'Employer',
      inverseLabel: 'Works for',
      showInverse: true,
      category: RelationshipCategory.Professional,
      icon: 'business',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER', 'LOCATION'] }, // Person or organization
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'colleague',
      name: 'Colleague',
      inverseLabel: 'Colleague of',
      showInverse: true,
      category: RelationshipCategory.Professional,
      icon: 'groups',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'mentor',
      name: 'Mentor',
      inverseLabel: 'Student of',
      showInverse: true,
      category: RelationshipCategory.Professional,
      icon: 'school',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'member-of',
      name: 'Member of',
      inverseLabel: 'Has member',
      showInverse: true,
      category: RelationshipCategory.Professional,
      icon: 'badge',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] }, // Group/org
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'leader',
      name: 'Leader',
      inverseLabel: 'Led by',
      showInverse: true,
      category: RelationshipCategory.Professional,
      icon: 'military_tech',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: [] }, // Can lead groups, locations, etc.
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Social Relationships
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'friend',
      name: 'Friend',
      inverseLabel: 'Friend of',
      showInverse: true,
      category: RelationshipCategory.Social,
      icon: 'handshake',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'enemy',
      name: 'Enemy',
      inverseLabel: 'Enemy of',
      showInverse: true,
      category: RelationshipCategory.Social,
      icon: 'swords',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'ally',
      name: 'Ally',
      inverseLabel: 'Ally of',
      showInverse: true,
      category: RelationshipCategory.Social,
      icon: 'shield',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'rival',
      name: 'Rival',
      inverseLabel: 'Rival of',
      showInverse: true,
      category: RelationshipCategory.Social,
      icon: 'sports_martial_arts',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },
    {
      id: 'romantic-interest',
      name: 'Romantic interest',
      inverseLabel: 'Has romantic interest in',
      showInverse: true,
      category: RelationshipCategory.Social,
      icon: 'heart_broken',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['CHARACTER'] },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Spatial Relationships
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'located-in',
      name: 'Located in',
      inverseLabel: 'Contains',
      showInverse: true,
      category: RelationshipCategory.Spatial,
      icon: 'place',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] }, // Anything can be located somewhere
      targetEndpoint: { allowedSchemas: ['LOCATION'] },
    },
    {
      id: 'lives-in',
      name: 'Lives in',
      inverseLabel: 'Home of',
      showInverse: true,
      category: RelationshipCategory.Spatial,
      icon: 'home',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['LOCATION'], maxCount: 1 }, // One primary residence
    },
    {
      id: 'originated-from',
      name: 'Originated from',
      inverseLabel: 'Origin of',
      showInverse: true,
      category: RelationshipCategory.Spatial,
      icon: 'flag',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER', 'WB_ITEM'] },
      targetEndpoint: { allowedSchemas: ['LOCATION'], maxCount: 1 },
    },
    {
      id: 'adjacent-to',
      name: 'Adjacent to',
      inverseLabel: 'Adjacent to',
      showInverse: true,
      category: RelationshipCategory.Spatial,
      icon: 'compare_arrows',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['LOCATION'] },
      targetEndpoint: { allowedSchemas: ['LOCATION'] },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Temporal Relationships
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'happened-before',
      name: 'Happened before',
      inverseLabel: 'Happened after',
      showInverse: true,
      category: RelationshipCategory.Temporal,
      icon: 'history',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },
    {
      id: 'caused',
      name: 'Caused',
      inverseLabel: 'Caused by',
      showInverse: true,
      category: RelationshipCategory.Temporal,
      icon: 'bolt',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },
    {
      id: 'contemporary',
      name: 'Contemporary',
      inverseLabel: 'Contemporary of',
      showInverse: true,
      category: RelationshipCategory.Temporal,
      icon: 'schedule',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Ownership Relationships
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'owns',
      name: 'Owns',
      inverseLabel: 'Owned by',
      showInverse: true,
      category: RelationshipCategory.Ownership,
      icon: 'inventory_2',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['WB_ITEM', 'LOCATION'] },
    },
    {
      id: 'created',
      name: 'Created',
      inverseLabel: 'Created by',
      showInverse: true,
      category: RelationshipCategory.Ownership,
      icon: 'construction',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['WB_ITEM'] },
    },
    {
      id: 'wields',
      name: 'Wields',
      inverseLabel: 'Wielded by',
      showInverse: true,
      category: RelationshipCategory.Ownership,
      icon: 'gavel',
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['CHARACTER'] },
      targetEndpoint: { allowedSchemas: ['WB_ITEM'], maxCount: 1 }, // One wielder at a time
    },
  ];

// ─────────────────────────────────────────────────────────────────────────────
// Legacy Default Relationship Types (deprecated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default built-in relationship types
 * @deprecated Use DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS instead
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

// ─────────────────────────────────────────────────────────────────────────────
// New Helper Functions (v2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a relationship type definition by ID (new format)
 */
export function getRelationshipTypeDefinitionById(
  id: string,
  customTypes: RelationshipTypeDefinition[] = []
): RelationshipTypeDefinition | undefined {
  // Check custom types first (allows overriding built-in)
  const custom = customTypes.find(t => t.id === id);
  if (custom) return custom;

  return DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS.find(t => t.id === id);
}

/**
 * Get all relationship type definitions (built-in + custom)
 */
export function getAllRelationshipTypeDefinitions(
  customTypes: RelationshipTypeDefinition[] = []
): RelationshipTypeDefinition[] {
  return [...DEFAULT_RELATIONSHIP_TYPE_DEFINITIONS, ...customTypes];
}

/**
 * Get relationship type definitions by category
 */
export function getRelationshipTypeDefinitionsByCategory(
  category: RelationshipCategory,
  customTypes: RelationshipTypeDefinition[] = []
): RelationshipTypeDefinition[] {
  const all = getAllRelationshipTypeDefinitions(customTypes);
  return all.filter(t => t.category === category);
}

/**
 * Get the display label for a relationship type definition (considering direction)
 */
export function getRelationshipTypeDefinitionLabel(
  type: RelationshipTypeDefinition,
  isIncoming: boolean
): string {
  if (isIncoming) {
    return type.inverseLabel;
  }
  return type.name;
}

/**
 * Check if a relationship type should show its inverse (backlinks)
 */
export function shouldShowInverse(type: RelationshipTypeDefinition): boolean {
  return type.showInverse;
}

/**
 * Get relationship types that are valid for a given source schema
 */
export function getValidRelationshipTypesForSource(
  sourceSchemaType: string,
  customTypes: RelationshipTypeDefinition[] = []
): RelationshipTypeDefinition[] {
  const all = getAllRelationshipTypeDefinitions(customTypes);
  return all.filter(t => {
    // Empty array means any schema is allowed
    if (t.sourceEndpoint.allowedSchemas.length === 0) return true;
    return t.sourceEndpoint.allowedSchemas.includes(sourceSchemaType);
  });
}

/**
 * Get relationship types that are valid for a given source and target schema pair
 */
export function getValidRelationshipTypesForPair(
  sourceSchemaType: string,
  targetSchemaType: string,
  customTypes: RelationshipTypeDefinition[] = []
): RelationshipTypeDefinition[] {
  const all = getAllRelationshipTypeDefinitions(customTypes);
  return all.filter(t => {
    const sourceAllowed =
      t.sourceEndpoint.allowedSchemas.length === 0 ||
      t.sourceEndpoint.allowedSchemas.includes(sourceSchemaType);
    const targetAllowed =
      t.targetEndpoint.allowedSchemas.length === 0 ||
      t.targetEndpoint.allowedSchemas.includes(targetSchemaType);
    return sourceAllowed && targetAllowed;
  });
}

/**
 * Convert a RelationshipTypeDefinition (v2) to a RelationshipType (v1) for backward compatibility.
 * This is a transitional helper while the codebase is being migrated.
 * @deprecated Use RelationshipTypeDefinition directly where possible
 */
export function toRelationshipTypeLegacy(
  def: RelationshipTypeDefinition
): RelationshipType {
  return {
    id: def.id,
    label: def.name,
    inverseLabel: def.inverseLabel,
    icon: def.icon,
    category: def.category,
    isBuiltIn: def.isBuiltIn,
    color: def.color,
  };
}
