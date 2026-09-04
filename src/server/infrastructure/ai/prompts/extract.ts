export function buildExtractPagePrompt(input: {
  sourceUrl: string;
  pageTitle?: string;
  cleanedText: string;
}): string {
  return [
    "Extract structured company, people, contact, and business signal facts from the webpage text below.",
    "Only include facts explicitly supported by the provided text.",
    "Do not invent missing names, titles, emails, or signals.",
    "Return evidence spans when possible.",
    "",
    `Source URL: ${input.sourceUrl}`,
    input.pageTitle ? `Page title: ${input.pageTitle}` : "",
    "",
    "Webpage text:",
    input.cleanedText,
  ]
    .filter(Boolean)
    .join("\n");
}
