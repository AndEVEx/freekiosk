import React from 'react';

export type MotionStatus = 'idle' | 'active' | 'error' | 'no-camera';

interface MotionDetectorProps {
  enabled?: boolean;
  onMotionDetected?: () => void;
  sensitivity?: 'low' | 'medium' | 'high';
  cameraPosition?: 'front' | 'back';
  onStatusChange?: (status: MotionStatus) => void;
}

/**
 * MotionDetector disabled to release camera hardware for HTML5/WebView camera streaming (WebRTC getUserMedia).
 */
const MotionDetector: React.FC<MotionDetectorProps> = () => {
  return null;
};

export default MotionDetector;
