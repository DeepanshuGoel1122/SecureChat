import React, { useState, useEffect, useRef } from 'react';

function ImageGalleryModal({ isOpen, onClose, images, initialIndex }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Swipe mechanics
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const imageRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex || 0);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, images.length]);

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

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = (e) => {
    if (e) e.stopPropagation();
    setScale(prev => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = (e) => {
    if (e) e.stopPropagation();
    setScale(prev => {
      const newScale = prev - 0.5;
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 });
        return 1;
      }
      return newScale;
    });
  };

  const handleWheel = (e) => {
    if (e.deltaY < 0) {
      setScale(prev => Math.min(prev + 0.2, 4));
    } else {
      setScale(prev => {
        const newScale = prev - 0.2;
        if (newScale <= 1) {
          setPosition({ x: 0, y: 0 });
          return 1;
        }
        return newScale;
      });
    }
  };

  const onTouchStartHandler = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.targetTouches[0].clientX - position.x,
        y: e.targetTouches[0].clientY - position.y
      });
    }
  };

  const onTouchMoveHandler = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
    if (isDragging && scale > 1) {
      setPosition({
        x: e.targetTouches[0].clientX - dragStart.x,
        y: e.targetTouches[0].clientY - dragStart.y
      });
    }
  };

  const onTouchEndHandler = () => {
    setIsDragging(false);
    if (scale > 1) return; // Do not swipe if zoomed in
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    if (isLeftSwipe && currentIndex < images.length - 1) {
      handleNext();
    }
    if (isRightSwipe && currentIndex > 0) {
      handlePrev();
    }
  };

  const onMouseDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const onMouseMove = (e) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div 
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(5px)', userSelect: 'none'
      }}
      onClick={onClose}
      onWheel={handleWheel}
    >
      {/* Top Bar with Info & Controls */}
      <div 
        style={{
          position: 'absolute', top: 0, width: '100%', padding: '15px 25px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
          zIndex: 10
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ color: 'white', fontSize: '1rem', display: 'flex', gap: '15px', alignItems: 'center' }}>
          <span style={{ background: 'rgba(255,255,255,0.15)', padding: '5px 12px', borderRadius: '20px', fontSize: '0.85rem' }}>
            {currentIndex + 1} / {images.length}
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleZoomOut} style={controlBtnStyle} title="Zoom Out">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
              {Math.round(scale * 100)}%
            </span>
            <button onClick={handleZoomIn} style={controlBtnStyle} title="Zoom In">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button onClick={resetZoom} style={controlBtnStyle} title="Reset Zoom">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
            </button>
          </div>
        </div>
        <button 
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '50%',
            width: '40px', height: '40px', fontSize: '1.5rem', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
        >
          &times;
        </button>
      </div>

      {/* Navigation Arrows */}
      {currentIndex > 0 && (
        <button onClick={handlePrev} style={{...navBtnStyle, left: '20px'}} title="Previous">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
      )}
      
      {currentIndex < images.length - 1 && (
        <button onClick={handleNext} style={{...navBtnStyle, right: '20px'}} title="Next">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      )}

      {/* Current Image */}
      <div 
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStartHandler}
        onTouchMove={onTouchMoveHandler}
        onTouchEnd={onTouchEndHandler}
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
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            pointerEvents: 'none' // allow parent div to handle drag
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
  cursor: 'pointer', zIndex: 10, transition: 'background 0.2s', backdropFilter: 'blur(5px)'
};

const controlBtnStyle = {
  background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '6px',
  width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', transition: 'background 0.2s'
};

export default ImageGalleryModal;
