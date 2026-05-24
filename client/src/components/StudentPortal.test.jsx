import { render, screen } from '@testing-library/react'
import { waitFor } from '@testing-library/react'
import StudentPortal from './StudentPortal'

test('Student portal title is displayed', async () => {
  render(<StudentPortal />)

  await waitFor(() => {
    expect(
      screen.getByText('Student Portal')
    ).toBeInTheDocument()
  })
})