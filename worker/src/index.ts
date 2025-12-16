import { createClient } from "@libsql/client/web";

type Env = {
  LIBSQL_DB_URL: string;
  LIBSQL_DB_AUTH_TOKEN: string;
  ALLOWED_ORIGINS: string; // "https://site1.com,https://site2.com"
};

function nowIso() {
  return new Date().toISOString();
}

function parseAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };

  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(request: Request, env: Env, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
    },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("JSON inválido no body.");
  }
}

function badRequest(request: Request, env: Env, message: string) {
  return jsonResponse(request, env, 400, { ok: false, error: message });
}

function serverError(request: Request, env: Env, message: string) {
  return jsonResponse(request, env, 500, { ok: false, error: message });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Preflight CORS
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const method = request.method.toUpperCase();

      const client = createClient({
        url: env.LIBSQL_DB_URL,
        authToken: env.LIBSQL_DB_AUTH_TOKEN,
      });

      // Health
      if (method === "GET" && path === "/health") {
        return jsonResponse(request, env, 200, { ok: true, ts: nowIso() });
      }

      // Helpers
      async function auditLog(args: {
        empresa_id?: string | null;
        entidade: string;
        entidade_id?: string | null;
        acao: string;
        payload?: unknown;
      }) {
        const id = crypto.randomUUID();
        await client.execute({
          sql: `
            INSERT INTO audit_log (id, empresa_id, entidade, entidade_id, acao, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            args.empresa_id ?? null,
            args.entidade,
            args.entidade_id ?? null,
            args.acao,
            args.payload ? JSON.stringify(args.payload) : null,
            nowIso(),
          ],
        });
      }

      // ========= EMPRESAS =========
      if (method === "GET" && path === "/v1/empresas") {
        const rs = await client.execute({
          sql: `SELECT id, nome, status, created_at, updated_at FROM empresas ORDER BY nome`,
          args: [],
        });
        return jsonResponse(request, env, 200, { ok: true, empresas: rs.rows });
      }

      if (method === "POST" && path === "/v1/empresas") {
        const body = await readJson<{ nome?: string }>(request);
        const nome = (body.nome || "").trim();
        if (!nome) return badRequest(request, env, "Campo 'nome' é obrigatório.");

        const id = crypto.randomUUID();
        const ts = nowIso();

        await client.execute({
          sql: `INSERT INTO empresas (id, nome, status, created_at, updated_at) VALUES (?, ?, 'ATIVA', ?, ?)`,
          args: [id, nome, ts, ts],
        });

        await auditLog({
          empresa_id: id,
          entidade: "empresas",
          entidade_id: id,
          acao: "CREATE",
          payload: { nome },
        });

        return jsonResponse(request, env, 201, { ok: true, id, nome });
      }

      // ========= PRODUTOS =========
      if (method === "GET" && path === "/v1/produtos") {
        const empresa_id = (url.searchParams.get("empresa_id") || "").trim();
        if (!empresa_id) return badRequest(request, env, "Query 'empresa_id' é obrigatória.");

        const rs = await client.execute({
          sql: `
            SELECT id, empresa_id, sku, descricao, unidade, created_at, updated_at
            FROM produtos
            WHERE empresa_id = ?
            ORDER BY sku
          `,
          args: [empresa_id],
        });

        return jsonResponse(request, env, 200, { ok: true, produtos: rs.rows });
      }

      if (method === "POST" && path === "/v1/produtos") {
        const body = await readJson<{ empresa_id?: string; sku?: string; descricao?: string; unidade?: string }>(request);
        const empresa_id = (body.empresa_id || "").trim();
        const sku = (body.sku || "").trim();
        const descricao = (body.descricao || "").trim();
        const unidade = (body.unidade || "UN").trim();

        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!sku) return badRequest(request, env, "Campo 'sku' é obrigatório.");
        if (!descricao) return badRequest(request, env, "Campo 'descricao' é obrigatório.");

        const id = crypto.randomUUID();
        const ts = nowIso();

        await client.execute({
          sql: `
            INSERT INTO produtos (id, empresa_id, sku, descricao, unidade, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [id, empresa_id, sku, descricao, unidade, ts, ts],
        });

        await auditLog({
          empresa_id,
          entidade: "produtos",
          entidade_id: id,
          acao: "CREATE",
          payload: { empresa_id, sku, descricao, unidade },
        });

        return jsonResponse(request, env, 201, { ok: true, id });
      }

      // ========= TABELAS =========
      if (method === "GET" && path === "/v1/tabelas") {
        const empresa_id = (url.searchParams.get("empresa_id") || "").trim();
        if (!empresa_id) return badRequest(request, env, "Query 'empresa_id' é obrigatória.");

        const rs = await client.execute({
          sql: `
            SELECT id, empresa_id, nome, validade_inicio, validade_fim, status, created_at, updated_at
            FROM tabelas_preco
            WHERE empresa_id = ?
            ORDER BY created_at DESC
          `,
          args: [empresa_id],
        });

        return jsonResponse(request, env, 200, { ok: true, tabelas: rs.rows });
      }

      if (method === "POST" && path === "/v1/tabelas") {
        const body = await readJson<{
          empresa_id?: string;
          nome?: string;
          validade_inicio?: string | null;
          validade_fim?: string | null;
        }>(request);

        const empresa_id = (body.empresa_id || "").trim();
        const nome = (body.nome || "").trim();
        const validade_inicio = (body.validade_inicio || null);
        const validade_fim = (body.validade_fim || null);

        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!nome) return badRequest(request, env, "Campo 'nome' é obrigatório.");

        const id = crypto.randomUUID();
        const ts = nowIso();

        await client.execute({
          sql: `
            INSERT INTO tabelas_preco (id, empresa_id, nome, validade_inicio, validade_fim, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'ATIVA', ?, ?)
          `,
          args: [id, empresa_id, nome, validade_inicio, validade_fim, ts, ts],
        });

        await auditLog({
          empresa_id,
          entidade: "tabelas_preco",
          entidade_id: id,
          acao: "CREATE",
          payload: { empresa_id, nome, validade_inicio, validade_fim },
        });

        return jsonResponse(request, env, 201, { ok: true, id });
      }

      // ========= ITENS (tabela_id no path) =========
      // GET /v1/tabelas/:id/itens
      // PUT /v1/tabelas/:id/itens  -> substitui itens
      const itensMatch = path.match(/^\/v1\/tabelas\/([^\/]+)\/itens$/);
      if (itensMatch) {
        const tabela_id = itensMatch[1].trim();

        if (method === "GET") {
          const rs = await client.execute({
            sql: `
              SELECT i.id, i.tabela_id, i.produto_id, i.preco, i.created_at, i.updated_at,
                     p.sku, p.descricao, p.unidade
              FROM tabela_preco_itens i
              JOIN produtos p ON p.id = i.produto_id
              WHERE i.tabela_id = ?
              ORDER BY p.sku
            `,
            args: [tabela_id],
          });

          return jsonResponse(request, env, 200, { ok: true, itens: rs.rows });
        }

        if (method === "PUT") {
          const body = await readJson<Array<{ produto_id: string; preco: number }>>(request);
          if (!Array.isArray(body)) return badRequest(request, env, "Body deve ser um array de itens.");

          // Descobre empresa_id da tabela (pra auditoria e validações)
          const t = await client.execute({
            sql: `SELECT id, empresa_id FROM tabelas_preco WHERE id = ?`,
            args: [tabela_id],
          });
          const tabelaRow = t.rows[0] as any;
          if (!tabelaRow) return badRequest(request, env, "Tabela não encontrada.");
          const empresa_id = String(tabelaRow.empresa_id);

          // Validação básica: produtos devem existir e pertencer à empresa
          for (const item of body) {
            const pid = (item?.produto_id || "").trim();
            if (!pid) return badRequest(request, env, "Item sem 'produto_id'.");
            if (typeof item.preco !== "number" || !isFinite(item.preco) || item.preco < 0) {
              return badRequest(request, env, `Preço inválido para produto_id=${pid}.`);
            }

            const p = await client.execute({
              sql: `SELECT id FROM produtos WHERE id = ? AND empresa_id = ?`,
              args: [pid, empresa_id],
            });
            if (!p.rows[0]) {
              return badRequest(request, env, `Produto ${pid} não existe ou não pertence à empresa.`);
            }
          }

          const ts = nowIso();

          // Estratégia: "replace all" com transação
          try {
            await client.execute({ sql: "BEGIN", args: [] });

            await client.execute({
              sql: `DELETE FROM tabela_preco_itens WHERE tabela_id = ?`,
              args: [tabela_id],
            });

            for (const item of body) {
              const id = crypto.randomUUID();
              await client.execute({
                sql: `
                  INSERT INTO tabela_preco_itens (id, tabela_id, produto_id, preco, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?)
                `,
                args: [id, tabela_id, item.produto_id.trim(), item.preco, ts, ts],
              });
            }

            await client.execute({
              sql: `UPDATE tabelas_preco SET updated_at = ? WHERE id = ?`,
              args: [ts, tabela_id],
            });

            await client.execute({ sql: "COMMIT", args: [] });
          } catch (e: any) {
            try { await client.execute({ sql: "ROLLBACK", args: [] }); } catch {}
            throw e;
          }

          await auditLog({
            empresa_id,
            entidade: "tabela_preco_itens",
            entidade_id: tabela_id,
            acao: "REPLACE_ALL",
            payload: { tabela_id, itens: body },
          });

          return jsonResponse(request, env, 200, { ok: true, tabela_id, total_itens: body.length });
        }
      }

      return jsonResponse(request, env, 404, { ok: false, error: "Rota não encontrada." });
    } catch (err: any) {
      return serverError(request, env, err?.message || "Erro inesperado.");
    }
  },
};
