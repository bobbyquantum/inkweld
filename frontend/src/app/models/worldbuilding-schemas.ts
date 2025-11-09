import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '../../api-client';

// Base interface for all worldbuilding elements
export interface WorldbuildingBase {
  id: string;
  name: string;
  type: GetApiV1ProjectsUsernameSlugElements200ResponseInner.TypeEnum;
  summary?: string;
  notes?: string;
  tags?: string[];
  lastModified?: Date;
  createdDate?: Date;
}

// Character schema
export interface CharacterSchema extends WorldbuildingBase {
  type: 'CHARACTER';

  // Basic Information
  fullName?: string;
  aliases?: string[];
  age?: string;
  gender?: string;
  species?: string;
  occupation?: string;

  // Physical Description
  appearance?: {
    height?: string;
    weight?: string;
    eyeColor?: string;
    hairColor?: string;
    distinguishingFeatures?: string;
    clothing?: string;
  };

  // Personality & Traits
  personality?: {
    traits?: string[];
    strengths?: string[];
    weaknesses?: string[];
    fears?: string[];
    goals?: string[];
    motivations?: string[];
  };

  // Background
  background?: {
    birthplace?: string;
    family?: string;
    education?: string;
    history?: string;
  };

  // Relationships (IDs to other elements)
  relationships?: {
    elementId: string;
    relationshipType: string;
    description?: string;
  }[];

  // Abilities & Skills
  abilities?: {
    skills?: string[];
    powers?: string[];
    equipment?: string[];
  };
}

// Location schema
export interface LocationSchema extends WorldbuildingBase {
  type: 'LOCATION';

  // Basic Information
  locationType?: string; // city, town, building, region, etc.
  population?: string;
  climate?: string;
  terrain?: string;

  // Geography
  geography?: {
    coordinates?: string;
    area?: string;
    borders?: string[];
    landmarks?: string[];
    resources?: string[];
  };

  // Culture & Society
  society?: {
    government?: string;
    economy?: string;
    culture?: string;
    languages?: string[];
    religions?: string[];
    customs?: string[];
  };

  // History
  history?: {
    founding?: string;
    majorEvents?: { date: string; event: string }[];
    currentStatus?: string;
  };

  // Notable Features
  notableLocations?: string[];
  inhabitants?: string[]; // References to Character IDs
}

// Item schema (Worldbuilding Item)
export interface WBItemSchema extends WorldbuildingBase {
  type: 'WB_ITEM';

  // Basic Information
  itemType?: string; // weapon, artifact, tool, etc.
  rarity?: string;
  value?: string;
  weight?: string;
  dimensions?: string;

  // Properties
  properties?: {
    material?: string;
    condition?: string;
    magical?: boolean;
    powers?: string[];
    limitations?: string[];
  };

  // History & Origin
  origin?: {
    creator?: string;
    dateCreated?: string;
    purpose?: string;
    previousOwners?: string[];
  };

  // Current Status
  currentLocation?: string; // Reference to Location ID
  currentOwner?: string; // Reference to Character ID
}

// Map schema
export interface MapSchema extends WorldbuildingBase {
  type: 'MAP';

  // Map Information
  mapType?: string; // world, region, city, building, etc.
  scale?: string;
  orientation?: string;

  // Image Data
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;

  // Map Markers/Points of Interest
  markers?: {
    id: string;
    x: number;
    y: number;
    label: string;
    description?: string;
    linkedElementId?: string; // Link to Location, Character, etc.
  }[];

  // Legend
  legend?: {
    symbol: string;
    meaning: string;
  }[];

  // Related Locations
  locations?: string[]; // Location IDs
}

// Relationship schema
export interface RelationshipSchema extends WorldbuildingBase {
  type: 'RELATIONSHIP';

  // Relationship Details
  relationshipType?: string; // family, romantic, friendship, rivalry, etc.

  // Participants
  participants: {
    elementId: string;
    role?: string;
    perspective?: string;
  }[];

  // Timeline
  timeline?: {
    startDate?: string;
    endDate?: string;
    status?: string; // active, ended, complicated, etc.
    milestones?: { date: string; event: string }[];
  };

  // Dynamics
  dynamics?: {
    strength?: string;
    quality?: string;
    conflicts?: string[];
    bonds?: string[];
  };
}

// Philosophy schema
export interface PhilosophySchema extends WorldbuildingBase {
  type: 'PHILOSOPHY';

  // Core Concepts
  coreBeliefs?: string[];
  principles?: string[];
  values?: string[];

  // Origins
  founder?: string;
  originDate?: string;
  originLocation?: string;
  influences?: string[];

  // Practice
  practices?: {
    rituals?: string[];
    teachings?: string[];
    texts?: string[];
    symbols?: string[];
  };

