// File upload validator and utilities
const MAX_DEFAULT_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_PREMIUM_FILE_SIZE = 300 * 1024 * 1024; // 300 MB

// Safe file types that users can upload
const ALLOWED_FILE_TYPES = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/csv': ['csv'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/zip': ['zip'],
  'application/x-rar-compressed': ['rar'],
  'application/x-7z-compressed': ['7z'],
  'application/vnd.android.package-archive': ['apk'],
  'application/x-msdownload': ['exe'],
  'application/x-msdos-program': ['exe'],
  'text/plain': ['txt'],
  'application/json': ['json'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
};

const DANGEROUS_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'com', 'scr', 'vbs', 'js', 'jar', 'app', 'deb', 'rpm', 'msi',
  'sh', 'bash', 'py', 'rb', 'pl', 'php', 'asp', 'jsp', 'dll', 'so', 'dylib'
];

const VERIFIED_FILE_EXTENSIONS = Array.from(
  new Set(Object.values(ALLOWED_FILE_TYPES).flat())
).filter(ext => !DANGEROUS_EXTENSIONS.includes(ext));

/**
 * Validate file before upload
 * @param {Object} file - File object from multer
 * @param {Object} user - User object from database
 * @param {Object} adminSettings - Admin file upload settings
 * @returns {Object} { valid: boolean, error?: string, reason?: string }
 */
function validateFileUpload(file, user, adminSettings = {}) {
  const isAdmin = user?.role === 'admin';
  const legacyGlobalEnabled = adminSettings.allowFileUpload === true;
  const legacyUserEnabled = user?.canUploadFiles !== false;
  const mediaGloballyEnabled = adminSettings.allowMediaSharing ?? adminSettings.allowRestrictedFileUpload ?? legacyGlobalEnabled;
  const mediaUserEnabled = user?.canMediaSharing ?? legacyUserEnabled;
  const restrictedGloballyEnabled = adminSettings.allowRestrictedFileUpload ?? mediaGloballyEnabled;
  const unrestrictedGloballyEnabled = adminSettings.allowUnrestrictedFileUpload === true;
  const restrictedUserEnabled = (user?.canRestrictedFileUpload ?? mediaUserEnabled) !== false;
  const unrestrictedUserEnabled = mediaUserEnabled && user?.canUnrestrictedFileUpload !== false;

  const allowRestricted = isAdmin || (restrictedGloballyEnabled && restrictedUserEnabled);
  const allowUnrestricted = isAdmin || (unrestrictedGloballyEnabled && unrestrictedUserEnabled);

  // Check if user has permission to upload files
  if (!allowRestricted && !allowUnrestricted) {
    return {
      valid: false,
      error: 'File uploads are not allowed',
      reason: 'UPLOADS_DISABLED'
    };
  }

  // Check legacy per-user override
  if (user?.canUploadFiles === false) {
    return {
      valid: false,
      error: 'Your account does not have file upload permission',
      reason: 'USER_DISABLED'
    };
  }

  // Get file extension
  const fileExtension = file.originalname.split('.').pop().toLowerCase();

  // Check for dangerous extensions
  if (DANGEROUS_EXTENSIONS.includes(fileExtension)) {
    return {
      valid: false,
      error: 'This file type is not allowed for security reasons',
      reason: 'DANGEROUS_FILE_TYPE'
    };
  }

  // Check file size
  const maxSizeMb = allowUnrestricted
    ? (user?.maxFileSize || adminSettings.maxFileSize || MAX_PREMIUM_FILE_SIZE / 1024 / 1024)
    : (MAX_DEFAULT_FILE_SIZE / 1024 / 1024);
  const maxSize = maxSizeMb * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed (${Math.round(maxSize / 1024 / 1024)}MB)`,
      reason: 'FILE_TOO_LARGE'
    };
  }

  if (!allowUnrestricted && !VERIFIED_FILE_EXTENSIONS.includes(fileExtension)) {
    return {
      valid: false,
      error: `File type .${fileExtension} is not a verified file format`,
      reason: 'UNVERIFIED_FILE_TYPE'
    };
  }

  // Check allowed file types if restricted
  if (!allowUnrestricted && user?.allowedFileTypes && user.allowedFileTypes.length > 0) {
    if (!user.allowedFileTypes.includes(fileExtension)) {
      return {
        valid: false,
        error: `File type .${fileExtension} is not allowed`,
        reason: 'FILE_TYPE_NOT_ALLOWED'
      };
    }
  }

  return { valid: true };
}

/**
 * Get file type category
 * @param {string} fileName - File name
 * @returns {string} File type category
 */
function getFileTypeCategory(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();

  const categories = {
    documents: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'csv', 'ppt', 'pptx'],
    archives: ['zip', 'rar', '7z'],
    images: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    executables: ['exe', 'apk'],
    code: ['js', 'py', 'json', 'html', 'css'],
    other: []
  };

  for (const [category, exts] of Object.entries(categories)) {
    if (exts.includes(ext)) {
      return category;
    }
  }

  return 'other';
}

/**
 * Get file size in human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Human readable size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if file is safe to open in browser
 * @param {string} fileName - File name
 * @returns {boolean} True if safe to preview
 */
function isSafeToPreview(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const previewableSafe = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt'];
  return previewableSafe.includes(ext);
}

module.exports = {
  validateFileUpload,
  getFileTypeCategory,
  formatFileSize,
  isSafeToPreview,
  ALLOWED_FILE_TYPES,
  VERIFIED_FILE_EXTENSIONS,
  DANGEROUS_EXTENSIONS,
  MAX_DEFAULT_FILE_SIZE,
  MAX_PREMIUM_FILE_SIZE
};
