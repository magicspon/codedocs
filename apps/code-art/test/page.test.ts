import { describe, expect, it } from 'vitest'
import { artPage } from '../scripts/page.ts'
import { atlas } from './fixture.ts'

const VIEWER =
  '<body><div id="root"></div>\n<!-- codedocs-art:data -->\n</body>'

/** The JSON inside the block named `name`, read back as the viewer reads it. */
function readBack(page: string, name: string): unknown {
  const match = new RegExp(
    `<script type="application/json" data-dataset="${name}">(.*?)</script>`,
  ).exec(page)
  return match ? JSON.parse(match[1]!) : undefined
}

describe('artPage', () => {
  it('writes each dataset as its own block, in place of the marker', () => {
    const page = artPage(VIEWER, { one: atlas(), two: atlas() })
    expect(page).not.toContain('codedocs-art:data')
    expect(readBack(page, 'one')).toEqual(atlas())
    expect(readBack(page, 'two')).toEqual(atlas())
  })

  it('keeps a path holding `</script>` from closing the block', () => {
    const data = atlas()
    const hostile = {
      ...data,
      files: [{ ...data.files[0]!, path: 'a/</script><b>$&.ts' }],
    }
    const page = artPage(VIEWER, { x: hostile })
    expect(page.match(/<\/script>/g)).toHaveLength(1)
    expect(readBack(page, 'x')).toEqual(hostile)
  })

  it('escapes a name that would break out of its attribute', () => {
    const page = artPage(VIEWER, { 'a"b&c': atlas() })
    expect(page).toContain('data-dataset="a&quot;b&amp;c"')
  })

  it('refuses a page that is not the embed build', () => {
    expect(() => artPage('<body></body>', {})).toThrow(/embed build/)
  })
})
