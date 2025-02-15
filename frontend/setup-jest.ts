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
Object.defineProperty(File.prototype, 'arrayBuffer', {
  value: function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(this);
    });
  },
});
