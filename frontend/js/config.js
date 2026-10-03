/**
 * RemoteX - Configuration
 * Permission-based remote support and communication platform
 */

const CONFIG = {
  API_BASE_URL: 'http://127.0.0.1:8000',
  WS_BASE_URL: 'ws://127.0.0.1:8000',

  STORAGE_KEYS: {
    TOKEN: 'remotex_access_token',
    USER: 'remotex_user_data',
    ACTIVE_SESSION: 'remotex_active_session',
    ACTIVE_TARGET: 'remotex_active_target'
  },

  VALID_FEATURES: [
    'video',
    'voice',
    'screen',
    'chat',
    'mouse',
    'keyboard',
    'file_transfer',
    'translation'
  ],

  PERMISSION_STATES: {
    REQUEST: 'REQUEST',
    PENDING: 'PENDING',
    ALLOWED: 'ALLOWED',
    REJECTED: 'REJECTED',
    REVOKED: 'REVOKED'
  },

  SUPPORTED_LANGUAGES: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'hinglish', name: 'Hinglish' },
    { code: 'bn', name: 'Bengali' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'mr', name: 'Marathi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'kn', name: 'Kannada' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'ur', name: 'Urdu' },
    { code: 'od', name: 'Odia' },
    { code: 'santhali', name: 'Santhali' }
  ],

  RTC_CONFIG: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
};

// Freeze to prevent accidental alterations
Object.freeze(CONFIG);
