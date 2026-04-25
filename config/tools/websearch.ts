import { tool } from "../node_modules/@opencode-ai/plugin/dist/index.js"

const DEFAULT_LIMIT = 5

export default tool({
  description:
    "Search the web using local SearXNG. Always pass the search terms as the 'query' argument — never call this tool without a query.",
  args: {
    query: tool.schema
      .string()
      .describe("The search terms to look up, extracted from the user's request. Required — must be non-empty."),
    site: tool.schema
      .string()
      .optional()
      .describe("Restrict results to this domain (e.g. 'react.dev' or 'docs.example.com')"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of results to return (default 5, max 10)"),
  },
  async execute(args) {
    const query = (args.query ?? "").trim()
    const site = (args.site ?? "").trim()
    if (!query && !site) {
      throw new Error("websearch requires a non-empty query")
    }
    const fullQuery = site
      ? query ? `${query} site:${site}` : `site:${site}`
      : query

    const limit = Math.max(1, Math.min(10, Math.floor(args.limit ?? DEFAULT_LIMIT)))
    const searxBase = process.env.OPENCODE_SEARXNG_URL || "http://searxng:8080"

    const endpoint = new URL("/search", searxBase)
    endpoint.searchParams.set("q", fullQuery)
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
        query: fullQuery,
        site: site || undefined,
        limit,
        results,
      },
      null,
      2,
    )
  },
})
