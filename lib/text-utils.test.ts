import { describe, expect, it } from "vitest";

import { stripMarkdownAndHtml, truncateText } from "./text-utils";

describe("text-utils", () => {
  describe("stripMarkdownAndHtml", () => {
    it("removes HTML tags", () => {
      expect(stripMarkdownAndHtml("<p>Hello</p>")).toBe("Hello");
      expect(stripMarkdownAndHtml("<div><span>Test</span></div>")).toBe("Test");
    });

    it("removes HTML attributes", () => {
      expect(stripMarkdownAndHtml('<a href="test">Link</a>')).toBe("Link");
      expect(stripMarkdownAndHtml('<img src="image.png" alt="Alt text">')).toBe(
        ""
      );
    });

    it("removes markdown bold syntax", () => {
      expect(stripMarkdownAndHtml("**bold text**")).toBe("bold text");
      expect(stripMarkdownAndHtml("__bold text__")).toBe("bold text");
    });

    it("removes markdown italic syntax", () => {
      expect(stripMarkdownAndHtml("*italic*")).toBe("italic");
      expect(stripMarkdownAndHtml("_italic_")).toBe("italic");
    });

    it("removes markdown links", () => {
      expect(stripMarkdownAndHtml("[link text](https://example.com)")).toBe("");
      expect(stripMarkdownAndHtml("[GitHub](https://github.com)")).toBe("");
    });

    it("removes markdown code syntax", () => {
      expect(stripMarkdownAndHtml("`code`")).toBe("code");
      expect(stripMarkdownAndHtml("```\ncode block\n```")).toBe(
        "\ncode block\n"
      );
    });

    it("removes markdown headers", () => {
      expect(stripMarkdownAndHtml("# Header")).toBe(" Header");
      expect(stripMarkdownAndHtml("## Subheader")).toBe(" Subheader");
    });

    it("removes markdown blockquotes", () => {
      expect(stripMarkdownAndHtml("> Quote")).toBe(" Quote");
    });

    it("handles empty string", () => {
      expect(stripMarkdownAndHtml("")).toBe("");
    });

    it("handles plain text", () => {
      expect(stripMarkdownAndHtml("Plain text")).toBe("Plain text");
    });

    it("handles mixed content", () => {
      const input = "<p>**Bold** and *italic* with [link](url)</p>";
      const result = stripMarkdownAndHtml(input);
      expect(result).toBe("Bold and italic with ");
    });
  });

  describe("truncateText", () => {
    it("truncates text longer than maxLength", () => {
      const text = "This is a long text that needs to be truncated";
      expect(truncateText(text, 20)).toBe("This is a long text ...");
    });

    it("keeps text shorter than maxLength unchanged", () => {
      const text = "Short text";
      expect(truncateText(text, 20)).toBe("Short text");
    });

    it("truncates text equal to maxLength", () => {
      const text = "12345";
      expect(truncateText(text, 5)).toBe("12345");
    });

    it("uses default maxLength of 100", () => {
      const shortText = "Short";
      expect(truncateText(shortText)).toBe("Short");

      const longText = "a".repeat(150);
      expect(truncateText(longText)).toBe("a".repeat(100) + "...");
    });

    it("handles empty string", () => {
      expect(truncateText("")).toBe("");
      expect(truncateText("", 10)).toBe("");
    });

    it("handles maxLength of 0", () => {
      expect(truncateText("Hello", 0)).toBe("...");
    });

    it("handles maxLength of 1", () => {
      expect(truncateText("Hello", 1)).toBe("H...");
    });
  });
});
