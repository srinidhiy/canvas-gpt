import React from 'react';
import { Plus } from 'lucide-react';

interface CanvasControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const CanvasControls: React.FC<CanvasControlsProps> = ({ zoom, onZoomIn, onZoomOut }) => {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 bg-white rounded-xl shadow-lg border border-slate-200 p-3">
      <button
        onClick={onZoomIn}
        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors duration-200"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        onClick={onZoomOut}
        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors duration-200"
      >
        <div className="w-4 h-4 flex items-center justify-center font-bold">-</div>
      </button>
      <div className="text-xs text-center text-slate-600 font-medium">{Math.round(zoom * 100)}%</div>
    </div>
  );
};

export default CanvasControls;
