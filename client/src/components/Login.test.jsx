import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import Login from './Login';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

test('submits the trimmed username and password through the callback', async () => {
  const user = userEvent.setup();
  const onLogin = vi.fn().mockResolvedValue(undefined);
  render(<Login onLogin={onLogin} onShowRegister={vi.fn()} />);
  await user.type(screen.getByLabelText('Username'), '  test_student  ');
  await user.type(screen.getByLabelText('Password'), 'Test password 42!');
  await user.click(screen.getByRole('button', { name: 'Login' }));
  expect(onLogin).toHaveBeenCalledWith({
    username: 'test_student',
    password: 'Test password 42!',
  });
});

test('displays callback errors as text', async () => {
  const user = userEvent.setup();
  const safeError = '<script>Invalid username or password.</script>';
  const onLogin = vi.fn().mockRejectedValue(new Error(safeError));
  render(<Login onLogin={onLogin} onShowRegister={vi.fn()} />);
  await user.type(screen.getByLabelText('Username'), 'test_student');
  await user.type(screen.getByLabelText('Password'), 'Wrong password 42!');
  await user.click(screen.getByRole('button', { name: 'Login' }));
  expect(await screen.findByText(safeError)).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});

test('prevents duplicate submission while pending', async () => {
  const user = userEvent.setup();
  const onLogin = vi.fn(() => new Promise(() => {}));
  render(<Login onLogin={onLogin} onShowRegister={vi.fn()} />);
  await user.type(screen.getByLabelText('Username'), 'test_student');
  await user.type(screen.getByLabelText('Password'), 'Test password 42!');
  const submit = screen.getByRole('button', { name: 'Login' });
  await user.dblClick(submit);
  expect(onLogin).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Logging in...' })).toBeDisabled();
});

test('contains no demo credentials or role selection', () => {
  render(<Login onLogin={vi.fn()} onShowRegister={vi.fn()} />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText(/demo|teacher|lecturer/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toHaveValue('');
  expect(screen.getByLabelText('Password')).toHaveValue('');
});
