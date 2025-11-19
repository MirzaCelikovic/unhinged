import axios, { AxiosError, AxiosInstance } from 'axios';
import * as Application from 'expo-application';

// Get the app version from app.json
const appVersion = Application.nativeApplicationVersion || '1.0.0';
const userAgent = `unhinged-mobile/${appVersion}`;

export type Api = AxiosInstance;
export type ApiError = AxiosError;

const api: Api = axios.create({
  baseURL: 'https://api-prod.unhinged.so',
  headers: {
    'User-Agent': userAgent,
    'Content-Type': 'application/json',
  },
});

// Request logging interceptor
api.interceptors.request.use((config) => {
  const url = new URL(config.baseURL + config.url);

  if (config.params) {
    Object.keys(config.params).forEach((key) => url.searchParams.append(key, config.params[key]));
  }

  console.log('API Request:', config.method?.toUpperCase(), url.toString());
  return config;
});

// Response logging interceptor
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.config.url, response.status);
    return response;
  },
  (error: AxiosError) => {
    console.error('API Error:', error.config?.url, error.response?.status, error.message);
    return Promise.reject(error);
  }
);

export const useApi = () => api;
