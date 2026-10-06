import type { ClientConfig } from "pg";

export type BuiltPostgresConnectionConfig = {
  /** The exact configuration object passed to pg; never contains connectionString. */
  pgConfig: Omit<ClientConfig, "connectionString">;
  /** Safe connection metadata; contains no username, password, URL, or CA. */
  host: string;
  database: string;
  sslEnabled: boolean;
  sslMode: string;
};

export declare class PostgresConnectionConfigError extends Error {
  readonly code: "DATABASE_SSL_CONFIG";
}

/**
 * Parse DATABASE_URL and DATABASE_SSL_CA into one verified pg configuration.
 * DATABASE_SSL_CA accepts PEM text with real newlines or literal \n sequences.
 */
export declare function buildPostgresConnectionConfig(
  databaseUrl: string,
  databaseSslCa?: string | null,
): BuiltPostgresConnectionConfig;
