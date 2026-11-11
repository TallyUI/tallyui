import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { CAMERA_CONSTRAINTS, cameraErrorStatus, nativeBarcodeDetector, startDecodeLoop,
  type CameraDecoder, type ViewfinderStatus } from '@tallyui/pos';

export interface ViewfinderProps {
  onDetected: (code: string, symbology?: string) => void;
  onStatus: (status: ViewfinderStatus) => void;
  /** Defaults to the BarcodeDetector global where it exists; an app may pass a ponyfill with the same detect. */
  decoder?: CameraDecoder;
}

function canUseCamera(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

/** The web camera view: getUserMedia into a <video>, decoded by startDecodeLoop (v2 scanner-viewfinder.web.tsx).
 * Elsewhere it reports 'camera-unavailable' and renders an empty view; a native app passes its own viewfinder
 * (for example one built on expo-camera) to CameraScannerPanel. */
export function ScannerViewfinder(props: ViewfinderProps) {
  const latest = useRef(props);
  latest.current = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const web = canUseCamera();

  useEffect(() => {
    if (!web) {
      latest.current.onStatus('camera-unavailable');
      return;
    }
    let cancelled = false;
    let stream: MediaStream | undefined;
    let loop: { stop(): void } | undefined;
    latest.current.onStatus('initializing');
    navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS).then((media) => {
      // Unmounted before the camera answered: release the late stream at once.
      if (cancelled) {
        stopTracks(media);
        return;
      }
      stream = media;
      const video = videoRef.current;
      if (video) video.srcObject = media;
      const decoder = latest.current.decoder ?? nativeBarcodeDetector();
      if (!decoder) {
        latest.current.onStatus('decoder-error');
        return;
      }
      latest.current.onStatus('scanning');
      loop = startDecodeLoop({
        decoder,
        source: video,
        onDetected: (code, symbology) => latest.current.onDetected(code, symbology),
        onStatus: (status) => latest.current.onStatus(status),
      });
    }, (error: unknown) => {
      if (!cancelled) latest.current.onStatus(cameraErrorStatus(error));
    });
    return () => {
      cancelled = true;
      loop?.stop();
      if (stream) stopTracks(stream);
    };
  }, [web]);

  return (
    <View className="h-full w-full" testID="scanner-viewfinder">
      {web ? <video ref={videoRef} autoPlay playsInline muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
    </View>
  );
}
