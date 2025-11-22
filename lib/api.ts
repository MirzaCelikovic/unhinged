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

  console.log('=== API REQUEST ===');
  console.log('Method:', config.method?.toUpperCase());
  console.log('URL:', url.toString());
  console.log('Headers:', JSON.stringify(config.headers, null, 2));
  if (config.data) {
    console.log('Payload:', JSON.stringify(config.data, null, 2));
  }
  console.log('==================');

  return config;
});

// Response logging interceptor
api.interceptors.response.use(
  (response) => {
    console.log('=== API RESPONSE ===');
    console.log('URL:', response.config.url);
    console.log('Status:', response.status, response.statusText);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    console.log('===================');
    return response;
  },
  (error: AxiosError) => {
    console.error('=== API ERROR ===');
    console.error('URL:', error.config?.url);
    console.error('Method:', error.config?.method?.toUpperCase());
    console.error('Status:', error.response?.status, error.response?.statusText);
    if (error.config?.data) {
      console.error('Request Payload:', JSON.stringify(error.config.data, null, 2));
    }
    if (error.response?.data) {
      console.error('Error Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('Error Message:', error.message);
    console.error('=================');
    return Promise.reject(error);
  }
);

export const useApi = () => api;
