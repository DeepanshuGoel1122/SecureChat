import React from 'react';
import {
  DownloadIcon,
  getFileIcon,
  getFileTypeColor,
  formatFileSize
} from '../assets/fileIcons';

const FileDisplay = ({ file, message }) => {
  if (!file) return null;

  const apiUrl = import.meta.env.VITE_API_URL;
  const downloadUrl = message?._id ? `${apiUrl}/api/messages/file-download/${message._id}` : file.url;
  const openUrl = message?._id ? `${apiUrl}/api/messages/file-open/${message._id}` : file.url;

  const handleDownload = () => {
    window.location.assign(downloadUrl);
  };

  const ext = file.fileExtension?.toLowerCase() || 'unknown';
  const color = getFileTypeColor(ext);

  return (
    <div
      className="file-display"
      style={{
        backgroundColor: 'rgba(' + hexToRgb(color).join(',') + ', 0.05)',
        border: `1px solid ${color}20`,
        borderRadius: '8px',
        padding: '12px',
        maxWidth: '400px',
        marginTop: '8px',
        transition: 'all 0.2s ease'
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
          {getFileIcon(file.fileName, 24)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: '600',
              fontSize: '14px',
              color: '#2C3E50',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '2px'
            }}
            title={file.fileName}
          >
            {file.fileName}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#7F8C8D',
              display: 'flex',
              gap: '8px'
            }}
          >
            <span>{formatFileSize(file.fileSize)}</span>
            <span>•</span>
            <span>{ext.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
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
            backgroundColor: `${color}20`,
            color: color,
            border: `1px solid ${color}40`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(10px)'
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

      {/* File Preview (if supported) */}
      {ext === 'pdf' && (
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

      {['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && (
        <div style={{ marginTop: '10px' }}>
          <img
            src={file.url}
            alt={file.fileName}
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
