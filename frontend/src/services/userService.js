import { api } from './api';

export const userService = {
  // GET /api/users/
  getAllUsers: () => api.get('/users/'),

  // GET /api/users/?search=query
  searchUsers: (query) => api.get('/users/', { search: query }),

  // POST /api/users/
  createUser: (userData) => api.post('/users/', userData),

  // PATCH /api/users/{id}/
  updateUser: (id, userData) => api.patch(`/users/${id}/`, userData),

  // DELETE /api/users/{id}/
  deleteUser: (id) => api.delete(`/users/${id}/`),

  // POST /api/users/{id}/set-password/
  setPassword: (id, passwordData) => api.post(`/users/${id}/set-password/`, passwordData),
};
