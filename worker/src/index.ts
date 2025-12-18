import { createClient, Client } from "@libsql/client/web";

type Env = {
  LIBSQL_DB_URL: string;
  LIBSQL_DB_AUTH_TOKEN: string;
  ALLOWED_ORIGINS: string;
};

type JsonMap = Record<string, any>;

type BulkRow = Record<string, string | number | null | undefined>;

type ProdutoInput = {
  empresa_id: string;
  sku: string;
  descricao: string;
  unidade: string;
  familia?: string | null;
  ativo?: number;
  ref_familia?: number;
  grupo_preco?: number;
  peso_kg?: number | null;
  ean13?: string | null;
  ean14_caixa?: string | null;
  apresentacao?: string | null;
  cubagem_m3?: number | null;
  peso_liq_kg?: number | null;
  peso_bruto_kg?: number | null;
  categoria_preco_base?: string | null;
  ncm_categoria_id?: string | null;
  pallet?: string | null;
  pallet_caixas?: number | null;
};

function nowIso() {
  return new Date().toISOString();
}

function parseAllowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env);

  const isAllowedOrigin = allowed.length === 0 || allowed.includes(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Origin": isAllowedOrigin && origin ? origin : "*",
    "Vary": "Origin",
  };

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
    throw new Error("JSON inválido no corpo da requisição.");
  }
}

function badRequest(request: Request, env: Env, message: string) {
  return jsonResponse(request, env, 400, { ok: false, error: message });
}

function serverError(request: Request, env: Env, message: string) {
  return jsonResponse(request, env, 500, { ok: false, error: message });
}

