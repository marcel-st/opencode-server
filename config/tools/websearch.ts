import { tool } from "../node_modules/@opencode-ai/plugin/dist/index.js"

const DEFAULT_LIMIT = 5

export default tool({
  description:
    "Search the web using local SearXNG and return top results with URLs and snippets. Provide a query, or a site domain, or both.",
  args: {
    query: tool.schema
      .string()
      .optional()
      .describe("Search query text (e.g. 'useEffect hook')"),
    q: tool.schema
      .string()
      .optional()
      .describe("Alias for query"),
    site: tool.schema
      .string()
      .optional()
      .describe("Restrict results to this domain (e.g. 'react.dev' or 'docs.example.com')"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of results to return"),
  },
  async execute(args) {
    const baseQuery = (args.query ?? args.q ?? "").trim()
    const site = (args.site ?? "").trim()
    if (!baseQuery && !site) {
      throw new Error("websearch requires at least a query or a site parameter")
    }
    const query = site
      ? baseQuery ? `${baseQuery} site:${site}` : `site:${site}`
      : baseQuery

    const limit = Math.max(1, Math.min(10, Math.floor(args.limit ?? DEFAULT_LIMIT)))
    const searxBase = process.env.OPENCODE_SEARXNG_URL || "http://searxng:8080"

    const endpoint = new URL("/search", searxBase)
    endpoint.searchParams.set("q", query)
    endpoint.searchParams.set("format", "json")

    const response = await fetch(endpoint.toString(), {
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      throw new Error(`SearXNG request failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>
    }

    const results = (data.results || []).slice(0, limit).map((item, index) => ({
      rank: index + 1,
      title: item.title || "(untitled)",
      url: item.url || "",
      snippet: item.content || "",
    }))

    return JSON.stringify(
      {
        mode: "searxng-search",
        query,
        site: site || undefined,
        limit,
        results,
      },
      null,
      2,
    )
  },
})