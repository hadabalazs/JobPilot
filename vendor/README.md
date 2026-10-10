# Vendored runtime libraries

These files are deployed locally; no runtime CDN dependency is needed.

- `supabase-2.117.3.js`: `@supabase/supabase-js` 2.117.3, UMD distribution fetched from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js`.
- SHA-256: `d6a5c4414a5d4ce646d9c1de223aa7067d3ff664c15394ffeb7fcffc763354a3`.
- Upstream MIT license is in `SUPABASE-LICENSE.txt`, retrieved from the matching upstream Git tag.

Preact, its hooks, htm and jsPDF were inherited from the existing application. Preserve their files and embedded notices; establish their exact upstream versions before upgrading rather than inferring versions from filenames.
