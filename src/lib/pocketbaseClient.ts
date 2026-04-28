import PocketBase from 'pocketbase';

const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL;

if (!pocketbaseUrl) {
  console.warn('PocketBase URL is not set. Please add VITE_POCKETBASE_URL to your .env file.');
}

export const pb = new PocketBase(pocketbaseUrl ?? 'http://localhost:8090');
