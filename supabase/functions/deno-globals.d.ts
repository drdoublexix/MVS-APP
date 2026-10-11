declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  type QueryResult = { data: any; error: any };

  interface QueryBuilder extends PromiseLike<QueryResult> {
    select(columns: string): QueryBuilder;
    eq(column: string, value: unknown): QueryBuilder;
    not(column: string, operator: string, value: unknown): QueryBuilder;
    order(column: string, options?: Record<string, unknown>): QueryBuilder;
    limit(value: number): QueryBuilder;
    range(from: number, to: number): QueryBuilder;
    gte(column: string, value: unknown): QueryBuilder;
    or(filters: string): QueryBuilder;
    maybeSingle(): Promise<QueryResult>;
    single(): Promise<QueryResult>;
    insert(values: Record<string, unknown> | Record<string, unknown>[]): Promise<QueryResult>;
  }

  interface SupabaseClient {
    auth: {
      getUser(token: string): Promise<{
        data: { user: { id: string; email?: string; email_confirmed_at?: string | null } | null };
        error: unknown;
      }>;
    };
    from(table: string): QueryBuilder;
    rpc(functionName: string, params: Record<string, unknown>): Promise<QueryResult>;
  }

  export function createClient(url: string, key: string, options?: Record<string, unknown>): SupabaseClient;
}

declare namespace Deno {
  const env: {
    get(name: string): string | undefined;
  };

  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}