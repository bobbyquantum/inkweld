/**
 * Type definitions for Hono context variables
 */

export interface User {
  id: string;
  username: string | null;
  name: string | null;
  enabled: boolean;
  isAdmin?: boolean;
}

export type AppContext = {
  Variables: {
    user: User;
  };
};
