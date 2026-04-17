import { api } from './api';

export const authService = {
  // POST /api/auth/login/
  login: (credentials) => api.post('/auth/login/', credentials),
  
  // POST /api/auth/logout/
  logout: () => api.post('/auth/logout/', {}),
  
  // POST /api/auth/register/
  register: (userData) => api.post('/auth/register/', userData),
  
  // GET /api/auth/me/
  getCurrentUser: () => api.get('/auth/me/'),

  // POST /api/auth/change-password/
  changePassword: (passwordData) => api.post('/auth/change-password/', passwordData),
};
