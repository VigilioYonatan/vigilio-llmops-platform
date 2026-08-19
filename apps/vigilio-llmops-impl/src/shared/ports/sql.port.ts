export const SQL_PORT = Symbol.for('SQL_PORT');

export interface SqlQueryResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

export interface SqlTxClient {
  query<T = any>(text: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

export interface SqlPort {
  rows<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(text: string, params?: unknown[]): Promise<T | null>;
  tx<T>(fn: (client: SqlTxClient) => Promise<T>): Promise<T>;
}
