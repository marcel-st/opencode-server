import { tool } from "../node_modules/@opencode-ai/plugin/dist/index.js"

const DEFAULT_LIMIT = 5

function formatSearchResults(
  query: string,
  results: Array<{ rank: number; title: string; url: string; snippet: string }>,
): string {
  if (results.length === 0) return `No search results found for "${query}".`

  return [
    `Search results for "${query}":`,
    "",
    ...results.map(result => [
      `${result.rank}. ${result.title}`,
      `   URL: ${result.url || "(no URL)"}`,
      `   Snippet: ${result.snippet || "No snippet available."}`,
    ].join("\n")),
  ].join("\n")
}

export default tool({
  description: "Search the web using local SearXNG and return top results with URLs and snippets.",
  args: {
    query: tool.schema
      .string()
      .describe("Search query text"),
    site: tool.schema
      .string()
      .optional()
      .describe("Restrict results to this domain (e.g. 'docs.example.com')"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of results to return (default 5, max 10)"),
  },
  async execute(args) {
    const query = args.query.trim()
    const site = (args.site ?? "").trim()
    const fullQuery = site ? `${query} site:${site}` : query
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

    return formatSearchResults(fullQuery, results)
  },
})
