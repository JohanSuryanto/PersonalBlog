import axe from 'axe-core'
import { expect } from 'vitest'

export async function expectNoA11yViolations(container: Element) {
  // color-contrast needs real layout, which jsdom does not have.
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
