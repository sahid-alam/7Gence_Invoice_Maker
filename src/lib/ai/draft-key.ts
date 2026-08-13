/**
 * Where a composed draft waits while the browser navigates to the invoice form.
 *
 * sessionStorage rather than the URL: line items would make an unreadable query
 * string, and a draft is not something anyone wants to bookmark or share. It is
 * read once and deleted, so a refresh gives a blank form rather than silently
 * re-filling one the person had already cleared.
 */
export const AI_DRAFT_KEY = "7g:ai-draft";
