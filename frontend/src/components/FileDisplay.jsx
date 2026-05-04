import React from 'react';
import {
  DownloadIcon,
  getFileIcon,
  getFileTypeColor,
  formatFileSize
} from '../assets/fileIcons';

const FileDisplay = ({ file, message, fileIndex }) => {
  if (!file) return null;

  // Normalize: optimistic upload objects use 'originalName' / 'size' / 'mimeType'
  // Stored file objects use 'fileName' / 'fileSize' / 'fileExtension'
  const fileName = file.fileName || file.originalName || file.name || '';
  const fileSize = file.fileSize ?? file.size ?? 0;
  const fileExtension =
    file.fileExtension ||
    (fileName ? fileName.split('.').pop().toLowerCase() : 'unknown');

  const apiUrl = import.meta.env.VITE_API_URL;
  // Only use backend routes for real saved messages (not temp optimistic IDs like "temp-xxx")
  const isRealMessage = message?._id && !String(message._id).startsWith('temp-');
  const indexParam = fileIndex !== null && fileIndex !== undefined ? `?fileIndex=${fileIndex}` : '';
  const downloadUrl = isRealMessage
    ? `${apiUrl}/api/messages/file-download/${message._id}${indexParam}`
    : file.url;
  const openUrl = isRealMessage
    ? `${apiUrl}/api/messages/file-open/${message._id}${indexParam}`
    : file.url;

  const handleDownload = () => {
    window.location.assign(downloadUrl);
  };

  const ext = fileExtension?.toLowerCase() || 'unknown';
  const color = getFileTypeColor(ext);

  const isSender = message?.isSender; // Assuming `isSender` indicates if the message is from the sender

  return (
    <div
      className={`file-display ${isSender ? 'message self file' : ''}`}
      style={{
        background: `linear-gradient(135deg, rgba(${hexToRgb(color).join(',')}, 0.15), rgba(${hexToRgb(color).join(',')}, 0.05))`,
        border: `1px solid ${color}80`,
        borderRadius: '12px',
        padding: '12px',
        maxWidth: '400px',
        marginTop: '8px',
        transition: 'all 0.2s ease',
        boxShadow: `0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px ${color}20`
      }}
    >
      {/* File Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '8px'
        }}
      >
        <div style={{ fontSize: '24px', flexShrink: 0 }}>
          {getFileIcon(fileName, 24)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: '600',
              fontSize: '14px',
              color: 'inherit',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '2px'
            }}
            title={fileName}
          >
            {fileName || 'Uploading…'}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'inherit',
              opacity: 0.8,
              display: 'flex',
              gap: '8px'
            }}
          >
            <span>{formatFileSize(fileSize)}</span>
            <span>•</span>
            <span>{ext !== 'unknown' ? ext.toUpperCase() : '—'}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons — hide download during upload (no URL yet) */}
      {!message?.isUploading && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end'
          }}
        >
          <button
            onClick={handleDownload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: `${color}40`,
              color: color,
              border: `1px solid ${color}80`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)',
              boxShadow: `0 2px 4px ${color}30`
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = `${color}30`;
              e.target.style.borderColor = color;
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = `${color}20`;
              e.target.style.borderColor = `${color}40`;
            }}
          >
            <DownloadIcon size={14} color={color} />
            Download
          </button>
        </div>
      )}

      {/* File Preview (if supported) */}
      {ext === 'pdf' && !message?.isUploading && (
        <div style={{ marginTop: '10px', marginBottom: '-8px' }}>
          <a
            href={openUrl}
            style={{
              fontSize: '12px',
              color: color,
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            Open PDF
          </a>
        </div>
      )}

      {['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && !message?.isUploading && (
        <div style={{ marginTop: '10px' }}>
          <img
            src={file.url}
            alt={fileName}
            style={{
              maxWidth: '100%',
              maxHeight: '300px',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={(e) => (e.target.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.target.style.transform = 'scale(1)')}
            onClick={() => window.location.assign(openUrl)}
          />
        </div>
      )}
    </div>
  );
};

// Helper to convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [127, 140, 141];
}

export default FileDisplay;