  // Followers
  followers?: {
    demographics?: string;
    organizations?: string[];
    notableFigures?: string[]; // Character IDs
  };

  // Impact
  influence?: string;
  conflicts?: string[];
  alliances?: string[];
}

// Culture schema
export interface CultureSchema extends WorldbuildingBase {
  type: 'CULTURE';

  // Identity
  ethnicity?: string;
  nationality?: string;
  languages?: string[];

  // Social Structure
  socialStructure?: {
    classes?: string[];
    roles?: string[];
    hierarchy?: string;
    familyStructure?: string;
  };

  // Traditions
  traditions?: {
    customs?: string[];
    holidays?: string[];
    ceremonies?: string[];
    taboos?: string[];
  };

  // Arts & Expression
  arts?: {
    music?: string[];
    literature?: string[];
    visualArts?: string[];
    cuisine?: string[];
    clothing?: string[];
  };

  // Beliefs
  beliefs?: {
    religions?: string[]; // Philosophy IDs
    superstitions?: string[];
    worldview?: string;
  };

  // Locations
  territories?: string[]; // Location IDs
  population?: string;
}

// Species schema
export interface SpeciesSchema extends WorldbuildingBase {
  type: 'SPECIES';

  // Biology
  biology?: {
    classification?: string;
    lifespan?: string;
    reproduction?: string;
    diet?: string;
    habitat?: string[];
  };

  // Physical Characteristics
  physicalTraits?: {
    averageHeight?: string;
    averageWeight?: string;
    distinctiveFeatures?: string[];
    variations?: string[];
  };

  // Abilities
  abilities?: {
    natural?: string[];
    learned?: string[];
    weaknesses?: string[];
  };

  // Society
  society?: {
    intelligence?: string;
    communication?: string[];
    socialStructure?: string;
    technology?: string;
  };

  // Relations
  relations?: {
    allies?: string[]; // Species IDs
    enemies?: string[]; // Species IDs
    neutrals?: string[]; // Species IDs
  };

  // Distribution
  homeworld?: string; // Location ID
  colonies?: string[]; // Location IDs
  population?: string;
}

// Systems schema (Magic systems, Technology systems, etc.)
export interface SystemsSchema extends WorldbuildingBase {
  type: 'SYSTEMS';

  // System Type
  systemType?: string; // magic, technology, political, economic, etc.

  // Core Mechanics
  mechanics?: {
    fundamentalLaws?: string[];
    sources?: string[];
    limitations?: string[];
    costs?: string[];
  };

  // Components
  components?: {
    elements?: string[];
    tools?: string[];
    techniques?: string[];
    levels?: string[];
  };

  // Usage
  usage?: {
    practitioners?: string[]; // Character IDs or group names
    requirements?: string[];
    training?: string;
    accessibility?: string;
  };

  // Effects
  effects?: {
    capabilities?: string[];
    sideEffects?: string[];
    restrictions?: string[];
  };

  // History
  history?: {
    origin?: string;
    evolution?: string[];
    majorEvents?: { date: string; event: string }[];
  };

  // Cultural Impact
  culturalImpact?: {
    societies?: string[]; // Culture IDs
    conflicts?: string[];
    regulations?: string[];
  };
}

// Union type for all worldbuilding schemas
export type WorldbuildingSchema =
  | CharacterSchema
  | LocationSchema
  | WBItemSchema
  | MapSchema
  | RelationshipSchema
  | PhilosophySchema
  | CultureSchema
  | SpeciesSchema
  | SystemsSchema;

// Helper to get the schema type from element type
export function getSchemaFromType(
  type: GetApiV1ProjectsUsernameSlugElements200ResponseInner.TypeEnum
): string | null {
  switch (type) {
    case 'CHARACTER':
      return 'character';
    case 'LOCATION':
      return 'location';
    case 'WB_ITEM':
      return 'wbItem';
    case 'MAP':
      return 'map';
    case 'RELATIONSHIP':
      return 'relationship';
    case 'PHILOSOPHY':
      return 'philosophy';
    case 'CULTURE':
      return 'culture';
    case 'SPECIES':
      return 'species';
    case 'SYSTEMS':
      return 'systems';
    default:
      return null;
  }
}

// Helper to check if an element type is a worldbuilding type
export function isWorldbuildingType(type: GetApiV1ProjectsUsernameSlugElements200ResponseInner.TypeEnum): boolean {
  // Custom templates start with 'CUSTOM_'
  if (typeof type === 'string' && type.startsWith('CUSTOM_')) {
    return true;
  }
  // Check built-in worldbuilding types
  return getSchemaFromType(type) !== null;
}




