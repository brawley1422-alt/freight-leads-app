#!/usr/bin/env python3
"""
render_pdf.py — convert a markdown lead report to an editorial PDF.

Usage:
    ./render_pdf.py reports/2026-04-15.md [reports/2026-04-15.pdf]
"""
import sys
import re
import pathlib
import markdown
from weasyprint import HTML, CSS

CSS_TEMPLATE = """
@page {
  size: Letter;
  margin: 0.75in 0.8in 1in 0.8in;
  @bottom-left {
    content: "RESOLVE LOGISTICS  ·  DAILY LEAD BRIEF";
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 8pt;
    letter-spacing: 0.12em;
    color: #8a8478;
  }
  @bottom-right {
    content: counter(page) " / " counter(pages);
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 8pt;
    color: #8a8478;
  }
}

@page :first {
  margin-top: 1.2in;
}

html {
  font-family: "Helvetica Neue", "Arial", sans-serif;
  font-size: 10pt;
  line-height: 1.55;
  color: #1a1a1a;
  background: #f7f3ec;
}

body {
  background: #f7f3ec;
}

/* Letterhead — first H1 */
h1 {
  font-family: "Palatino Linotype", "Book Antiqua", Georgia, serif;
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.15;
  color: #1a1a1a;
  margin: 0 0 0.3in 0;
  padding-bottom: 0.15in;
  border-bottom: 3px double #c8441e;
}

h1::before {
  content: "RESOLVE  ·  FREIGHT LEAD BRIEF";
  display: block;
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.25em;
  color: #c8441e;
  margin-bottom: 10pt;
}

h2 {
  font-family: "Palatino Linotype", "Book Antiqua", Georgia, serif;
  font-size: 15pt;
  font-weight: 700;
  color: #1a1a1a;
  margin: 28pt 0 10pt 0;
  padding-bottom: 4pt;
  border-bottom: 1px solid #1a1a1a;
  page-break-after: avoid;
}

h3 {
  font-family: "Palatino Linotype", "Book Antiqua", Georgia, serif;
  font-size: 12.5pt;
  font-weight: 700;
  color: #1a1a1a;
  margin: 18pt 0 6pt 0;
  page-break-after: avoid;
}

h3::before {
  content: "▪ ";
  color: #c8441e;
}

p {
  margin: 0 0 8pt 0;
  orphans: 3;
  widows: 3;
}

strong { font-weight: 700; color: #1a1a1a; }
em { font-style: italic; color: #3d3a35; }

a {
  color: #c8441e;
  text-decoration: underline;
  text-decoration-thickness: 0.75pt;
  text-underline-offset: 1.5pt;
}

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 10pt 0 14pt 0;
  font-size: 8.5pt;
  page-break-inside: avoid;
}

th {
  background: #1a1a1a;
  color: #f7f3ec;
  text-align: left;
  padding: 6pt 7pt;
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

td {
  padding: 6pt 7pt;
  border-bottom: 1px solid #e0d9ca;
  vertical-align: top;
}

tr:nth-child(even) td { background: #efeadd; }

/* Blockquote — intro note */
blockquote {
  margin: 12pt 0;
  padding: 10pt 14pt;
  background: #efeadd;
  border-left: 3pt solid #c8441e;
  font-size: 9.5pt;
  font-style: italic;
  color: #3d3a35;
}

blockquote p { margin: 0; }

/* Lists */
ul, ol {
  margin: 6pt 0 10pt 0;
  padding-left: 18pt;
}

li { margin-bottom: 3pt; }

/* HR — editorial divider */
hr {
  border: none;
  border-top: 1px solid #c8bfa8;
  margin: 18pt 0;
  text-align: center;
}

hr::after {
  content: "◆";
  display: inline-block;
  position: relative;
  top: -8pt;
  background: #f7f3ec;
  padding: 0 8pt;
  color: #c8441e;
  font-size: 8pt;
}

/* Keep lead detail cards together when possible */
h3 + p, h3 + p + p { page-break-inside: avoid; }

/* Code / emphasis treatment for "ICP Fit" style labels */
p strong:first-child { color: #c8441e; }
"""


def render(md_path: pathlib.Path, pdf_path: pathlib.Path) -> None:
    md_text = md_path.read_text()

    # Convert markdown to HTML
    html_body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"],
    )

    # Post-process: make bare URLs in details section clickable if they aren't already
    # (the model usually already outputs markdown links, so this is a safety net)
    html_body = re.sub(
        r'(?<!["\'>=])(https?://[^\s<>"\']+)',
        r'<a href="\1">\1</a>',
        html_body,
    )

    html_doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Freight Lead Brief</title></head>
<body>{html_body}</body></html>"""

    HTML(string=html_doc).write_pdf(
        pdf_path,
        stylesheets=[CSS(string=CSS_TEMPLATE)],
    )


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: render_pdf.py input.md [output.pdf]", file=sys.stderr)
        sys.exit(1)
    md_path = pathlib.Path(sys.argv[1])
    pdf_path = (
        pathlib.Path(sys.argv[2])
        if len(sys.argv) > 2
        else md_path.with_suffix(".pdf")
    )
    render(md_path, pdf_path)
    print(f"wrote {pdf_path} ({pdf_path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
