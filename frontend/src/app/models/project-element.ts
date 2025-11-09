import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '../../api-client/model/get-api-v1-projects-username-slug-elements200-response-inner';

export interface ProjectElement {
  id: string;
  name: string;
  type: GetApiV1ProjectsUsernameSlugElements200ResponseInner['type']; // Use type from DTO
  level: number;
  position: number;
  expandable: boolean;
  expanded?: boolean;
  visible?: boolean;
  version: number; // Add version property, make non-nullable
  metadata: { [key: string]: string }; // Add metadata property to interface, use object type
}

// map DTO to frontend model
export function mapDtoToProjectElement(dto: GetApiV1ProjectsUsernameSlugElements200ResponseInner, level = 0): ProjectElement {
  return {
    id: dto.id,
    name: dto.name || '',
    type: dto.type || 'ITEM',
    level: level, // Frontend-specific property
    position: dto.order || 0, // Map 'order' from API to 'position' in frontend
    expandable: dto.type === 'FOLDER',
    expanded: false,
    visible: true,
    metadata: {}, // Default to empty object (not in new API yet)
    version: 1, // Default version (not in new API yet)
  };
}




