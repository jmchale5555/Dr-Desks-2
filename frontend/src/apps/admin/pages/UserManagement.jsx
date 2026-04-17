import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Search,
  X,
  KeyRound,
  Shield,
  UserCheck,
  UserX,
  CheckCircle,
} from 'lucide-react';
import { useUsers } from '../../../hooks/useUsers';

const getErrorMessage = (err, fallback) => {
  if (!err) {
    return fallback;
  }

  if (err.data && typeof err.data === 'object') {
    const firstEntry = Object.entries(err.data)[0];
    if (firstEntry) {
      const [, value] = firstEntry;
      if (Array.isArray(value)) {
        return value[0];
      }
      if (typeof value === 'string') {
        return value;
      }
    }
    if (err.data.error) {
      return err.data.error;
    }
  }

  return err.message || fallback;
};

const initialCreateForm = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  department: '',
  phone: '',
  is_staff: false,
  is_active: true,
  password: '',
  password_confirm: '',
};

const initialEditForm = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  department: '',
  phone: '',
  is_staff: false,
  is_active: true,
};

const initialPasswordForm = {
  password: '',
  password_confirm: '',
};

export default function UserManagement() {
  const {
    users,
    loading,
    error,
    loadUsers,
    createUser,
    updateUser,
    deleteUser,
    setUserPassword,
  } = useUsers(false);

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(initialCreateForm);
  const [formErrors, setFormErrors] = useState({});

  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [passwordErrors, setPasswordErrors] = useState({});

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadUsers(search);
    }, 250);

    return () => clearTimeout(timeout);
  }, [search]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.username.localeCompare(b.username));
  }, [users]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData(initialCreateForm);
    setFormErrors({});
    setDeleteError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      ...initialEditForm,
      username: user.username || '',
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      department: user.department || '',
      phone: user.phone || '',
      is_staff: Boolean(user.is_staff),
      is_active: Boolean(user.is_active),
    });
    setFormErrors({});
    setDeleteError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData(initialCreateForm);
    setFormErrors({});
    setDeleteError('');
  };

  const openPasswordModal = (user) => {
    setPasswordModalUser(user);
    setPasswordForm(initialPasswordForm);
    setPasswordErrors({});
    setDeleteError('');
  };

  const closePasswordModal = () => {
    setPasswordModalUser(null);
    setPasswordForm(initialPasswordForm);
    setPasswordErrors({});
    setDeleteError('');
  };

  const validateUserForm = () => {
    const errors = {};

    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    } else if (formData.username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }

    if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!editingUser) {
      if (!formData.password) {
        errors.password = 'Password is required';
      } else if (formData.password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
      }

      if (formData.password !== formData.password_confirm) {
        errors.password_confirm = 'Passwords do not match';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validatePasswordForm = () => {
    const errors = {};

    if (!passwordForm.password) {
      errors.password = 'New password is required';
    } else if (passwordForm.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (passwordForm.password !== passwordForm.password_confirm) {
      errors.password_confirm = 'Passwords do not match';
    }

    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!validateUserForm()) {
      return;
    }

    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          username: formData.username.trim(),
          email: formData.email.trim(),
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          department: formData.department.trim(),
          phone: formData.phone.trim(),
          is_staff: formData.is_staff,
          is_active: formData.is_active,
        });
        showSuccess('User updated successfully.');
      } else {
        await createUser({
          username: formData.username.trim(),
          email: formData.email.trim(),
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          department: formData.department.trim(),
          phone: formData.phone.trim(),
          is_staff: formData.is_staff,
          is_active: formData.is_active,
          password: formData.password,
          password_confirm: formData.password_confirm,
        });
        showSuccess('User created successfully.');
      }

      closeModal();
    } catch (err) {
      setFormErrors({ general: getErrorMessage(err, 'Failed to save user') });
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();

    if (!passwordModalUser || !validatePasswordForm()) {
      return;
    }

    try {
      await setUserPassword(passwordModalUser.id, {
        password: passwordForm.password,
        password_confirm: passwordForm.password_confirm,
      });
      showSuccess(`Password updated for ${passwordModalUser.username}.`);
      closePasswordModal();
    } catch (err) {
      setPasswordErrors({ general: getErrorMessage(err, 'Failed to reset password') });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      return;
    }

    try {
      setDeleteError('');
      await deleteUser(deleteConfirm.id);
      showSuccess(
        deleteConfirm.is_ldap_user
          ? `${deleteConfirm.username} was disabled successfully.`
          : `${deleteConfirm.username} was deleted successfully.`
      );
      setDeleteConfirm(null);
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to remove user'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Users className="h-6 w-6" />
          <h2 className="text-2xl font-bold">User Management</h2>
        </div>

        <button
          onClick={openCreateModal}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name, username, or email"
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading && sortedUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : sortedUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Joined</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedUsers.map((user, index) => (
                  <tr
                    key={user.id}
                    className={`transition-colors ${
                      index % 2 === 0
                        ? 'bg-white dark:bg-gray-800'
                        : 'bg-gray-50 dark:bg-gray-700'
                    } hover:bg-gray-100 dark:hover:bg-gray-600`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{user.username}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {[user.first_name, user.last_name].filter(Boolean).join(' ') || 'No name'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {user.email || 'No email'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.is_ldap_user
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {user.auth_source || (user.is_ldap_user ? 'LDAP' : 'Local')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.is_staff
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        <Shield className="h-3 w-3" />
                        {user.is_staff ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}>
                        {user.is_active ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                        {user.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {user.date_joined ? new Date(user.date_joined).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => openEditModal(user)}
                        disabled={loading}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mr-4 inline-flex items-center gap-1"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </button>

                      {!user.is_ldap_user && (
                        <button
                          onClick={() => openPasswordModal(user)}
                          disabled={loading}
                          className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 mr-4 inline-flex items-center gap-1"
                        >
                          <KeyRound className="h-4 w-4" />
                          Reset Password
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setDeleteError('');
                          setDeleteConfirm(user);
                        }}
                        disabled={loading}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        {user.is_ldap_user ? 'Disable' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formErrors.general && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {formErrors.general}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
                    disabled={Boolean(editingUser?.is_ldap_user)}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800"
                  />
                  {editingUser?.is_ldap_user && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">LDAP usernames cannot be changed.</p>
                  )}
                  {formErrors.username && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.username}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {formErrors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {!editingUser && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    {formErrors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.password}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Password *</label>
                    <input
                      type="password"
                      value={formData.password_confirm}
                      onChange={(e) => setFormData((prev) => ({ ...prev, password_confirm: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    {formErrors.password_confirm && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.password_confirm}</p>}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-6">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.is_staff}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_staff: e.target.checked }))}
                    className="rounded"
                  />
                  Admin user
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                    className="rounded"
                  />
                  Active account
                </label>
              </div>

              {editingUser?.is_staff && editingUser?.is_active && (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  If this is the last active admin account, changing admin or active status will be blocked.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? 'Saving...' : (editingUser ? 'Save Changes' : 'Create User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordModalUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Reset Password</h3>
              <button
                onClick={closePasswordModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordReset} className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Set a new password for <strong>{passwordModalUser.username}</strong>.
              </p>

              {passwordErrors.general && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {passwordErrors.general}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password *</label>
                <input
                  type="password"
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {passwordErrors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordErrors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  value={passwordForm.password_confirm}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, password_confirm: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {passwordErrors.password_confirm && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{passwordErrors.password_confirm}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {deleteConfirm.is_ldap_user ? 'Disable LDAP User' : 'Delete User'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {deleteConfirm.is_ldap_user
                  ? `This will disable ${deleteConfirm.username}. The account will remain in the system and can be re-enabled later.`
                  : `Are you sure you want to permanently delete ${deleteConfirm.username}? This action cannot be undone.`}
              </p>

              {deleteError && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {deleteError}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setDeleteConfirm(null);
                    setDeleteError('');
                  }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                >
                  {loading
                    ? (deleteConfirm.is_ldap_user ? 'Disabling...' : 'Deleting...')
                    : (deleteConfirm.is_ldap_user ? 'Disable User' : 'Delete User')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
