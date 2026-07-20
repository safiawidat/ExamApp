import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import App from './App';
import {
  getCurrentUser,
  getStoredToken,
  login,
  logout,
  registerStudent,
} from './api/authService';

vi.mock('./components/TeacherDashboard', () => ({
  default: vi.fn(({ currentUser }) => (
    <section aria-label="Lecturer exam management">
      <h2>Teacher Dashboard</h2>
      <p>{currentUser.username}</p>
    </section>
  )),
}));

vi.mock('./api/authService', () => ({
  getCurrentUser: vi.fn(),
  getStoredToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  registerStudent: vi.fn(),
}));

const student = { id: 201, username: 'restored_student', role: 'student' };
const lecturer = { id: 202, username: 'restored_lecturer', role: 'lecturer' };

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

test('without a token shows login without calling /auth/me', async () => {
  getStoredToken.mockReturnValue(null);
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'E-Test System Login' }))
    .toBeInTheDocument();
  expect(getCurrentUser).not.toHaveBeenCalled();
});

test('an existing valid token restores the server-returned student', async () => {
  getStoredToken.mockReturnValue('test-only-token-placeholder');
  getCurrentUser.mockResolvedValue(student);
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Student Portal' })).toBeInTheDocument();
  expect(getCurrentUser).toHaveBeenCalledTimes(1);
});

test('an existing valid token restores the server-returned lecturer', async () => {
  getStoredToken.mockReturnValue('test-only-token-placeholder');
  getCurrentUser.mockResolvedValue(lecturer);
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Teacher Dashboard' })).toBeInTheDocument();
  expect(within(screen.getByLabelText('Lecturer exam management'))
    .getByText(lecturer.username)).toBeInTheDocument();
});

test('a restored student never renders lecturer exam management', async () => {
  getStoredToken.mockReturnValue('test-only-token-placeholder');
  getCurrentUser.mockResolvedValue(student);

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Student Portal' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Lecturer exam management')).not.toBeInTheDocument();
});

test('invalid restoration clears authentication and returns to login', async () => {
  getStoredToken.mockReturnValue('invalid-test-token-placeholder');
  getCurrentUser.mockRejectedValue(new Error('Invalid session'));
  render(<App />);
  expect(await screen.findByText('Your session is no longer valid. Please log in again.'))
    .toBeInTheDocument();
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'E-Test System Login' })).toBeInTheDocument();
});

test('an invalid server role is rejected rather than granted a dashboard', async () => {
  getStoredToken.mockReturnValue('test-only-token-placeholder');
  getCurrentUser.mockResolvedValue({
    id: 203,
    username: 'invalid_role_user',
    role: 'administrator',
  });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'E-Test System Login' }))
    .toBeInTheDocument();
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Your session is no longer valid. Please log in again.'))
    .toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Student Portal' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Teacher Dashboard' })).not.toBeInTheDocument();
});

test('an invalid role returned by login is rejected without granting a dashboard', async () => {
  const user = userEvent.setup();
  getStoredToken.mockReturnValue(null);
  login.mockResolvedValue({
    id: 204,
    username: 'invalid_login_role',
    role: 'administrator',
  });
  render(<App />);
  await user.type(await screen.findByLabelText('Username'), 'invalid_login_role');
  await user.type(screen.getByLabelText('Password'), 'Test password 42!');
  await user.click(screen.getByRole('button', { name: 'Login' }));
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Your session is no longer valid. Please log in again.'))
    .toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Student Portal' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Teacher Dashboard' })).not.toBeInTheDocument();
});

test('an invalid role returned by registration is rejected without granting a dashboard', async () => {
  const user = userEvent.setup();
  getStoredToken.mockReturnValue(null);
  registerStudent.mockResolvedValue({
    id: 205,
    username: 'invalid_registration_role',
    role: 'administrator',
  });
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Register' }));
  await user.type(screen.getByLabelText('Username'), 'invalid_registration_role');
  await user.type(screen.getByLabelText('Password'), 'Test password 42!');
  await user.type(screen.getByLabelText('Confirm Password'), 'Test password 42!');
  await user.click(screen.getByRole('button', { name: 'Register' }));
  expect(logout).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'E-Test System Login' })).toBeInTheDocument();
  expect(screen.getByText('Your session is no longer valid. Please log in again.'))
    .toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Student Portal' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Teacher Dashboard' })).not.toBeInTheDocument();
});

test('logout clears authentication and returns to login', async () => {
  const user = userEvent.setup();
  getStoredToken.mockReturnValue('test-only-token-placeholder');
  getCurrentUser.mockResolvedValue(student);
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Logout' }));
  expect(logout).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'E-Test System Login' })).toBeInTheDocument();
  });
});
