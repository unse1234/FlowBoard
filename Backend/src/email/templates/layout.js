/**
 * The frame every FlowBoard email shares, and the escaping that keeps it safe.
 *
 * Each template gives a heading, paragraphs and at most one button, and gets
 * back an HTML and a plain-text body saying the same thing. Mail clients that
 * show only text, and people who prefer it, lose nothing.
 *
 * **Everything interpolated is escaped.** A display name is chosen by whoever
 * signed up, and an email is HTML. An unescaped name could add a link or
 * restyle the message into something that is not from FlowBoard.
 */

const HTML_ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * @param {Object} content
 * @param {string} content.heading
 * @param {string[]} content.paragraphs  plain text; escaped here
 * @param {{ label: string, url: string } | null} [content.action]
 * @param {string[]} [content.footer]  plain text, after the button
 * @returns {{ html: string, text: string }}
 */
function renderEmail({ heading, paragraphs, action = null, footer = [] }) {
  const paragraphHtml = (text) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1f2328">${escapeHtml(text)}</p>`;

  const actionHtml = action
    ? `<p style="margin:24px 0">` +
      `<a href="${escapeHtml(action.url)}" style="display:inline-block;padding:11px 20px;border-radius:8px;` +
      `background:#1f2328;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">` +
      `${escapeHtml(action.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#59636e">` +
      `Or paste this link into your browser:<br>` +
      `<span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";

  const footerHtml = footer
    .map((text) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#59636e">${escapeHtml(text)}</p>`)
    .join("");

  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8fa;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">` +
    `<div style="max-width:520px;margin:0 auto;padding:32px;background:#ffffff;border-radius:12px">` +
    `<p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:0.04em;color:#1f2328">FlowBoard</p>` +
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1f2328">${escapeHtml(heading)}</h1>` +
    paragraphs.map(paragraphHtml).join("") +
    actionHtml +
    (footerHtml ? `<hr style="margin:24px 0;border:0;border-top:1px solid #d1d9e0">${footerHtml}` : "") +
    `</div></body></html>`;

  const text = [
    heading,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    ...(footer.length ? ["--", ...footer] : []),
  ]
    .join("\n")
    .trimEnd();

  return { html, text };
}

module.exports = {
  escapeHtml,
  renderEmail,
};
