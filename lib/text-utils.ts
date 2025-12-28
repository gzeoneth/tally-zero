/**
 * Strips HTML tags and markdown syntax from text
 */
export function stripMarkdownAndHtml(text: string): string {
  // Remove HTML tags first
  const withoutHtml = text.replace(/<[^>]*>/g, "");
  // Remove markdown syntax
  return withoutHtml.replace(/(\[.*?\]\(.*?\)|[*_`#>])/g, "");
}

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength = 100): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}
