declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  type QueryResult = { data: any; error: any };

  interface QueryBuilder extends PromiseLike<QueryResult> {
    select(columns: string): QueryBuilder;
    eq(column: string, value: unknown): QueryBuilder;
    not(column: string, operator: string, value: unknown): QueryBuilder;
    single(): Promise<QueryResult>;
    insert(values: Record<string, unknown>): Promise<QueryResult>;
  }

  interface SupabaseClient {
    from(table: string): QueryBuilder;
    rpc(functionName: string, params: Record<string, unknown>): Promise<QueryResult>;
  }

  export function createClient(url: string, key: string): SupabaseClient;
}

declare namespace Deno {
  const env: {
    get(name: string): string | undefined;
  };

  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}