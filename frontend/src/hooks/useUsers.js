import { useState, useEffect } from 'react';
import { userService } from '../services/userService';

export function useUsers(autoLoad = true) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadUsers = async (search = '') => {
    setLoading(true);
    setError(null);
    try {
      const data = search.trim()
        ? await userService.searchUsers(search.trim())
        : await userService.getAllUsers();
      setUsers(data);
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Failed to load users:', err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (userData) => {
    setLoading(true);
    setError(null);
    try {
      const newUser = await userService.createUser(userData);
      setUsers((prev) => [...prev, newUser].sort((a, b) => a.username.localeCompare(b.username)));
      return newUser;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (id, userData) => {
    setLoading(true);
    setError(null);
    try {
      const updatedUser = await userService.updateUser(id, userData);
      setUsers((prev) => prev
        .map((user) => (user.id === id ? updatedUser : user))
        .sort((a, b) => a.username.localeCompare(b.username)));
      return updatedUser;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await userService.deleteUser(id);
      setUsers((prev) => prev.filter((user) => user.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const setUserPassword = async (id, passwordData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await userService.setPassword(id, passwordData);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      loadUsers();
    }
  }, [autoLoad]);

  return {
    users,
    loading,
    error,
    loadUsers,
    createUser,
    updateUser,
    deleteUser,
    setUserPassword,
  };
}
