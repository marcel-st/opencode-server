import { tool } from "../node_modules/@opencode-ai/plugin/dist/index.js"

const DEFAULT_LIMIT = 5

export default tool({
  description:
    "Search the web using local SearXNG and return top results with URLs and snippets.",
  args: {
    query: tool.schema
      .string()
      .optional()
      .describe("Search query text"),
    q: tool.schema
      .string()
      .optional()
      .describe("Alias for query"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of results to return"),
  },
  async execute(args) {
    const query = (args.query ?? args.q ?? "").trim()
    if (!query) {
      throw new Error("websearch requires a query")
    }

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
        limit,
        results,
      },
      null,
      2,
    )
  },
})