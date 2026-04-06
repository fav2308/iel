import type { FirebaseOptions } from 'firebase/app';

export interface AppEnvironment {
  firebaseConfig: FirebaseOptions | null;
  appId: string;
  initialAuthToken: string;
  geminiApiKey: string;
}

function readEnv(key: string): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = env?.[key];
  return typeof value === 'string' ? value : '';
}

function readFirebaseConfigFromEnv(): FirebaseOptions | null {
  const rawConfig = readEnv('NG_APP_FIREBASE_CONFIG');

  if (!rawConfig) {
    return null;
  }

  try {
    return JSON.parse(rawConfig) as FirebaseOptions;
  } catch {
    return null;
  }
}

export const environment: AppEnvironment = {
  firebaseConfig: readFirebaseConfigFromEnv(),
  appId: readEnv('NG_APP_APP_ID') || 'default-app-id',
  initialAuthToken: readEnv('NG_APP_INITIAL_AUTH_TOKEN'),
  geminiApiKey: readEnv('NG_APP_GEMINI_API_KEY'),
};