function sanitizeString(value: unknown, def = "") {
  return typeof value === "string" ? value.trim() : def;
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function withClient(env: Env): Client {
  return createClient({ url: env.LIBSQL_DB_URL, authToken: env.LIBSQL_DB_AUTH_TOKEN });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const method = request.method.toUpperCase();
      const client = withClient(env);

      async function auditLog(args: { empresa_id?: string | null; entidade: string; entidade_id?: string | null; acao: string; payload?: unknown; }) {
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

      // Healthcheck
      if (method === "GET" && path === "/health") {
        return jsonResponse(request, env, 200, { ok: true, ts: nowIso() });
      }

      // ================= EMPRESAS =================
      if (method === "GET" && path === "/v1/empresas") {
        const rs = await client.execute({
          sql: `SELECT id, nome, logo_url, tema_json, config_json FROM empresas ORDER BY nome`,
          args: [],
        });
        return jsonResponse(request, env, 200, { ok: true, empresas: rs.rows });
      }

      if (method === "POST" && path === "/v1/empresas") {
        const body = await readJson<{ nome?: string }>(request);
        const nome = sanitizeString(body.nome);
        if (!nome) return badRequest(request, env, "Campo 'nome' é obrigatório.");

        const id = crypto.randomUUID();
        const ts = nowIso();
        await client.execute({
          sql: `INSERT INTO empresas (id, nome, status, created_at, updated_at) VALUES (?, ?, 'ATIVA', ?, ?)`,
          args: [id, nome, ts, ts],
        });

        await auditLog({ empresa_id: id, entidade: "empresas", entidade_id: id, acao: "CREATE", payload: { nome } });
        return jsonResponse(request, env, 201, { ok: true, id, nome });
      }

      const empresaMatch = path.match(/^\/v1\/empresas\/([^/]+)$/);
      if (empresaMatch && method === "PUT") {
        const empresaId = empresaMatch[1];
        const body = await readJson<{ nome?: string; logo_url?: string | null; tema_json?: JsonMap | null; config_json?: JsonMap | null }>(request);
        const nome = sanitizeString(body.nome);
        const logo_url = typeof body.logo_url === "string" ? body.logo_url.trim() : null;
        const tema_json = body.tema_json ? JSON.stringify(body.tema_json) : null;
        const config_json = body.config_json ? JSON.stringify(body.config_json) : null;
        if (!nome) return badRequest(request, env, "Campo 'nome' é obrigatório.");

        await client.execute({
          sql: `UPDATE empresas SET nome = ?, logo_url = ?, tema_json = ?, config_json = ?, updated_at = ? WHERE id = ?`,
          args: [nome, logo_url, tema_json, config_json, nowIso(), empresaId],
        });

        await auditLog({ empresa_id: empresaId, entidade: "empresas", entidade_id: empresaId, acao: "UPDATE", payload: { nome, logo_url, tema_json: body.tema_json, config_json: body.config_json } });
        return jsonResponse(request, env, 200, { ok: true, id: empresaId });
      }

      // ================= PRODUTOS =================
      if (method === "GET" && path === "/v1/produtos") {
        const empresa_id = sanitizeString(url.searchParams.get("empresa_id"));
        if (!empresa_id) return badRequest(request, env, "Query 'empresa_id' é obrigatória.");

        const rs = await client.execute({
          sql: `
            SELECT id, empresa_id, sku, descricao, unidade, familia, ativo, ref_familia, grupo_preco,
                   peso_kg, ean13, ean14_caixa, apresentacao, cubagem_m3, peso_liq_kg, peso_bruto_kg,
                   categoria_preco_base, ncm_categoria_id, pallet, pallet_caixas, created_at, updated_at
            FROM produtos
            WHERE empresa_id = ?
            ORDER BY sku
          `,
          args: [empresa_id],
        });
        return jsonResponse(request, env, 200, { ok: true, produtos: rs.rows });
      }

      async function persistProduto(id: string | null, body: ProdutoInput, acao: "CREATE" | "UPDATE") {
        const ts = nowIso();
        const args = [
          id ?? crypto.randomUUID(),
          body.empresa_id,
          body.sku,
          body.descricao,
          body.unidade || "UN",
          body.familia ?? null,
          body.ativo ?? 1,
          body.ref_familia ?? 0,
          body.grupo_preco ?? 1,
          body.peso_kg ?? null,
          body.ean13 ?? null,
          body.ean14_caixa ?? null,
          body.apresentacao ?? null,
          body.cubagem_m3 ?? null,
          body.peso_liq_kg ?? null,
          body.peso_bruto_kg ?? null,
          body.categoria_preco_base ?? null,
          body.ncm_categoria_id ?? null,
          body.pallet ?? null,
          body.pallet_caixas ?? null,
          ts,
          ts,
        ];

        if (acao === "CREATE") {
          await client.execute({
            sql: `
              INSERT INTO produtos (
                id, empresa_id, sku, descricao, unidade, familia, ativo, ref_familia, grupo_preco,
                peso_kg, ean13, ean14_caixa, apresentacao, cubagem_m3, peso_liq_kg, peso_bruto_kg,
                categoria_preco_base, ncm_categoria_id, pallet, pallet_caixas, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args,
          });
          return args[0] as string;
        }

        await client.execute({
          sql: `
            UPDATE produtos SET
              empresa_id = ?, sku = ?, descricao = ?, unidade = ?, familia = ?, ativo = ?, ref_familia = ?, grupo_preco = ?,
              peso_kg = ?, ean13 = ?, ean14_caixa = ?, apresentacao = ?, cubagem_m3 = ?, peso_liq_kg = ?, peso_bruto_kg = ?,
              categoria_preco_base = ?, ncm_categoria_id = ?, pallet = ?, pallet_caixas = ?, updated_at = ?
            WHERE id = ?
          `,
          args: [
            body.empresa_id,
            body.sku,
            body.descricao,
            body.unidade || "UN",
            body.familia ?? null,
            body.ativo ?? 1,
            body.ref_familia ?? 0,
            body.grupo_preco ?? 1,
            body.peso_kg ?? null,
            body.ean13 ?? null,
            body.ean14_caixa ?? null,
            body.apresentacao ?? null,
            body.cubagem_m3 ?? null,
            body.peso_liq_kg ?? null,
            body.peso_bruto_kg ?? null,
            body.categoria_preco_base ?? null,
            body.ncm_categoria_id ?? null,
            body.pallet ?? null,
            body.pallet_caixas ?? null,
            ts,
            id,
          ],
        });
        return id as string;
      }

      if (method === "POST" && path === "/v1/produtos") {
        const body = await readJson<ProdutoInput>(request);
        body.empresa_id = sanitizeString(body.empresa_id);
        body.sku = sanitizeString(body.sku);
        body.descricao = sanitizeString(body.descricao);
        body.unidade = sanitizeString(body.unidade || "UN", "UN") || "UN";

        if (!body.empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!body.sku) return badRequest(request, env, "Campo 'sku' é obrigatório.");
        if (!body.descricao) return badRequest(request, env, "Campo 'descricao' é obrigatório.");

        const id = await persistProduto(null, body, "CREATE");
        await auditLog({ empresa_id: body.empresa_id, entidade: "produtos", entidade_id: id, acao: "CREATE", payload: body });
        return jsonResponse(request, env, 201, { ok: true, id });
      }

      const produtoMatch = path.match(/^\/v1\/produtos\/([^/]+)$/);
      if (produtoMatch && method === "PUT") {
        const produtoId = produtoMatch[1];
        const body = await readJson<ProdutoInput>(request);
        body.empresa_id = sanitizeString(body.empresa_id);
        body.sku = sanitizeString(body.sku);
        body.descricao = sanitizeString(body.descricao);
        body.unidade = sanitizeString(body.unidade || "UN", "UN") || "UN";

        if (!body.empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!body.sku) return badRequest(request, env, "Campo 'sku' é obrigatório.");
        if (!body.descricao) return badRequest(request, env, "Campo 'descricao' é obrigatório.");

        await persistProduto(produtoId, body, "UPDATE");
        await auditLog({ empresa_id: body.empresa_id, entidade: "produtos", entidade_id: produtoId, acao: "UPDATE", payload: body });
        return jsonResponse(request, env, 200, { ok: true, id: produtoId });
      }

      if (method === "POST" && path === "/v1/produtos/bulk") {
        const body = await readJson<{ empresa_id?: string; template?: string; rows?: BulkRow[] }>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        const template = sanitizeString(body.template).toUpperCase();
        const rows = Array.isArray(body.rows) ? body.rows : [];

        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!template) return badRequest(request, env, "Campo 'template' é obrigatório.");
        if (!rows.length) return badRequest(request, env, "Campo 'rows' deve conter linhas para importar.");

        const report = { inseridos: 0, atualizados: 0, erros: [] as Array<{ linha: number; erro: string }> };

        function mapProduto(row: BulkRow): ProdutoInput {
          const base: ProdutoInput = {
            empresa_id,
            sku: sanitizeString(row["Cod"] ?? row["sku"] ?? ""),
            descricao: sanitizeString(row["Descrição"] ?? row["descricao"] ?? ""),
            unidade: sanitizeString(row["Und"] ?? row["unidade"] ?? "UN", "UN") || "UN",
            familia: sanitizeString((row["Família"] ?? row["familia"]) as any) || null,
            ativo: row["Ativo"] === 0 || row["Ativo"] === "0" ? 0 : 1,
            ref_familia: Number(row["Ref"] ?? row["ref_familia"] ?? 0) ? 1 : 0,
            grupo_preco: Number(row["Grupo"] ?? row["grupo_preco"] ?? 1) || 1,
            peso_kg: toNumber(row["Peso_kg"] ?? row["peso_kg"]),
            ean13: sanitizeString(row["EAN13"] ?? row["ean13"] ?? "") || null,
            ean14_caixa: sanitizeString(row["EAN14_caixa"] ?? row["ean14_caixa"] ?? "") || null,
            apresentacao: sanitizeString(row["Apresentacao"] ?? row["apresentacao"] ?? "") || null,
            cubagem_m3: toNumber(row["Cubagem_m3"] ?? row["cubagem_m3"]),
            peso_liq_kg: toNumber(row["PesoLiq_kg"] ?? row["peso_liq_kg"]),
            peso_bruto_kg: toNumber(row["PesoBruto_kg"] ?? row["peso_bruto_kg"]),
            categoria_preco_base: sanitizeString(row["categoria_preco_base"] ?? "") || null,
            ncm_categoria_id: sanitizeString(row["ncm_categoria_id"] ?? "") || null,
            pallet: sanitizeString(row["PalletFormato"] ?? row["pallet"] ?? "") || null,
            pallet_caixas: toNumber(row["PalletCaixas"] ?? row["pallet_caixas"]),
          };

          if (!base.pallet_caixas && base.pallet && /^(\d+)x(\d+)$/i.test(base.pallet)) {
            const match = base.pallet.match(/^(\d+)x(\d+)$/i);
            if (match) {
              base.pallet_caixas = Number(match[1]) * Number(match[2]);
            }
          }

          if (template === "GERMANI_PRODUTOS") {
            base.ean13 = null;
            base.apresentacao = null;
            base.cubagem_m3 = null;
            base.peso_liq_kg = null;
            base.peso_bruto_kg = null;
            base.pallet = sanitizeString(row["PalletFormato"] ?? row["pallet"] ?? "") || null;
          }

          if (template === "DALLAS_LOGISTICA") {
            base.peso_kg = base.peso_kg ?? toNumber(row["Peso_kg"]);
          }

          return base;
        }

        const existing = await client.execute({
          sql: `SELECT id, sku FROM produtos WHERE empresa_id = ?`,
          args: [empresa_id],
        });
        const bySku = new Map<string, string>();
        for (const r of existing.rows as any[]) bySku.set(String(r.sku), String(r.id));

        try {
          await client.execute({ sql: "BEGIN", args: [] });
          for (let i = 0; i < rows.length; i++) {
            try {
              const prod = mapProduto(rows[i]);
              if (!prod.sku) throw new Error("SKU vazio.");
              if (!prod.descricao) throw new Error("Descrição obrigatória.");

              const existingId = bySku.get(prod.sku);
              if (existingId) {
                await persistProduto(existingId, prod, "UPDATE");
                report.atualizados += 1;
              } else {
                const newId = await persistProduto(null, prod, "CREATE");
                bySku.set(prod.sku, newId);
                report.inseridos += 1;
              }
            } catch (err: any) {
              report.erros.push({ linha: i + 1, erro: err?.message || "Erro ao importar." });
            }
          }
          await client.execute({ sql: "COMMIT", args: [] });
        } catch (err) {
          try { await client.execute({ sql: "ROLLBACK", args: [] }); } catch {}
          throw err;
        }

        await auditLog({ empresa_id, entidade: "produtos", acao: "BULK_UPSERT", payload: { template, linhas: rows.length, ...report } });
        return jsonResponse(request, env, 200, { ok: true, ...report });
      }

      // ================= DESTINOS =================
      if (method === "GET" && path === "/v1/destinos") {
        const rs = await client.execute({ sql: `SELECT codigo, tipo, descricao FROM destinos ORDER BY codigo`, args: [] });
        return jsonResponse(request, env, 200, { ok: true, destinos: rs.rows });
      }

      if (method === "POST" && path === "/v1/destinos") {
        const body = await readJson<{ codigo?: string; tipo?: string; descricao?: string }>(request);
        const codigo = sanitizeString(body.codigo);
        const tipo = sanitizeString(body.tipo || "UF") || "UF";
        const descricao = sanitizeString(body.descricao);
        if (!codigo) return badRequest(request, env, "Campo 'codigo' é obrigatório.");
        if (!descricao) return badRequest(request, env, "Campo 'descricao' é obrigatório.");

        await client.execute({
          sql: `INSERT OR REPLACE INTO destinos (codigo, tipo, descricao) VALUES (?, ?, ?)`,
          args: [codigo, tipo, descricao],
        });
        await auditLog({ entidade: "destinos", entidade_id: codigo, acao: "UPSERT", payload: { codigo, tipo, descricao } });
        return jsonResponse(request, env, 201, { ok: true, codigo });
      }

      // ================= ST REGRAS =================
      if (method === "GET" && path === "/v1/st") {
        const empresa_id = sanitizeString(url.searchParams.get("empresa_id"));
        const destino = sanitizeString(url.searchParams.get("destino"));
        const operacao = sanitizeString(url.searchParams.get("operacao"));
        if (!empresa_id) return badRequest(request, env, "Query 'empresa_id' é obrigatória.");

        const rs = await client.execute({
          sql: `
            SELECT id, empresa_id, destino_codigo, operacao, tem_st, variantes_json, parametros_json, ativo, created_at, updated_at
            FROM st_regras
            WHERE empresa_id = ?
              AND (? = '' OR destino_codigo = ?)
              AND (? = '' OR operacao = ?)
            ORDER BY destino_codigo, operacao
          `,
          args: [empresa_id, destino, destino, operacao, operacao],
        });
        return jsonResponse(request, env, 200, { ok: true, regras: rs.rows });
      }

      if (method === "POST" && path === "/v1/st") {
        const body = await readJson<{ empresa_id?: string; destino_codigo?: string; operacao?: string; tem_st?: number; variantes_json?: JsonMap | null; parametros_json?: JsonMap | null; ativo?: number }>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        const destino_codigo = sanitizeString(body.destino_codigo || (body as any)["destino"] || "");
        const operacao = sanitizeString(body.operacao || "INTERNA") || "INTERNA";
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!destino_codigo) return badRequest(request, env, "Campo 'destino_codigo' é obrigatório.");

        const id = crypto.randomUUID();
        const ts = nowIso();
        await client.execute({
          sql: `
            INSERT INTO st_regras (id, empresa_id, destino_codigo, operacao, tem_st, variantes_json, parametros_json, ativo, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            empresa_id,
            destino_codigo,
            operacao,
            body.tem_st ? 1 : 0,
            body.variantes_json ? JSON.stringify(body.variantes_json) : null,
            body.parametros_json ? JSON.stringify(body.parametros_json) : null,
            body.ativo ? 1 : 0,
            ts,
            ts,
          ],
        });
        await auditLog({ empresa_id, entidade: "st_regras", entidade_id: id, acao: "CREATE", payload: body });
        return jsonResponse(request, env, 201, { ok: true, id });
      }

      const stMatch = path.match(/^\/v1\/st\/([^/]+)$/);
      if (stMatch && method === "PUT") {
        const id = stMatch[1];
        const body = await readJson<{ empresa_id?: string; destino_codigo?: string; operacao?: string; tem_st?: number; variantes_json?: JsonMap | null; parametros_json?: JsonMap | null; ativo?: number }>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");

        await client.execute({
          sql: `
            UPDATE st_regras SET destino_codigo = ?, operacao = ?, tem_st = ?, variantes_json = ?, parametros_json = ?, ativo = ?, updated_at = ?
            WHERE id = ? AND empresa_id = ?
          `,
          args: [
            sanitizeString(body.destino_codigo || ""),
            sanitizeString(body.operacao || "INTERNA") || "INTERNA",
            body.tem_st ? 1 : 0,
            body.variantes_json ? JSON.stringify(body.variantes_json) : null,
            body.parametros_json ? JSON.stringify(body.parametros_json) : null,
            body.ativo ? 1 : 0,
            nowIso(),
            id,
            empresa_id,
          ],
        });
        await auditLog({ empresa_id, entidade: "st_regras", entidade_id: id, acao: "UPDATE", payload: body });
        return jsonResponse(request, env, 200, { ok: true, id });
      }

      // ================= CUSTOS LOGÍSTICOS =================
      if (method === "GET" && path === "/v1/custos-logisticos") {
        const empresa_id = sanitizeString(url.searchParams.get("empresa_id"));
        const destino = sanitizeString(url.searchParams.get("destino"));
        const operacao = sanitizeString(url.searchParams.get("operacao"));
        if (!empresa_id) return badRequest(request, env, "Query 'empresa_id' é obrigatória.");

        const rs = await client.execute({
          sql: `
            SELECT id, empresa_id, destino_codigo, operacao, tipo_custo, aplica_em_json, valor, unidade_cobranca, ativo, created_at, updated_at
            FROM custos_logisticos
            WHERE empresa_id = ?
              AND (? = '' OR destino_codigo = ?)
              AND (? = '' OR operacao = ?)
            ORDER BY destino_codigo, tipo_custo
          `,
          args: [empresa_id, destino, destino, operacao, operacao],
        });
        return jsonResponse(request, env, 200, { ok: true, custos: rs.rows });
      }

      if (method === "POST" && path === "/v1/custos-logisticos") {
        const body = await readJson<{ empresa_id?: string; destino_codigo?: string; operacao?: string; tipo_custo?: string; aplica_em_json?: JsonMap | null; valor?: number; unidade_cobranca?: string; ativo?: number }>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        const destino_codigo = sanitizeString(body.destino_codigo || "");
        const operacao = sanitizeString(body.operacao || "INTERNA") || "INTERNA";
        const tipo_custo = sanitizeString(body.tipo_custo || "");
        const unidade_cobranca = sanitizeString(body.unidade_cobranca || "");
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!destino_codigo) return badRequest(request, env, "Campo 'destino_codigo' é obrigatório.");
        if (!tipo_custo) return badRequest(request, env, "Campo 'tipo_custo' é obrigatório.");
        if (!unidade_cobranca) return badRequest(request, env, "Campo 'unidade_cobranca' é obrigatório.");
        if (typeof body.valor !== "number") return badRequest(request, env, "Campo 'valor' deve ser numérico.");

        const id = crypto.randomUUID();
        const ts = nowIso();
        await client.execute({
          sql: `
            INSERT INTO custos_logisticos (id, empresa_id, destino_codigo, operacao, tipo_custo, aplica_em_json, valor, unidade_cobranca, ativo, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            empresa_id,
            destino_codigo,
            operacao,
            tipo_custo,
            body.aplica_em_json ? JSON.stringify(body.aplica_em_json) : null,
            body.valor,
            unidade_cobranca,
            body.ativo ? 1 : 0,
            ts,
            ts,
          ],
        });
        await auditLog({ empresa_id, entidade: "custos_logisticos", entidade_id: id, acao: "CREATE", payload: body });
        return jsonResponse(request, env, 201, { ok: true, id });
      }

      const custoMatch = path.match(/^\/v1\/custos-logisticos\/([^/]+)$/);
      if (custoMatch && method === "PUT") {
        const id = custoMatch[1];
        const body = await readJson<{ empresa_id?: string; destino_codigo?: string; operacao?: string; tipo_custo?: string; aplica_em_json?: JsonMap | null; valor?: number; unidade_cobranca?: string; ativo?: number }>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (typeof body.valor !== "number") return badRequest(request, env, "Campo 'valor' deve ser numérico.");

        await client.execute({
          sql: `
            UPDATE custos_logisticos SET destino_codigo = ?, operacao = ?, tipo_custo = ?, aplica_em_json = ?, valor = ?, unidade_cobranca = ?, ativo = ?, updated_at = ?
            WHERE id = ? AND empresa_id = ?
          `,
          args: [
            sanitizeString(body.destino_codigo || ""),
            sanitizeString(body.operacao || "INTERNA") || "INTERNA",
            sanitizeString(body.tipo_custo || ""),
            body.aplica_em_json ? JSON.stringify(body.aplica_em_json) : null,
            body.valor,
            sanitizeString(body.unidade_cobranca || ""),
            body.ativo ? 1 : 0,
            nowIso(),
            id,
            empresa_id,
          ],
        });
        await auditLog({ empresa_id, entidade: "custos_logisticos", entidade_id: id, acao: "UPDATE", payload: body });
        return jsonResponse(request, env, 200, { ok: true, id });
      }

      // ================= NCM CATEGORIAS =================
      if (method === "GET" && path === "/v1/ncm") {
        const empresa_id = sanitizeString(url.searchParams.get("empresa_id"));
        if (!empresa_id) return badRequest(request, env, "Query 'empresa_id' é obrigatória.");
        const rs = await client.execute({ sql: `SELECT id, empresa_id, nome, ncm, created_at FROM ncm_categorias WHERE empresa_id = ? ORDER BY nome`, args: [empresa_id] });
        return jsonResponse(request, env, 200, { ok: true, categorias: rs.rows });
      }

      if (method === "POST" && path === "/v1/ncm") {
        const body = await readJson<{ empresa_id?: string; nome?: string; ncm?: string }>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        const nome = sanitizeString(body.nome);
        const ncm = sanitizeString(body.ncm);
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!nome) return badRequest(request, env, "Campo 'nome' é obrigatório.");
        if (!ncm) return badRequest(request, env, "Campo 'ncm' é obrigatório.");

        const id = crypto.randomUUID();
        await client.execute({ sql: `INSERT INTO ncm_categorias (id, empresa_id, nome, ncm, created_at) VALUES (?, ?, ?, ?, ?)`, args: [id, empresa_id, nome, ncm, nowIso()] });
        await auditLog({ empresa_id, entidade: "ncm_categorias", entidade_id: id, acao: "CREATE", payload: body });
        return jsonResponse(request, env, 201, { ok: true, id });
      }

      if (method === "POST" && path === "/v1/ncm/bulk") {
        const body = await readJson<{ empresa_id?: string; seeds?: Array<{ nome: string; ncm: string }> }>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        const seeds = body.seeds && Array.isArray(body.seeds) ? body.seeds : [
          { nome: "ARROZ", ncm: "1006.30.21" },
          { nome: "FEIJAO", ncm: "0713.33.19" },
          { nome: "MASSAS", ncm: "1902.19.00" },
        ];

        let inseridos = 0;
        for (const seed of seeds) {
          if (!seed?.nome || !seed?.ncm) continue;
          const id = crypto.randomUUID();
          await client.execute({
            sql: `INSERT OR IGNORE INTO ncm_categorias (id, empresa_id, nome, ncm, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [id, empresa_id, seed.nome, seed.ncm, nowIso()],
          });
          inseridos += 1;
        }
        await auditLog({ empresa_id, entidade: "ncm_categorias", acao: "BULK_SEED", payload: { inseridos, total: seeds.length } });
        return jsonResponse(request, env, 200, { ok: true, inseridos, total: seeds.length });
      }

      // ================= PAUTA ITENS =================
      if (method === "GET" && path === "/v1/pauta-itens") {
        const empresa_id = sanitizeString(url.searchParams.get("empresa_id"));
        const destino_codigo = sanitizeString(url.searchParams.get("destino"));
        const operacao = sanitizeString(url.searchParams.get("operacao"));
        if (!empresa_id) return badRequest(request, env, "Query 'empresa_id' é obrigatória.");

        const rs = await client.execute({
          sql: `
            SELECT pi.id, pi.empresa_id, pi.destino_codigo, pi.operacao, pi.produto_id, pi.pauta_tipo, pi.pauta_preco,
                   pi.percentual_aplicacao, pi.pauta_percentual, pi.mva_pct, pi.aliquota_pct, pi.ativo, pi.created_at, pi.updated_at,
                   p.sku, p.descricao
            FROM pauta_itens pi
            JOIN produtos p ON p.id = pi.produto_id
            WHERE pi.empresa_id = ?
              AND (? = '' OR pi.destino_codigo = ?)
              AND (? = '' OR pi.operacao = ?)
            ORDER BY p.sku
          `,
          args: [empresa_id, destino_codigo, destino_codigo, operacao, operacao],
        });
        return jsonResponse(request, env, 200, { ok: true, itens: rs.rows });
      }

      function validatePauta(body: any) {
        const pauta_tipo = sanitizeString(body.pauta_tipo);
        if (!pauta_tipo) throw new Error("Campo 'pauta_tipo' é obrigatório.");
        if (pauta_tipo === "PRECO") {
          if (typeof body.pauta_preco !== "number") throw new Error("'pauta_preco' é obrigatório para PRECO.");
          if (typeof body.percentual_aplicacao !== "number") throw new Error("'percentual_aplicacao' é obrigatório para PRECO.");
        }
        if (pauta_tipo === "PERCENTUAL") {
          if (typeof body.pauta_percentual !== "number") throw new Error("'pauta_percentual' é obrigatório para PERCENTUAL.");
        }
        if (pauta_tipo === "FORMULA_ESPECIAL") {
          if (typeof body.mva_pct !== "number") throw new Error("'mva_pct' é obrigatório para FORMULA_ESPECIAL.");
          if (typeof body.aliquota_pct !== "number") throw new Error("'aliquota_pct' é obrigatório para FORMULA_ESPECIAL.");
        }
      }

      if (method === "POST" && path === "/v1/pauta-itens") {
        const body = await readJson<any>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        const destino_codigo = sanitizeString(body.destino_codigo || body.destino || "");
        const operacao = sanitizeString(body.operacao || "INTERNA") || "INTERNA";
        const produto_id = sanitizeString(body.produto_id);
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        if (!destino_codigo) return badRequest(request, env, "Campo 'destino_codigo' é obrigatório.");
        if (!produto_id) return badRequest(request, env, "Campo 'produto_id' é obrigatório.");

        try { validatePauta(body); } catch (e: any) { return badRequest(request, env, e.message); }

        const id = crypto.randomUUID();
        const ts = nowIso();
        await client.execute({
          sql: `
            INSERT INTO pauta_itens (
              id, empresa_id, destino_codigo, operacao, produto_id, pauta_tipo, pauta_preco, percentual_aplicacao,
              pauta_percentual, mva_pct, aliquota_pct, ativo, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            empresa_id,
            destino_codigo,
            operacao,
            produto_id,
            sanitizeString(body.pauta_tipo),
            body.pauta_preco ?? null,
            body.percentual_aplicacao ?? null,
            body.pauta_percentual ?? null,
            body.mva_pct ?? null,
            body.aliquota_pct ?? null,
            body.ativo ? 1 : 0,
            ts,
            ts,
          ],
        });
        await auditLog({ empresa_id, entidade: "pauta_itens", entidade_id: id, acao: "CREATE", payload: body });
        return jsonResponse(request, env, 201, { ok: true, id });
      }

      const pautaMatch = path.match(/^\/v1\/pauta-itens\/([^/]+)$/);
      if (pautaMatch && method === "PUT") {
        const id = pautaMatch[1];
        const body = await readJson<any>(request);
        const empresa_id = sanitizeString(body.empresa_id);
        if (!empresa_id) return badRequest(request, env, "Campo 'empresa_id' é obrigatório.");
        try { validatePauta(body); } catch (e: any) { return badRequest(request, env, e.message); }

        await client.execute({
          sql: `
            UPDATE pauta_itens SET destino_codigo = ?, operacao = ?, produto_id = ?, pauta_tipo = ?, pauta_preco = ?, percentual_aplicacao = ?,
              pauta_percentual = ?, mva_pct = ?, aliquota_pct = ?, ativo = ?, updated_at = ?
            WHERE id = ? AND empresa_id = ?
          `,
          args: [
            sanitizeString(body.destino_codigo || ""),
            sanitizeString(body.operacao || "INTERNA") || "INTERNA",
            sanitizeString(body.produto_id || ""),
            sanitizeString(body.pauta_tipo),
            body.pauta_preco ?? null,
            body.percentual_aplicacao ?? null,
            body.pauta_percentual ?? null,
            body.mva_pct ?? null,
            body.aliquota_pct ?? null,
            body.ativo ? 1 : 0,
            nowIso(),
            id,
            empresa_id,
          ],
        });
        await auditLog({ empresa_id, entidade: "pauta_itens", entidade_id: id, acao: "UPDATE", payload: body });
        return jsonResponse(request, env, 200, { ok: true, id });
      }

      return jsonResponse(request, env, 404, { ok: false, error: "Rota não encontrada." });
    } catch (err: any) {
      return serverError(request, env, err?.message || "Erro inesperado.");
    }
  },
};
