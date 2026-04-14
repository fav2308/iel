export interface AppEnvironment {
  appId: string;
  geminiApiKey: string;
}

function readEnv(key: string): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = env?.[key];
  return typeof value === 'string' ? value : '';
}

export const environment: AppEnvironment = {
  appId: readEnv('NG_APP_APP_ID') || 'default-app-id',
  geminiApiKey: readEnv('NG_APP_GEMINI_API_KEY'),
};
