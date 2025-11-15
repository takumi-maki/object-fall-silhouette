import { useEffect, useRef } from 'react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error('カメラの起動に失敗しました', err);
      }
    };

    setupCamera();
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
      <video ref={videoRef} width={640} height={480} style={{ border: '2px solid black' }} autoPlay muted />
    </div>
  );
};

export default App;
