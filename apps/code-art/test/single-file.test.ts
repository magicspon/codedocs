import { describe, expect, it } from 'vitest'
import { POLICY, singleFile } from '../scripts/single-file.ts'

const BUILT = [
  '<html><head>',
  '<script type="module" crossorigin src="./assets/index-a.b.js"></script>',
  '<link rel="stylesheet" crossorigin href="./assets/index-c.css">',
  '</head><body></body></html>',
].join('\n')

describe('singleFile', () => {
  it('inlines the script and the stylesheet where they were linked', () => {
    const page = singleFile(BUILT, [
      { name: 'assets/index-a.b.js', kind: 'script', text: 'run()' },
      { name: 'assets/index-c.css', kind: 'style', text: 'a{}' },
    ])
    expect(page).toContain('<script type="module">run()</script>')
    expect(page).toContain('<style>a{}</style>')
    expect(page).not.toContain('assets/')
  })

  it('puts the no-request policy in the head', () => {
    const page = singleFile(BUILT, [])
    expect(page).toContain(`content="${POLICY}"`)
    expect(POLICY).toMatch(/^default-src 'none';/)
  })

  it('keeps code holding `</script>` or `$&` intact and inside its tag', () => {
    const page = singleFile(BUILT, [
      { name: 'assets/index-a.b.js', kind: 'script', text: 'x("</script>$&")' },
    ])
    expect(page).toContain('<script type="module">x("<\\/script>$&")</script>')
  })

  it('reads a dot in a name as a dot, not as any character', () => {
    const page = singleFile(BUILT, [
      { name: 'assets/index-aXb.js', kind: 'script', text: 'wrong()' },
    ])
    expect(page).not.toContain('wrong()')
  })
})
