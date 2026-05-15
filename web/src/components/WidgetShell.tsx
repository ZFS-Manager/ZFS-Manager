import React, { useRef } from 'react';
import { GripVertical, X } from 'lucide-react';

interface WidgetShellProps {
  id: string;
  editMode: boolean;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  isDragOver: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export default function WidgetShell({
  id, editMode, onRemove, onDragStart, onDragOver, onDrop,
  isDragOver, children, style,
}: WidgetShellProps) {
  const dragging = useRef(false);

  return (
    <div
      draggable={editMode}
      onDragStart={e => {
        if (!editMode) return;
        dragging.current = true;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(id);
      }}
      onDragEnd={() => { dragging.current = false; }}
      onDragOver={e => {
        if (!editMode) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(id);
      }}
      onDrop={e => {
        if (!editMode) return;
        e.preventDefault();
        onDrop(id);
      }}
      className={`widget-shell${isDragOver ? ' drag-over' : ''}`}
      style={{ position: 'relative', ...style }}
    >
      {editMode && (
        <>
          <div
            className="widget-handle"
            onMouseDown={e => e.stopPropagation()}
            title="Drag to reorder"
          >
            <GripVertical size={13} />
          </div>
          <button
            className="widget-remove"
            onClick={() => onRemove(id)}
            title="Remove widget"
          >
            <X size={13} />
          </button>
        </>
      )}
      {children}
    </div>
  );
}
