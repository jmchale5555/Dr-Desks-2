import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';

const mockUseAuth = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ProtectedRoute', () => {
  test('redirects to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <ProtectedRoute>
          <div>Secret Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  test('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'alice', is_staff: false },
      loading: false,
      isAdmin: false,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Secret Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });

  test('shows access denied when admin is required and user is not admin', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'alice', is_staff: false },
      loading: false,
      isAdmin: false,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requireAdmin>
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});
