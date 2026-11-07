/**
 * Time systems (calendars) and time points.
 *
 * Lives in `@inkweld/project-library` (`packages/inkweld-project-library/src/time-system.ts`),
 * shared with the backend's MCP tools; this module re-exports it for the app.
 */
export {
  absoluteToTimePoint,
  assertValidTimeSystem,
  compareTimePoints,
  effectiveSubdivision,
  FANTASY_LUNAR_SYSTEM,
  FANTASY_SEASONS_SYSTEM,
  findTemplateSystem,
  formatTimePoint,
  GREGORIAN_SYSTEM,
  ISO_YEAR_SYSTEM,
  isTemplateSystemId,
  isValidTimePointFor,
  MISSION_DAY_SYSTEM,
  normalizeTimePoint,
  parseTimePoint,
  RELATIVE_YEARS_SYSTEM,
  STARDATE_SYSTEM,
  TIME_SYSTEM_TEMPLATES,
  type TimePoint,
  timePointToAbsolute,
  type TimeSystem,
  unitDropdownOptions,
  unitInputModeFor,
  unitMaxValue,
  unitMaxValueFor,
  unitMinValue,
  zeroTimePoint,
} from '@inkweld/project-library';
