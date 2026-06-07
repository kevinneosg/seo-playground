// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    /** Postgres connection string (required at runtime; injected by Railway). */
    DATABASE_URL?: string;
    /** Set to "disable" to force-disable SSL (e.g. Railway private networking). */
    PGSSL?: string;
  }
}
