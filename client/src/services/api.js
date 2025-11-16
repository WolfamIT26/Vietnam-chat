import axios from 'axios';

/**
 * API Service - Kết nối HTTP với Flask backend
 * Sử dụng axios để gọi các endpoint /register, /login, /users, /messages
 */

// Default to localhost:5000 (Flask backend) when env var is not provided.
// Previously defaulted to 8000 which caused "Lỗi kết nối server" when
// the backend is actually running on 5000. Keep environment override.
// In development we prefer using a relative base URL so CRA's proxy can avoid CORS.
// If you set REACT_APP_API_URL explicitly, it will be used (useful for production).
// If REACT_APP_API_URL is set, use it. Otherwise default to the current origin so
// built clients and ngrok-hosted pages call the same host that served the page.
let API_URL = process.env.REACT_APP_API_URL !== undefined ? process.env.REACT_APP_API_URL : '';
if (!API_URL) {
  // When running in browser, prefer the page origin (works for localhost dev or ngrok public URL).
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    API_URL = window.location.origin;
  } else {
    API_URL = '';
  }
}


// If REACT_APP_MOCK_API is set to 'true', use an in-memory mock implementation
const USE_MOCK = process.env.REACT_APP_MOCK_API === 'true';

// Tạo instance axios với base URL (bình thường)
// Do not set a global 'Content-Type' here so multipart/form-data
// requests (FormData) let the browser set proper boundaries.
const api = axios.create({
  baseURL: API_URL,
});

// Simple in-browser mock storage for demoing auth when backend is unavailable.
const mockStorageKey = 'mock_users';
const mockOtpKey = 'mock_otps';

const readMockUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(mockStorageKey) || '[]');
  } catch (e) {
    return [];
  }
};

const writeMockUsers = (users) => {
  localStorage.setItem(mockStorageKey, JSON.stringify(users));
};

const readMockOtps = () => {
  try {
    return JSON.parse(localStorage.getItem(mockOtpKey) || '{}');
  } catch (e) {
    return {};
  }
};

const writeMockOtps = (map) => {
  localStorage.setItem(mockOtpKey, JSON.stringify(map));
};

const mockApiDelay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

// Thêm JWT token vào header nếu tồn tại
// Log all API requests and responses for debugging
api.interceptors.request.use(
  (config) => {
    // Lấy token từ localStorage hoặc sessionStorage
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log('[API REQUEST]', config.method?.toUpperCase(), config.url, config.data || config.params || '');
    return config;
  },
  (error) => {
    console.error('[API REQUEST ERROR]', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    console.log('[API RESPONSE]', response.config.url, response.status, response.data);
    return response;
  },
  (error) => {
    console.error('[API RESPONSE ERROR]', error?.config?.url, error?.response?.status, error?.response?.data);
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  register: async (username, password, display_name) => {
    if (!USE_MOCK) return api.post('/register', { username, password, display_name });
    await mockApiDelay();
    const users = readMockUsers();
    if (users.find((u) => u.username === username)) {
      return Promise.resolve({ data: { success: false, message: 'User exists' }, status: 400 });
    }
    users.push({ username, password, display_name });
    writeMockUsers(users);
    return Promise.resolve({ data: { success: true, message: 'Registered' }, status: 200 });
  },

  login: async (username, password) => {
    if (!USE_MOCK) return api.post('/login', { username, password });
    await mockApiDelay();
    const users = readMockUsers();
    const found = users.find((u) => u.username === username && u.password === password);
    if (!found) {
      return Promise.resolve({ data: { success: false, message: 'Invalid credentials' }, status: 401 });
    }
    const fakeToken = `mock-token-${username}-${Date.now()}`;
    localStorage.setItem('token', fakeToken);
    return Promise.resolve({ data: { success: true, token: fakeToken }, status: 200 });
  },

  logout: () => {
    localStorage.removeItem('token');
    return Promise.resolve();
  },

  forgotPassword: async (contact) => {
    if (!USE_MOCK) return api.post('/forgot-password', { contact });
    await mockApiDelay();
    const users = readMockUsers();
    const found = users.find((u) => u.username === contact || u.phone_number === contact);
    if (!found) {
      return Promise.resolve({ data: { success: false, message: 'User not found' }, status: 400 });
    }
    const otps = readMockOtps();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps[contact] = otp;
    writeMockOtps(otps);
    // In mock mode we return the OTP so testers can reset immediately
    return Promise.resolve({ data: { success: true, otp }, status: 200 });
  },

  resetPassword: async (contact, otp, newPassword) => {
    if (!USE_MOCK) return api.post('/forgot-password/reset', {
      contact,
      otp,
      new_password: newPassword,
    });
    await mockApiDelay();
    const otps = readMockOtps();
    if (otps[contact] !== otp) {
      return Promise.resolve({ data: { success: false, message: 'Invalid OTP' }, status: 400 });
    }
    const users = readMockUsers();
    const idx = users.findIndex((u) => u.username === contact || u.phone_number === contact);
    if (idx === -1) {
      return Promise.resolve({ data: { success: false, message: 'User not found' }, status: 400 });
    }
    users[idx].password = newPassword;
    writeMockUsers(users);
    delete otps[contact];
    writeMockOtps(otps);
    return Promise.resolve({ data: { success: true }, status: 200 });
  },
};

// User APIs
export const userAPI = {
  getUsers: () => api.get('/users'),
  searchUsers: (q) => api.get('/users/search', { params: { q } }),
  getSuggestions: (limit = 10) => api.get('/users/suggestions', { params: { limit } }),
  
  getUserById: (userId) => api.get(`/users/${userId}`),
  getCurrent: () => api.get('/users/me'),
  updateMe: (payload) => api.patch('/users/me', payload),
  addFriend: (otherId) => api.post(`/friends/${otherId}/add`),
  acceptFriend: (otherId) => api.post(`/friends/${otherId}/accept`),
  getFriends: () => api.get('/friends'),
  getFriendRequests: () => api.get('/friends/requests'),
};

// Message APIs
export const messageAPI = {
  getMessages: (senderId, receiverId) =>
    api.get('/messages', {
      params: { sender_id: senderId, receiver_id: receiverId },
    }),
  
  sendMessage: (senderId, receiverId, content) =>
    api.post('/messages', { sender_id: senderId, receiver_id: receiverId, content }),
  
  sendFile: (formData) =>
    api.post('/messages/upload', formData),
  
  getConversations: () => api.get('/messages/conversations'),
};

// Group APIs
export const groupAPI = {
  createGroup: (name) => api.post('/groups', { name }),
  joinGroup: (groupId) => api.post(`/groups/${groupId}/join`),
  getMyGroups: () => api.get('/groups'),
  getGroupMembers: (groupId) => api.get(`/groups/${groupId}/members`),
};

export default api;
