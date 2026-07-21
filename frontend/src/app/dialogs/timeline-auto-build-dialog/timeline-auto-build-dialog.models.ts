import { type TimePoint } from '@models/time-system';

export interface AutoBuildCandidate {
  elementId: string;
  elementName: string;
  fieldKey: string;
  fieldLabel: string;
  rawValue: string;
  timePoint: TimePoint;
  alreadyOnTimeline: boolean;
}

export interface AutoBuildDialogData {
  candidates: AutoBuildCandidate[];
  systemName: string;
}

export type AutoBuildDialogResult = {
  kind: 'build';
  selected: AutoBuildCandidate[];
};