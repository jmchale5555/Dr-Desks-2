import { useRef, useState } from 'react';

export function useHorizontalDragScroll() {
  const containerRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const stopDragging = (pointerId) => {
    const container = containerRef.current;
    if (!container || !dragStateRef.current.active) {
      return;
    }

    if (pointerId !== null) {
      try {
        container.releasePointerCapture(pointerId);
      } catch {
        // No-op: release can fail if capture was lost.
      }
    }

    dragStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startScrollLeft: 0,
    };
    setIsDragging(false);
  };

  const onPointerDown = (event) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    if (container.scrollWidth <= container.clientWidth) {
      return;
    }

    if (event.pointerType !== 'mouse') {
      return;
    }

    container.setPointerCapture(event.pointerId);

    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    setIsDragging(true);
  };

  const onPointerMove = (event) => {
    const container = containerRef.current;
    if (!container || !dragStateRef.current.active) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    container.scrollLeft = dragStateRef.current.startScrollLeft - deltaX;
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    stopDragging(event.pointerId);
  };

  const onPointerCancel = (event) => {
    stopDragging(event.pointerId);
  };

  const onPointerLeave = () => {
    if (dragStateRef.current.active) {
      stopDragging(dragStateRef.current.pointerId);
    }
  };

  return {
    containerRef,
    isDragging,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
    },
  };
}
