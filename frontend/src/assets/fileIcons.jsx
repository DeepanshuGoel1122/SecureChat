// Lightweight custom SVG icons for different file types
// No external dependencies - reduces bundle size

export const PDFIcon = ({ size = 24, color = "#FF6B6B" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
    <text x="12" y="15" fontSize="8" fontWeight="bold" fill={color} textAnchor="middle">PDF</text>
  </svg>
);

export const ExcelIcon = ({ size = 24, color = "#26A65B" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
    <g fill={color}>
      <rect x="6" y="6" width="3" height="3"/>
      <rect x="10" y="6" width="3" height="3"/>
      <rect x="14" y="6" width="3" height="3"/>
      <rect x="6" y="10" width="3" height="3"/>
      <rect x="10" y="10" width="3" height="3"/>
      <rect x="14" y="10" width="3" height="3"/>
      <rect x="6" y="14" width="3" height="3"/>
      <rect x="10" y="14" width="3" height="3"/>
      <rect x="14" y="14" width="3" height="3"/>
    </g>
  </svg>
);

export const DocIcon = ({ size = 24, color = "#4A90E2" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
    <text x="12" y="14" fontSize="7" fontWeight="bold" fill={color} textAnchor="middle">DOC</text>
  </svg>
);

export const PowerPointIcon = ({ size = 24, color = "#E74C3C" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="4" fill={color} opacity="0.3"/>
    <text x="12" y="14" fontSize="7" fontWeight="bold" fill={color} textAnchor="middle">PPT</text>
  </svg>
);

export const ZipIcon = ({ size = 24, color = "#F39C12" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
    <line x1="9" y1="6" x2="9" y2="18" stroke={color} strokeWidth="1.5"/>
    <line x1="15" y1="6" x2="15" y2="18" stroke={color} strokeWidth="1.5"/>
    <path d="M11 8 L13 10 L11 12" stroke={color} strokeWidth="1" fill="none"/>
  </svg>
);

export const APKIcon = ({ size = 24, color = "#3DDC84" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
    <path d="M8 8 L12 14 L16 8" stroke={color} strokeWidth="1.5" fill="none"/>
    <circle cx="12" cy="16" r="1.5" fill={color}/>
  </svg>
);

export const EXEIcon = ({ size = 24, color = "#95A5A6" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
    <text x="12" y="14" fontSize="7" fontWeight="bold" fill={color} textAnchor="middle">EXE</text>
  </svg>
);

export const GenericFileIcon = ({ size = 24, color = "#7F8C8D" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4 L20 4 L20 20 L4 20 Z" stroke={color} strokeWidth="1.5" fill={color} opacity="0.05"/>
    <path d="M4 4 L12 4 L14 6 L20 6 L20 20 L4 20 Z" stroke={color} strokeWidth="1.5" fill="none"/>
    <line x1="4" y1="11" x2="20" y2="11" stroke={color} strokeWidth="0.5" opacity="0.5"/>
    <line x1="4" y1="14" x2="20" y2="14" stroke={color} strokeWidth="0.5" opacity="0.5"/>
    <line x1="4" y1="17" x2="16" y2="17" stroke={color} strokeWidth="0.5" opacity="0.5"/>
  </svg>
);

// Download Icon
export const DownloadIcon = ({ size = 20, color = "#2C3E50" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2 L12 14 M12 14 L7 9 M12 14 L17 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 17 L21 17 L21 21 Q21 22 20 22 L4 22 Q3 22 3 21 Z" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
);

// Delete Icon
export const DeleteIcon = ({ size = 20, color = "#E74C3C" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6 L5 6 L21 6 M5 6 L19 20 Q19 21 18 21 L6 21 Q5 21 5 20 Z" stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    <line x1="9" y1="9" x2="9" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="12" y1="9" x2="12" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="15" y1="9" x2="15" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// Get file size in human readable format
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// File icon selector utility
export const getFileIcon = (fileName, size = 24) => {
  if (!fileName || typeof fileName !== 'string') {
    return <GenericFileIcon size={size} color="#7F8C8D" />;
  }
  const ext = fileName.split('.').pop().toLowerCase();
  const color = getFileTypeColor(ext);

  const iconProps = { size, color };

  switch (ext) {
    case 'pdf':
      return <PDFIcon {...iconProps} />;
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <ExcelIcon {...iconProps} />;
    case 'doc':
    case 'docx':
    case 'txt':
      return <DocIcon {...iconProps} />;
    case 'ppt':
    case 'pptx':
      return <PowerPointIcon {...iconProps} />;
    case 'zip':
    case 'rar':
    case '7z':
      return <ZipIcon {...iconProps} />;
    case 'apk':
      return <APKIcon {...iconProps} />;
    case 'exe':
      return <EXEIcon {...iconProps} />;
    default:
      return <GenericFileIcon {...iconProps} />;
  }
};

export const getFileTypeColor = (ext) => {
  const ext_lower = ext.toLowerCase();
  const colorMap = {
    pdf: '#FF6B6B',
    xlsx: '#26A65B',
    xls: '#26A65B',
    csv: '#26A65B',
    doc: '#4A90E2',
    docx: '#4A90E2',
    txt: '#4A90E2',
    ppt: '#E74C3C',
    pptx: '#E74C3C',
    zip: '#F39C12',
    rar: '#F39C12',
    '7z': '#F39C12',
    apk: '#3DDC84',
    exe: '#95A5A6',
  };
  return colorMap[ext_lower] || '#7F8C8D';
};
