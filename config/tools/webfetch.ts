import { tool } from "../node_modules/@opencode-ai/plugin/dist/index.js"

const MAX_RESPONSE_CHARS = 15000

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
  description: "Fetch a URL and return its text content. If the input is not a URL, run a SearXNG search instead.",
  args: {
    url: tool.schema
      .string()
      .describe("URL to fetch, or a plain-text search query if not a URL"),
  },
  async execute(args) {
    const input = args.url.trim()
    const isUrl = /^https?:\/\//i.test(input)

    if (!isUrl) {
      const searxBase = process.env.OPENCODE_SEARXNG_URL || "http://searxng:8080"
      const endpoint = new URL("/search", searxBase)
      endpoint.searchParams.set("q", input)
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

      return formatSearchResults(input, results)
    }

    const response = await fetch(input, { redirect: "follow" })
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get("content-type") || ""
    const body = await response.text()
    const text = contentType.includes("text/html") ? htmlToText(body) : body

    return truncate(text)
  },
})
