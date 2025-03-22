import { Mock } from 'bun:test';

/**
 * Utility types for Bun tests to provide Jest-like functionality
 */

/**
 * Makes all properties and methods of T mocked (similar to Jest's Mocked<T>)
 */
export type Mocked<T> = {
  [P in keyof T]: T[P] extends (...args: any[]) => any
    ? Mock<ReturnType<T[P]>>
    : T[P];
} & T;

/**
 * Helper function to create a mock with proper typing
 */
export function createMock<T>(): Mocked<T> {
  return {} as Mocked<T>;
}
