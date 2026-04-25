import { tool } from "@opencode-ai/plugin"

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
    "Fetch a URL. If the input is not a URL, run a SearXNG search and return top results.",
  args: {
    url: tool.schema
      .string()
      .optional()
      .describe("URL to fetch, or a plain-text search query"),
    query: tool.schema
      .string()
      .optional()
      .describe("Optional explicit search query"),
  },
  async execute(args) {
    const rawInput = (args.url ?? args.query ?? "").trim()
    if (!rawInput) {
      throw new Error("webfetch requires either url or query")
    }

    const isUrl = /^https?:\/\//i.test(rawInput)

    if (!isUrl) {
      const searxBase = process.env.OPENCODE_SEARXNG_URL || "http://searxng:8080"
      const endpoint = new URL("/search", searxBase)
      endpoint.searchParams.set("q", rawInput)
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
          query: rawInput,
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