import React, { useState, useEffect, useRef, useCallback } from 'react';

function ImageGalleryModal({ isOpen, onClose, images, initialIndex }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Drag state (mouse + single-touch pan)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Pinch state
  const pinchStartDistRef = useRef(null);
  const pinchStartScaleRef = useRef(1);
  const pinchMidpointRef = useRef({ x: 0, y: 0 });

  // Swipe state (single finger)
  const swipeTouchStartRef = useRef(null);
  const touchCountRef = useRef(0);

  const imageRef = useRef(null);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex || 0);
      resetZoom();
    }
  }, [isOpen, initialIndex, resetZoom]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, images?.length]);

  if (!isOpen || !images || images.length === 0) return null;

  const currentImage = images[currentIndex];

  const handleNext = (e) => {
    if (e) e.stopPropagation();
    if (currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1);
      resetZoom();
    }
  };

  const handlePrev = (e) => {
    if (e) e.stopPropagation();
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      resetZoom();
    }
  };

  const handleDownload = async (e) => {
    if (e) e.stopPropagation();
    try {
      const response = await fetch(currentImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Try to extract filename or use a default
      const filename = currentImage.split('/').pop().split('?')[0] || 'downloaded_image.jpg';
      link.setAttribute('download', filename);
      
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download image.');
    }
  };

  // ─── Mouse wheel zoom (desktop) ──────────────────────────────────────────
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setScale(prev => {
      const next = Math.min(Math.max(prev + delta, 1), 5);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  // ─── Mouse drag (desktop) ─────────────────────────────────────────────────
  const onMouseDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const onMouseMove = (e) => {
    if (!isDraggingRef.current || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const onMouseUp = () => { isDraggingRef.current = false; };

  // ─── Touch handlers (pinch + swipe + pan) ────────────────────────────────
  const getTouchDist = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchMidpoint = (touches) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const onTouchStart = (e) => {
    touchCountRef.current = e.touches.length;

    if (e.touches.length === 2) {
      // Pinch start
      pinchStartDistRef.current = getTouchDist(e.touches);
      pinchStartScaleRef.current = scale;
      pinchMidpointRef.current = getTouchMidpoint(e.touches);
      swipeTouchStartRef.current = null; // cancel any swipe tracking
    } else if (e.touches.length === 1) {
      // Single finger: could be swipe (if scale===1) or pan (if zoomed)
      swipeTouchStartRef.current = e.touches[0].clientX;
      if (scale > 1) {
        isDraggingRef.current = true;
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        };
      }
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      e.preventDefault(); // prevent page scroll/zoom
      const dist = getTouchDist(e.touches);
      const ratio = dist / pinchStartDistRef.current;
      const newScale = Math.min(Math.max(pinchStartScaleRef.current * ratio, 1), 5);
      setScale(newScale);
      if (newScale <= 1) setPosition({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDraggingRef.current && scale > 1) {
      // Single-finger pan while zoomed
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      });
    }
  };

  const onTouchEnd = (e) => {
    if (e.touches.length === 0) {
      // All fingers lifted
      isDraggingRef.current = false;
      pinchStartDistRef.current = null;

      // Only trigger swipe if we were in single-touch mode and not zoomed
      if (touchCountRef.current === 1 && scale <= 1 && swipeTouchStartRef.current != null) {
        const changedX = e.changedTouches[0].clientX;
        const dist = swipeTouchStartRef.current - changedX;
        if (dist > 50 && currentIndex < images.length - 1) handleNext();
        if (dist < -50 && currentIndex > 0) handlePrev();
      }
      swipeTouchStartRef.current = null;
    } else if (e.touches.length === 1) {
      // One finger lifted during pinch → switch to pan mode
      pinchStartDistRef.current = null;
      if (scale > 1) {
        isDraggingRef.current = true;
        dragStartRef.current = {
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y,
        };
      }
    }
    touchCountRef.current = e.touches.length;
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(5px)', userSelect: 'none',
      }}
      onClick={onClose}
      onWheel={handleWheel}
    >
      {/* Top Bar */}
      <div
        style={{
          position: 'absolute', top: 0, width: '100%', padding: '15px 25px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
          zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: counter + scale badge */}
        <div style={{ color: 'white', fontSize: '1rem', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ background: 'rgba(255,255,255,0.15)', padding: '5px 12px', borderRadius: '20px', fontSize: '0.85rem' }}>
            {currentIndex + 1} / {images.length}
          </span>
          {scale > 1 && (
            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
              {Math.round(scale * 100)}%
            </span>
          )}
        </div>

        {/* Right Area: download + close */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleDownload}
            style={{
              background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '50%',
              width: '40px', height: '40px', fontSize: '1.2rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s',
            }}
            title="Download Image"
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '50%',
              width: '40px', height: '40px', fontSize: '1.5rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Pinch hint — visible only on touch devices, fades after a moment */}
      {scale === 1 && (
        <div
          style={{
            position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', pointerEvents: 'none',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 7l5-5 5 5M7 17l5 5 5-5" />
          </svg>
          Pinch to zoom · Swipe to navigate
        </div>
      )}

      {/* Navigation Arrows */}
      {currentIndex > 0 && (
        <button onClick={handlePrev} style={{ ...navBtnStyle, left: '20px' }} title="Previous">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      {currentIndex < images.length - 1 && (
        <button onClick={handleNext} style={{ ...navBtnStyle, right: '20px' }} title="Next">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Image Container */}
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          cursor: scale > 1 ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'auto',
          touchAction: 'none', // let our handlers manage everything
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          ref={imageRef}
          src={currentImage}
          alt={`Gallery item ${currentIndex + 1}`}
          style={{
            maxWidth: '90%', maxHeight: '85%', objectFit: 'contain',
            borderRadius: scale > 1 ? '0' : '8px',
            boxShadow: scale > 1 ? 'none' : '0 0 40px rgba(0,0,0,0.8)',
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDraggingRef.current ? 'none' : 'transform 0.15s ease-out',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        />
      </div>
    </div>
  );
}

const navBtnStyle = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '50%',
  width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', zIndex: 10, transition: 'background 0.2s', backdropFilter: 'blur(5px)',
};

export default ImageGalleryModal;
