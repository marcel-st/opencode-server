import { tool } from "../node_modules/@opencode-ai/plugin/dist/index.js"

const MAX_RESPONSE_CHARS = 15000

function htmlToText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function truncate(input: string): string {
  if (input.length <= MAX_RESPONSE_CHARS) return input
  return `${input.slice(0, MAX_RESPONSE_CHARS)}\n\n[truncated]`
}

export default tool({
  description:
    "Fetch a URL and return its content. If you also provide a query, or if the input is not a URL, a SearXNG site search is performed instead. Use this to search documentation on a specific site.",
  args: {
    url: tool.schema
      .string()
      .optional()
      .describe("URL to fetch, a site domain (e.g. 'docs.example.com'), or a plain-text search query"),
    query: tool.schema
      .string()
      .optional()
      .describe("Search terms to look up — when combined with a URL/domain this performs a site-specific search"),
  },
  async execute(args) {
    const rawInput = (args.url ?? "").trim()
    const explicitQuery = (args.query ?? "").trim()
    if (!rawInput && !explicitQuery) {
      throw new Error("webfetch requires either url or query")
    }

    const isUrl = /^https?:\/\//i.test(rawInput)

    // Site-specific search: URL/domain provided together with a query
    if (isUrl && explicitQuery) {
      const searxBase = process.env.OPENCODE_SEARXNG_URL || "http://searxng:8080"
      const endpoint = new URL("/search", searxBase)
      const domain = new URL(rawInput).hostname
      endpoint.searchParams.set("q", `${explicitQuery} site:${domain}`)
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

      const results = (data.results || []).slice(0, 5).map((item, index) => ({
        rank: index + 1,
        title: item.title || "(untitled)",
        url: item.url || "",
        snippet: item.content || "",
      }))

      return JSON.stringify({ mode: "searxng-search", query: `${explicitQuery} site:${domain}`, results }, null, 2)
    }

    // Plain search: no URL, or explicit query only
    if (!isUrl) {
      const searchQuery = explicitQuery || rawInput
      const searxBase = process.env.OPENCODE_SEARXNG_URL || "http://searxng:8080"
      const endpoint = new URL("/search", searxBase)
      endpoint.searchParams.set("q", searchQuery)
      endpoint.searchParams.set("format", "json")

      const response = await fetch(endpoint.toString(), {
        headers: { Accept: "application/json" },
      })

      if (!response.ok) {
        throw new Error(
          `SearXNG request failed: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>
      }

      const results = (data.results || []).slice(0, 5).map((item, index) => ({
        rank: index + 1,
        title: item.title || "(untitled)",
        url: item.url || "",
        snippet: item.content || "",
      }))

      return JSON.stringify(
        {
          mode: "searxng-search",
          query: searchQuery,
          results,
        },
        null,
        2,
      )
    }

    const response = await fetch(rawInput, { redirect: "follow" })
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get("content-type") || ""
    const body = await response.text()
    const text = contentType.includes("text/html") ? htmlToText(body) : body

    return truncate(text)
  },
})