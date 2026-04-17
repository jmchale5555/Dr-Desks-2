import { useEffect, useRef, useState } from 'react';
import { Menu, Moon, Sun, UserCircle2, KeyRound, LogOut, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';

export default function Header({ onMenuToggle, darkMode, onDarkModeToggle }) {
  const { user, logout } = useAuth();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isPasswordModalOpen) {
        setIsPasswordModalOpen(false);
        return;
      }

      if (isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPasswordModalOpen, isProfileMenuOpen]);

  const handleOpenPasswordModal = () => {
    setIsProfileMenuOpen(false);
    setPasswordForm({ old_password: '', new_password: '', new_password_confirm: '' });
    setPasswordError('');
    setPasswordSuccess('');
    setIsPasswordModalOpen(true);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.new_password.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (passwordForm.new_password !== passwordForm.new_password_confirm) {
      setPasswordError('New passwords do not match.');
      return;
    }

    try {
      setIsSubmittingPassword(true);
      await authService.changePassword(passwordForm);
      setPasswordSuccess('Password updated successfully.');
      setPasswordForm({ old_password: '', new_password: '', new_password_confirm: '' });
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordSuccess('');
      }, 1200);
    } catch (err) {
      if (err?.data && typeof err.data === 'object') {
        if (err.data.error) {
          setPasswordError(err.data.error);
        } else {
          const firstEntry = Object.values(err.data)[0];
          if (Array.isArray(firstEntry)) {
            setPasswordError(firstEntry[0]);
          } else if (typeof firstEntry === 'string') {
            setPasswordError(firstEntry);
          } else {
            setPasswordError(err.message || 'Failed to update password.');
          }
        }
      } else {
        setPasswordError(err.message || 'Failed to update password.');
      }
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <>
      <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
          {/* Left: Logo and mobile menu button */}
            <div className="flex items-center gap-4">
              <button
                onClick={onMenuToggle}
                className="lg:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Toggle menu"
              >
                <Menu className="h-6 w-6" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">DD</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Dr Desk
                </h1>
              </div>
            </div>

          {/* Right: User info and controls */}
            <div className="flex items-center gap-2 sm:gap-4">
            {/* Dark mode toggle */}
              <button
                onClick={onDarkModeToggle}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle dark mode"
              >
                {darkMode ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </button>

            {/* User info - hidden on mobile */}
              {user && (
                <div className="relative" ref={profileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                    className="group relative flex items-center gap-2 sm:gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Open profile menu"
                    aria-expanded={isProfileMenuOpen}
                    title="Profile"
                  >
                    <div className="hidden sm:block text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {user.first_name || user.username}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {user.is_staff ? 'Admin' : 'User'}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      {user.first_name ? (
                        <span className="text-blue-600 dark:text-blue-300 font-semibold">
                          {user.first_name.charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <UserCircle2 className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                      )}
                    </div>

                    <span className="pointer-events-none absolute -bottom-8 left-1/2 hidden -translate-x-1/2 rounded bg-gray-900 px-2 py-1 text-xs text-white sm:group-hover:block dark:bg-gray-100 dark:text-gray-900">
                      Profile
                    </span>
                  </button>

                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-50 py-1">
                      <button
                        type="button"
                        onClick={handleOpenPasswordModal}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <KeyRound className="h-4 w-4" />
                        Reset Password
                      </button>
                      <button
                        type="button"
                        onClick={logout}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Reset Password</h3>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
              {passwordError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg text-sm">
                  {passwordSuccess}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.old_password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, old_password: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.new_password_confirm}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, new_password_confirm: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  disabled={isSubmittingPassword}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSubmittingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
