export {};

declare global {
  interface Window {
    __env?: {
      API_BASE_URL?: string;
    };
  }
}
