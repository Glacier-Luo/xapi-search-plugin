import { describe, it, expect } from "vitest";
import { transformResults } from "./web-search.js";

describe("transformResults", () => {
  it("returns empty array for empty data", () => {
    expect(transformResults({})).toEqual([]);
  });

  it("maps organic results to SearchResult format", () => {
    const results = transformResults({
      organic: [
        { title: "Apple", link: "https://apple.com", snippet: "Official site" },
        { title: "Wiki", link: "https://en.wikipedia.org/wiki/Apple", snippet: "Apple Inc." },
      ],
    });

    expect(results).toEqual([
      { title: "Apple", url: "https://apple.com", snippet: "Official site" },
      { title: "Wiki", url: "https://en.wikipedia.org/wiki/Apple", snippet: "Apple Inc." },
    ]);
  });

  it("inserts knowledgeGraph as first result when title and description exist", () => {
    const results = transformResults({
      knowledgeGraph: {
        title: "Apple",
        description: "Apple Inc. is a technology company",
        descriptionLink: "https://en.wikipedia.org/wiki/Apple_Inc.",
      },
      organic: [
        { title: "Apple", link: "https://apple.com", snippet: "Official site" },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Apple",
      url: "https://en.wikipedia.org/wiki/Apple_Inc.",
      snippet: "Apple Inc. is a technology company",
    });
    expect(results[1]).toEqual({
      title: "Apple",
      url: "https://apple.com",
      snippet: "Official site",
    });
  });

  it("uses empty string for knowledgeGraph url when descriptionLink is missing", () => {
    const results = transformResults({
      knowledgeGraph: {
        title: "Test",
        description: "A description",
      },
    });

    expect(results).toEqual([
      { title: "Test", url: "", snippet: "A description" },
    ]);
  });

  it("skips knowledgeGraph when title is missing", () => {
    const results = transformResults({
      knowledgeGraph: {
        description: "No title here",
      },
      organic: [
        { title: "Result", link: "https://example.com", snippet: "A result" },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Result");
  });

  it("skips knowledgeGraph when description is missing", () => {
    const results = transformResults({
      knowledgeGraph: {
        title: "Has title but no description",
      },
    });

    expect(results).toEqual([]);
  });

  it("ignores peopleAlsoAsk and relatedSearches", () => {
    const results = transformResults({
      organic: [
        { title: "R1", link: "https://example.com", snippet: "S1" },
      ],
      peopleAlsoAsk: [
        { question: "Q?", snippet: "A", title: "T", link: "https://q.com" },
      ],
      relatedSearches: [
        { query: "related query" },
      ],
    });

    expect(results).toHaveLength(1);
  });

  it("handles organic results with optional fields (position, date, sitelinks)", () => {
    const results = transformResults({
      organic: [
        {
          title: "Full",
          link: "https://example.com",
          snippet: "Full result",
          position: 1,
          date: "3 days ago",
          sitelinks: [{ title: "Sub", link: "https://example.com/sub" }],
        },
      ],
    });

    expect(results).toEqual([
      { title: "Full", url: "https://example.com", snippet: "Full result" },
    ]);
  });
});
