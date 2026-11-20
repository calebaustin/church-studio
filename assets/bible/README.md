# World English Bible

`web.json.gz` holds the 66 books of the World English Bible, unchanged, from eBible.org (eng-web, verse per line).
The World English Bible is in the public domain. "World English Bible" is a trademark of eBible.org: if the text
is ever changed, it must not be called the World English Bible.

Church Studio uses it only to check Bible references and show their exact wording, never to interpret them.
Format: `{ name, source, books: [{ name, ch: [[verse1, verse2, ...], ...] }] }`.
