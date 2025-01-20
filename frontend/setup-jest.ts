import 'fake-indexeddb/auto';
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';
import { nanoid as cnanoid } from 'nanoid';
setupZoneTestEnv();
jest.mock('nanoid', () => {
  let counter = 0;
  return {
    nanoid: () => `test-id-${counter++}`
  };
});
