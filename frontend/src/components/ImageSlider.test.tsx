import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { expectNoA11yViolations } from '../test-utils'
import { ImageSlider } from './ImageSlider'

const images = Array.from({ length: 5 }, (_, i) => ({
  publicId: `blog/img${i}`,
  width: 800,
  height: 600,
  altText: i === 0 ? 'A sunset' : null,
}))

describe('ImageSlider', () => {
  it('shows a live position counter and moves with buttons', async () => {
    render(<ImageSlider images={images} title="Trip" />)
    const counter = screen.getByText('1 / 5')
    expect(counter).toHaveAttribute('aria-live', 'polite')

    await userEvent.click(screen.getByRole('button', { name: 'Next image' }))
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous image' }))
    expect(screen.getByText('1 / 5')).toBeInTheDocument()
  })

  it('supports arrow keys', async () => {
    render(<ImageSlider images={images} title="Trip" />)
    screen.getByRole('button', { name: 'Next image' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByText('3 / 5')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('uses author alt text or a descriptive fallback', () => {
    const { container } = render(<ImageSlider images={images} title="Trip" />)
    const alts = Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('alt'))
    expect(alts[0]).toBe('A sunset')
    expect(alts[1]).toBe('Image 2 of 5 for Trip')
  })

  it('hides controls for a single image', () => {
    render(<ImageSlider images={images.slice(0, 1)} title="Trip" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ImageSlider images={images} title="Trip" />)
    await expectNoA11yViolations(container)
  })
})
