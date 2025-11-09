import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '../../api-client/model/project-element-dto';

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
export function mapDtoToProjectElement(dto: GetApiV1ProjectsUsernameSlugElements200ResponseInner): ProjectElement {
  return {
    id: dto.id,
    name: dto.name || '',
    type: dto.type || 'ITEM',
    level: dto.level || 0, // Default to level 0
    position: dto.position || 0,
    expandable: dto.type === 'FOLDER',
    expanded: false,
    visible: true,
    metadata: dto.metadata,
    version: dto.version, // Map version from DTO
  };
}




