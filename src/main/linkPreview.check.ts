import assert from 'node:assert'
import { parseLinkPreview, fetchLinkPreview } from './linkPreview'

const html = `<!doctype html><html><head>
<meta charset="utf-8"><title>대체 제목 &amp; 기타</title>
<meta property="og:title" content="BlockNote &#8212; 블록 에디터">
<meta name="description" content="일반 설명">
<meta property="og:description" content="OG 설명이 우선">
<meta property="og:image" content="/img/cover.png">
<meta property="og:site_name" content="BlockNote">
<link rel="icon" href="/favicon.ico">
</head><body>…</body></html>`

const p = parseLinkPreview(html, 'https://www.blocknotejs.org/docs')
assert.equal(p.title, 'BlockNote — 블록 에디터', 'og:title wins; entities decoded')
assert.equal(p.description, 'OG 설명이 우선')
assert.equal(p.image, 'https://www.blocknotejs.org/img/cover.png', 'relative image made absolute')
assert.equal(p.site, 'BlockNote')

const bare = parseLinkPreview('<title>Only a title</title>', 'https://example.com/a')
assert.deepEqual(bare, { url: 'https://example.com/a', title: 'Only a title', description: '', image: '', site: 'example.com' })
assert.equal(parseLinkPreview('<meta property="og:image" content="javascript:alert(1)">', 'https://x.com').image, '', 'only http(s) images')

async function main(): Promise<void> {
  await assert.rejects(fetchLinkPreview('file:///etc/passwd'), /http/)
  await assert.rejects(fetchLinkPreview('not a url'), /주소/)
  // Unreachable pages still produce a usable bookmark (just the URL).
  const offline = await fetchLinkPreview('https://example.com/page', async () => {
    throw new Error('offline')
  })
  assert.deepEqual(offline, { url: 'https://example.com/page', title: 'example.com/page', description: '', image: '', site: 'example.com' })
  console.log('link preview: all assertions passed')
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
