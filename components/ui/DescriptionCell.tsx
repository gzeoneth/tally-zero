export function DescriptionCell({ mdxContent }: { mdxContent: string }) {
  const stripMarkdownAndHtml = (text: string) => {
    // Remove HTML tags first
    const withoutHtml = text.replace(/<[^>]*>/g, "");
    // Remove markdown syntax
    return withoutHtml.replace(/(\[.*?\]\(.*?\)|[*_`#>])/g, "");
  };

  const truncateText = (text: string, maxLength = 100) => {
    return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
  };

  const plainText = truncateText(stripMarkdownAndHtml(mdxContent));

  return (
    <span className="max-w-[500px] truncate font-medium">{plainText}</span>
  );
}
