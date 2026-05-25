import { render, screen } from '@testing-library/react'
import TeacherDashboard from './TeacherDashboard'

test('Teacher dashboard title is displayed', () => {
  render(<TeacherDashboard />)

  expect(
    screen.getByText('Teacher Dashboard')
  ).toBeInTheDocument()
})