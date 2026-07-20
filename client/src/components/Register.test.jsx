import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import Register from './Register';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

const fillRegistration = async (user, confirmation = 'Test password 42!') => {
  await user.type(screen.getByLabelText('Username'), '  test_student  ');
  await user.type(screen.getByLabelText('Password'), 'Test password 42!');
  await user.type(screen.getByLabelText('Confirm Password'), confirmation);
};

test('sends username and password only', async () => {
  const user = userEvent.setup();
  const onRegister = vi.fn().mockResolvedValue(undefined);
  render(<Register onRegister={onRegister} onBackToLogin={vi.fn()} />);
  await fillRegistration(user);
  await user.click(screen.getByRole('button', { name: 'Register' }));
  expect(onRegister).toHaveBeenCalledWith({
    username: 'test_student',
    password: 'Test password 42!',
  });
  expect(onRegister.mock.calls[0][0]).not.toHaveProperty('role');
});

test('contains no lecturer or teacher role selector', () => {
  render(<Register onRegister={vi.fn()} onBackToLogin={vi.fn()} />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText(/lecturer|teacher/i)).not.toBeInTheDocument();
});

test('password mismatch prevents the callback', async () => {
  const user = userEvent.setup();
  const onRegister = vi.fn();
  render(<Register onRegister={onRegister} onBackToLogin={vi.fn()} />);
  await fillRegistration(user, 'Different password 84!');
  await user.click(screen.getByRole('button', { name: 'Register' }));
  expect(onRegister).not.toHaveBeenCalled();
  expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
});

test('displays duplicate and validation errors as text', async () => {
  const user = userEvent.setup();
  const safeError = '<b>Username is already registered.</b>';
  const onRegister = vi.fn().mockRejectedValue(new Error(safeError));
  render(<Register onRegister={onRegister} onBackToLogin={vi.fn()} />);
  await fillRegistration(user);
  await user.click(screen.getByRole('button', { name: 'Register' }));
  expect(await screen.findByText(safeError)).toBeInTheDocument();
  expect(document.querySelector('b')).toBeNull();
});

test('prevents duplicate submission while pending', async () => {
  const user = userEvent.setup();
  const onRegister = vi.fn(() => new Promise(() => {}));
  render(<Register onRegister={onRegister} onBackToLogin={vi.fn()} />);
  await fillRegistration(user);
  await user.dblClick(screen.getByRole('button', { name: 'Register' }));
  expect(onRegister).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Registering...' })).toBeDisabled();
});
