import { tool } from "../node_modules/@opencode-ai/plugin/dist/index.js"

export default tool({
  description: "Search the web (google:search compatibility alias) and return concise result snippets. Provide a query, or a site domain, or both.",
  args: {
    query: tool.schema.string().optional().describe("Search query text (e.g. 'useEffect hook')"),
    q: tool.schema.string().optional().describe("Alias for query"),
    site: tool.schema.string().optional().describe("Restrict results to this domain (e.g. 'react.dev')"),
    limit: tool.schema
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Max results (default 5)"),
  },
  async execute(input: { query?: string; q?: string; site?: string; limit?: number }) {
    const baseQuery = (input.query ?? input.q ?? "").trim()
    const site = (input.site ?? "").trim()
    if (!baseQuery && !site) {
      throw new Error("google:search requires at least a query or a site parameter")
    }
    const query = site
      ? baseQuery ? `${baseQuery} site:${site}` : `site:${site}`
      : baseQuery

    const limit = input.limit ?? 5
    const base = process.env.OPENCODE_SEARXNG_URL || process.env.SEARXNG_BASE_URL || "http://searxng:8080"
    const url = new URL("/search", base)
    url.searchParams.set("q", query)
    url.searchParams.set("format", "json")

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      throw new Error(`SearXNG request failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>
      number_of_results?: number
    }

    const items = (data.results ?? []).slice(0, limit).map((result, index) => ({
      index: index + 1,
      title: result.title ?? "Untitled",
      url: result.url ?? "",
      snippet: result.content ?? "",
    }))

    return JSON.stringify(
      {
        query,
        total: data.number_of_results ?? items.length,
        count: items.length,
        results: items,
      },
      null,
      2,
    )
  },
})